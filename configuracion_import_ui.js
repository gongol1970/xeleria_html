(function(){
  const API='https://api.xeleria.com.ar/api';
  const DEFAULT='00000000-0000-0000-0000-000000000001';
  let batchId=null;
  let gridRows=[];

  function qs(s){return document.querySelector(s)}
  function ce(tag, html){const e=document.createElement(tag); if(html!==undefined)e.innerHTML=html; return e}
  function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c))}
  function tenant(){return localStorage.getItem('xeleria_tenant_id')||''}
  function okTenant(){const t=tenant(); return t && t!==DEFAULT}
  function status(txt, cls){const e=qs('#import_status'); if(e){e.textContent=txt; e.className=cls||'status'}}
  function modalStatus(txt, cls){const e=qs('#xi_modal_status'); if(e){e.textContent=txt; e.className=cls||'status'}}

  function injectStyle(){
    if(qs('#xi_import_style')) return;
    const st=ce('style'); st.id='xi_import_style';
    st.textContent=`
      .xiImportModal{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:flex-start;justify-content:center;padding:26px;z-index:99999}
      .xiImportBox{width:min(1200px,96vw);max-height:90vh;overflow:auto;background:#fffdf8;border:1px solid #ded4be;border-radius:18px;box-shadow:0 18px 48px rgba(0,0,0,.18);padding:18px}
      .xiImportTop{display:flex;justify-content:space-between;gap:12px;align-items:center;position:sticky;top:0;background:#fffdf8;z-index:1;padding-bottom:10px;border-bottom:1px solid #ded4be}
      .xiImportTable{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
      .xiImportTable th,.xiImportTable td{border:1px solid #ded4be;padding:8px;vertical-align:top}
      .xiImportTable th{background:#eee4d1;text-align:left;position:sticky;top:56px;z-index:1}
      .xiImportTable tr.new{background:#eefbe8}.xiImportTable tr.missing_sku{background:#fff8c5}.xiImportTable tr.missing_in_refresh{background:#fdecec}
      .xiPubTitle{font-weight:800}.xiPubMeta{color:#5b554c;font-size:12px;margin-top:3px;line-height:1.35}.xiRadio{text-align:center;white-space:nowrap}.xiRadio input{width:18px;height:18px}
    `;
    document.head.appendChild(st);
  }

  function injectModal(){
    if(qs('#xi_import_modal')) return;
    document.body.appendChild(ce('div', `
      <div id="xi_import_modal" class="xiImportModal">
        <div class="xiImportBox">
          <div class="xiImportTop">
            <div><h3 id="xi_import_title">Configurar inventario</h3><div id="xi_import_subtitle" class="lead">Temporal de publicaciones</div></div>
            <button id="xi_close_import">Cerrar</button>
          </div>
          <div class="btnrow" style="margin-top:12px">
            <button class="gold" id="xi_confirm_import">Guardar selección en inventario real</button>
            <span id="xi_modal_status" class="status"></span>
          </div>
          <div style="overflow:auto">
            <table class="xiImportTable">
              <thead><tr><th>SKU</th><th>Tienda Nube</th><th>Simple</th><th>Bundle</th><th>Mercado Libre</th><th>Simple</th><th>Bundle</th></tr></thead>
              <tbody id="xi_import_body"></tbody>
            </table>
          </div>
        </div>
      </div>`).firstElementChild);
    qs('#xi_close_import').onclick=()=>qs('#xi_import_modal').style.display='none';
    qs('#xi_confirm_import').onclick=confirmImport;
  }

  function findInventoryButtons(){
    const inv=qs('#inventario'); if(!inv) return [];
    return Array.from(inv.querySelectorAll('button')).filter(b=>/Configurar desde/i.test(b.textContent||''));
  }

  async function initButtons(){
    const btns=findInventoryButtons();
    if(btns[0]){btns[0].disabled=true; btns[0].textContent='Configurar desde ML'; btns[0].onclick=()=>startImport('ML')}
    if(btns[1]){btns[1].disabled=true; btns[1].textContent='Configurar desde TN'; btns[1].onclick=()=>startImport('TN')}
    let row=qs('#import_status');
    if(!row && btns[0]){row=ce('span'); row.id='import_status'; row.className='status'; btns[0].parentElement.appendChild(row)}
    if(!okTenant()) return;
    try{
      const r=await fetch(`${API}/inventory/import/connections?tenant_id=${encodeURIComponent(tenant())}`);
      const j=await r.json();
      if(!j.ok) throw new Error(j.error||'No pude leer conexiones');
      if(btns[0]) btns[0].disabled=!j.connections.ml_connected;
      if(btns[1]) btns[1].disabled=!j.connections.tn_connected;
      status('Listo para importar desde canales conectados.','ok');
    }catch(e){status(e.message||'Error leyendo conexiones','bad')}
  }

  function cellHtml(cell){
    if(!cell) return '<span style="color:#777">Sin publicación</span>';
    return `<div class="xiPubTitle">${esc(cell.title||'')}</div><div class="xiPubMeta">${esc(cell.variant_title||'')}<br>Publicación: ${esc(cell.publication||'')}${cell.variant?' / Variante: '+esc(cell.variant):''}<br>${esc(cell.compare_status||'')}</div>`;
  }
  function radio(cell,type){
    if(!cell||!cell.staging_id) return '';
    const checked=(type==='simple'&&cell.simple)||(type==='bundle'&&cell.bundle);
    return `<input type="radio" name="xi_${cell.staging_id}" value="${type}" ${checked?'checked':''}>`;
  }
  function rowClass(row){return row.row_status==='missing_sku'?'missing_sku':row.row_status==='missing_in_refresh'?'missing_in_refresh':row.row_status==='new'?'new':''}

  function renderGrid(rows){
    gridRows=rows||[];
    const tb=qs('#xi_import_body'); tb.innerHTML='';
    for(const row of gridRows){
      const tr=ce('tr'); tr.className=rowClass(row);
      tr.innerHTML=`<td><b>${esc(row.sku||'SIN SKU')}</b></td><td>${cellHtml(row.tn)}</td><td class="xiRadio">${radio(row.tn,'simple')}</td><td class="xiRadio">${radio(row.tn,'bundle')}</td><td>${cellHtml(row.ml)}</td><td class="xiRadio">${radio(row.ml,'simple')}</td><td class="xiRadio">${radio(row.ml,'bundle')}</td>`;
      tb.appendChild(tr);
    }
  }

  async function startImport(ch){
    if(!okTenant()) return alert('Falta tenant real. Entrá desde inicio.html');
    injectStyle(); injectModal();
    try{
      status(`Importando ${ch}... puede tardar un minuto`,'warn');
      const r=await fetch(`${API}/inventory/import/start`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tenant(),channels:[ch]})});
      const j=await r.json();
      if(!j.ok) throw new Error(j.error||'Error importando');
      batchId=j.batch_id;
      status(`${ch}: ${(j.counts&&j.counts[ch])||0} publicaciones importadas a temporal`,'ok');
      await loadGrid(ch);
    }catch(e){status(e.message||'Error importando','bad')}
  }

  async function loadGrid(ch){
    modalStatus('Cargando grilla...','warn');
    const r=await fetch(`${API}/inventory/import/batches/${batchId}/grid?tenant_id=${encodeURIComponent(tenant())}`);
    const j=await r.json();
    if(!j.ok) throw new Error(j.error||'Error cargando grilla');
    qs('#xi_import_title').textContent=`Configurar inventario desde ${ch}`;
    qs('#xi_import_subtitle').textContent=`Batch ${batchId} · ${(j.grid||[]).length} filas agrupadas`;
    renderGrid(j.grid||[]);
    qs('#xi_import_modal').style.display='flex';
    modalStatus('Revisá Simple/Bundle y luego Guardar selección.','ok');
  }

  function classifications(){
    const out=[];
    for(const row of gridRows){
      for(const cell of [row.tn,row.ml]){
        if(!cell||!cell.staging_id) continue;
        const c=qs(`input[name="xi_${cell.staging_id}"]:checked`);
        out.push({staging_id:cell.staging_id,item_type:c?c.value:'simple'});
      }
    }
    return out;
  }

  async function confirmImport(){
    if(!batchId) return;
    try{
      modalStatus('Guardando inventario real...','warn');
      const r=await fetch(`${API}/inventory/import/batches/${batchId}/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tenant(),rows:classifications()})});
      const j=await r.json();
      if(!j.ok) throw new Error(j.error||'Error guardando');
      modalStatus(`Guardado. Items: ${j.saved_items}, publicaciones: ${j.saved_listings}`,'ok');
    }catch(e){modalStatus(e.message||'Error guardando','bad')}
  }

  function boot(){injectStyle(); injectModal(); initButtons(); setTimeout(initButtons,1200);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
