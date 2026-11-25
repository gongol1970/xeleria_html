import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../admin_multicd.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../admin_erp.html',import.meta.url),'utf8');
test('depot channel stock is not compared with the global total',()=>{
  const context=vm.createContext({qs:()=>({value:''}),esc:v=>String(v??''),money:()=>'',listingStatusTextSpan:()=>'',warehouseMode:()=>true});
  vm.runInContext(page.slice(page.indexOf('function listingMarket(l)'),page.indexOf('function inventoryIsBundle(i)')),context);
  const item={stock:3,listings:[{marketplace:'TN',external_product_id:'one',stock:0}]};
  assert.doesNotMatch(context.renderListingsForItem(item),/syncPending|sincronización pendiente/);
  context.warehouseMode=()=>false;
  assert.match(context.renderListingsForItem(item),/syncPending/);
});
const restoreSource=page.slice(page.indexOf('function cancelledSaleRestoreState(o){'),page.indexOf('function saleExternalOrderIds('));
function screen(){
  const nodes=new Map(),calls=[],messages=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',classList:{remove(){},add(){}},querySelectorAll:()=>[],scrollIntoView(){}});return nodes.get(id)};
  const context=vm.createContext({crypto:webcrypto,console,tenantId:()=> 'tenant',qs:node,
    fieldVal:id=>node(id).value,esc:v=>String(v??''),errText:e=>e.message||String(e),
    setStatus:(...args)=>messages.push(args),confirm:()=>true,
    state:{inventoryItems:[]},fetchJson:async(path,options)=>{calls.push({path,options});return {}},
    inventoryIsBundle:()=>false});
  vm.runInContext(source,context);
  vm.runInContext(`warehouseUI.tenant='tenant';warehouseUI.config={enabled:true,warehouses:[],tn_locations:[]};
    warehouseUI.product={item:{id:12,sku:'A',stock:8,item_type:'single'},ml_origin:null,
      warehouses:[{warehouse_id:'flores',name:'Flores',active:true,stock:0,stock_revision:2,postal_code:'1406'},
                  {warehouse_id:'moron',name:'Morón',active:true,stock:8,stock_revision:3,postal_code:'1708'}]};
    reloadWarehouseProduct=async()=>{};`,context);
  return {context,nodes,calls,messages,node,run:code=>vm.runInContext(code,context)};
}

function productEditor(sku='PCGRIP_AZU'){
  const s=screen();
  Object.assign(s.context,{listingMarket:l=>l.marketplace,listingProductId:l=>l.external_product_id,
    listingVariantId:l=>l.external_variant_id,listingStatus:()=> 'active',listingUrl:()=>'',
    inventoryPackageBody:()=>({}),inventoryToolBox:()=>s.node('editorBox'),restoreInventoryReturnPosition:()=>{},
    searchInventory:async()=>{},invToolStatus:(...args)=>s.messages.push(args),friendlyInventoryError:e=>e.message,
    applyInventoryProductSaveResultToOpenEditor:()=>{}});
  vm.runInContext(page.slice(page.indexOf('function inventoryListingPayloadsFromEdit('),page.indexOf('async function saveInventoryListingPrices(')),s.context);
  vm.runInContext(page.slice(page.indexOf('async function saveInventoryProductAll('),page.indexOf('/* COMBOS_LEGACY_MONOUSER_EDIT_JS_REMOVED */')),s.context);
  s.context.state.inventory={offset:0};
  s.context.state.inventoryItems=[{id:12,sku,stock:3,listings:[{marketplace:'ML',external_product_id:'ml',external_variant_id:'0'},{marketplace:'TN',external_product_id:'tn',external_variant_id:'v'}]}];
  for(const [id,value] of Object.entries({editSku:sku,editStock:'4',editName:sku,editCost:'',editListPrice:'',editItemType:'single',editListingPrice_0_0:'100',editListingPrice_0_1:'90',editListingStock_0_0:'3',editListingStock_0_1:'3'}))s.node(id).value=value;
  s.run(`warehouseUI.product.item.stock=3;warehouseUI.product.warehouses[0].stock=3;warehouseUI.product.warehouses[1].stock=0;
    warehouseUI.product.ml_origin={warehouse_id:'flores',revision:4};
    warehouseUI.editor={itemId:12,sku:state.inventoryItems[0].sku,product:warehouseUI.product,target:warehouseSingleStockTarget(warehouseUI.product)};`);
  s.context.fetchJson=async(path,options)=>{
    s.calls.push({path,options});
    return path.endsWith('/stock')?{changed:true,total_stock:4,new_stock:4,warehouse_stock_revision:3,sync_status:'pending'}:{new_stock:4,sync_jobs:[],sync_job_summary:{job_ids:[]}};
  };
  return s;
}
for(const sku of ['PCGRIP_AZU','PCGRIP_ROJ'])test(`${sku}: master stock uses selected depot and channel prices stay independent`,async()=>{
  const s=productEditor(sku);await s.run('saveInventoryProductAll(0)');
  assert.equal(s.calls.length,2);
  assert.match(s.calls[0].path,/products\/12\/warehouses\/flores\/stock$/);
  const stock=JSON.parse(s.calls[0].options.body);
  assert.equal(stock.stock,4);assert.equal(stock.expected_revision,2);assert.equal(stock.single_origin_revision,4);
  const metadata=JSON.parse(s.calls[1].options.body);
  assert.equal('stock' in metadata,false);assert.ok(metadata.listings.every(l=>!('stock' in l)));
  assert.deepEqual(metadata.listings.map(l=>l.price),[100,90]);
  assert.match(s.messages.at(-1)[1],new RegExp(`Stock de ${sku} guardado`));
  assert.doesNotMatch(s.messages.at(-1)[1],/sin cambios/);
});
test('split stock and missing origin keep total read-only',()=>{
  const s=productEditor();s.run('warehouseUI.product.warehouses[1].stock=1');
  assert.equal(s.run('warehouseSingleStockTarget(warehouseUI.product)'),null);
  s.run('warehouseUI.product.warehouses[1].stock=0;warehouseUI.product.ml_origin=null');
  assert.equal(s.run('warehouseSingleStockTarget(warehouseUI.product)'),null);
});
test('legacy editor still saves the master quantity to both listings',async()=>{
  const s=productEditor();s.run('warehouseUI.config.enabled=false');
  await s.run('saveInventoryProductAll(0)');
  assert.equal(s.calls.length,1);
  const body=JSON.parse(s.calls[0].options.body);
  assert.equal(body.stock,4);assert.ok(body.listings.every(l=>l.stock===4));
});
test('a late save cannot close or label a different SKU editor',async()=>{
  const s=productEditor();let release;
  s.context.fetchJson=async(path,options)=>{s.calls.push({path,options});if(path.endsWith('/stock'))return {changed:true,total_stock:4,new_stock:4,warehouse_stock_revision:3};await new Promise(r=>release=r);return {new_stock:4}};
  const saving=s.run('saveInventoryProductAll(0)');
  await new Promise(r=>setImmediate(r));
  s.node('editSku').value='PCGRIP_ROJ';s.node('editorBox').innerHTML='ROJ editor';
  s.run("warehouseUI.editor={itemId:13,sku:'PCGRIP_ROJ'}");const count=s.messages.length;
  release();await saving;
  assert.equal(s.node('editorBox').innerHTML,'ROJ editor');assert.equal(s.messages.length,count);
});
test('opening ROJ clears the previous AZU confirmation',()=>{
  const s=productEditor('PCGRIP_ROJ');s.run('warehouseUI.config.enabled=false');
  Object.assign(s.context,{rememberInventoryReturnPosition:()=>{},scrollToInventoryTool:()=>{},
    inventoryListPrice:()=>0,renderEditableListingsForItem:()=>'',jsq:String,
    setStatus:(id,text)=>{s.node(id).textContent=text}});
  s.node('invStatus').textContent='Stock de PCGRIP_AZU guardado';
  vm.runInContext(page.slice(page.indexOf('function renderEditProductTool('),page.indexOf('function cancelInventoryTool(')),s.context);
  s.run('renderEditProductTool(0)');
  assert.equal(s.node('invStatus').textContent,'');
  assert.match(s.node('editorBox').innerHTML,/PCGRIP_ROJ/);
});
test('a metadata failure reports stock already saved instead of no changes',async()=>{
  const s=productEditor('PCGRIP_ROJ');
  s.context.fetchJson=async path=>{if(path.endsWith('/stock'))return {changed:true,total_stock:4,new_stock:4,warehouse_stock_revision:3};throw Error('price service unavailable')};
  await s.run('saveInventoryProductAll(0)');
  assert.equal(s.context.state.inventoryItems[0].stock,4);
  assert.match(s.messages.at(-1)[0],/Stock de PCGRIP_ROJ guardado; faltó guardar otros cambios/);
});
test('loading a single-origin editor enables the master stock field',async()=>{
  const s=productEditor();const product=s.run('warehouseUI.product');
  s.context.fetchJson=async()=>product;
  await s.run('loadWarehouseInventoryEditor(warehouseUI.editor)');
  assert.equal(s.node('editStock').disabled,false);
  assert.match(s.node('inventoryWarehouseStockHint').textContent,/Flores/);
});
test('channel quantities render read-only while their prices stay editable',()=>{
  const s=productEditor();Object.assign(s.context,{listingPrice:()=>100,listingStock:()=>3,listingStatusTextSpan:()=>''});
  vm.runInContext(page.slice(page.indexOf('function renderEditableListingsForItem('),page.indexOf('async function unlinkInventoryListing(')),s.context);
  const html=s.run('renderEditableListingsForItem(state.inventoryItems[0],0)');
  assert.match(html,/<input id="editListingStock_0_0"[^>]*readonly/);
  assert.doesNotMatch(html,/<input id="editListingPrice_0_0"[^>]*readonly/);
});

test('missing origin stays unselected and blocks publication',async()=>{
  const s=screen();s.run('renderWarehouseProduct()');
  assert.match(s.node('warehouseProduct').innerHTML,/<option value="" selected>/);
  await s.run('saveWarehouseOrigin()');assert.equal(s.calls.length,0);
  assert.match(s.messages.at(-1)[1],/Elegí explícitamente/);
});
test('zero in selected warehouse does not switch to another warehouse',()=>{
  const s=screen();s.node('warehouseOrigin').value='flores';s.run('renderWarehouseOriginPreview()');
  assert.match(s.node('warehouseOriginPreview').textContent,/0 unidades desde Flores/);
  assert.equal(s.calls.length,0);
});
test('manual choice includes selected origin and expected revision',async()=>{
  const s=screen();s.node('warehouseOrigin').value='moron';await s.run('saveWarehouseOrigin()');
  const body=JSON.parse(s.calls[0].options.body);
  assert.equal(body.warehouse_id,'moron');assert.equal(body.expected_revision,0);
  assert.match(s.calls[0].path,/products\/12\/ml-origin$/);
});
test('cancelled confirmation sends no change',async()=>{
  const s=screen();s.context.confirm=()=>false;s.node('warehouseOrigin').value='moron';
  await s.run('saveWarehouseOrigin()');assert.equal(s.calls.length,0);
});
test('uncertain response retry keeps operation identifier',async()=>{
  const s=screen();s.node('warehouseOrigin').value='moron';
  s.context.fetchJson=async(path,options)=>{s.calls.push({path,options});throw Error('Sin respuesta')};
  await s.run('saveWarehouseOrigin()');await s.run('saveWarehouseOrigin()');
  assert.equal(JSON.parse(s.calls[0].options.body).request_id,JSON.parse(s.calls[1].options.body).request_id);
});
test('warehouse quantity sends only chosen warehouse and its revision',async()=>{
  const s=screen();s.node('whStock_0').value='0';await s.run('saveWarehouseQuantity(0)');
  assert.match(s.calls[0].path,/products\/12\/warehouses\/flores\/stock$/);
  assert.equal(JSON.parse(s.calls[0].options.body).expected_revision,2);
  assert.equal(JSON.parse(s.calls[0].options.body).stock,0);
});
test('empty quantity cannot become zero',async()=>{
  const s=screen();s.node('whStock_0').value='';await s.run('saveWarehouseQuantity(0)');
  assert.equal(s.calls.length,0);assert.match(s.messages.at(-1)[1],/cantidad entera/);
});
test('switching tenant discards prior origin and reviewed worksheet',async()=>{
  const s=screen();s.context.tenantId=()=> 'another';
  s.run('warehouseUI.sheet={reviewed:true}');await s.run('loadWarehouseMode()');
  assert.equal(s.run('warehouseUI.product'),null);assert.equal(s.run('warehouseUI.sheet'),null);
});
test('cancellation view counts allocation returns against the original order',()=>{
  const s=screen();vm.runInContext(restoreSource,s.context);
  const result=s.context.cancelledSaleRestoreState({stock_movements:[
    {reference_id:'order',sku:'A',quantity:-3,movement_type:'sale',reference_type:'order',warehouse_managed:true,warehouse_allocation_id:'allocation'},
    {reference_id:'allocation',order_reference_id:'order',sku:'A',quantity:1,movement_type:'sale_cancellation_restore',reference_type:'warehouse_allocation_return',warehouse_managed:true,warehouse_allocation_id:'allocation'},
    {reference_id:'allocation',order_reference_id:'order',sku:'A',quantity:2,movement_type:'sale_cancellation_restore',reference_type:'warehouse_allocation_return',warehouse_managed:true,warehouse_allocation_id:'allocation'}]});
  assert.equal(result.sold,3);assert.equal(result.restored,3);assert.equal(result.pending,0);
});
test('historical debit without warehouse proof is not offered as a depot return',()=>{
  const s=screen();vm.runInContext(restoreSource,s.context);
  assert.equal(s.context.cancelledSaleRestoreState({stock_movements:[{reference_id:'old-order',sku:'A',quantity:-2,movement_type:'sale',reference_type:'order',warehouse_managed:true}]}).pending,0);
});
test('legacy cancellation accounting remains unchanged',()=>{
  const s=screen();vm.runInContext(restoreSource,s.context);
  assert.equal(s.context.cancelledSaleRestoreState({stock_movements:[
    {reference_id:'order',sku:'A',quantity:-3,movement_type:'sale',reference_type:'order'},
    {reference_id:'order',sku:'A',quantity:1,movement_type:'sale_cancellation_restore',reference_type:'order_cancellation'}]}).pending,2);
});


test('differences show actual target and configuration blocker instead of generic text',async()=>{
  const s=screen();s.context.fetchJson=async()=>({items:[{sku:'A',marketplace:'ML',listing_id:'MLA1',variant_id:'0',observed_stock:8,target_stock:0,blocked_reason:'missing_ml_origin'}]});
  await s.run('loadWarehouseDifferences()');const html=s.node('warehouseDifferences').innerHTML;
  assert.match(html,/>8<\/td>/);assert.match(html,/>0<\/td>/);assert.match(html,/Falta elegir el origen ML/);assert.match(html,/no es una consulta en vivo/);
});
test('TN location selection preserves saved warehouse and refreshes after save',async()=>{
  const s=screen();s.run("warehouseUI.config.warehouses=[{id:'flores',name:'Flores',active:true}];warehouseUI.locations={store_id:'1',items:[{id:'loc',name:'Planeta Casa'}]};warehouseUI.config.tn_locations=[{store_id:'1',location_id:'loc',warehouse_id:'flores',revision:2}]");
  s.run('renderWarehouseTnLocations()');assert.match(s.node('warehouseTnLocations').innerHTML,/value="flores" selected/);
  s.node('whTn_0').value='flores';s.run('loadWarehouseMode=async()=>warehouseUI.config');await s.run('saveWarehouseTnLocation(0)');
  assert.match(s.node('warehouseTnLocations').innerHTML,/Actual: Flores/);assert.equal(JSON.parse(s.calls[0].options.body).expected_revision,2);
});
test('preparation blocks operational worksheet without network writes',async()=>{
  const s=screen();s.run('warehouseUI.config.enabled=false');await s.run('previewWarehouseSheet()');
  assert.equal(s.calls.length,0);assert.match(s.messages.at(-1)[1],/requiere MultiCD activo/);
});

test('unknown TN plan stays blocked after the request finishes while ERP controls remain usable',async()=>{
  const s=screen(),linkButton={disabled:false},erpButton={disabled:false};
  s.node('warehousePanel').querySelectorAll=selector=>selector==='button'?[linkButton,erpButton]:selector.startsWith('[onclick^')?[linkButton]:[];
  s.run('warehouseUI.locations={capacity:{known:false}}');await s.run('warehouseAction(async()=>{})');
  assert.equal(linkButton.disabled,true);assert.equal(erpButton.disabled,false);
});
