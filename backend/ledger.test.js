import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setup, contracts, submit } from './ledger.js';

test('rejects unknown identities and actions before contacting the ledger', async () => {
  const parties = { auctioneer: 'seller', bidder1: 'one', bidder2: 'two', bidder3: 'three', outsider: 'outside' };
  await assert.rejects(contracts('unknown', parties), /Unknown demo party/);
  await assert.rejects(submit('unknown', parties, 'open', {}), /Unknown demo party/);
  await assert.rejects(submit('auctioneer', parties, 'credit', { owner: 'unknown' }), /Unknown credit owner/);
  await assert.rejects(submit('auctioneer', parties, 'unknown', {}), /Unknown action/);
});

test('opening requires three distinct named bidders and preserves invitation order', async t => {
  const parties = { auctioneer: 'seller', bidder1: 'alice', bidder2: 'bob', bidder3: 'carol', outsider: 'outside' };
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let command;
  globalThis.fetch = async (url, options) => {
    command = JSON.parse(options.body);
    return { ok: true, text: async () => '{}' };
  };
  const open = selection => submit('auctioneer', parties, 'open', { title: 'Sale', ...selection });
  await assert.rejects(open({ bidder1: 'bidder1', bidder2: 'bidder1', bidder3: 'bidder3' }), /exactly once/);
  await assert.rejects(open({ bidder1: 'bidder1', bidder2: 'bidder2' }), /exactly once/);
  await assert.rejects(open({ bidder1: 'bidder1', bidder2: 'bidder2', bidder3: 'outsider' }), /exactly once/);
  await assert.rejects(submit('bidder1', parties, 'open', { bidder1: 'bidder1', bidder2: 'bidder2', bidder3: 'bidder3' }), /distinct parties/);
  assert.equal(command, undefined);
  await open({ bidder1: 'bidder3', bidder2: 'bidder1', bidder3: 'bidder2' });
  assert.deepEqual(command.commands[0].CreateAndExerciseCommand.createArguments, {
    auctioneer: 'seller', bidder1: 'carol', bidder2: 'alice', bidder3: 'bob', title: 'Sale'
  });
  assert.deepEqual(command.actAs, ['seller']);
  assert.deepEqual(command.readAs, []);
});

test('bid tampering submits Archive with the selected party only', async t => {
  const parties = { auctioneer: 'seller', bidder1: 'alice', bidder2: 'bob', bidder3: 'carol', outsider: 'outside' };
  let command;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    command = JSON.parse(options.body);
    return { ok: true, text: async () => '{}' };
  });
  await submit('bidder1', parties, 'tamper-bid', { contractId: 'other-bid-id' });
  assert.deepEqual(command.commands, [{ ExerciseCommand: { templateId: '#private-auction:Auction:Bid', contractId: 'other-bid-id', choice: 'Archive', choiceArgument: {} } }]);
  assert.equal(command.userId, 'auction-demo-bidder1');
  assert.deepEqual(command.actAs, ['alice']);
  assert.deepEqual(command.readAs, []);
});

test('live LocalNet auction, privacy and settlement', { skip: process.env.LIVE_LEDGER_TEST !== '1', timeout: 300000 }, async () => {
  const { parties } = await setup();
  const title = `integration-${randomUUID()}`;
  const get = async name => (await contracts(name, parties)).contracts;
  const type = (c, name) => c.templateId.endsWith(`:Auction:${name}`);
  const rejected = async promise => assert.rejects(promise, error => error.status >= 400 && error.status < 500 && error.status !== 401);
  await submit('auctioneer', parties, 'open', { title, bidder1: 'bidder1', bidder2: 'bidder2', bidder3: 'bidder3' });
  let seller = await get('auctioneer');
  const marker = seller.find(c => type(c, 'AuctionOpen') && c.createArgument.title === title);
  assert.ok(marker, 'auction marker exists');
  const sale = seller.find(c => type(c, 'Auction') && c.createArgument.auction === marker.contractId);
  assert.ok(sale);
  const invites = [];
  for (let i = 1; i <= 3; i++) {
    const name = `bidder${i}`;
    const view = await get(name);
    const invite = view.find(c => type(c, 'Invitation') && c.createArgument.auction === marker.contractId);
    assert.ok(invite);
    invites.push(invite);
    assert.equal(view.some(c => c.contractId === sale.contractId), false);
  }
  assert.equal((await get('outsider')).some(c => c.contractId === marker.contractId), false);
  await rejected(submit('outsider', parties, 'bid', { contractId: invites[0].contractId, amount: '1.0' }));
  await rejected(submit('bidder1', parties, 'bid', { contractId: invites[0].contractId, amount: '0.0' }));
  for (let i = 1; i <= 3; i++) await submit(`bidder${i}`, parties, 'bid', { contractId: invites[i - 1].contractId, amount: `${i * 10}.0` });
  seller = await get('auctioneer');
  const bids = invites.map(invite => seller.find(c => type(c, 'Bid') && c.createArgument.invitation === invite.contractId));
  assert.ok(bids.every(Boolean));
  const checkBidVisibility = async () => {
    for (const [name, expected] of [['auctioneer', [0, 1, 2]], ['bidder1', [0]], ['bidder2', [1]], ['bidder3', [2]], ['outsider', []]]) {
      const view = await get(name);
      for (let i = 0; i < bids.length; i++) {
        assert.equal(view.some(c => c.contractId === bids[i].contractId), expected.includes(i), `${name} visibility of bid ${i + 1}`);
      }
    }
  };
  await checkBidVisibility();
  await rejected(submit('bidder1', parties, 'tamper-bid', { contractId: bids[1].contractId }));
  await rejected(submit('bidder1', parties, 'tamper-bid', { contractId: bids[0].contractId }));
  const closing = { contractId: sale.contractId, bid1: bids[0].contractId, bid2: bids[1].contractId, bid3: bids[2].contractId };
  await rejected(submit('bidder1', parties, 'close', closing));
  await submit('auctioneer', parties, 'close', closing);
  // The original invitation was consumed by its successful bid.
  await rejected(submit('bidder1', parties, 'bid', { contractId: invites[0].contractId, amount: '11.0' }));
  await checkBidVisibility();
  const loser = await get('bidder1');
  const winner = await get('bidder3');
  assert.equal(loser.some(c => c.contractId === marker.contractId), false);
  assert.ok(loser.some(c => type(c, 'Loss') && c.createArgument.auction === marker.contractId));
  assert.equal(loser.some(c => type(c, 'Obligation') && c.createArgument.auction === marker.contractId), false);
  const obligation = winner.find(c => type(c, 'Obligation') && c.createArgument.auction === marker.contractId);
  assert.ok(obligation);
  await submit('auctioneer', parties, 'credit', { owner: 'bidder3', amount: '50.0' });
  const credit = (await get('bidder3')).filter(c => type(c, 'Credit') && c.createArgument.issuer === parties.auctioneer && c.createArgument.owner === parties.bidder3 && Number(c.createArgument.amount) === 50).at(-1);
  assert.ok(credit);
  await submit('bidder3', parties, 'pay', { contractId: obligation.contractId, credit: credit.contractId });
  const paid = await get('bidder3');
  assert.ok(paid.some(c => type(c, 'Payment') && c.createArgument.auction === marker.contractId));
  assert.equal(paid.some(c => c.contractId === obligation.contractId), false);
  assert.equal((await get('outsider')).some(c => c.createArgument?.auction === marker.contractId), false);
});
