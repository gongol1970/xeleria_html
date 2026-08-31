'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'admin_erp.html'), 'utf8');
function extract(name) {
  const start = html.search(new RegExp('^(?:async )?function '+name+'\\(', 'm'));
  assert.ok(start >= 0, name);
  const tail = html.slice(start);
  const end = tail.slice(1).search(/^(?:async )?function \w+\(/m);
  return end < 0 ? tail : tail.slice(0, end + 1);
}
const code = [
  'comboListingSkuHtml', 'comboSkuInput', 'comboListingKey', 'comboSelectedListingsMini',
  'comboRenderSelectedListings', 'comboRenderOrphans', 'comboAddListing',
  'comboLoadOrphans', 'comboFormInner', 'comboSaveForm',
].map(extract).join('\n');
const candidate = {marketplace:'ML', external_product_id:'MLA2051775405', external_variant_id:'0',
  title:'Magic Rack x6', seller_sku:'PCMAGICRACKIMP4x6', sku_source:'item.attributes.SELLER_SKU', source:'live_ml', price:28882};
const esc = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setup() {
  const form = {sku:candidate.seller_sku, name:'Magic Rack x6', listings:[], orphanML:[{...candidate}], orphanTN:[], components:[]};
  const nodes = {comboOrphan_new_ML:{innerHTML:''}, comboOrphan_new_TN:{innerHTML:''},
    comboOrphan_new_ML_q:{value:'magic'}, comboOrphan_new_TN_q:{value:''},
    comboLiveSearch_new:{checked:true}, comboSelectedListings_new:{innerHTML:''}};
  const calls = [];
  let response = async()=>({items:[{...candidate}]});
  const context = vm.createContext({
    state:{comboSaving:false}, comboForm:()=>form, qs:id=>nodes[id], esc,
    money:value=>String(value), jsq:value=>String(value), XELERIA_MIN_SEARCH_CHARS:4,
    minSearchMessage:()=> 'Ingresá al menos 4 caracteres para buscar.',
    fetchJson:async(url,options)=>{calls.push({url,options});return response(url,options);},
    comboQtyInt:value=>Math.max(1,Math.trunc(Number(value))), comboCloseNew:()=>{},
    setStatus:()=>{}, loadCombos:async()=>{}, comboFriendlyComboError:e=>String(e),
  });
  vm.runInContext(code,context);
  return {form,nodes,calls,context,respond:fn=>{response=fn;}};
}
const tests = [];
const test = (name,fn)=>tests.push({name,fn});
test('SKU real y coincidencia visibles en búsqueda',()=>{
  const s=setup();s.context.comboRenderOrphans('new','ML');
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/SKU en ML/);
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/PCMAGICRACKIMP4x6/);
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/Coincide con el SKU del combo/);
  assert.doesNotMatch(s.nodes.comboOrphan_new_ML.innerHTML,/sin SKU/);
});
test('SKU del canal se conserva al agregar sin escritura',()=>{
  const s=setup();s.context.comboAddListing('new','ML',0);
  assert.equal(s.form.listings[0].seller_sku,candidate.seller_sku);
  assert.equal(s.form.listings[0].sku_source,candidate.sku_source);
  assert.match(s.nodes.comboSelectedListings_new.innerHTML,/SKU en ML/);
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/Agregada/);
  assert.equal(s.calls.length,0);
  s.context.comboAddListing('new','ML',0);
  assert.equal(s.form.listings.length,1);
});
test('cambio de SKU actualiza ambas comparaciones sin igualar los SKU',()=>{
  const s=setup();s.context.comboAddListing('new','ML',0);
  s.context.comboSkuInput('new','PCMAGICRACKIMP4x12');
  assert.match(s.nodes.comboSelectedListings_new.innerHTML,/Distinto del SKU del combo: PCMAGICRACKIMP4x12/);
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/Distinto del SKU del combo/);
  assert.equal(s.form.listings[0].seller_sku,candidate.seller_sku);
  assert.equal(s.form.orphanML[0].seller_sku,candidate.seller_sku);
  assert.equal(s.calls.length,0);
});
test('mayúsculas importan, espacios de borde no',()=>{
  const s=setup();s.context.comboSkuInput('new',candidate.seller_sku.toUpperCase());
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/Distinto/);
  s.context.comboSkuInput('new',' '+candidate.seller_sku+' ');
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/Coincide/);
});
test('sin SKU leído no se inventa coincidencia',()=>{
  const s=setup();s.form.orphanML[0].seller_sku=null;s.context.comboRenderOrphans('new','ML');
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/no informado en esta consulta/);
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/No se puede comparar/);
  assert.doesNotMatch(s.nodes.comboOrphan_new_ML.innerHTML,/Coincide|sin SKU/);
});
test('dato local se distingue de consulta viva',()=>{
  const s=setup();s.form.orphanML[0].source='inventory_import_staging_tenant';
  s.context.comboRenderOrphans('new','ML');
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/SKU de ML \(base local\)/);
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/verificá en vivo/);
  s.form.orphanML[0].seller_sku=null;s.context.comboRenderOrphans('new','ML');
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/no disponible. Buscá en vivo/);
});
test('asociación preexistente no afirma haber consultado el canal',()=>{
  const s=setup();s.form.listings=[{marketplace:'ML',external_product_id:'MLA1'}];
  s.context.comboRenderSelectedListings('new');
  assert.match(s.nodes.comboSelectedListings_new.innerHTML,/no consultado en esta pantalla/);
});
test('combo sin SKU invita a completar sin autocompletar',()=>{
  const s=setup();s.context.comboSkuInput('new','');
  assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/Ingresá el SKU del combo/);
  assert.equal(s.form.sku,'');
});
test('TN conserva su canal y se escapan los valores',()=>{
  const s=setup();s.form.sku='<combo>';const text=s.context.comboListingSkuHtml('new',{...candidate,marketplace:'TN',source:'live_tn',seller_sku:'<img src=x>'},'TN');
  assert.match(text,/SKU en TN/);assert.match(text,/&lt;img src=x&gt;/);assert.match(text,/&lt;combo&gt;/);
  assert.doesNotMatch(text,/<img/);
});
test('input del formulario ejecuta actualización y mínimo correcto',()=>{
  const s=setup();const markup=s.context.comboFormInner('new',{mode:'create'});
  assert.match(markup,/comboSkuInput\('new',this.value\)/);
  assert.match(markup,/al menos 4 caracteres/);
});
test('reconsulta actualiza SKU de la candidata ya seleccionada',async()=>{
  const s=setup();s.context.comboAddListing('new','ML',0);
  s.respond(async()=>({items:[{...candidate,seller_sku:'MODIFICADO-EN-ML'}]}));
  await s.context.comboLoadOrphans('new','ML');
  assert.match(s.calls[0].url,/live=true/);assert.equal(s.calls[0].options,undefined);
  assert.equal(s.form.sku,candidate.seller_sku);
  assert.equal(s.form.listings[0].seller_sku,'MODIFICADO-EN-ML');
  assert.match(s.nodes.comboSelectedListings_new.innerHTML,/Distinto/);
});
test('respuesta tardía no pisa lectura nueva',async()=>{
  const s=setup();let resolveOld;s.respond(()=>new Promise(resolve=>{resolveOld=resolve;}));
  const pending=s.context.comboLoadOrphans('new','ML');
  s.respond(async()=>({items:[{...candidate,seller_sku:'NUEVO'}]}));
  await s.context.comboLoadOrphans('new','ML');
  resolveOld({items:[{...candidate,seller_sku:'ANTIGUO'}]});await pending;
  assert.equal(s.form.orphanML[0].seller_sku,'NUEVO');
});
test('cambio de consulta o modo descarta respuesta anterior',async()=>{
  for(const change of [s=>s.nodes.comboOrphan_new_ML_q.value='otro',s=>s.nodes.comboLiveSearch_new.checked=false]){
    const s=setup();let finish;s.respond(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=s.context.comboLoadOrphans('new','ML');change(s);finish({items:[candidate]});await pending;
    assert.equal(s.form.orphanML.length,0);
  }
});
test('error limpia candidatas; consulta corta no llama al canal',async()=>{
  const s=setup();s.respond(async()=>{throw Error('fallo');});
  await s.context.comboLoadOrphans('new','ML');
  assert.equal(s.form.orphanML.length,0);assert.match(s.nodes.comboOrphan_new_ML.innerHTML,/No pude consultar ML/);
  s.nodes.comboOrphan_new_ML_q.value='ab';await s.context.comboLoadOrphans('new','ML');
  assert.equal(s.calls.length,1);
});
test('guardar mantiene SKU elegido y contrato anterior sin metadatos de comparación',async()=>{
  const s=setup();s.context.comboAddListing('new','ML',0);s.context.comboSkuInput('new','OTROx6');
  s.form.components=[{sku:'SIMPLE',name:'Simple',quantity:6}];
  await s.context.comboSaveForm('new','create');
  assert.equal(s.calls.length,1);assert.equal(s.calls[0].url,'/admin/v2/inventory/create-bundle');
  const payload=JSON.parse(s.calls[0].options.body);
  assert.equal(payload.sku,'OTROx6');assert.equal(payload.components[0].quantity,6);
  assert.equal(payload.listings[0].external_product_id,candidate.external_product_id);
  assert.ok(!('seller_sku' in payload.listings[0]));assert.ok(!('sku_source' in payload.listings[0]));
});
(async()=>{
  for(const {name,fn} of tests){await fn();console.log('OK '+name);}
  let scripts=0;for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    if(match[1].trim()){new vm.Script(match[1]);scripts++;}
  }
  console.log(`${tests.length} pruebas aprobadas; sintaxis de ${scripts} bloques JavaScript OK.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
