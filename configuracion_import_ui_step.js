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
  function gridMsg(x,c){let e=q('#xi_grid_status');if(e){e.textContent=x;e.className=c||'status'}}
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

  function ensureStyle(){
    if(q('#xi_grid_style'))return;
    const s=document.createElement('style');
    s.id='xi_grid_style';
    s.textContent=`
      #xi_grid_panel{margin-top:12px;border:1px solid #ded4be;background:#fffdf8;border-radius:0;box-shadow:none;overflow:hidden}
      #xi_grid_head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid #ded4be;background:#fffdf8}
      #xi_grid_head b{font-size:14px}
      #xi_grid_status{font-size:12px;color:#087345;margin-left:8px}
      #xi_grid_help{font-size:11px;color:#5b554c;padding:4px 10px;border-bottom:1px solid #eadfc9;background:#fffaf0}
      #xi_grid_wrap{height:52vh;min-height:360px;overflow:auto;background:white}
      #xi_grid_table{border-collapse:collapse;width:100%;min-width:1040px;table-layout:fixed;font-size:12px;line-height:1.15}
      #xi_grid_table th,#xi_grid_table td{border:1px solid #e5dac4;padding:4px 8px;vertical-align:middle;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:36px}
      #xi_grid_table th{position:sticky;top:0;z-index:2;background:#eee4d1;text-align:left;font-size:13px;font-weight:900}
      #xi_grid_table th:nth-child(4),#xi_grid_table th:nth-child(5),#xi_grid_table td:nth-child(4),#xi_grid_table td:nth-child(5){text-align:center}
      #xi_grid_table .sku{font-weight:900}
      #xi_grid_table .nopub{color:#777;font-style:italic}
      #xi_grid_table .pub b{font-size:12px}
      #xi_grid_table .pub small{font-size:11px;color:#222;line-height:1.2}
      #xi_grid_table tr.new{background:#eefbe8}
      #xi_grid_table tr.missing_sku{background:#fff8c5}
      #xi_grid_table tr.missing_in_refresh{background:#fdecec}
      #xi_grid_table tr:hover{background:#fff8db}
      #xi_grid_table input[type=radio]{width:15px;height:15px;accent-color:#111}
      #xi_grid_actions{position:sticky;bottom:0;display:flex;gap:8px;align-items:center;padding:7px 10px;background:rgba(255,253,248,.94);border-top:1px solid #ded4be;backdrop-filter:blur(3px)}
      #xi_grid_actions button{height:30px;font-size:12px;border-radius:7px;padding:0 11px}
      #xi_grid_actions .xi_save{background:#cdb272;border:0;color:#111;font-weight:900}
      #xi_grid_actions .xi_cancel{background:#fff;border:1px solid #d7c9ae;color:#9a1f1f;font-weight:900}
      #xi_grid_actions span{font-size:11px;color:#6b6254}
    `;
    document.head.appendChild(s);
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

  function panel(){
    ensureStyle();
    let p=q('#xi_grid_panel');
    if(p)return p;
    const inv=q('#inventario');
    p=document.createElement('div');
    p.id='xi_grid_panel';
    p.innerHTML=`
      <div id="xi_grid_head"><div><b>Grilla importada</b><span id="xi_grid_status"></span></div></div>
      <div id="xi_grid_help">Revisá solo Simple/Bundle. Simple = producto normal. Bundle = combo/kit que descuenta componentes. Si TN dice “Sin publicación”, es normal cuando todavía importaste solo ML.</div>
      <div id="xi_grid_wrap">
        <table id="xi_grid_table">
          <colgroup><col style="width:150px"><col style="width:260px"><col><col style="width:72px"><col style="width:72px"></colgroup>
          <thead><tr><th>SKU</th><th>Tienda Nube</th><th>Mercado Libre</th><th>Simple</th><th>Bundle</th></tr></thead>
          <tbody id="xi_grid_body"></tbody>
        </table>
      </div>
      <div id="xi_grid_actions"><button class="xi_save" id="xi_grid_save">Guardar cambios</button><button class="xi_cancel" id="xi_grid_cancel">Cancelar</button><span>Guardar aplica lo revisado. Cancelar no cambia nada.</span></div>`;
    const legend=inv?.querySelector('.legend');
    if(legend)inv.insertBefore(p,legend); else inv?.appendChild(p);
    q('#xi_grid_save').onclick=saveBatch;
    q('#xi_grid_cancel').onclick=()=>p.remove();
    return p;
  }

  function cell(c){
    if(!c)return '<span class="nopub">Sin publicación TN</span>';
    return '<div class="pub"><b>'+safe(c.title||'')+'</b><br><small>Publicación: '+safe(c.publication||'')+(c.variant?' / Variante: '+safe(c.variant):'')+'</small></div>';
  }

  function rowType(row){return (row?.tn?.bundle || row?.ml?.bundle) ? 'bundle' : 'simple'}

  function renderGrid(rows){
    gridRows=rows||[];
    let tb=q('#xi_grid_body');
    tb.innerHTML='';
    let simple=0,bundle=0,tn=0,ml=0;
    for(const row of gridRows){
      const k=slug(row.sku||'SIN_SKU');
      const type=rowType(row);
      if(type==='bundle')bundle++; else simple++;
      if(row.tn)tn++; if(row.ml)ml++;
      let tr=document.createElement('tr');
      tr.className=row.row_status||'';
      tr.innerHTML=`<td class="sku">${safe(row.sku||'SIN SKU')}</td><td>${cell(row.tn)}</td><td>${cell(row.ml)}</td><td><input type="radio" name="xi_type_${k}" value="simple" ${type==='simple'?'checked':''}></td><td><input type="radio" name="xi_type_${k}" value="bundle" ${type==='bundle'?'checked':''}></td>`;
      tb.appendChild(tr);
    }
    gridMsg(`ML: ${ml} · TN: ${tn} · ${gridRows.length} SKUs agrupados · Simple: ${simple} · Bundle: ${bundle}`,'ok');
  }

  function selected(){
    const out=[];
    for(const row of gridRows){
      const k=slug(row.sku||'SIN_SKU');
      const type=q(`input[name="xi_type_${k}"]:checked`)?.value||'simple';
      for(const c of [row.tn,row.ml])if(c&&c.staging_id)out.push({staging_id:c.staging_id,item_type:type});
    }
    return out;
  }

  async function openGrid(id,ch){
    panel();
    gridMsg('Cargando grilla...','warn');
    let j=await fetchJsonRetry(A+'/inventory/import/batches/'+id+'/grid?tenant_id='+encodeURIComponent(tid()),{},'Cargando grilla',5);
    renderGrid(j.grid||[]);
    q('#xi_grid_panel')?.scrollIntoView({block:'start'});
  }

  async function saveBatch(){
    if(!batch)return gridMsg('No encontré batch activo.','bad');
    const bundles=gridRows.filter(r=>q(`input[name="xi_type_${slug(r.sku||'SIN_SKU')}"]:checked`)?.value==='bundle').length;
    if(!confirm(`Vas a guardar ${gridRows.length} SKUs.\nBundles marcados: ${bundles}.`))return;
    try{
      gridMsg('Guardando inventario real...','warn');
      let j=await fetchJsonRetry(A+'/inventory/import/batches/'+batch+'/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),rows:selected()})},'Guardando',4);
      gridMsg(`Guardado. Items: ${j.saved_items||0}, publicaciones: ${j.saved_listings||0}`,'ok');
      localStorage.removeItem(BK);localStorage.removeItem(CK);batch='';paint('',false);
    }catch(e){gridMsg(e.message||'Error guardando','bad')}
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
    msg(ch+' importado. Revisá la grilla abajo.','ok');
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
