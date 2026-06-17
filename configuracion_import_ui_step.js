(function(){
  const A='https://api.xeleria.com.ar/api';
  const D='00000000-0000-0000-0000-000000000001';
  let busy=false;
  let batch=localStorage.getItem('xeleria_import_batch_id')||'';
  let chan=localStorage.getItem('xeleria_import_channel')||'ML';
  function q(s){return document.querySelector(s)}
  function all(){const inv=q('#inventario');return inv?Array.from(inv.querySelectorAll('button')):[]}
  function mlb(){return all().find(b=>/ML/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function tnb(){return all().find(b=>/TN/i.test(b.textContent||'')&&!/conectado|Conectar/i.test(b.textContent||''))}
  function tid(){return localStorage.getItem('xeleria_tenant_id')||''}
  function ok(){const x=tid();return x&&x!==D}
  function msg(x,c){let e=q('#import_status');if(e){e.textContent=x;e.className=c||'status'}}
  function connected(ch){return q('#'+ch.toLowerCase()+'_card')?.classList.contains('connected')}
  function paint(ch,on){busy=on;const m=mlb(),n=tnb();if(m){m.textContent=on&&ch==='ML'?'Importando ML...':(batch&&chan==='ML'?'Continuar ML':'Importar ML');m.disabled=on||!connected('ML')}if(n){n.textContent=on&&ch==='TN'?'Importando TN...':'Importar TN';n.disabled=on||!connected('TN')}}
  async function begin(ch){if(busy)return;if(!ok())return alert('Falta tenant real');if(ch!=='ML')return alert('Primero dejamos ML perfecto; TN queda en el próximo paso.');chan=ch;localStorage.setItem('xeleria_import_channel',ch);paint(ch,true);try{if(!batch){msg('Iniciando ML...','warn');let r=await fetch(A+'/inventory/import/start-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),channel:ch})});let j=await r.json();if(!j.ok)throw new Error(j.error||'Error iniciando');batch=j.batch_id;localStorage.setItem('xeleria_import_batch_id',batch)}await loop(ch)}catch(e){msg((e.message||'Error')+' · podés reintentar desde el último avance','bad')}finally{paint(ch,false)}}
  async function loop(ch){let done=false,lastP=0,lastT='?',doneBatch=batch;while(!done){let s=await fetch(A+'/inventory/import/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:tid(),batch_id:batch,limit:5})});let x=await s.json();if(!x.ok)throw new Error(x.error||'Error importando');done=!!x.done;lastP=x.processed||lastP;lastT=x.total||lastT;msg('Importando ML: '+lastP+' / '+lastT+' publicaciones','warn')}localStorage.removeItem('xeleria_import_batch_id');localStorage.removeItem('xeleria_import_channel');batch='';msg('ML importado. Batch: '+doneBatch,'ok')}
  function boot(){let m=mlb(),n=tnb();if(m)m.onclick=function(){begin('ML')};if(n)n.onclick=function(){begin('TN')};if(m&&!q('#import_status')){const s=document.createElement('span');s.id='import_status';s.className='status';m.parentElement.appendChild(s)}paint('',false)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();setTimeout(boot,1200);setTimeout(boot,2500);
})();
