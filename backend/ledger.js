import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:3975';
const ADMIN = 'ledger-api-user';
const NAMES = ['auctioneer', 'bidder1', 'bidder2', 'bidder3', 'outsider'];
const BIDDERS = ['bidder1', 'bidder2', 'bidder3'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userId = name => `auction-demo-${name}`;
const template = name => `#private-auction:Auction:${name}`;

export class LedgerError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : (detail.cause || detail.message || JSON.stringify(detail)));
    this.status = status;
    this.detail = detail;
  }
}

function token(subject) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: subject, aud: 'https://canton.network.global', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${payload}.${createHmac('sha256', 'unsafe').update(payload).digest('base64url')}`;
}

async function request(path, { user = ADMIN, body, binary = false, method = body === undefined ? 'GET' : 'POST' } = {}) {
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: { Authorization: `Bearer ${token(user)}`, ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }) },
      body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(60000)
    });
  } catch (error) {
    throw new LedgerError(503, `Cannot reach LocalNet JSON Ledger API at ${BASE}: ${error.message}`);
  }
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  if (!response.ok) throw new LedgerError(response.status, data);
  return data;
}

let pendingSetup;
export function setup() {
  if (!pendingSetup) pendingSetup = provision().finally(() => { pendingSetup = undefined; });
  return pendingSetup;
}

async function provision() {
  let bytes;
  try {
    bytes = await readFile(path.join(ROOT, '.daml', 'dist', 'private-auction-1.0.0.dar'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new LedgerError(503, 'Auction DAR not found. Run dpm build with Daml SDK 3.4.11 from the project directory, then retry setup.');
    throw error;
  }
  await request('/v2/packages', { body: bytes, binary: true });
  const parties = {};
  for (const name of NAMES) {
    const user = userId(name);
    try {
      await request(`/v2/users/${user}`);
    } catch (error) {
      if (error.status !== 404) throw error;
      try { await request('/v2/users', { body: { user: { id: user, identityProviderId: '' }, rights: [] } }); }
      catch (createError) { if (createError.status !== 409) throw createError; }
    }
    let rights = await request(`/v2/users/${user}/rights`);
    const acting = (rights.rights || []).map(r => r.kind?.CanActAs?.value?.party).filter(Boolean);
    const extra = (rights.rights || []).filter(r => !r.kind?.CanActAs);
    if (acting.length > 1 || extra.length) throw new Error(`Refusing ${user}: its rights are not isolated to one party. Remove extra rights or use a clean LocalNet.`);
    let party = acting[0];
    if (!party) {
      const allocated = await request('/v2/parties', { body: { partyIdHint: `AuctionDemo-${name}`, identityProviderId: '', userId: user } });
      party = allocated.partyDetails.party;
      rights = await request(`/v2/users/${user}/rights`);
      if (!(rights.rights || []).some(r => r.kind?.CanActAs?.value?.party === party)) throw new Error(`CanActAs was not granted to ${user}`);
    }
    if (Object.values(parties).includes(party)) throw new Error('Demo users must have distinct parties.');
    parties[name] = party;
  }
  return { parties, dar: 'DAR uploaded to the participant.' };
}

function validateParty(name, parties) {
  if (!NAMES.includes(name) || !parties[name]) throw new LedgerError(400, 'Unknown demo party.');
}

export async function contracts(name, parties) {
  validateParty(name, parties);
  const user = userId(name);
  const end = await request('/v2/state/ledger-end', { user });
  const offset = end.offset;
  if (Number(offset) === 0) return { offset, contracts: [] };
  const entities = ['AuctionSetup', 'AuctionOpen', 'Invitation', 'Bid', 'Auction', 'Loss', 'Credit', 'Obligation', 'Payment'];
  const filter = { cumulative: entities.map(entity => ({ identifierFilter: { TemplateFilter: { value: { templateId: template(entity), includeCreatedEventBlob: false } } } })) };
  const entries = [];
  const seen = new Set();
  let continuation;
  do {
    const body = { activeAtOffset: offset, eventFormat: { filtersByParty: { [parties[name]]: filter }, verbose: true } };
    if (continuation) body.streamContinuationToken = continuation;
    const result = await request('/v2/state/active-contracts', { user, body });
    if (!Array.isArray(result)) throw new Error('Unexpected active-contract response.');
    entries.push(...result.map(row => row.contractEntry?.JsActiveContract?.createdEvent).filter(Boolean));
    continuation = result.at(-1)?.streamContinuationToken;
    if (continuation && seen.has(continuation)) throw new Error('Repeated active-contract continuation token.');
    if (continuation) seen.add(continuation);
  } while (continuation);
  return { offset, contracts: entries };
}

export async function submit(name, parties, action, input) {
  validateParty(name, parties);
  const actor = parties[name];
  const exercise = (entity, choice, contractId, choiceArgument) => ({ ExerciseCommand: { templateId: template(entity), contractId, choice, choiceArgument } });
  let command;
  switch (action) {
    case 'open': {
      const selected = [input.bidder1, input.bidder2, input.bidder3];
      if (selected.some(bidder => !BIDDERS.includes(bidder) || !parties[bidder]) || new Set(selected).size !== 3) {
        throw new LedgerError(400, 'Choose Alice, Bob and Carol exactly once each.');
      }
      const [bidder1, bidder2, bidder3] = selected.map(bidder => parties[bidder]);
      if (new Set([actor, bidder1, bidder2, bidder3]).size !== 4) {
        throw new LedgerError(400, 'The auctioneer and three bidders must be distinct parties.');
      }
      command = { CreateAndExerciseCommand: { templateId: template('AuctionSetup'), createArguments: { auctioneer: actor, bidder1, bidder2, bidder3, title: input.title }, choice: 'Open', choiceArgument: {} } };
      break;
    }
    case 'bid':
      command = exercise('Invitation', 'SubmitBid', input.contractId, { amount: input.amount });
      break;
    case 'tamper-bid':
      command = exercise('Bid', 'Archive', input.contractId, {});
      break;
    case 'close':
      command = exercise('Auction', 'Close', input.contractId, { bid1: input.bid1, bid2: input.bid2, bid3: input.bid3 });
      break;
    case 'credit':
      if (!NAMES.includes(input.owner)) throw new LedgerError(400, 'Unknown credit owner.');
      command = { CreateCommand: { templateId: template('Credit'), createArguments: { issuer: actor, owner: parties[input.owner], amount: input.amount } } };
      break;
    case 'pay':
      command = exercise('Obligation', 'Pay', input.contractId, { credit: input.credit });
      break;
    default: throw new LedgerError(400, 'Unknown action.');
  }
  return request('/v2/commands/submit-and-wait', { user: userId(name), body: { userId: userId(name), commandId: randomUUID(), actAs: [actor], readAs: [], commands: [command] } });
}
