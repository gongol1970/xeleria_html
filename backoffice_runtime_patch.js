(function(){
  const DEFAULT_API = 'https://api.xeleria.com.ar';
  const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001';
  const LAST_KEY = 'xeleria_last_json';
  const TOKEN_KEY = 'xeleria_admin_token';
  const TENANT_KEY = 'xeleria_tenant_id';

  function pretty(v){ try{return JSON.stringify(v,null,2)}catch(e){return String(v)} }
  function saveLast(payload){ try{ localStorage.setItem(LAST_KEY, pretty({...payload, at:new Date().toISOString()})); }catch(e){} }
  window.xeleriaSaveLastJson = saveLast;

  function cleanOuterUrl(){
    try{
      const u = new URL(location.href);
      const t = u.searchParams.get('token') || u.searchParams.get('admin_token') || u.searchParams.get('ADMIN_TOKEN');
      const tenant = u.searchParams.get('tenant_id') || u.searchParams.get('tenant');
      if(t){ localStorage.setItem(TOKEN_KEY,t); u.searchParams.delete('token'); u.searchParams.delete('admin_token'); u.searchParams.delete('ADMIN_TOKEN'); }
      if(tenant){ localStorage.setItem(TENANT_KEY,tenant); }
      if(t) history.replaceState({},'',u.toString());
    }catch(e){}
  }
  cleanOuterUrl();

  function tenantId(){
    try{
      const qp = new URLSearchParams(location.search);
      const fromUrl = qp.get('tenant_id') || qp.get('tenant') || '';
      if(fromUrl) localStorage.setItem(TENANT_KEY,fromUrl);
      return fromUrl || localStorage.getItem(TENANT_KEY) || DEFAULT_TENANT;
    }catch(e){ return localStorage.getItem(TENANT_KEY) || DEFAULT_TENANT; }
  }

  function token(doc){
    const byDoc = doc ? (doc.getElementById('cfgToken') || doc.getElementById('token')) : null;
    const val = byDoc && byDoc.value ? byDoc.value.trim() : '';
    if(val) localStorage.setItem(TOKEN_KEY,val);
    return val || localStorage.getItem(TOKEN_KEY) || '';
  }

  function apiBase(doc){
    const input = doc ? (doc.getElementById('cfgApiUrl') || doc.getElementById('apiUrl')) : null;
    const value = input && input.value ? input.value.trim() : DEFAULT_API;
    return value.replace(/\/$/,'').replace(/\/api$/,'');
  }

  function headers(doc, extra={}){
    const h = {'Content-Type':'application/json','x-xeleria-tenant':tenantId(), ...(extra||{})};
    const t = token(doc);
    if(t) h['x-admin-token'] = t;
    return h;
  }

  function injectCss(doc){
    if(doc.getElementById('xeRuntimePatchCss')) return;
    const link = doc.createElement('link');
    link.id = 'xeRuntimePatchCss';
    link.rel = 'stylesheet';
    link.href = './backoffice_runtime_patch.css?v=20260620-2';
    doc.head.appendChild(link);
  }

  function hideToken(doc){
    const input = doc.getElementById('cfgToken') || doc.getElementById('token');
    if(!input) return;
    input.type = 'password';
    input.autocomplete = 'off';
    input.style.display = 'none';
    const labels = Array.from(doc.querySelectorAll('label'));
    const lab = labels.find(l => (l.getAttribute('for') === input.id) || /ADMIN_TOKEN|TOKEN/i.test(l.textContent||''));
    if(lab) lab.style.display = 'none';
    if(!doc.getElementById('xeTokenNote')){
      const note = doc.createElement('div');
      note.id = 'xeTokenNote';
      note.className = 'xe-token-note';
      note.textContent = 'Token guardado localmente. No se muestra ni viaja en la URL.';
      input.insertAdjacentElement('afterend', note);
    }
  }

  function patchText(doc){
    doc.title = 'XelerIA · Backoffice';
    Array.from(doc.querySelectorAll('h1,h2,h3,label,button,p,span,div')).forEach(el=>{
      if(el.childNodes.length === 1 && el.childNodes[0].nodeType === 3){
        const txt = el.textContent || '';
        if(txt.includes('Conexión ERP')) el.textContent = txt.replace('Conexión ERP','Conexión XelerIA');
        if(txt.includes('Planeta Casa ·')) el.textContent = txt.replace('Planeta Casa ·','XelerIA ·');
      }
    });
  }

  function ensureApiRoot(doc){
    const input = doc.getElementById('cfgApiUrl') || doc.getElementById('apiUrl');
    if(input){
      const current = (input.value || '').trim();
      if(!current || current.includes('planeta-casa-erp') || current.endsWith('/api')) input.value = DEFAULT_API;
    }
  }

  function hookFetch(win, doc){
    if(win.__xeFetchHooked) return;
    win.__xeFetchHooked = true;
    const raw = win.fetch.bind(win);
    win.fetch = async function(input, init={}){
      let reqUrl = (typeof input === 'string') ? input : ((input && input.url) || '');
      try{
        if(typeof input === 'string'){
          input = input.replace('https://api.xeleria.com.ar/api','https://api.xeleria.com.ar').replace('https://planeta-casa-erp.onrender.com','https://api.xeleria.com.ar');
          reqUrl = input;
        }
        init = init || {};
        init.headers = {...headers(doc), ...(init.headers || {})};
        const res = await raw(input, init);
        const clone = res.clone();
        let txt = '';
        try{ txt = await clone.text(); }catch(e){}
        let body = txt;
        try{ body = JSON.parse(txt); }catch(e){}
        saveLast({ok:res.ok,status:res.status,url:reqUrl,body});
        return res;
      }catch(err){ saveLast({ok:false,url:reqUrl,error:String((err && err.message) || err)}); throw err; }
    };
  }

  function setStatus(card, ok, text){
    const status = card.querySelector('.status') || card.querySelector('[id*=status]') || card.querySelector('[id*=Status]');
    if(status){ status.textContent = text; status.className = 'status ' + (ok ? 'oktxt' : 'badtxt'); }
  }

  function ensureDebugUi(doc){
    const apiInput = doc.getElementById('cfgApiUrl') || doc.getElementById('apiUrl');
    if(!apiInput) return;
    const card = apiInput.closest('.card') || apiInput.parentElement;
    if(!card || doc.getElementById('xeShowLastJson')) return;
    const testBtn = Array.from(card.querySelectorAll('button,.btn')).find(b => (b.textContent||'').trim().toLowerCase() === 'probar');
    if(testBtn){
      testBtn.type = 'button';
      testBtn.onclick = async function(ev){
        ev.preventDefault(); ev.stopPropagation();
        const healthUrl = `${apiBase(doc)}/admin/health?tenant_id=${encodeURIComponent(tenantId())}`;
        try{
          const r = await fetch(healthUrl, {headers:headers(doc)});
          const data = await r.json();
          saveLast({ok:r.ok,status:r.status,url:healthUrl,body:data});
          setStatus(card, r.ok, r.ok ? `Conectado: ${data.service || 'XelerIA'} ${data.version || ''}`.trim() : 'Error de conexión.');
        }catch(e){ saveLast({ok:false,url:healthUrl,error:String((e && e.message) || e)}); setStatus(card, false, 'Error de conexión. Ver último JSON.'); }
      };
    }
    const row = doc.createElement('div'); row.className = 'btnrow'; row.style.marginTop = '12px';
    const btn = doc.createElement('button'); btn.id = 'xeShowLastJson'; btn.type = 'button'; btn.textContent = 'Ver último JSON';
    const panel = doc.createElement('div'); panel.id = 'xeLastJsonPanel'; panel.className = 'xe-json-panel'; panel.innerHTML = '<pre id="xeLastJsonPre">Todavía no hay JSON guardado.</pre>';
    btn.addEventListener('click', function(){ const pre = panel.querySelector('pre'); pre.textContent = localStorage.getItem(LAST_KEY) || 'Todavía no hay JSON guardado.'; panel.classList.toggle('active'); });
    row.appendChild(btn); card.appendChild(row); card.appendChild(panel);
  }

  function patchIframe(iframe){
    try{
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument || win.document;
      injectCss(doc); patchText(doc); ensureApiRoot(doc); hideToken(doc); hookFetch(win, doc); ensureDebugUi(doc);
    }catch(e){ console.error('No pude aplicar runtime patch XelerIA', e); }
  }
  window.XeleriaRuntimePatch = {patchIframe, saveLast, tenantId};
})();
