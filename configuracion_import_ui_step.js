(function(){
  const API='https://api.xeleria.com.ar/api';
  const DEF='00000000-0000-0000-0000-000000000001';
  const KEY='xeleria_import_batch_v5';
  const qp=new URLSearchParams(location.search);
  const incomingSession=(qp.get('session')||'').trim();
  if(incomingSession){
    localStorage.setItem('xeleria_session',incomingSession);
    qp.delete('session');
    history.replaceState(null,'',location.pathname+(qp.toString()?'?'+qp.toString():'')+location.hash);
  }
  let batch=localStorage.getItem(KEY)||'';
  let rows=[];
  let busy=false;
  let saving=false;

  const $=s=>document.querySelector(s);
  const tenant=()=>localStorage.getItem('xeleria_tenant_id')||'';
  const session=()=>localStorage.getItem('xeleria_session')||'';
  const realTenant=()=>tenant()&&tenant()!==DEF;
  const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const slug=s=>String(s??'SIN_SKU').replace(/[^a-zA-Z0-9_-]/g,'_');
  const connected=c=>$('#'+c.toLowerCase()+'_card')?.classList.contains('connected');
  const connectedChannels=()=>['ML','TN'].filter(connected);
  const status=(t,c)=>{let e=$('#import_status');if(e){e.textContent=t;e.className=c||'status'}};
  const gridStatus=(t,c)=>{let e=$('#xi_grid_status');if(e){e.textContent=t;e.className=c||'status'}};

  function authHeaders(extra){
    const h=new Headers(extra||{});
    const tok=session().trim();
    const ten=tenant().trim();
    if(tok)h.set('Authorization','Bearer '+tok);
    if(ten)h.set('X-XelerIA-Tenant',ten);
    return h;
  }

  function needSession(where){
    if(session().trim())return true;
    status((where||'Configuración')+': falta sesión XelerIA. Volvé a ingresar con ML o TN.','bad');
    return false;
  }

  async function loadSessionSettings(){
    if(!realTenant())return window.redirectToLogin?window.redirectToLogin():null;
    if(!needSession('Cargando configuración'))return;
    try{
      const r=await fetch(API+'/session/tenant-settings/'+encodeURIComponent(tenant()),{headers:authHeaders(),cache:'no-store'});
      const j=await r.json();
      if(!r.ok||!j.ok)throw new Error(j.error||'Error cargando configuración');
      if(window.el)window.el('tenantLabel').textContent=tenant();
      if(j.settings&&window.apply)window.apply(j.settings);
      status('Sesión XelerIA activa para Configuración.','ok');
    }catch(e){
      status(e.message||'Error cargando configuración','bad');
    }
  }

  async function saveSessionSettings(id){
    if(!realTenant())return window.redirectToLogin?window.redirectToLogin():null;
    if(!needSession('Guardando configuración'))return;
    try{
      if(window.msg)window.msg(id,'Guardando con sesión XelerIA...','warn');
      const payload=window.data?window.data():{};
      const r=await fetch(API+'/session/tenant-settings/'+encodeURIComponent(tenant()),{
        method:'POST',
        headers:authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify(payload)
      });
      const j=await r.json();
      if(!r.ok||!j.ok)throw new Error(j.error||'Error guardando');
      if(j.settings&&window.apply)window.apply(j.settings);
      if(window.msg)window.msg(id,'Guardado con sesión XelerIA.','ok');
    }catch(e){
      if(window.msg)window.msg(id,e.message||'Error','bad');
      else status(e.message||'Error guardando','bad');
    }
  }

  function patchConfigSession(){
    window.load=loadSessionSettings;
    window.saveSettings=saveSessionSettings;
  }

  function addStyle(){
    if($('#xi_grid_style'))return;
    const s=document.createElement('style');s.id='xi_grid_style';
    s.textContent='#xi_grid_panel{margin-top:12px;border:1px solid #ded4be;background:#fffdf8;overflow:visible}#xi_grid_head{padding:6px 10px;border-bottom:1px solid #ded4be;background:#fffdf8;font-size:13px}#xi_grid_status{font-size:11px;margin-left:8px}#xi_grid_status.ok{color:#087345!important}#xi_grid_status.warn{color:#b54708!important}#xi_grid_status.bad{color:#b42318!important}#xi_grid_help{font-size:10px;color:#5b554c;padding:4px 10px;border-bottom:1px solid #eadfc9;background:#fffaf0}#xi_grid_wrap{height:auto;min-height:0;max-height:none;overflow:visible;background:#fff}#xi_grid_table{width:100%;min-width:0;border-collapse:collapse;table-layout:fixed;font-size:11px;line-height:1.08}#xi_grid_table th,#xi_grid_table td{border:1px solid #e5dac4;padding:3px 6px;height:31px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:middle}#xi_grid_table th{position:sticky;top:0;z-index:2;background:#eee4d1;text-align:left;font-size:11px;font-weight:900}#xi_grid_table th:nth-child(3),#xi_grid_table td:nth-child(3){text-align:center}#xi_grid_table th:nth-child(3){font-size:10px!important}.xi_sku{font-weight:900}.xi_empty{color:#777;font-style:italic}.xi_pub b{font-size:10px}.xi_pub small{font-size:9px;color:#222}.xi_type{display:flex;gap:5px;align-items:center;justify-content:center;font-size:9px;font-weight:900;white-space:nowrap}.xi_type label{display:inline-flex;align-items:center;gap:2px}.xi_type input[type=radio],#xi_grid_table input[type=radio]{width:13px;height:13px;margin:0;accent-color:#1677ff}.new{background:#eefbe8}.missing_sku{background:#fff8c5}.missing_in_refresh{background:#fdecec}#xi_grid_actions{position:sticky;bottom:0;display:flex;gap:8px;align-items:center;padding:7px 10px;background:rgba(255,253,248,.95);border-top:1px solid #ded4be}#xi_grid_actions button{height:30px;font-size:11px;border-radius:7px;padding:0 11px}.xi_save{background:#cdb272!important;border:0!important;color:#111!important}.xi_cancel{background:#fff!important;border:1px solid #d7c9ae!important;color:#9a1f1f!important}#xi_backend_version{margin:8px 0 0;font-size:10px;color:#6b6254;background:#fffaf0;border:1px solid #eadfc9;padding:5px 8px;display:inline-block}';
    document.head.appendChild(s);
  }

  function backendVersionEl(){
    let e=$('#xi_backend_version');
    if(e)return e;
    e=document.createElement('div');
    e.id='xi_backend_version';
    e.textContent='Backend: consultando versión...';
    const anchor=$('#inventario h2')?.parentElement||$('#inventario')||document.body;
    anchor.appendChild(e);
    return e;
  }

  async function loadBackendVersion(){
    addStyle();
    const e=backendVersionEl();
    try{
      const r=await fetch(API+'/version?_='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const j=await r.json();
      if(!j.ok)throw new Error(j.error||'sin ok');
      const v=j.app_version||j.version||'?';
      const up=Number(j.uptime_seconds||0);
      const mins=Math.floor(up/60);
      e.textContent='Backend: '+v+' · uptime '+mins+' min';
    }catch(err){
      e.textContent='Backend: sin /api/version todavía (deploy viejo o pendiente)';
    }
  }

  function normalizeScreen(){
    const p=$('#inventario h2 + p.lead');
    if(p&&/revisa tus canales/i.test(p.textContent||''))p.remove();
    const tn=$('#import_tn_btn');if(tn)tn.style.display='none';
    const b=$('#import_ml_btn');
    if(b){
      b.textContent=busy?'Importando canales...':'Importar canales conectados';
      b.onclick=importConnected;
      b.disabled=busy||!!batch||connectedChannels().length===0;
      b.title=batch?'Guardá o cancelá la grilla pendiente primero':(connectedChannels().length?'':'Conectá ML, TN o ambos primero');
    }
    if(b&&!$('#import_status')){const s=document.createElement('span');s.id='import_status';s.className='status';b.parentElement.appendChild(s)}
  }

  function openChannelOAuth(ch){
    if(!realTenant()){
      alert('Primero entrá desde inicio.html para generar un tenant real.');
      return;
    }
    const ownerKey=localStorage.getItem('xeleria_owner_key')||'';
    if(!ownerKey){
      alert('Falta el código beta privado desde inicio.html.');
      return;
    }
    if(batch&&!confirm('Hay una grilla pendiente. Podés salir a conectar y al volver se intentará recuperar.\n\nContinuar?'))return;
    const url=API+'/oauth/'+encodeURIComponent(ch)+'/start?owner_key='+encodeURIComponent(ownerKey)+'&tenant_id='+encodeURIComponent(tenant())+'&next='+encodeURIComponent('configuracion.html');
    const win=window.open(url,'_blank','noopener,noreferrer');
    if(!win){
      alert('El navegador bloqueó la pestaña nueva. Abrimos la autenticación en esta pestaña.');
      window.top.location.href=url;
    }
  }

  function patchConnect(){
    window.connectChannel=function(ch){openChannelOAuth(ch)};
  }

  async function fetchJson(url,opt={},label='Operación'){
    opt={...opt,headers:authHeaders(opt.headers||{})};
    let last;
    for(let i=1;i<=6;i++){
      try{
        const r=await fetch(url,opt);
        const j=await r.json().catch(()=>({ok:false,error:'Respuesta no JSON'}));
        if(!r.ok||!j.ok)throw new Error(j.error||j.detail||('HTTP '+r.status));
        return j;
      }catch(e){
        last=e;
        if(!/Errno 11|temporarily unavailable|EAGAIN|Failed to fetch|NetworkError|Load failed/i.test(String(e.message||e))||i===6)break;
        status(label+': servidor ocupado, reintento '+i+'/5...','warn');
        await new Promise(r=>setTimeout(r,Math.min(1000*i,4000)));
      }
    }
    throw last||new Error(label+' falló');
  }

  async function importConnected(){
    if(busy)return;
    if(batch){await loadGrid();return alert('Ya hay una grilla pendiente. Guardá o cancelá antes de importar de nuevo.');}
    if(!realTenant())return alert('Falta tenant real.');
    const ch=connectedChannels();
    if(!ch.length)return alert('Primero conectá ML, TN o ambos.');
    busy=true;normalizeScreen();
    try{
      status('Importando '+ch.join(' + ')+'... puede tardar.','warn');
      const j=await fetchJson(API+'/inventory/import/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tenant(),channels:ch})},'Importando canales');
      batch=j.batch_id;localStorage.setItem(KEY,batch);
      status('Importación terminada. Revisá la grilla abajo.','ok');
      await loadGrid();
    }catch(e){status(e.message||'Error importando','bad')}
    finally{busy=false;normalizeScreen()}
  }

  function panel(){
    addStyle();let p=$('#xi_grid_panel');if(p)return p;
    p=document.createElement('div');p.id='xi_grid_panel';
    p.innerHTML='<div id="xi_grid_head"><b>Grilla importada</b><span id="xi_grid_status"></span></div><div id="xi_grid_help">Revisá Simple / Combo una vez por SKU. Aplica tanto para Tienda Nube como para Mercado Libre.</div><div id="xi_grid_wrap"><table id="xi_grid_table"><colgroup><col style="width:14%"><col style="width:39%"><col style="width:8%"><col style="width:39%"></colgroup><thead><tr><th>SKU</th><th>Tienda Nube</th><th>Simple/Combo</th><th>Mercado Libre</th></tr></thead><tbody id="xi_grid_body"></tbody></table></div><div id="xi_grid_actions"><button class="xi_save" id="xi_grid_save">Guardar cambios</button><button class="xi_cancel" id="xi_grid_cancel">Cancelar</button></div>';
    const inv=$('#inventario'),legend=inv?.querySelector('.legend');
    if(legend)inv.insertBefore(p,legend);else inv?.appendChild(p);
    $('#xi_grid_save').onclick=saveBatch;$('#xi_grid_cancel').onclick=cancelBatch;setGridSaving(false);
    return p;
  }

  function cell(c,ch){
    if(!c)return '<span class="xi_empty">Sin publicación '+ch+'</span>';
    return '<div class="xi_pub"><b>'+esc(c.title||'')+'</b><br><small>Publicación: '+esc(c.publication||'')+(c.variant?' / Variante: '+esc(c.variant):'')+'</small></div>';
  }
  function typeOf(row){return (row?.tn?.bundle||row?.ml?.bundle)?'bundle':'simple'}
  function render(){
    const tb=$('#xi_grid_body');tb.innerHTML='';let ml=0,tn=0,s=0,c=0;
    for(const row of rows){
      const k=slug(row.sku),t=typeOf(row);if(t==='bundle')c++;else s++;if(row.ml)ml++;if(row.tn)tn++;
      const tr=document.createElement('tr');tr.className=row.row_status||'';
      tr.innerHTML='<td class="xi_sku">'+esc(row.sku||'SIN SKU')+'</td><td>'+cell(row.tn,'TN')+'</td><td><div class="xi_type"><label><input title="Simple" type="radio" name="xi_'+k+'" value="simple" '+(t==='simple'?'checked':'')+'></label><label><input title="Combo" type="radio" name="xi_'+k+'" value="bundle" '+(t==='bundle'?'checked':'')+'></label></div></td><td>'+cell(row.ml,'ML')+'</td>';
      tb.appendChild(tr);
    }
    gridStatus('ML: '+ml+' · TN: '+tn+' · '+rows.length+' SKUs · Simple: '+s+' · Combo: '+c,'ok');
  }
  async function loadGrid(){
    if(!batch)return;
    panel();gridStatus('Cargando grilla...','warn');
    const j=await fetchJson(API+'/inventory/import/batches/'+batch+'/grid?tenant_id='+encodeURIComponent(tenant()),{},'Cargando grilla');
    rows=j.grid||[];render();setGridSaving(false);$('#xi_grid_panel')?.scrollIntoView({block:'start'});normalizeScreen();
  }
  function selected(){
    const out=[];
    for(const row of rows){const k=slug(row.sku),t=document.querySelector('input[name="xi_'+k+'"]:checked')?.value||'simple';for(const c of [row.tn,row.ml])if(c&&c.staging_id)out.push({staging_id:c.staging_id,item_type:t})}
    return out;
  }
  function scrollToInventoryTop(){
    try{$('#inventario')?.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){}
    try{if(parent&&parent!==window)parent.scrollTo({top:0,behavior:'smooth'})}catch(e){}
  }

  function setGridSaving(on){
    saving=!!on;
    const disabled=saving||!batch;
    const save=$('#xi_grid_save');
    const cancel=$('#xi_grid_cancel');
    if(save){
      save.disabled=disabled;
      save.textContent=saving?'Guardando...':'Guardar cambios';
      save.style.opacity=disabled?'.55':'';
      save.style.cursor=disabled?'not-allowed':'';
    }
    if(cancel){
      cancel.disabled=disabled;
      cancel.style.opacity=disabled?'.55':'';
      cancel.style.cursor=disabled?'not-allowed':'';
    }
  }

  async function saveBatch(){
    if(!batch||saving)return;
    if(!confirm('Aplicar los cambios de '+rows.length+' SKUs al inventario?'))return;
    scrollToInventoryTop();
    setGridSaving(true);
    try{
      gridStatus('Aplicando cambios al inventario...','warn');
      const j=await fetchJson(API+'/inventory/import/batches/'+batch+'/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tenant(),rows:selected()})},'Guardando');
      gridStatus('Guardado. Items: '+(j.saved_items||0)+' · publicaciones: '+(j.saved_listings||0),'ok');
      localStorage.removeItem(KEY);
      batch='';
      normalizeScreen();
    }catch(e){
      gridStatus('No se pudo guardar: '+(e.message||'Error guardando'),'bad');
    }finally{
      setGridSaving(false);
    }
  }
  function cancelBatch(){
    if(!confirm('Cancelar la grilla pendiente?'))return;
    localStorage.removeItem(KEY);batch='';rows=[];setGridSaving(false);$('#xi_grid_panel')?.remove();status('Importación cancelada.','warn');normalizeScreen();
  }

  function boot(){patchConfigSession();patchConnect();normalizeScreen();loadBackendVersion();loadSessionSettings();if(batch){status('Hay una grilla pendiente recuperable. Guardá o cancelá antes de importar de nuevo.','warn');loadGrid().catch(e=>status('No pude recuperar grilla: '+(e.message||e),'bad'))}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,1200);setTimeout(boot,2500);setInterval(loadBackendVersion,30000);
})();