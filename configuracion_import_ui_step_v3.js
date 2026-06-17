(function(){
  const A='https://api.xeleria.com.ar/api';
  const D='00000000-0000-0000-0000-000000000001';
  const BK='xeleria_import_batch_id_v3';
  const CK='xeleria_import_channel_v3';
  let busy=false,batch=localStorage.getItem(BK)||'',chan=localStorage.getItem(CK)||'ML';
  function q(s){return document.querySelector(s)}
  function all(){const inv=q('#inventario');return inv?Array.from(inv.querySelectorAll('button')):[]}
  function mlb(){return all().find(b=>/ML/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function tnb(){return all().find(b=>/TN/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function tid(){return localStorage.getItem('xeleria_tenant_id')||''}
  function ok(){const x=tid();return x&&x!==D}
  function msg(x,c){let e=q('#import_status');if(e){e.textContent=x;e.className=c||'status'}}
  function connected(ch){return q('#'+ch.toLowerCase()+'_card')?.classList.contains('connected')}
  function paint(ch,on){busy=on;const m=mlb(),n=tnb();if(m){m.textContent=on&&ch==='ML'?'Importando ML...':(batch&&chan==='ML'?'Continuar ML':'Importar ML');m.disabled=on||!connected('ML')}if(n){n.textContent=on&&ch==='TN'?'Importando TN...':'Importar TN';n.disabled=on||!connected('TN')}}
  function modal(){let m=q('#xi_grid_modal');if(m)return m;let d=document.createElement('div');d.id='xi_grid_modal';d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:none;padding:24px;overflow:auto';d.innerHTML='<div style="background:#fffdf8;border-radius:18px;padding:18px;max-width:1200px;margin:auto"><button id="xi_grid_close">Cerrar</button><h3>Grilla importada</h3><div id="xi_grid_status"></div><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th>SKU</th><th>Tienda Nube</th><th>ML</th></tr></thead><tbody id="xi_grid_body"></tbody></table></div></div>';document.body.appendChild(d);q('#xi_grid_close').onclick=()=>d.style.display='none';return d}
  function safe(s){return String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
  function cell(c){if(!c)return 'Sin publicación';return '<b>'+safe(c.title||'')+'</b><br><small>'+safe(c.publication||'')+(c.variant?' / '+safe(c.variant):'')+'<br>'+safe(c.compare_status||'')+'</small>'}
  async function openGrid(id){let m=modal();q('#xi_grid_status').textContent='Cargando grilla...';m.style.display='block';let r=await fetch(A+'/inventory/import/batches/'+id+'/grid?tenant_id='+encodeURIComponent(tid()));let j=await r.json();if(!j.ok)throw new Error(j.error||'Error grilla');let tb=q('#xi_grid_body');tb.innerHTML='';for(const row of (j.grid||[])){let tr=document.createElement('tr');tr.innerHTML='<td><b>'+safe(row.sku||'SIN SKU')+'</b></td><td>'+cell(row.tn)+'</td><td>'+cell(row.ml)+'</td>';tb.appendChild(tr)}q('#xi_grid_status').textContent=(j.grid||[]).length+' filas agrupadas'}
  async function begin(ch){if(busy)return;if(!ok())return alert('Falta tenant real');if(ch!=='ML')return alert('Primero dejamos ML perfecto; TN queda en el próximo paso.');chan=ch;localStorage.setItem(CK,ch);paint(ch,true);try{if(!batch){msg('Iniciando ML...','warn');let r=await fetch(A+'/inventory/import/start-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),channel:ch})});let j=await r.json();if(!j.ok)throw new Error(j.error||'Error iniciando');batch=j.batch_id;localStorage.setItem(BK,batch)}await loop(ch)}catch(e){if(String(e.message||'').includes('Batch no encontrado')){localStorage.removeItem(BK);localStorage.removeItem(CK);batch=''}msg((e.message||'Error')+' · podés reintentar desde el último avance','bad')}finally{paint(ch,false)}}
  async function loop(ch){let done=false,lastP=0,lastT='?',doneBatch=batch;while(!done){let s=await fetch(A+'/inventory/import/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),batch_id:batch,limit:5})});let x=await s.json();if(!x.ok)throw new Error(x.error||'Error importando');done=!!x.done;lastP=x.processed||lastP;lastT=x.total||lastT;msg('Importando ML: '+lastP+' / '+lastT+' publicaciones','warn')}localStorage.removeItem(BK);localStorage.removeItem(CK);batch='';msg('ML importado. Abriendo grilla...','ok');await openGrid(doneBatch)}
  window.xeleriaOpenImportGrid=openGrid;
  function boot(){let m=mlb(),n=tnb();if(m)m.onclick=function(){begin('ML')};if(n)n.onclick=function(){begin('TN')};if(m&&!q('#import_status')){const s=document.createElement('span');s.id='import_status';s.className='status';m.parentElement.appendChild(s)}paint('',false)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();setTimeout(boot,1200);setTimeout(boot,2500);
})();