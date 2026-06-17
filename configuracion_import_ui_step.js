(function(){
  const A='https://api.xeleria.com.ar/api';
  const D='00000000-0000-0000-0000-000000000001';
  const BK='xeleria_import_batch_id_v3';
  const CK='xeleria_import_channel_v3';
  let busy=false,batch=localStorage.getItem(BK)||'',chan=localStorage.getItem(CK)||'ML',gridRows=[];
  const q=s=>document.querySelector(s);
  const tid=()=>localStorage.getItem('xeleria_tenant_id')||'';
  const ok=()=>tid()&&tid()!==D;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const safe=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const slug=s=>String(s??'').replace(/[^a-zA-Z0-9_-]/g,'_')||'SIN_SKU';
  const transient=e=>/Errno 11|Resource temporarily unavailable|temporarily unavailable|EAGAIN|Failed to fetch|NetworkError|Load failed/i.test(String(e?.message||e||''));
  const hasBatch=()=>!!batch;
  function invButtons(){const inv=q('#inventario');return inv?Array.from(inv.querySelectorAll('button')):[]}
  function mlb(){return invButtons().find(b=>/ML/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function tnb(){return invButtons().find(b=>/TN/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function msg(t,c){let e=q('#import_status');if(e){e.textContent=t;e.className=c||'status'}}
  function gridMsg(t,c){let e=q('#xi_grid_status');if(e){e.textContent=t;e.className=c||'status'}}
  function connected(ch){return q('#'+ch.toLowerCase()+'_card')?.classList.contains('connected')}
  function setDisabled(id,on){let b=q(id);if(b){b.disabled=!!on;b.title=on?'Guardá o cancelá la grilla pendiente primero':''}}
  function paint(ch,on){
    busy=on; const pending=hasBatch()&&!on;
    const m=mlb(),n=tnb();
    if(m){m.textContent=on&&ch==='ML'?'Importando ML...':'Importar ML';m.disabled=on||pending||!connected('ML')}
    if(n){n.textContent=on&&ch==='TN'?'Importando TN...':'Importar TN';n.disabled=on||pending||!connected('TN')}
    setDisabled('#ml_button',pending); setDisabled('#tn_button',pending);
  }
  function clearBatch(){localStorage.removeItem(BK);localStorage.removeItem(CK);batch='';chan='ML'}
  function hideOldPhrase(){const inv=q('#inventario');const p=inv?.querySelector('h2 + p.lead');if(p&&/revisa tus canales/i.test(p.textContent||''))p.remove()}
  function style(){if(q('#xi_grid_style'))return;let s=document.createElement('style');s.id='xi_grid_style';s.textContent=`
    #xi_grid_panel{margin-top:12px;border:1px solid #ded4be;background:#fffdf8;border-radius:0;box-shadow:none;overflow:hidden}
    #xi_grid_head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid #ded4be;background:#fffdf8}
    #xi_grid_head b{font-size:14px}#xi_grid_status{font-size:12px;color:#087345;margin-left:8px}
    #xi_grid_help{font-size:11px;color:#5b554c;padding:4px 10px;border-bottom:1px solid #eadfc9;background:#fffaf0}
    #xi_grid_wrap{height:calc(100vh - 310px);min-height:460px;max-height:640px;overflow-y:auto;overflow-x:hidden;background:white}
    #xi_grid_table{border-collapse:collapse;width:100%;min-width:0;table-layout:fixed;font-size:12px;line-height:1.15}
    #xi_grid_table th,#xi_grid_table td{border:1px solid #e5dac4;padding:4px 8px;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:36px}
    #xi_grid_table th{position:sticky;top:0;z-index:2;background:#eee4d1;text-align:left;font-size:13px;font-weight:900}
    #xi_grid_table th:nth-child(3),#xi_grid_table th:nth-child(4),#xi_grid_table td:nth-child(3),#xi_grid_table td:nth-child(4){text-align:center}
    #xi_grid_table .sku{font-weight:900}.nopub{color:#777;font-style:italic}.pub b{font-size:12px}.pub small{font-size:11px;color:#222;line-height:1.2}
    #xi_grid_table tr.new{background:#eefbe8}#xi_grid_table tr.missing_sku{background:#fff8c5}#xi_grid_table tr.missing_in_refresh{background:#fdecec}#xi_grid_table tr:hover{background:#fff8db}
    #xi_grid_table input[type=radio]{width:15px;height:15px;accent-color:#111}
    #xi_grid_actions{position:sticky;bottom:0;display:flex;gap:8px;align-items:center;padding:7px 10px;background:rgba(255,253,248,.94);border-top:1px solid #ded4be;backdrop-filter:blur(3px)}
    #xi_grid_actions button{height:30px;font-size:12px;border-radius:7px;padding:0 11px}.xi_save{background:#cdb272!important;border:0!important;color:#111!important;font-weight:900}.xi_cancel{background:#fff!important;border:1px solid #d7c9ae!important;color:#9a1f1f!important;font-weight:900}#xi_grid_actions span{font-size:11px;color:#6b6254}`;document.head.appendChild(s)}
  async function fetchJsonRetry(url,opt,label,max=8){let last=null;for(let i=1;i<=max;i++){try{const r=await fetch(url,opt);const j=await r.json().catch(()=>({ok:false,error:'Respuesta no JSON'}));if(!r.ok||!j.ok)throw new Error(j.error||j.detail||('HTTP '+r.status));return j}catch(e){last=e;if(!transient(e)||i===max)break;msg(`${label}: servidor ocupado, reintento ${i}/${max-1}...`,'warn');await sleep(Math.min(1200*i,5000))}}throw last||new Error(label+' falló')}
  function panel(){style();let p=q('#xi_grid_panel');if(p)return p;const inv=q('#inventario');p=document.createElement('div');p.id='xi_grid_panel';p.innerHTML=`<div id="xi_grid_head"><div><b>Grilla importada</b><span id="xi_grid_status"></span></div></div><div id="xi_grid_help">Revisá solo Simple/Combo. Esa definición pertenece al SKU completo, tanto para Tienda Nube como para Mercado Libre. Simple = producto normal. Combo = kit que descuenta componentes.</div><div id="xi_grid_wrap"><table id="xi_grid_table"><colgroup><col style="width:12%"><col style="width:38%"><col style="width:6%"><col style="width:6%"><col style="width:38%"></colgroup><thead><tr><th>SKU</th><th>Tienda Nube</th><th>Simple</th><th>Combo</th><th>Mercado Libre</th></tr></thead><tbody id="xi_grid_body"></tbody></table></div><div id="xi_grid_actions"><button class="xi_save" id="xi_grid_save">Guardar cambios</button><button class="xi_cancel" id="xi_grid_cancel">Cancelar</button><span>Guardar aplica lo revisado. Cancelar no cambia nada.</span></div>`;const legend=inv?.querySelector('.legend');if(legend)inv.insertBefore(p,legend);else inv?.appendChild(p);q('#xi_grid_save').onclick=saveBatch;q('#xi_grid_cancel').onclick=cancelBatch;return p}
  function cell(c,ch){if(!c)return '<span class="nopub">Sin publicación '+ch+'</span>';return '<div class="pub"><b>'+safe(c.title||'')+'</b><br><small>Publicación: '+safe(c.publication||'')+(c.variant?' / Variante: '+safe(c.variant):'')+'</small></div>'}
  function rowType(row){return (row?.tn?.bundle||row?.ml?.bundle)?'bundle':'simple'}
  function renderGrid(rows){gridRows=rows||[];let tb=q('#xi_grid_body');tb.innerHTML='';let simple=0,bundle=0,tn=0,ml=0;for(const row of gridRows){const k=slug(row.sku||'SIN_SKU'),type=rowType(row);if(type==='bundle')bundle++;else simple++;if(row.tn)tn++;if(row.ml)ml++;let tr=document.createElement('tr');tr.className=row.row_status||'';tr.innerHTML=`<td class="sku">${safe(row.sku||'SIN SKU')}</td><td>${cell(row.tn,'TN')}</td><td><input type="radio" name="xi_type_${k}" value="simple" ${type==='simple'?'checked':''}></td><td><input type="radio" name="xi_type_${k}" value="bundle" ${type==='bundle'?'checked':''}></td><td>${cell(row.ml,'ML')}</td>`;tb.appendChild(tr)}gridMsg(`ML: ${ml} · TN: ${tn} · ${gridRows.length} SKUs agrupados · Simple: ${simple} · Combo: ${bundle}`,'ok')}
  function selected(){const out=[];for(const row of gridRows){const k=slug(row.sku||'SIN_SKU');const type=q(`input[name="xi_type_${k}"]:checked`)?.value||'simple';for(const c of [row.tn,row.ml])if(c&&c.staging_id)out.push({staging_id:c.staging_id,item_type:type})}return out}
  async function openGrid(id,ch){if(!id)return;panel();gridMsg('Cargando grilla...','warn');let j=await fetchJsonRetry(A+'/inventory/import/batches/'+id+'/grid?tenant_id='+encodeURIComponent(tid()),{},'Cargando grilla',5);renderGrid(j.grid||[]);q('#xi_grid_panel')?.scrollIntoView({block:'start'});paint('',false)}
  function cancelBatch(){if(!confirm('Cancelar la grilla pendiente? No se guardará esta importación.'))return;clearBatch();q('#xi_grid_panel')?.remove();msg('Importación cancelada. Podés importar de nuevo.','warn');paint('',false)}
  async function saveBatch(){if(!batch)return gridMsg('No encontré batch activo.','bad');const bundles=gridRows.filter(r=>q(`input[name="xi_type_${slug(r.sku||'SIN_SKU')}"]:checked`)?.value==='bundle').length;if(!confirm(`Vas a guardar ${gridRows.length} SKUs.\nCombos marcados: ${bundles}.`))return;try{gridMsg('Guardando inventario real...','warn');let j=await fetchJsonRetry(A+'/inventory/import/batches/'+batch+'/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),rows:selected()})},'Guardando',4);gridMsg(`Guardado. Items: ${j.saved_items||0}, publicaciones: ${j.saved_listings||0}`,'ok');clearBatch();paint('',false)}catch(e){gridMsg(e.message||'Error guardando','bad')}}
  async function begin(ch){if(busy)return;if(hasBatch()){alert('Ya hay una grilla importada pendiente. Guardá cambios o cancelá antes de importar otro canal.');await openGrid(batch,chan);return}if(!ok())return alert('Falta tenant real');chan=ch;localStorage.setItem(CK,ch);paint(ch,true);try{msg('Iniciando '+ch+'...','warn');let j=await fetchJsonRetry(A+'/inventory/import/start-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),channel:ch})},'Iniciando '+ch,8);batch=j.batch_id;localStorage.setItem(BK,batch);await loop(ch)}catch(e){clearBatch();msg((e.message||'Error')+' · reintentá Importar '+ch,'bad')}finally{paint(ch,false)}}
  async function loop(ch){let done=false,lastP=0,lastT='?',doneBatch=batch;while(!done){let x=await fetchJsonRetry(A+'/inventory/import/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),batch_id:batch,limit:5})},'Importando '+ch,10);done=!!x.done;lastP=x.processed||lastP;lastT=x.total||lastT;msg('Importando '+ch+': '+lastP+' / '+lastT+' publicaciones','warn')}msg(ch+' importado. Revisá la grilla abajo.','ok');await openGrid(doneBatch,ch)}
  window.xeleriaOpenImportGrid=openGrid;
  function boot(){hideOldPhrase();let m=mlb(),n=tnb();if(m)m.onclick=function(){begin('ML')};if(n)n.onclick=function(){begin('TN')};if(m&&!q('#import_status')){const s=document.createElement('span');s.id='import_status';s.className='status';m.parentElement.appendChild(s)}paint('',false);if(batch){msg('Hay una grilla importada pendiente. Guardá cambios o cancelá antes de conectar/importar otro canal.','warn');openGrid(batch,chan).catch(e=>{msg('No pude recuperar la grilla pendiente: '+(e.message||e),'bad');clearBatch();paint('',false)})}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();setTimeout(boot,1200);setTimeout(boot,2500);
})();
