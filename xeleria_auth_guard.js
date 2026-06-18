(function () {
  const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const publicPages = { "": true, "index.html": true, "inicio.html": true };

  if (publicPages[file]) return;

  const qp = new URLSearchParams(location.search);

  if (qp.get("reset") === "1") {
    localStorage.removeItem("xeleria_tenant_id");
    localStorage.removeItem("xeleria_session");
    localStorage.removeItem("xeleria_owner_key");
    localStorage.removeItem("pc_erp_token");
  }

  let cleanUrl = false;

  const incomingTenant = (qp.get("tenant_id") || qp.get("tenant") || "").trim();
  if (incomingTenant && incomingTenant !== DEFAULT_TENANT) {
    localStorage.setItem("xeleria_tenant_id", incomingTenant);
  }
  if (qp.has("tenant_id")) { qp.delete("tenant_id"); cleanUrl = true; }
  if (qp.has("tenant")) { qp.delete("tenant"); cleanUrl = true; }

  const incomingSession = (qp.get("session") || "").trim();
  if (incomingSession) {
    localStorage.setItem("xeleria_session", incomingSession);
    qp.delete("session");
    cleanUrl = true;
  }

  if (cleanUrl) {
    const clean = location.pathname + (qp.toString() ? "?" + qp.toString() : "") + location.hash;
    history.replaceState(null, "", clean);
  }

  if (file === "admin_erp.html") {
    const sessionToken = (localStorage.getItem("xeleria_session") || "").trim();
    if (sessionToken) localStorage.setItem("pc_erp_token", sessionToken);
  }

  const tenant = localStorage.getItem("xeleria_tenant_id") || "";
  if (!tenant || tenant === DEFAULT_TENANT) {
    const next = encodeURIComponent(file || "index.html");
    location.replace("inicio.html?next=" + next);
    return;
  }
})();

(function(){
  const file=(location.pathname.split('/').pop()||'').toLowerCase();
  if(file!=='configuracion.html')return;

  function sessionErrorText(txt){
    const t=String(txt||'').toLowerCase();
    return t.includes('sesión xeleria inválida') || t.includes('sesion xeleria invalida') || t.includes('falta sesión xeleria') || t.includes('falta sesion xeleria');
  }

  function goInicioIfSessionError(){
    if(!document.body)return;
    if(sessionErrorText(document.body.innerText||'')){
      localStorage.removeItem('xeleria_session');
      try{
        window.top.location.replace('inicio.html');
      }catch(e){
        location.replace('inicio.html');
      }
    }
  }

  function apply(){
    if(!document.getElementById('xeleriaButtonStyle')){
      const s=document.createElement('style');
      s.id='xeleriaButtonStyle';
      s.textContent=[
        'body{font-size:14px!important;line-height:1.38!important}',
        '.wrap{padding:14px 16px 42px!important}',
        'h1{font-size:28px!important;line-height:1.05!important;margin:0 0 2px!important}',
        'h2{font-size:18px!important;margin:0 0 8px!important}',
        'h3{font-size:17px!important;margin:0 0 10px!important}',
        '.sub{font-size:13px!important;margin:0 0 16px!important}',
        '.card{padding:16px!important;margin-bottom:22px!important;border-radius:16px!important}',
        '.lead,p{font-size:14px!important;line-height:1.42!important}',
        'label,.field label{font-size:13px!important}',
        'input:not([type="radio"]):not([type="checkbox"]),select,textarea{height:40px!important;font-size:14px!important;padding:8px 11px!important;border-radius:11px!important}',
        'textarea{height:72px!important}',
        'button,.tab{background:#DCC58F!important;border:0!important;color:#111!important;box-shadow:none!important;font-size:14px!important;min-height:38px!important;height:auto!important;padding:9px 13px!important;border-radius:12px!important}',
        '.tab{border-radius:999px!important}',
        'button:hover,.tab:hover{filter:brightness(.98)}button:active,.tab:active{background:#CDB272!important;filter:none!important}',
        'button:disabled,button.disabled,.disabled{background:#e9dfcf!important;color:#8a8172!important;border:0!important}',
        'input[type="radio"],input[type="checkbox"],.checks input,.radioCell input,#importGridBody input[type="radio"]{width:16px!important;height:16px!important;min-width:16px!important;max-width:16px!important;min-height:16px!important;max-height:16px!important;margin:0 6px 0 0!important;padding:0!important;transform:none!important;vertical-align:middle!important;accent-color:#0d6efd!important}',
        '.radioCell{text-align:center!important;width:64px!important}',
        '.radioCell input{margin:0!important}',
        '.importTable th,.importTable td{font-size:13px!important;padding:7px 8px!important}',
        '.logoBox{width:78px!important;height:78px!important}',
        '.channel{padding:18px 22px!important;border-radius:16px!important}',
        '.channel h3{font-size:18px!important}',
        '.pill{font-size:13px!important;padding:3px 8px!important}'
      ].join('');
      document.head.appendChild(s);
    }
    const t=document.getElementById('tenantLabel');
    if(t) t.textContent='';
    goInicioIfSessionError();
  }
  function boot(){
    apply();
    const t=document.getElementById('tenantLabel');
    if(t && window.MutationObserver){
      new MutationObserver(apply).observe(t,{childList:true,characterData:true,subtree:true});
    }
    if(document.body && window.MutationObserver){
      new MutationObserver(goInicioIfSessionError).observe(document.body,{childList:true,characterData:true,subtree:true});
    }
    let n=0;
    const timer=setInterval(()=>{apply(); if(++n>40)clearInterval(timer)},250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

(function(){
  const API='https://api.xeleria.com.ar/api';
  const DEFAULT_TENANT='00000000-0000-0000-0000-000000000001';
  const page=(location.pathname.split('/').pop()||'').toLowerCase();
  if(page!=='admin_erp.html')return;

  function tenant(){return localStorage.getItem('xeleria_tenant_id')||''}
  function validTenant(){const t=tenant();return t&&t!==DEFAULT_TENANT}
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function normalizeLogo(src){
    src=String(src||'').trim();
    if(!src)return '';
    if(src.startsWith('data/png;base64,'))return src.replace('data/png;base64,','data:image/png;base64,');
    if(src.startsWith('data/jpg;base64,'))return src.replace('data/jpg;base64,','data:image/jpeg;base64,');
    if(src.startsWith('data/jpeg;base64,'))return src.replace('data/jpeg;base64,','data:image/jpeg;base64,');
    if(src.startsWith('data/webp;base64,'))return src.replace('data/webp;base64,','data:image/webp;base64,');
    return src;
  }
  function addShellStyle(){
    if(document.getElementById('xeleriaTenantShellStyle'))return;
    const s=document.createElement('style');
    s.id='xeleriaTenantShellStyle';
    s.textContent='.brandTenantLogo{width:58px!important;height:58px!important;min-width:58px!important;max-width:58px!important;border-radius:12px!important;overflow:hidden!important;padding:4px!important}.brandTenantLogo.hasLogo{background:#fff!important}.brandTenantLogo img{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important}.brandName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sidebarFoot{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.sidebarFoot #footBackendVer{color:#fff}';
    document.head.appendChild(s);
  }
  async function updateBackendVersion(){
    const el=document.getElementById('footBackendVer');
    if(!el)return;
    try{
      const r=await fetch(API+'/version?_='+Date.now(),{cache:'no-store'});
      const j=await r.json();
      if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));
      el.textContent=j.app_version||j.version||'?';
      el.title='Uptime: '+Math.floor(Number(j.uptime_seconds||0)/60)+' min';
    }catch(e){
      el.textContent='?';
      el.title='No pude leer /api/version';
    }
  }
  async function updateTenantBrand(){
    if(!validTenant())return;
    try{
      const r=await fetch(API+'/tenant-settings/'+encodeURIComponent(tenant())+'?_='+Date.now(),{cache:'no-store'});
      const j=await r.json();
      if(!r.ok||!j.ok||!j.settings)return;
      const st=j.settings;
      const name=(st.display_name||'').trim()||'Mi comercio';
      const logo=normalizeLogo(st.logo_png_500_base64||'');
      const pEl=document.querySelector('.brand p');
      const box=document.getElementById('brandTenantLogo');
      if(pEl)pEl.textContent=name+' · operación diaria';
      document.title='XelerIA · '+name;
      if(box&&logo){box.classList.add('hasLogo');box.innerHTML='<img src="'+esc(logo)+'" alt="'+esc(name)+'">';box.title=name;}
      else if(box){box.classList.remove('hasLogo');box.textContent='LOGO';box.title=name;}
    }catch(e){}
  }
  function bootShell(){
    addShellStyle();
    updateBackendVersion();
    updateTenantBrand();
    setTimeout(updateBackendVersion,1500);
    setInterval(updateBackendVersion,30000);
    setTimeout(updateTenantBrand,1200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootShell);else bootShell();
})();
