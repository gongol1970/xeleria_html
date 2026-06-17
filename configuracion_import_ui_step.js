(function(){
  const A='https://api.xeleria.com.ar/api';
  const D='00000000-0000-0000-0000-000000000001';
  const BK='xeleria_import_batch_id_v3';
  const CK='xeleria_import_channel_v3';
  let busy=false,batch=localStorage.getItem(BK)||'',chan=localStorage.getItem(CK)||'ML',gridRows=[];

  function q(s){return document.querySelector(s)}
  function all(){const inv=q('#inventario');return inv?Array.from(inv.querySelectorAll('button')):[]}
  function mlb(){return all().find(b=>/ML/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function tnb(){return all().find(b=>/TN/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function tid(){return localStorage.getItem('xeleria_tenant_id')||''}
  function ok(){const x=tid();return x&&x!==D}
  function msg(x,c){let e=q('#import_status');if(e){e.textContent=x;e.className=c||'status'}}
  function modalMsg(x,c){let e=q('#xi_grid_status');if(e){e.textContent=x;e.className=c||'status'}}
  function connected(ch){return q('#'+ch.toLowerCase()+'_card')?.classList.contains('connected')}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
  function safe(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
  function slug(s){return String(s??'').replace(/[^a-zA-Z0-9_-]/g,'_')||'SIN_SKU'}
  function isTransient(e){return /Errno 11|Resource temporarily unavailable|temporarily unavailable|EAGAIN|Failed to fetch|NetworkError|Load failed/i.test(String(e?.message||e||''))}

  function hideOldPhrase(){
    const inv=q('#inventario');
    if(!inv)return;
    const p=inv.querySelector('h2 + p.lead');
    if(p && /revisa tus canales/i.test(p.textContent||''))p.remove();
  }

  function paint(ch,on){
    busy=on;
    const m=mlb(),n=tnb();
    if(m){m.textContent=on&&ch==='ML'?'Importando ML...':(batch&&chan==='ML'?'Continuar ML':'Importar ML');m.disabled=on||!connected('ML')}
    if(n){n.textContent=on&&ch==='TN'?'Importando TN...':(batch&&chan==='TN'?'Continuar TN':'Importar TN');n.disabled=on||!connected('TN')}
  }

  async function fetchJsonRetry(url,opt,label,max=8){
    let lastErr=null;
    for(let i=1;i<=max;i++){
      try{
        const r=await fetch(url,opt);
        const j=await r.json().catch(()=>({ok:false,error:'Respuesta no JSON'}));
        if(!r.ok || !j.ok) throw new Error(j.error||j.detail||('HTTP '+r.status));
        return j;
      }catch(e){
        lastErr=e;
        if(!isTransient(e) || i===max)break;
        const wait=Math.min(1200*i,5000);
        msg(`${label}: servidor ocupado, reintento ${i}/${max-1}...`,'warn');
        await sleep(wait);
      }
    }
    throw lastErr||new Error(label+' falló');
  }

  function modal(){
    let m=q('#xi_grid_modal');
    if(m)return m;
    let d=document.createElement('div');
    d.id='xi_grid_modal';
    d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:none;padding:24px;overflow:auto';
    d.innerHTML=`
      <div style="background:#fffdf8;border-radius:18px;padding:18px;max-width:1250px;margin:auto;border:1px solid #ded4be">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;margin-bottom:12px">
          <div>
            <h3 style="margin:0 0 4px">Paso 2 de 2 · Revisar inventario importado</h3>
            <div id="xi_grid_status" class="status"></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="xi_grid_save" class="gold">Guardar inventario real</button>
            <button id="xi_grid_close">Cerrar sin guardar</button>
          </div>
        </div>
        <div style="background:#fff8c5;border:1px solid #ded4be;border-radius:14px;padding:12px 14px;margin:8px 0 12px;line-height:1.45">
          <b>Qué tenés que hacer:</b><br>
          1) Revisá solamente las columnas <b>Simple</b> y <b>Bundle</b>.<br>
          2) Dejá <b>Simple</b> para un producto normal.<br>
          3) Marcá <b>Bundle</b> solo si ese SKU es un combo/kit que debe descontar componentes.<br>
          4) Si Tienda Nube dice <b>Sin publicación</b>, no es error: todavía no se importó TN.
        </div>
        <div id="xi_grid_summary" style="font-size:13px;color:#5b554c;margin:0 0 8px"></div>
        <div style="overflow:auto;max-height:70vh">
          <table class="importTable" style="min-width:1040px;width:100%;border-collapse:collapse;font-size:14px">
            <thead><tr><th>SKU</th><th>Tienda Nube</th><th>Mercado Libre</th><th>Simple</th><th>Bundle</th></tr></thead>
            <tbody id="xi_grid_body"></tbody>
          </table>
        </div>
        <div style="font-size:12px;color:#5b554c;margin-top:8px">La clasificación Simple/Bundle es única por SKU. No depende del canal.</div>
      </div>`;
    document.body.appendChild(d);
    q('#xi_grid_close').onclick=()=>d.style.display='none';
    q('#xi_grid_save').onclick=saveBatch;
    return d;
  }

  function cell(c){
    if(!c)return '<span style="color:#8a8172;font-style:italic">Sin publicación</span>';
    return '<b>'+safe(c.title||'')+'</b><br><small>'+safe(c.variant_title||'')+'<br>Publicación: '+safe(c.publication||'')+(c.variant?' / Variante: '+safe(c.variant):'')+'<br>'+safe(c.compare_status||'')+'</small>';
  }

  function rowType(row){
    return (row?.tn?.bundle || row?.ml?.bundle) ? 'bundle' : 'simple';
  }

  function renderGrid(rows){
    gridRows=rows||[];
    let tb=q('#xi_grid_body');
    tb.innerHTML='';
    let simple=0,bundle=0,tn=0,ml=0;
    for(const row of gridRows){
      const k=slug(row.sku||'SIN_SKU');
      const type=rowType(row);
      if(type==='bundle')bundle++; else simple++;
      if(row.tn)tn++;
      if(row.ml)ml++;
      let tr=document.createElement('tr');
      tr.className=row.row_status||'';
      tr.innerHTML=`<td><b>${safe(row.sku||'SIN SKU')}</b></td><td>${cell(row.tn)}</td><td>${cell(row.ml)}</td><td style="text-align:center"><input style="width:18px;height:18px" type="radio" name="xi_type_${k}" value="simple" ${type==='simple'?'checked':''}></td><td style="text-align:center"><input style="width:18px;height:18px" type="radio" name="xi_type_${k}" value="bundle" ${type==='bundle'?'checked':''}></td>`;
      tb.appendChild(tr);
    }
    const s=q('#xi_grid_summary');
    if(s)s.innerHTML=`Detectados: <b>${gridRows.length}</b> SKUs · ML: <b>${ml}</b> · TN: <b>${tn}</b> · Simple: <b>${simple}</b> · Bundle: <b>${bundle}</b>`;
  }

  function selected(){
    const out=[];
    for(const row of gridRows){
      const k=slug(row.sku||'SIN_SKU');
      const type=q(`input[name="xi_type_${k}"]:checked`)?.value||'simple';
      for(const c of [row.tn,row.ml]){
        if(c&&c.staging_id)out.push({staging_id:c.staging_id,item_type:type});
      }
    }
    return out;
  }

  async function openGrid(id,ch){
    let m=modal();
    modalMsg('Cargando grilla...','warn');
    m.style.display='block';
    let j=await fetchJsonRetry(A+'/inventory/import/batches/'+id+'/grid?tenant_id='+encodeURIComponent(tid()),{},'Cargando grilla',5);
    renderGrid(j.grid||[]);
    modalMsg(`${ch||chan}: ${(j.grid||[]).length} SKUs agrupados. Revisá Simple/Bundle antes de guardar.`,'ok');
  }

  async function saveBatch(){
    if(!batch)return modalMsg('No encontré batch activo.','bad');
    const rows=selected();
    const bundles=gridRows.filter(r=>q(`input[name="xi_type_${slug(r.sku||'SIN_SKU')}"]:checked`)?.value==='bundle').length;
    if(!confirm(`Vas a guardar ${gridRows.length} SKUs en inventario real.\n\nBundles marcados: ${bundles}.\n\nSi no revisaste los combos, cancelá.`))return;
    try{
      modalMsg('Guardando inventario real...','warn');
      let j=await fetchJsonRetry(A+'/inventory/import/batches/'+batch+'/confirm',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),rows:rows})
      },'Guardando',4);
      modalMsg(`Guardado. Items: ${j.saved_items||0}, publicaciones: ${j.saved_listings||0}`,'ok');
      localStorage.removeItem(BK);localStorage.removeItem(CK);batch='';paint('',false);
    }catch(e){modalMsg(e.message||'Error guardando','bad')}
  }

  async function begin(ch){
    if(busy)return;
    if(!ok())return alert('Falta tenant real');
    chan=ch;localStorage.setItem(CK,ch);paint(ch,true);
    try{
      if(!batch){
        msg('Iniciando '+ch+'...','warn');
        let j=await fetchJsonRetry(A+'/inventory/import/start-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),channel:ch})},'Iniciando '+ch,8);
        batch=j.batch_id;localStorage.setItem(BK,batch);
      }
      await loop(ch);
    }catch(e){
      if(String(e.message||'').includes('Batch no encontrado')){localStorage.removeItem(BK);localStorage.removeItem(CK);batch=''}
      msg((e.message||'Error')+' · podés reintentar desde el último avance','bad');
    }finally{paint(ch,false)}
  }

  async function loop(ch){
    let done=false,lastP=0,lastT='?',doneBatch=batch;
    while(!done){
      let x=await fetchJsonRetry(A+'/inventory/import/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),batch_id:batch,limit:5})},'Importando '+ch,10);
      done=!!x.done;lastP=x.processed||lastP;lastT=x.total||lastT;
      msg('Importando '+ch+': '+lastP+' / '+lastT+' publicaciones','warn');
    }
    msg(ch+' importado. Abriendo grilla...','ok');
    await openGrid(doneBatch,ch);
  }

  window.xeleriaOpenImportGrid=openGrid;
  function boot(){
    hideOldPhrase();
    let m=mlb(),n=tnb();
    if(m)m.onclick=function(){begin('ML')};
    if(n)n.onclick=function(){begin('TN')};
    if(m&&!q('#import_status')){const s=document.createElement('span');s.id='import_status';s.className='status';m.parentElement.appendChild(s)}
    paint('',false);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,1200);setTimeout(boot,2500);
})();
