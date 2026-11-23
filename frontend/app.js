const $ = id => document.getElementById(id);
let parties = null;
let visible = [];
let generation = 0;
const labels = { auctioneer: 'Auctioneer', bidder1: 'Alice', bidder2: 'Bob', bidder3: 'Carol', outsider: 'Outsider' };
const bidders = [['', 'Choose a bidder'], ...['bidder1', 'bidder2', 'bidder3'].map(name => [name, labels[name]])];

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data, null, 2));
  return data;
}
function log(message) {
  $('log').textContent = `${new Date().toLocaleTimeString()} ${message}\n\n${$('log').textContent}`;
}
function entity(contract) { return contract.templateId.split(':').at(-1); }
function field(name, label, value = '', type = 'text', options = []) {
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement(type === 'select' ? 'select' : 'input');
  input.name = name;
  if (type === 'select') {
    input.required = true;
    for (const [key, text] of options) {
      const option = document.createElement('option');
      option.value = key; option.textContent = text; input.append(option);
    }
    input.value = value;
  } else {
    input.type = 'text'; input.value = value; input.required = true;
  }
  wrapper.append(input);
  $('fields').append(wrapper);
}
function choices(kind) {
  return visible.filter(c => entity(c) === kind);
}
function picker(name, label, kind, selected = '') {
  const contracts = choices(kind);
  const wrapper = document.createElement('label');
  wrapper.textContent = label;
  const input = document.createElement('input');
  input.name = name; input.required = true; input.placeholder = `Select or paste ${kind} ID`;
  input.setAttribute('list', `list-${name}`);
  input.value = selected || (contracts.length === 1 ? contracts[0].contractId : '');
  const list = document.createElement('datalist');
  list.id = `list-${name}`;
  for (const c of contracts) {
    const option = document.createElement('option');
    option.value = c.contractId;
    option.label = `${kind} ${JSON.stringify(c.createArgument)}`;
    list.append(option);
  }
  wrapper.append(input, list);
  $('fields').append(wrapper);
}
function fields() {
  $('fields').replaceChildren();
  switch ($('action').value) {
    case 'open':
      field('title', 'Auction title', 'Local auction');
      for (let i = 1; i <= 3; i++) field(`bidder${i}`, `Invitation ${i}`, '', 'select', bidders);
      break;
    case 'bid':
      picker('contractId', 'Invitation ID', 'Invitation');
      field('amount', 'Bid amount (decimal)', '10.0'); break;
    case 'tamper-bid':
      field('contractId', 'Paste Bid ID to attempt Archive (expected rejection)');
      break;
    case 'close': {
      const sales = choices('Auction');
      const sale = sales.length === 1 ? sales[0] : undefined;
      picker('contractId', 'Auction / sale ID', 'Auction');
      for (let i = 1; i <= 3; i++) {
        const bid = choices('Bid').find(b => b.createArgument?.invitation === sale?.createArgument?.[`invite${i}`]);
        picker(`bid${i}`, `Bid ${i} ID`, 'Bid', bid?.contractId);
      }
      $('fields').querySelector('[name="contractId"]').addEventListener('change', event => {
        const selected = choices('Auction').find(c => c.contractId === event.target.value);
        for (let i = 1; i <= 3; i++) {
          const bid = choices('Bid').find(b => selected && b.createArgument?.invitation === selected.createArgument?.[`invite${i}`]);
          $('fields').querySelector(`[name="bid${i}"]`).value = bid?.contractId || '';
        }
      });
      break;
    }
    case 'credit':
      field('owner', 'Credit owner', 'bidder1', 'select', Object.entries(labels));
      field('amount', 'Credit amount (decimal)', '100.0'); break;
    case 'pay':
      picker('contractId', 'Obligation ID', 'Obligation');
      picker('credit', 'Credit ID', 'Credit'); break;
  }
}
async function refresh() {
  const name = $('party').value;
  const current = ++generation;
  visible = [];
  $('contracts').textContent = 'Loading…';
  $('offset').textContent = '';
  fields();
  try {
    const data = await api(`/api/contracts?party=${encodeURIComponent(name)}`);
    if (current !== generation) return;
    visible = data.contracts;
    $('identity').textContent = `${labels[name]}: ${parties[name]}`;
    $('offset').textContent = `at ledger offset ${data.offset}`;
    $('contracts').replaceChildren();
    if (!visible.length) $('contracts').textContent = 'No visible auction contracts.';
    for (const contract of visible) {
      const card = document.createElement('article');
      card.className = 'card';
      const heading = document.createElement('h4');
      heading.textContent = entity(contract);
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify({ contractId: contract.contractId, ...contract.createArgument }, null, 2);
      card.append(heading, pre); $('contracts').append(card);
    }
    fields();
  } catch (error) {
    if (current !== generation) return;
    $('contracts').textContent = 'Could not load contracts.';
    log(`Query rejected: ${error.message}`);
  }
}
$('setup').addEventListener('click', async () => {
  $('setup').disabled = true;
  $('party').disabled = $('refresh').disabled = $('submit').disabled = true;
  generation++;
  parties = null;
  visible = [];
  $('identity').textContent = $('offset').textContent = '';
  $('contracts').textContent = 'Connect to view contracts.';
  $('status').textContent = 'Connecting and provisioning…';
  try {
    const result = await api('/api/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    parties = result.parties;
    $('status').textContent = `Connected. ${result.dar}`;
    $('party').disabled = $('refresh').disabled = $('submit').disabled = false;
    await refresh();
  } catch (error) { $('status').textContent = `Setup failed: ${error.message}`; }
  finally { $('setup').disabled = false; }
});
$('party').addEventListener('change', () => { $('log').textContent = ''; $('identity').textContent = ''; refresh(); });
$('refresh').addEventListener('click', refresh);
$('action').addEventListener('change', fields);
$('clear').addEventListener('click', () => { $('log').textContent = ''; });
$('form').addEventListener('submit', async event => {
  event.preventDefault();
  const party = $('party').value;
  const action = $('action').value;
  const input = Object.fromEntries(new FormData(event.target));
  if (action === 'open' && new Set([input.bidder1, input.bidder2, input.bidder3]).size !== 3) {
    log('Open rejected: choose Alice, Bob and Carol exactly once each.');
    return;
  }
  $('submit').disabled = true;
  try {
    const result = await api('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ party, action, input }) });
    if (parties && $('party').value === party) {
      log(`${labels[party]} ${action} accepted: ${JSON.stringify(result)}`);
      await refresh();
    }
  } catch (error) {
    if (parties && $('party').value === party) log(`${labels[party]} ${action} rejected: ${error.message}`);
  } finally { $('submit').disabled = !parties; }
});
fields();
