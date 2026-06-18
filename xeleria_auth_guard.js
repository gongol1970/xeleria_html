(function () {
  const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  const publicPages = {
    "": true,
    "index.html": true,
    "inicio.html": true
  };

  if (publicPages[file]) return;

  const qp = new URLSearchParams(location.search);

  if (qp.get("reset") === "1") {
    localStorage.removeItem("xeleria_tenant_id");
    localStorage.removeItem("xeleria_session");
    localStorage.removeItem("xeleria_owner_key");
    localStorage.removeItem("pc_erp_token");
  }

  const incomingTenant = qp.get("tenant_id") || qp.get("tenant") || "";
  if (incomingTenant && incomingTenant !== DEFAULT_TENANT) {
    localStorage.setItem("xeleria_tenant_id", incomingTenant);
  }

  if (file === "admin_erp.html") {
    const ownerKey = (localStorage.getItem("xeleria_owner_key") || "").trim();
    const legacyToken = (localStorage.getItem("pc_erp_token") || "").trim();
    if (ownerKey && !legacyToken) {
      localStorage.setItem("pc_erp_token", ownerKey);
    }
  }

  const tenant = localStorage.getItem("xeleria_tenant_id") || "";

  if (!tenant || tenant === DEFAULT_TENANT) {
    const next = encodeURIComponent(file || "index.html");
    location.replace("inicio.html?next=" + next);
  }
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
      if(box&&logo){
        box.classList.add('hasLogo');
        box.innerHTML='<img src="'+esc(logo)+'" alt="'+esc(name)+'">';
        box.title=name;
      }else if(box){
        box.classList.remove('hasLogo');
        box.textContent='LOGO';
        box.title=name;
      }
    }catch(e){
      // No bloquea el panel si falla el branding.
    }
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

(function(){
  const VERSION='xeleria-import-grid-v1';
  const page=(location.pathname.split('/').pop()||'').toLowerCase();
  if(page!=='admin_erp.html')return;
  function boot(){let n=0,t=setInterval(()=>{n++;if(window.uploadCsv&&document.getElementById('csvFile')){clearInterval(t);patch()}if(n>80)clearInterval(t)},150)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  function patch(){
    if(window.__xeleriaImportGridPatchInstalled)return;
    window.__xeleriaImportGridPatchInstalled=VERSION;
    const original=window.uploadCsv;
    window.__xeleriaOriginalUploadCsv=original;
    addStyle();
    window.uploadCsv=async function(){
      const f=document.getElementById('csvFile')?.files?.[0];
      if(!f){return show('Elegí un CSV.')}
      try{
        const txt=await f.text();
        const rows=parse(txt);
        render(build(rows),f.name,rows.length);
      }catch(e){
        show('Error armando preview: '+(e&&e.message?e.message:String(e)));
      }
    };
    window.xeleriaApplyInventoryCsvImport=async function(){
      if(!confirm('Aplicar el CSV original?\n\nLa grilla Simple/Bundle es solo visual/temporal.'))return;
      return original();
    };
    window.xeleriaCancelInventoryCsvPreview=function(){document.getElementById('xeleriaImportPreview')?.remove()};
  }
  function show(s){let p=document.getElementById('uploadOut'); if(p){p.classList.remove('hidden');p.textContent=s}}
  function norm(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
  function key(s){return norm(s).replace(/[^a-z0-9]/g,'')}
  function esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
  function pick(r,names){let set=new Set(names.map(key));for(let k in r){if(set.has(key(k)))return r[k]}return ''}
  function delim(t){let l=(t.split(/\r?\n/).find(x=>x.trim())||''),best=';',bc=-1;for(let c of [';',',','\t','|']){let n=l.split(c).length-1;if(n>bc){best=c;bc=n}}return best}
  function parse(t){let d=delim(t),out=[],row=[],cell='',q=false;function pc(){row.push(cell);cell=''}function pr(){if(row.length||cell){pc();out.push(row)}row=[]}for(let i=0;i<t.length;i++){let c=t[i],nx=t[i+1];if(c==='"'){if(q&&nx==='"'){cell+='"';i++}else q=!q}else if(c===d&&!q)pc();else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&nx==='\n')i++;pr()}else cell+=c}if(cell||row.length)pr();let h=(out.shift()||[]).map(x=>String(x||'').replace(/^\ufeff/,'').trim());return out.filter(r=>r.some(v=>String(v||'').trim())).map(r=>Object.fromEntries(h.map((x,i)=>[x||('col_'+i),String(r[i]??'').trim()]))) }
  function channel(r){let s=norm([pick(r,['marketplace','channel','canal','plataforma','origen']),pick(r,['market'])].join(' '));if(s.includes('tienda')||s==='tn'||s.includes('nube'))return'tn';if(s.includes('mercado')||s==='ml')return'ml';let id=pick(r,['listing_id','external_product_id','publication_id','product_id','item_id']);if(/^ML[A-Z]?\d+/i.test(id))return'ml';return''}
  function isBundle(r){let b=norm([pick(r,['item_type','product_type','tipo','type','clasificacion','modo']),pick(r,['bundle','is_bundle','es_bundle','combo','kit']),pick(r,['component_sku','sku_componente'])].join(' '));let s=norm(pick(r,['simple','is_simple','es_simple']));if(['1','true','si','yes','x'].includes(s))return false;return b.includes('bundle')||b.includes('combo')||b.includes('kit')||!!pick(r,['component_sku','sku_componente'])}
  function info(r,ch){let title=pick(r,[ch+'_title',ch+'_titulo',ch+'_name',ch+'_nombre','title','titulo','name','nombre','producto']);let id=pick(r,[ch+'_listing_id',ch+'_product_id',ch+'_item_id','listing_id','external_product_id','publication_id','product_id','item_id']);let varid=pick(r,[ch+'_variant_id',ch+'_variation_id','variant_id','variation_id','external_variant_id']);let st=pick(r,[ch+'_status',ch+'_estado','status','estado']);return{title,id,varid,st}}
  function build(rows){let m=new Map();for(let r of rows){let sku=String(pick(r,['sku','seller_sku','codigo','sku_erp'])||'').trim();if(!sku)continue;if(!m.has(sku))m.set(sku,{sku,type:'simple',tn:null,ml:null,warn:[]});let x=m.get(sku);if(isBundle(r))x.type='bundle';let ch=channel(r);if(ch==='tn')x.tn=x.tn||info(r,'tn');else if(ch==='ml')x.ml=x.ml||info(r,'ml');else x.warn.push('Canal no detectado')}return [...m.values()].sort((a,b)=>a.sku.localeCompare(b.sku))}
  function cell(x,label){if(!x)return`<td class="pubCell emptyPub">Sin publicación ${label}</td>`;let meta=[x.id?'Pub: '+esc(x.id):'',x.varid?'Var: '+esc(x.varid):'',x.st?'Estado: '+esc(x.st):''].filter(Boolean).join(' · ');return`<td class="pubCell"><div class="pubTitle">${esc(x.title||'Publicación detectada')}</div><div class="pubMeta">${meta||'Detectada en CSV'}</div></td>`}
  function render(items,file,totalRows){let host=document.getElementById('uploadOut')||document.getElementById('invStatus');let old=document.getElementById('xeleriaImportPreview');if(old)old.remove();let html=items.map((r,i)=>`<tr><td class="skuCell">${esc(r.sku)}${r.warn.length?'<br><span class="small">'+esc(r.warn.join(' · '))+'</span>':''}</td>${cell(r.tn,'TN')}${cell(r.ml,'ML')}<td class="typeCell"><input type="radio" name="xig_${i}" ${r.type!=='bundle'?'checked':''}></td><td class="typeCell"><input type="radio" name="xig_${i}" ${r.type==='bundle'?'checked':''}></td></tr>`).join('');let div=document.createElement('div');div.id='xeleriaImportPreview';div.className='card xeleriaImportPreview';div.innerHTML=`<div class="xigHead"><div><b>Preview de importación</b><br><span class="small">${esc(file)} · ${totalRows} filas · ${items.length} SKU</span></div><div class="btnrow"><button class="ok" onclick="xeleriaApplyInventoryCsvImport()">Aplicar CSV original</button><button class="secondary" onclick="xeleriaCancelInventoryCsvPreview()">Cancelar</button></div></div><div class="tableWrap" style="max-height:520px"><table class="xeleriaImportGrid"><thead><tr><th>SKU</th><th>Tienda Nube</th><th>Mercado Libre</th><th>Simple</th><th>Bundle</th></tr></thead><tbody>${html||'<tr><td colspan="5">No detecté SKUs.</td></tr>'}</tbody></table></div><div class="xigNote">Simple/Bundle es global por SKU y temporal. No toca bundle_components ni item_type.</div>`;host.parentElement.insertBefore(div,host)}
  function addStyle(){if(document.getElementById('xeleriaImportGridStyle'))return;let s=document.createElement('style');s.id='xeleriaImportGridStyle';s.textContent='.xeleriaImportPreview{margin-top:12px;background:#fffaf0;border-color:#eee2c8;box-shadow:none}.xigHead{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px}.xeleriaImportGrid{min-width:980px;table-layout:fixed;font-size:12px}.xeleriaImportGrid th:nth-child(1),.xeleriaImportGrid td:nth-child(1){width:150px}.xeleriaImportGrid th:nth-child(2),.xeleriaImportGrid td:nth-child(2),.xeleriaImportGrid th:nth-child(3),.xeleriaImportGrid td:nth-child(3){width:330px}.xeleriaImportGrid th:nth-child(4),.xeleriaImportGrid td:nth-child(4),.xeleriaImportGrid th:nth-child(5),.xeleriaImportGrid td:nth-child(5){width:82px;text-align:center}.xeleriaImportGrid .skuCell{font-weight:950;white-space:nowrap;background:#fffdf8}.xeleriaImportGrid .pubCell{white-space:normal;line-height:1.25;background:#fff}.xeleriaImportGrid .emptyPub{background:#faf7ef;color:#8a8172;font-style:italic}.xeleriaImportGrid .pubTitle{font-weight:850;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.xeleriaImportGrid .pubMeta{font-size:11px;color:#6b665c;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.xeleriaImportGrid .typeCell input{width:18px;height:18px;accent-color:#111}.xigNote{font-size:12px;color:#6b665c;margin-top:8px}';document.head.appendChild(s)}
})();