import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../admin_multicd.js',import.meta.url),'utf8');
const page=fs.readFileSync(new URL('../admin_erp.html',import.meta.url),'utf8');
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
