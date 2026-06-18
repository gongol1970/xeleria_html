(function(){
  const API='https://api.xeleria.com.ar/api';
  const DEF='00000000-0000-0000-0000-000000000001';
  const page=(location.pathname.split('/').pop()||'').toLowerCase();
  if(page!=='configuracion.html')return;

  const $=s=>document.querySelector(s);
  const tenant=()=>localStorage.getItem('xeleria_tenant_id')||'';
  const session=()=>localStorage.getItem('xeleria_session')||'';
  const realTenant=()=>tenant()&&tenant()!==DEF;

  function pumba(){
    localStorage.removeItem('xeleria_session');
    try{window.top.location.replace('https://xeleria.com.ar/inicio.html')}
    catch(e){location.replace('https://xeleria.com.ar/inicio.html')}
  }

  function authHeaders(){
    const h=new Headers();
    const tok=session().trim();
    if(tok)h.set('Authorization','Bearer '+tok);
    return h;
  }

  function status(text, cls){
    const e=$('#import_status');
    if(e){e.textContent=text||'';e.className=cls||'status'}
  }

  function normConnections(raw){
    raw=raw||{};
    return {
      ML: raw.ML || raw.ml || raw.mercadolibre || raw.mercado_libre || {},
      TN: raw.TN || raw.tn || raw.tiendanube || raw.tienda_nube || {}
    };
  }

  function connIsOn(c){
    return !!(c && (c.connected===true || c.ok===true || c.live===true || c.status==='connected' || c.status==='ok'));
  }

  function connLabel(c){
    return String((c&&(c.label||c.account_label||c.name||c.nickname||c.email||c.store_name||c.user||c.id))||'').trim();
  }

  function paintChannel(ch, conn){
    const key=ch.toLowerCase();
    const card=$('#'+key+'_card');
    const state=$('#'+key+'_state');
    const label=$('#'+key+'_label');
    const btn=$('#'+key+'_button');
    const on=connIsOn(conn);
    const txt=connLabel(conn);
    if(card)card.classList.toggle('connected',on);
    if(state)state.textContent=on?'conectado':'no conectado';
    if(label)label.textContent=on && txt ? ' · '+txt : '';
    if(btn){
      btn.textContent=on ? ch+' conectado' : 'Conectar '+ch;
      btn.disabled=on;
      btn.title=on ? ch+' conectado por sesión XelerIA' : 'Conectar '+ch;
    }
  }

  function applyStatus(j){
    if(j.settings && window.apply)window.apply(j.settings);
    const c=normConnections(j.connections||{});
    paintChannel('ML',c.ML);
    paintChannel('TN',c.TN);
    const parts=[];
    if(connIsOn(c.ML))parts.push('ML: '+(connLabel(c.ML)||'conectado'));
    if(connIsOn(c.TN))parts.push('TN: '+(connLabel(c.TN)||'conectado'));
    status(parts.length?'Sesión XelerIA activa · '+parts.join(' · '):'Sesión XelerIA activa · sin canales conectados','ok');
    if(typeof window.normalizeScreen==='function')window.normalizeScreen();
  }

  async function refreshSessionStatus(){
    if(!realTenant()||!session().trim())return pumba();
    try{
      const r=await fetch(API+'/session/status?tenant_id='+encodeURIComponent(tenant())+'&_='+Date.now(),{headers:authHeaders(),cache:'no-store'});
      const j=await r.json().catch(()=>({ok:false,error:'Respuesta no JSON'}));
      if(r.status===401||r.status===403)return pumba();
      if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));
      applyStatus(j);
      return j;
    }catch(e){
      status(e.message||'No pude validar sesión/conexiones','bad');
    }
  }

  window.xeleriaRefreshSessionStatus=refreshSessionStatus;
  function boot(){refreshSessionStatus();setTimeout(refreshSessionStatus,900);setTimeout(refreshSessionStatus,2200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
