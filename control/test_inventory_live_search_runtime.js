'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'admin_erp.html'), 'utf8');
const start = html.indexOf('function renderLinkPublicationsTool(');
const end = html.indexOf('async function linkPublication(', start);
assert.ok(start > 0 && end > start);
const code = html.slice(start, end);

function setup() {
  const nodes = {
    linkMarket: { value: 'ML' },
    linkLiveSearch: { checked: true },
    linkLimit: { value: '100' },
    linkQuery: { value: 'magic rack' },
    linkSearchButton: { disabled: false },
    unlinkedResults: { innerHTML: '' },
    invSearch: { value: '' },
  };
  const calls = [], statuses = [], box = { innerHTML: '' };
  let response = async () => ({ items: [] });
  const context = vm.createContext({
    state: { linkCandidates: [] },
    qs: id => nodes[id],
    inventoryToolBox: () => box,
    scrollToInventoryTool: () => {},
    invToolStatus: (message, ok) => statuses.push({ message, ok }),
    XELERIA_MIN_SEARCH_CHARS: 4,
    minSearchMessage: () => 'Ingresá al menos 4 caracteres para buscar.',
    humanFrontendError: (_error, fallback) => fallback,
    esc: value => String(value ?? ''),
    statusPill: value => String(value || ''),
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      assert.ok(!options?.method || options.method === 'GET', 'Buscar sólo puede leer');
      return response(url);
    },
  });
  vm.runInContext(code, context);
  return { nodes, context, calls, statuses, box, respond: callback => { response = callback; } };
}

async function main() {
  let cases = 0;
  {
    const s = setup();
    s.context.renderLinkPublicationsTool('PCMAGICRACKIMP4x6');
    assert.match(s.box.innerHTML, /id="linkLiveSearch" type="checkbox" checked/);
    assert.match(s.box.innerHTML, /PCMAGICRACKIMP4x6/);
    assert.match(s.box.innerHTML, /Buscar no importa, no vincula ni cambia stock/);
    assert.equal(s.nodes.linkLimit.value, '50');
    assert.equal(s.nodes.linkLimit.disabled, true);
    assert.equal(s.calls.length, 0);
    cases++;
  }
  {
    const s = setup();
    s.respond(async () => ({ items: [{ marketplace: 'ML', external_product_id: 'MLA-TEST', title: 'Magic Rack x6', source: 'live_ml', stock: 3 }] }));
    await s.context.loadUnlinkedPublications();
    const query = new URL(s.calls[0].url, 'https://test.invalid').searchParams;
    assert.equal(query.get('live'), 'true');
    assert.equal(query.get('marketplace'), 'ML');
    assert.equal(query.get('limit'), '50');
    assert.equal(query.get('q'), 'magic rack');
    assert.match(s.nodes.unlinkedResults.innerHTML, /Magic Rack x6/);
    assert.match(s.nodes.unlinkedResults.innerHTML, /Vincular al SKU/);
    assert.match(s.statuses.at(-1).message, /en vivo/);
    assert.equal(s.calls.length, 1, 'No debe importar ni vincular automáticamente');
    cases++;
  }
  {
    const s = setup();
    s.nodes.linkMarket.value = 'TN';
    await s.context.loadUnlinkedPublications();
    assert.match(s.calls[0].url, /marketplace=TN/);
    assert.match(s.calls[0].url, /live=true/);
    assert.match(s.nodes.unlinkedResults.innerHTML, /No encontré publicaciones sin vincular en el canal/);
    cases++;
  }
  {
    const s = setup();
    s.nodes.linkLiveSearch.checked = false;
    s.context.resetUnlinkedPublicationSearch();
    assert.equal(s.nodes.linkLimit.disabled, false);
    s.nodes.linkLimit.value = '200';
    await s.context.loadUnlinkedPublications();
    assert.doesNotMatch(s.calls[0].url, /live=true/);
    assert.match(s.calls[0].url, /limit=200/);
    assert.match(s.nodes.unlinkedResults.innerHTML, /activá “Buscar en vivo/);
    cases++;
  }
  {
    const s = setup();
    for (const query of ['', 'mag']) {
      s.nodes.linkQuery.value = query;
      await s.context.loadUnlinkedPublications();
    }
    assert.equal(s.calls.length, 0);
    assert.match(s.statuses.at(-1).message, /al menos 4/);
    cases++;
  }
  {
    const s = setup();
    s.nodes.linkLiveSearch.checked = false;
    s.nodes.linkQuery.value = '';
    await s.context.loadUnlinkedPublications();
    assert.equal(s.calls.length, 1, 'La consulta local vacía conserva el listado existente');
    assert.doesNotMatch(s.calls[0].url, /live=true/);
    cases++;
  }
  {
    const s = setup();
    s.context.state.linkCandidates = [{ title: 'Anterior' }];
    s.respond(async () => { throw new Error('private technical error'); });
    await s.context.loadUnlinkedPublications();
    assert.equal(s.context.state.linkCandidates.length, 0);
    assert.equal(s.nodes.unlinkedResults.innerHTML, '');
    assert.equal(s.nodes.linkSearchButton.disabled, false);
    assert.match(s.statuses.at(-1).message, /No pude consultar ML en vivo/);
    cases++;
  }
  {
    const s = setup();
    let finish;
    s.respond(() => new Promise(resolve => { finish = resolve; }));
    const request = s.context.loadUnlinkedPublications();
    s.nodes.linkLiveSearch.checked = false;
    s.context.resetUnlinkedPublicationSearch();
    finish({ items: [{ title: 'Respuesta vieja' }] });
    await request;
    assert.equal(s.context.state.linkCandidates.length, 0);
    assert.equal(s.nodes.unlinkedResults.innerHTML, '');
    assert.match(s.statuses.at(-1).message, /base local/);
    cases++;
  }
  {
    const s = setup();
    let finishOld;
    s.respond(() => new Promise(resolve => { finishOld = resolve; }));
    const first = s.context.loadUnlinkedPublications();
    s.respond(async () => ({ items: [{ title: 'Nueva', marketplace: 'ML' }] }));
    await s.context.loadUnlinkedPublications();
    finishOld({ items: [{ title: 'Vieja' }] });
    await first;
    assert.equal(s.context.state.linkCandidates[0].title, 'Nueva');
    cases++;
  }
  console.log(`${cases} pruebas de búsqueda de publicaciones aprobadas`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
