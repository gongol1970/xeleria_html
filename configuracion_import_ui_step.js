(function(){
  const A='https://api.xeleria.com.ar/api';
  const D='00000000-0000-0000-0000-000000000001';
  let busy=false,batch=null;
  function q(s){return document.querySelector(s)}
  function t(){return localStorage.getItem('xeleria_tenant_id')||''}
  function ok(){const x=t();return x&&x!==D}
  function msg(x,c){let e=q('#import_status');if(e){e.textContent=x;e.className=c||'status'}}
  function btns(){const inv=q('#inventario');return inv?Array.from(inv.querySelectorAll('button')).filter(b=>/Configurar desde|Importar/i.test(b.textContent||'')):[]}
  function paint(ch,on){busy=on;const b=btns();if(b[0]){b[0].textContent=on&&ch==='ML'?'Importando ML...':'Importar ML';b[0].disabled=on||!q('#ml_card')?.classList.contains('connected')}if(b[1]){b[1].textContent=on&&ch==='TN'?'Importando TN...':'Importar TN';b[1].disabled=on||!q('#tn_card')?.classList.contains('connected')}}
  async function start(ch){if(busy)return;if(!ok())return alert('Falta tenant real');if(ch!=='ML')return alert('Primero dejamos ML perfecto; TN queda en el próximo paso.');paint(ch,true);try{msg('Iniciando ML...','warn');let r=await fetch(A+'/inventory/import/start-step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:t(),channel:ch})});let j=await r.json();if(!j.ok)throw new Error(j.error||'Error iniciando');batch=j.batch_id;let done=false;while(!done){let s=await fetch(A+'/inventory/import/step',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenant_id:t(),batch_id:batch,limit:10})});let x=await s.json();if(!x.ok)throw new Error(x.error||'Error importando');done=!!x.done;msg('Importando ML: '+x.processed+' / '+x.total+' publicaciones','warn')}msg('ML importado. Abrí la grilla del batch: '+batch,'ok')}catch(e){msg(e.message||'Error','bad')}finally{paint(ch,false)}}
  function boot(){const b=btns();if(b[0]){b[0].onclick=()=>start('ML')}if(b[1]){b[1].onclick=()=>start('TN')}if(b[0]&&!q('#import_status')){const s=document.createElement('span');s.id='import_status';s.className='status';b[0].parentElement.appendChild(s)}paint('',false)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();setTimeout(boot,1200);
})();
