'use strict';

const warehouseUI={tenant:'',config:null,product:null,requests:new Map(),sheet:null,busy:false};
function warehouseRequest(key,body){
  const signature=JSON.stringify(body),old=warehouseUI.requests.get(key);
  if(old?.signature===signature)return {...body,request_id:old.id};
  const id=crypto.randomUUID();warehouseUI.requests.set(key,{signature,id});return {...body,request_id:id};
}
async function loadWarehouseMode(force=false){
  const tenant=tenantId();
  if(warehouseUI.tenant!==tenant){warehouseUI.tenant=tenant;warehouseUI.config=null;warehouseUI.product=null;warehouseUI.requests.clear();warehouseUI.sheet=null;warehouseUI.locations=null}
  if(force||!warehouseUI.config)warehouseUI.config=await fetchJson('/admin/v2/warehouses',{retrySafeGet:false});
  return warehouseUI.config;
}
function warehouseMode(){return warehouseUI.tenant===tenantId()&&warehouseUI.config?.enabled===true}
function warehousePanel(){return qs('warehousePanel')}
function warehouseInteger(value,label){if(!/^\d+$/.test(String(value)))throw Error(label+': indica una cantidad entera, incluso si es cero.');const n=Number(value);if(!Number.isSafeInteger(n))throw Error(label+': cantidad fuera de rango.');return n}
async function warehouseAction(action){
  if(warehouseUI.busy)return;
  warehouseUI.busy=true;warehousePanel()?.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await action()}catch(e){setStatus('warehouseStatus',errText(e)||String(e),false)}
  finally{warehouseUI.busy=false;warehousePanel()?.querySelectorAll('button').forEach(b=>b.disabled=false);warehousePanel()?.querySelectorAll('[onclick^="saveWarehouseTnLocation("]').forEach(b=>b.disabled=warehouseUI.locations?.capacity?.known===false);if(!warehouseMode()){['warehouseSheetFile'].forEach(id=>{if(qs(id))qs(id).disabled=true});warehousePanel()?.querySelectorAll('[onclick="downloadWarehouseSheet()"],[onclick="previewWarehouseSheet()"]').forEach(b=>b.disabled=true)}}
}
async function openWarehousePanel(){
  const panel=warehousePanel();panel.classList.remove('hidden');
  panel.innerHTML='<h3>Depósitos</h3><div id="warehouseStatus" class="status">Consultando depósitos…</div>';
  try{await loadWarehouseMode(true);renderWarehousePanel()}catch(e){setStatus('warehouseStatus',errText(e),false)}
  panel.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderWarehousePanel(){
  const c=warehouseUI.config;if(!c)return;
  warehousePanel().innerHTML=`<div class="btnrow"><h3>Depósitos</h3><button class="secondary" onclick="warehousePanel().classList.add('hidden')">Cerrar</button></div>
  <p>${c.enabled?'Stock por depósito habilitado.':'Preparación: los cambios de cantidades y origen todavía no se envían a los canales.'} Mercado Libre usa un único origen por SKU. Si se agota, queda en cero hasta que decidas cambiarlo.</p>
  <p>Xeli y MultiCD comparten la misma configuración de origen por SKU. XelerIA administra tus depósitos; Tiendanube habilita los centros vinculados según el plan de esa tienda.</p>
  ${(c.xeli_origins||[]).length?`<p>Orígenes ya cargados en Xeli: ${c.xeli_origins.map(o=>`CP ${esc(o.origin_postal_code)} (${esc(o.sku_count)} SKU)`).join(' · ')}. Se conservan como referencia; confirmá qué depósito corresponde a cada uno.</p>`:''}
  <p>1. Agregá tus depósitos. 2. Vinculá las ubicaciones TN. 3. En cada producto, confirmá el reparto y elegí el origen ML.</p>
  <div class="tableWrap"><table><thead><tr><th>Depósito</th><th>Código</th><th>Código postal</th><th>Dirección</th><th>Horario</th><th>Estado</th><th>Tiendanube</th><th></th></tr></thead><tbody>${c.warehouses.map((w,i)=>`<tr><td><input aria-label="Nombre del depósito" id="whName_${i}" value="${esc(w.name)}"></td><td><input aria-label="Código del depósito" id="whCode_${i}" value="${esc(w.code)}"></td><td><input aria-label="Código postal del depósito" id="whPostal_${i}" value="${esc(w.postal_code)}"></td><td><input aria-label="Dirección del depósito" id="whAddress_${i}" value="${esc(w.address_line||'')}" maxlength="300"></td><td><input aria-label="Horario del depósito" id="whHours_${i}" value="${esc(w.opening_hours||'')}" maxlength="300"></td><td><select aria-label="Estado del depósito" id="whActive_${i}"><option value="true" ${w.active?'selected':''}>Activo</option><option value="false" ${w.active?'':'selected'}>Inactivo</option></select></td><td>${c.tn_locations.some(m=>m.warehouse_id===w.id)?'Vinculado':'Sin vínculo TN · disponible para ML y Xeli'}</td><td><button class="secondary" onclick="saveWarehouse(${i})">Guardar</button></td></tr>`).join('')||'<tr><td colspan="8">Todavía no hay depósitos. Agregá el primero para comenzar.</td></tr>'}</tbody></table></div>
  <details><summary>Agregar depósito</summary><div class="grid"><div class="col-4"><label>Nombre</label><input id="whNewName"></div><div class="col-4"><label>Código breve</label><input id="whNewCode" maxlength="32"></div><div class="col-4"><label>Código postal</label><input id="whNewPostal"></div></div><div class="grid"><div class="col-6"><label>Dirección</label><input id="whNewAddress" maxlength="300"></div><div class="col-6"><label>Horario</label><input id="whNewHours" maxlength="300"></div></div><button class="secondary" onclick="saveWarehouse(-1)">Agregar depósito</button></details>
  <div class="btnrow"><button class="secondary" onclick="loadWarehouseTnLocations()">Vincular ubicaciones de Tiendanube</button><button class="secondary" onclick="loadWarehouseDifferences()">Ver diferencias de stock</button><button class="secondary" onclick="loadWarehouseIncidents()">Revisar actualizaciones de stock sin confirmar</button><button class="secondary" onclick="loadWarehousePublicationIncidents()">Revisar publicaciones sin confirmar</button></div>
  <div id="warehouseTnLocations"></div><div id="warehouseDifferences"></div><div id="warehouseIncidents"></div><div id="warehousePublicationIncidents"></div>
  <p>Para revisar un SKU, abrí su menú en Productos y elegí «Depósitos y origen ML».</p>
  <h4>Planilla operativa de cantidades</h4><p>${c.enabled?'Editá solo cantidades de productos simples con reparto preparado. El origen ML se elige desde cada producto.':'Disponible después de activar MultiCD. Para preparar el inventario, confirmá el reparto desde el menú de cada producto; esta planilla no sirve para la carga inicial.'}</p>
  <div class="btnrow"><button class="secondary" onclick="downloadWarehouseSheet()" ${c.enabled?'':'disabled'}>Bajar planilla de productos visibles</button><input aria-label="Planilla de stock por depósito" type="file" accept=".xlsx" id="warehouseSheetFile" onchange="warehouseUI.sheet=null;qs('warehouseSheetPreview').textContent=''" ${c.enabled?'':'disabled'}><button class="secondary" onclick="previewWarehouseSheet()" ${c.enabled?'':'disabled'}>Revisar planilla</button></div><div id="warehouseSheetPreview"></div>
  <div id="warehouseStatus" class="status" role="status"></div><div id="warehouseProduct"></div>`;
  if(warehouseUI.product)renderWarehouseProduct();
}
function saveWarehouse(index){return warehouseAction(async()=>{
  const old=index<0?null:warehouseUI.config.warehouses[index],suffix=index<0?'New':'_'+index;
  const body={name:fieldVal('wh'+(index<0?'NewName':'Name'+suffix)).trim(),code:fieldVal('wh'+(index<0?'NewCode':'Code'+suffix)).trim(),
    postal_code:fieldVal('wh'+(index<0?'NewPostal':'Postal'+suffix)).trim(),active:index<0||fieldVal('whActive'+suffix)==='true',expected_revision:old?.revision||0,
    address_line:fieldVal(index<0?'whNewAddress':'whAddress_'+index).trim(),opening_hours:fieldVal(index<0?'whNewHours':'whHours_'+index).trim()};
  if(!body.name||!body.code||!body.postal_code)throw Error('Completá nombre, código y código postal.');
  const request=warehouseRequest('warehouse:'+index,body),id=old?.id||request.request_id;
  await fetchJson('/admin/v2/warehouses/'+id,{method:'PUT',body:JSON.stringify(request)});
  await loadWarehouseMode(true);renderWarehousePanel();setStatus('warehouseStatus','Depósito guardado.',true);
})}
async function openWarehouseProduct(index){
  const item=state.inventoryItems[index];if(!item)return;
  await openWarehousePanel();if(!warehouseUI.config)return;
  await warehouseAction(async()=>{warehouseUI.product=await fetchJson(`/admin/v2/inventory/products/${encodeURIComponent(item.id)}/warehouses`);renderWarehouseProduct();qs('warehouseProduct').scrollIntoView({behavior:'smooth',block:'start'})});
}
function renderWarehouseProduct(){
  const p=warehouseUI.product,c=warehouseUI.config;if(!p||!c||!qs('warehouseProduct'))return;
  const combo=['bundle','combo','kit','combos'].includes(String(p.item.item_type||'').toLowerCase()),origin=p.ml_origin;
  const options=p.warehouses.filter(w=>w.active&&w.stock!==null).map(w=>`<option value="${esc(w.warehouse_id)}" ${origin?.warehouse_id===w.warehouse_id?'selected':''}>${esc(w.name)} · ${esc(w.stock)} unidades · CP ${esc(w.postal_code)}</option>`).join('');
  qs('warehouseProduct').innerHTML=`<hr><h3>${esc(p.item.sku)} · stock por depósito</h3><p>Stock total: ${esc(p.item.stock)}. ${combo?'El stock del combo se calcula con componentes del mismo depósito.':'Las cantidades sin revisar se muestran vacías; no se toman como cero.'}</p>
    ${p.xeli_origin_postal_code?`<p>CP ya registrado en Xeli para este SKU: <b>${esc(p.xeli_origin_postal_code)}</b>. Usalo como referencia para confirmar su depósito; no se asigna automáticamente.</p>`:''}
    <div class="tableWrap"><table><thead><tr><th>Depósito</th><th>Cantidad</th><th>Origen ML</th><th></th></tr></thead><tbody>${p.warehouses.map((w,i)=>`<tr><td>${esc(w.name)}${w.active?'':' (inactivo)'}</td><td><input aria-label="Cantidad en ${esc(w.name)}" id="whStock_${i}" type="number" min="0" step="1" value="${w.stock===null?'':esc(w.stock)}" ${combo||(!w.active)?'disabled':''}></td><td>${w.ml_origin?'Elegido':''}</td><td>${c.enabled&&!combo&&w.active&&w.stock_revision?`<button class="secondary" onclick="saveWarehouseQuantity(${i})">Guardar cantidad</button>`:''}</td></tr>`).join('')}</tbody></table></div>
    ${combo?'<button class="secondary" onclick="prepareWarehouseBundle()">Calcular por depósito</button>':(!c.enabled||p.warehouses.every(w=>w.stock===null)?'<button class="secondary" onclick="prepareWarehouseDistribution()">Confirmar reparto revisado</button>':'')}
    ${p.warehouses.length?'':'<p>Primero agregá un depósito desde el panel superior.</p>'}
    <label for="warehouseOrigin">Origen obligatorio de Mercado Libre</label><select id="warehouseOrigin" onchange="renderWarehouseOriginPreview()"><option value="" ${origin?'':'selected'}>Elegí desde dónde podés despachar</option>${options}</select>
    <p id="warehouseOriginPreview"></p><button class="primary" onclick="saveWarehouseOrigin()">Confirmar origen elegido</button><p class="small">No hay reemplazo automático de depósito. Los pedidos anteriores conservan su origen.</p>`;
  renderWarehouseOriginPreview();
}
function renderWarehouseOriginPreview(){
  const selected=warehouseUI.product?.warehouses.find(w=>w.warehouse_id===fieldVal('warehouseOrigin'));
  if(qs('warehouseOriginPreview'))qs('warehouseOriginPreview').textContent=selected?`Mercado Libre tendrá ${selected.stock} unidades desde ${selected.name}. Verificá que puedas preparar y despachar desde allí a tiempo.`:'Falta elegir un depósito: no se puede sincronizar stock con Mercado Libre.';
}
async function reloadWarehouseProduct(){
  warehouseUI.product=await fetchJson(`/admin/v2/inventory/products/${warehouseUI.product.item.id}/warehouses`);renderWarehouseProduct();
}
function saveWarehouseQuantity(index){return warehouseAction(async()=>{
  const p=warehouseUI.product,w=p.warehouses[index],stock=warehouseInteger(fieldVal('whStock_'+index),'Cantidad');
  const body=warehouseRequest('stock:'+p.item.id+':'+w.warehouse_id,{stock,expected_revision:w.stock_revision});
  await fetchJson(`/admin/v2/inventory/products/${p.item.id}/warehouses/${w.warehouse_id}/stock`,{method:'PUT',body:JSON.stringify(body)});
  await reloadWarehouseProduct();setStatus('warehouseStatus','Cantidad guardada. La sincronización con los canales queda pendiente de confirmación.',true);
})}
function prepareWarehouseDistribution(){return warehouseAction(async()=>{
  const p=warehouseUI.product,levels=p.warehouses.map((w,i)=>({warehouse_id:w.warehouse_id,text:fieldVal('whStock_'+i),active:w.active})).filter(w=>w.active||w.text!=='').map(w=>({warehouse_id:w.warehouse_id,stock:warehouseInteger(w.text,'Reparto')}));
  if(levels.reduce((n,w)=>n+w.stock,0)!==p.item.stock)throw Error('El reparto debe sumar el stock total actual.');
  const body=warehouseRequest('distribution:'+p.item.id,{expected_stock:p.item.stock,levels});
  await fetchJson(`/admin/v2/inventory/products/${p.item.id}/warehouse-distribution`,{method:'PUT',body:JSON.stringify(body)});
  await reloadWarehouseProduct();setStatus('warehouseStatus','Reparto preparado. Ahora elegí el origen de Mercado Libre.',true);
})}
function prepareWarehouseBundle(){return warehouseAction(async()=>{
  const id=warehouseUI.product.item.id,body=warehouseRequest('bundle:'+id,{});
  await fetchJson(`/admin/v2/inventory/products/${id}/warehouse-bundle`,{method:'PUT',body:JSON.stringify(body)});
  await reloadWarehouseProduct();setStatus('warehouseStatus','Disponibilidad del combo calculada por depósito. Revisá su origen ML.',true);
})}
function saveWarehouseOrigin(){return warehouseAction(async()=>{
  const p=warehouseUI.product,warehouse_id=fieldVal('warehouseOrigin'),w=p.warehouses.find(row=>row.warehouse_id===warehouse_id);
  if(!w)throw Error('Elegí explícitamente un depósito de origen.');
  if(!confirm(`¿Confirmás despachar ${p.item.sku} desde ${w.name}?\nMercado Libre tendrá ${w.stock} unidades. Los pedidos anteriores conservan su origen.`))return;
  const body=warehouseRequest('origin:'+p.item.id,{warehouse_id,expected_revision:p.ml_origin?.revision||0});
  await fetchJson(`/admin/v2/inventory/products/${p.item.id}/ml-origin`,{method:'PUT',body:JSON.stringify(body)});
  await reloadWarehouseProduct();setStatus('warehouseStatus',warehouseMode()?'Origen guardado. La actualización de Mercado Libre queda pendiente de confirmación.':'Origen preparado. Todavía no se actualizan los canales.',true);
})}
function loadWarehouseTnLocations(){return warehouseAction(async()=>{
  warehouseUI.locations=await fetchJson('/admin/v2/warehouses/tn-locations');renderWarehouseTnLocations();
})}
function renderWarehouseTnLocations(){
  const data=warehouseUI.locations;
  qs('warehouseTnLocations').innerHTML=`<h4>Ubicaciones de Tiendanube</h4><p>${data.capacity?.known?(data.capacity.unlimited?'El plan de Tiendanube admite centros sin límite.':`Tu plan de Tiendanube admite hasta ${esc(data.capacity.max_locations)} centro(s).`):'No se pudo determinar el límite del plan; los nuevos vínculos TN quedan bloqueados hasta verificarlo.'} Los depósitos sin vínculo TN siguen disponibles para ML y Xeli.</p>${data.items.map((location,i)=>{const map=warehouseUI.config.tn_locations.find(m=>m.store_id===data.store_id&&m.location_id===location.id);const options=warehouseUI.config.warehouses.filter(w=>w.active||w.id===map?.warehouse_id).map(w=>`<option value="${esc(w.id)}" ${w.id===map?.warehouse_id?'selected':''}>${esc(w.name)}${w.active?'':' (inactivo)'}</option>`).join('');return `<div class="btnrow"><label>${esc(typeof location.name==='object'?Object.values(location.name)[0]:location.name)} <select id="whTn_${i}"><option value="">Elegí un depósito</option>${options}</select></label><button class="secondary" onclick="saveWarehouseTnLocation(${i})" ${data.capacity&&!data.capacity.known?'disabled':''}>Guardar vínculo</button><span>${map?'Actual: '+esc(warehouseUI.config.warehouses.find(w=>w.id===map.warehouse_id)?.name||''):'Sin vincular'}</span></div>`}).join('')||'<p>La tienda no informó ubicaciones.</p>'}`;
}
function saveWarehouseTnLocation(index){return warehouseAction(async()=>{
  const data=warehouseUI.locations,location=data.items[index],warehouse_id=fieldVal('whTn_'+index);
  if(!warehouse_id)throw Error('Elegí el depósito que corresponde a esa ubicación.');
  const old=warehouseUI.config.tn_locations.find(m=>m.store_id===data.store_id&&m.location_id===location.id);
  const body=warehouseRequest('tn:'+location.id,{warehouse_id,expected_revision:old?.revision||0});
  await fetchJson('/admin/v2/warehouses/tn-locations/'+encodeURIComponent(location.id),{method:'PUT',body:JSON.stringify(body)});
  await loadWarehouseMode(true);renderWarehouseTnLocations();setStatus('warehouseStatus','Ubicación vinculada al depósito elegido.',true);
})}
function warehouseDifferenceReason(row){
  const reasons={missing_ml_origin:'Falta elegir el origen ML',inactive_warehouse:'El depósito está inactivo',missing_warehouse_stock:'Falta revisar el stock del depósito',unbalanced_distribution:'El reparto no coincide con el stock total',missing_channel_observation:'Falta una lectura confirmada del canal',missing_tn_store:'Falta conectar Tiendanube',missing_tn_locations:'Faltan ubicaciones TN',unmapped_tn_location:'La ubicación TN no está vinculada',unlimited_channel_stock:'El canal informa stock sin límite'};
  return row.blocked_reason?(reasons[row.blocked_reason]||row.blocked_reason):'El stock del canal difiere del objetivo';
}
function loadWarehouseDifferences(){return warehouseAction(async()=>{
  const data=await fetchJson('/admin/v2/warehouses/stock-differences');
  const value=n=>n===null||n===undefined?'Sin confirmar':esc(n);
  qs('warehouseDifferences').innerHTML='<h4>Diferencias por destino</h4><p>Comparación con la última lectura guardada del canal; no es una consulta en vivo ni aplica correcciones. En preparación indica lo que falta configurar.</p><div class="tableWrap"><table><thead><tr><th>SKU</th><th>Canal / publicación / variante</th><th>Ubicación TN</th><th>Stock del canal</th><th>Stock objetivo</th><th>Motivo</th></tr></thead><tbody>'+(data.items||[]).map(row=>`<tr><td>${esc(row.sku)}</td><td>${esc(row.marketplace)} · ${esc(row.listing_id)} · ${esc(row.variant_id)}</td><td>${esc(row.location_id||'—')}</td><td>${value(row.observed_stock)}</td><td>${value(row.target_stock)}</td><td>${esc(warehouseDifferenceReason(row))}</td></tr>`).join('')+'</tbody></table></div>';
  if(!data.items?.length)qs('warehouseDifferences').textContent='No hay diferencias informadas en la última lectura guardada.';
  else if(data.items.length>=100)qs('warehouseDifferences').innerHTML+='<p>Se muestran hasta 100 resultados.</p>';
})}
function loadWarehouseIncidents(){return warehouseAction(async()=>{
  const data=await fetchJson('/admin/v2/warehouses/stock-incidents');warehouseUI.incidents=data.items||[];
  qs('warehouseIncidents').innerHTML='<h4>Actualizaciones de stock sin confirmar</h4><p>No alcanza con consultar el stock actual: una solicitud anterior podría seguir pendiente en el canal. Conciliá solamente después de verificar que terminó.</p>'+warehouseUI.incidents.map((row,i)=>`<div class="card"><b>${esc(row.sku)} · ${esc(row.marketplace)} · ${esc(row.listing_id)}</b><p>El cambio de origen queda bloqueado hasta resolver esta solicitud.</p><label>Evidencia de finalización de la solicitud anterior<textarea id="whIncidentNote_${i}" minlength="20" maxlength="2000" placeholder="Indicá qué verificaste, cuándo y la referencia del canal o soporte."></textarea></label><label><input type="checkbox" id="whIncidentSettled_${i}"> Verifiqué que la solicitud anterior terminó y que el canal no tiene una actualización pendiente.</label><button class="secondary" onclick="resolveWarehouseIncident(${i})">Registrar conciliación y permitir nuevo objetivo</button></div>`).join('');
  if(!warehouseUI.incidents.length)qs('warehouseIncidents').textContent='No hay actualizaciones sin confirmar.';
})}
function resolveWarehouseIncident(index){return warehouseAction(async()=>{
  const row=warehouseUI.incidents[index],resolution_note=fieldVal('whIncidentNote_'+index).trim();
  if(!qs('whIncidentSettled_'+index)?.checked||resolution_note.length<20)throw Error('Confirmá que la solicitud terminó e indicá evidencia de esa verificación.');
  const body=warehouseRequest('incident:'+row.id,{confirmed_settled:true,resolution_note,expected_updated_at:row.updated_at});
  await fetchJson('/admin/v2/warehouses/stock-incidents/'+encodeURIComponent(row.id)+'/resolve',{method:'POST',body:JSON.stringify(body)});
  qs('warehouseIncidents').textContent='Conciliación registrada. El próximo envío debe recalcular el objetivo vigente; esta acción no cambió cantidades ni depósito.';
})}
function loadWarehousePublicationIncidents(){return warehouseAction(async()=>{
  const data=await fetchJson('/admin/v2/warehouses/publication-incidents');warehouseUI.publicationIncidents=data.items||[];
  qs('warehousePublicationIncidents').innerHTML='<h4>Creaciones de publicaciones sin conciliar</h4><p>Verificá el resultado en el canal. Si el producto existe, vinculalo al SKU antes de resolver. No crees otra publicación para reemplazar una respuesta incierta.</p>'+warehouseUI.publicationIncidents.map((row,i)=>`<div class="card"><b>${esc(row.sku)} · ${esc(row.marketplace)}</b><p>${row.created_product_id?'Producto creado: '+esc(row.created_product_id):'El canal no confirmó un identificador.'}</p><label>Resultado verificado<select id="whPublishDisposition_${i}"><option value="">Elegí el resultado</option><option value="linked">El producto existe y ya lo vinculé a este SKU</option>${row.created_product_id?'':'<option value="not_created">El canal confirmó que no se creó ningún producto</option>'}</select></label><label>Identificador del producto creado<input id="whPublishProduct_${i}" value="${esc(row.created_product_id||'')}"></label><label>Evidencia<textarea id="whPublishNote_${i}" minlength="20" maxlength="2000"></textarea></label><label><input type="checkbox" id="whPublishSettled_${i}"> Verifiqué que la creación anterior terminó y no sigue pendiente en el canal.</label><button class="secondary" onclick="resolveWarehousePublicationIncident(${i})">Registrar resultado verificado</button></div>`).join('');
  if(!warehouseUI.publicationIncidents.length)qs('warehousePublicationIncidents').textContent='No hay publicaciones sin conciliar.';
})}
function resolveWarehousePublicationIncident(index){return warehouseAction(async()=>{
  const row=warehouseUI.publicationIncidents[index],disposition=fieldVal('whPublishDisposition_'+index),resolution_note=fieldVal('whPublishNote_'+index).trim();
  if(!disposition||!qs('whPublishSettled_'+index)?.checked||resolution_note.length<20)throw Error('Elegí el resultado, confirmá la finalización e indicá evidencia de la verificación.');
  const body=warehouseRequest('publication-incident:'+row.request_id,{confirmed_settled:true,resolution_note,
    expected_state:row.state,disposition,created_product_id:fieldVal('whPublishProduct_'+index).trim()||null});
  await fetchJson('/admin/v2/warehouses/publication-incidents/'+encodeURIComponent(row.request_id)+'/resolve',{method:'POST',body:JSON.stringify(body)});
  qs('warehousePublicationIncidents').textContent='Resultado registrado. Revisá el stock por depósito antes de sincronizar o preparar otro borrador.';
})}
function downloadWarehouseSheet(){return warehouseAction(async()=>{
  if(!warehouseMode())throw Error('La planilla operativa requiere MultiCD activo. Prepará el reparto desde cada producto.');
  const ids=(state.inventoryItems||[]).filter(i=>!inventoryIsBundle(i)).map(i=>i.id);
  if(!ids.length)throw Error('Buscá los productos simples que querés incluir en la planilla.');
  const r=await fetch(url('/admin/v2/warehouses/stock-sheet?product_ids='+encodeURIComponent(ids.join(','))),{headers:xeleriaHeaders()});
  if(!r.ok)throw Error('No se pudo exportar. Revisá que los productos tengan reparto por depósito.');
  const blob=await r.blob(),link=document.createElement('a'),href=URL.createObjectURL(blob);link.href=href;link.download='Stock-por-deposito.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);
})}
async function uploadWarehouseSheet(confirmChanges){
  if(!warehouseMode())throw Error('La planilla operativa requiere MultiCD activo.');
  const saved=warehouseUI.sheet,file=qs('warehouseSheetFile')?.files?.[0];if(!file)throw Error('Elegí la planilla por depósito.');
  if(!saved||saved.file!==file)warehouseUI.sheet={file,id:crypto.randomUUID(),reviewed:false};
  if(confirmChanges&&!warehouseUI.sheet.reviewed)throw Error('Primero revisá la planilla.');
  const form=new FormData();form.append('file',file);const headers=xeleriaHeaders();delete headers['Content-Type'];
  const r=await fetch(url(`/admin/v2/warehouses/stock-sheet?request_id=${warehouseUI.sheet.id}&confirm=${confirmChanges?'true':'false'}`),{method:'POST',headers,body:form});
  const data=await r.json();if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'No se pudo revisar la planilla.');return data;
}
function previewWarehouseSheet(){return warehouseAction(async()=>{
  const data=await uploadWarehouseSheet(false);warehouseUI.sheet.reviewed=true;
  qs('warehouseSheetPreview').innerHTML=`<p>${esc(data.changed_rows)} cantidades cambian. Se aplican todas juntas; si alguna cambió desde la exportación se rechaza el archivo completo. El origen ML no se modifica.</p><button class="primary" onclick="confirmWarehouseSheet()">Confirmar cantidades revisadas</button>`;
})}
function confirmWarehouseSheet(){return warehouseAction(async()=>{
  const data=await uploadWarehouseSheet(true);qs('warehouseSheetPreview').textContent=`${data.changed_rows} cantidades actualizadas. Sincronización con los canales pendiente de confirmación.`;
  if(warehouseUI.product)await reloadWarehouseProduct();
})}
