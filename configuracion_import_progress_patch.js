(function(){
  const API='https://api.xeleria.com.ar/api';
  const DEF='00000000-0000-0000-0000-000000000001';
  const KEY='xeleria_import_batch_v5';
  const LIMIT=5;
  let running=false;

  const $=s=>document.querySelector(s);
  const tenant=()=>localStorage.getItem('xeleria_tenant_id')||'';
  const realTenant=()=>tenant()&&tenant()!==DEF;
  const connected=c=>$('#'+c.toLowerCase()+'_card')?.classList.contains('connected');
  const channels=()=>['ML','TN'].filter(connected);

  function installImportGridCss(){
    if($('#xeleriaImportGridCss'))return;
    const s=document.createElement('style');
    s.id='xeleriaImportGridCss';
    s.textContent=[
      '.importBox{width:min(1320px,98vw)!important;padding:14px!important}',
      '.importBox .tableWrap{overflow-x:hidden!important}',
      '.importTable{width:100%!important;table-layout:fixed!important;font-size:12px!important}',
      '.importTable th,.importTable td{font-size:12px!important;line-height:1.22!important;padding:5px 6px!important;overflow-wrap:anywhere!important;word-break:normal!important}',
      '.importTable th:nth-child(1),.importTable td:nth-child(1){width:18%!important}',
      '.importTable th:nth-child(2),.importTable td:nth-child(2){width:27%!important}',
      '.importTable th:nth-child(3),.importTable td:nth-child(3){width:5%!important}',
      '.importTable th:nth-child(4),.importTable td:nth-child(4){width:5%!important}',
      '.importTable th:nth-child(5),.importTable td:nth-child(5){width:35%!important}',
      '.importTable th:nth-child(6),.importTable td:nth-child(6){width:5%!important}',
      '.importTable th:nth-child(7),.importTable td:nth-child(7){width:5%!important}',
      '.pubTitle{font-size:12px!important;line-height:1.22!important;font-weight:700!important}',
      '.pubMeta{font-size:10.5px!important;line-height:1.22!important}',
      '.importTable .radioCell{text-align:center!important;width:auto!important}',
      '.importTable .radioCell input[type="radio"],#importGridBody input[type="radio"]{width:16px!important;height:16px!important;min-width:16px!important;max-width:16px!important;min-height:16px!important;max-height:16px!important;margin:0!important;padding:0!important;transform:none!important;accent-color:#0d6efd!important;vertical-align:middle!important}'
    ].join('');
    document.head.appendChild(s);
  }

  function status(text, cls){
    let e=$('#import_status');
    if(!e){
      const b=$('#import_ml_btn');
      if(b&&b.parentElement){e=document.createElement('span');e.id='import_status';b.parentElement.appendChild(e)}
    }
    if(e){e.textContent=text||'';e.className=cls||'status'}
  }

  async function json(url,opt){
    const r=await fetch(url,opt||{});
    const j=await r.json().catch(()=>({ok:false,error:'Respuesta no JSON'}));
    if(!r.ok||!j.ok)throw new Error(j.error||j.detail||('HTTP '+r.status));
    return j;
  }

  function fmt(counts){
    const p=(counts&&counts.progress)||{};
    const proc=p.processed||{};
    const totals=p.totals||{};
    const active=p.channel||p.last_channel||'';
    const parts=[];
    for(const ch of (p.channels||channels())){
      const a=Number(proc[ch]||0);
      const t=Number(totals[ch]||0);
      parts.push(ch+': '+a+(t?(' / '+t):''));
    }
    return (active?'Importando '+active+' · ':'')+parts.join(' · ');
  }

  async function loadFinalGrid(batchId){
    if(typeof window.loadGrid==='function'){
      try{return await window.loadGrid()}
      catch(e){}
    }
    localStorage.setItem(KEY,batchId);
    status('Importación terminada. Cargando grilla...','warn');
    location.hash='#inventario';
    setTimeout(()=>location.reload(),350);
  }

  async function steppedImport(){
    if(running)return;
    if(!realTenant())return alert('Falta tenant real.');
    const ch=channels();
    if(!ch.length)return alert('Primero conectá ML, TN o ambos.');
    const oldBatch=localStorage.getItem(KEY)||'';
    if(oldBatch && !confirm('Hay una grilla pendiente. Si seguís, se reemplaza por una importación nueva.\n\nContinuar?'))return;

    running=true;
    const btn=$('#import_ml_btn');
    if(btn)btn.disabled=true;
    try{
      status('Iniciando importación por pasos '+ch.join(' + ')+'...','warn');
      const start=await json(API+'/inventory/import2/start-step',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tenant_id:tenant(),channels:ch})
      });
      const batchId=start.batch_id;
      localStorage.setItem(KEY,batchId);
      status(fmt(start.counts)||'Importación iniciada.','warn');

      let last=start;
      for(let i=0;i<10000;i++){
        last=await json(API+'/inventory/import2/step',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({tenant_id:tenant(),batch_id:batchId,limit:LIMIT})
        });
        status((fmt(last.counts)||'Importando...')+(last.done?' · terminado':''),last.done?'ok':'warn');
        if(last.done)break;
        await new Promise(r=>setTimeout(r,120));
      }
      if(!last.done)throw new Error('Corte de seguridad: demasiados pasos de importación');
      await loadFinalGrid(batchId);
      installImportGridCss();
    }catch(e){
      status(e.message||'Error importando','bad');
    }finally{
      running=false;
      if(btn)btn.disabled=false;
      patch();
    }
  }

  function normalizeConnectButtons(){
    const map=[['ML','ml_button'],['TN','tn_button']];
    for(const [ch,id] of map){
      const b=$('#'+id);
      if(!b)continue;
      if(connected(ch)){
        b.textContent=ch+' conectado';
        b.disabled=true;
        b.title=ch+' ya está conectado';
      }else{
        b.textContent='Conectar '+ch;
        b.disabled=false;
        b.title='Conectar '+ch;
      }
    }
  }

  function patch(){
    installImportGridCss();
    normalizeConnectButtons();
    const btn=$('#import_ml_btn');
    const tn=$('#import_tn_btn');
    if(tn)tn.style.display='none';
    if(!btn)return;
    btn.textContent=running?'Importando canales...':'Importar canales conectados';
    btn.onclick=steppedImport;
    btn.disabled=running||channels().length===0;
    btn.title=channels().length?'Importa ML/TN de a 5 publicaciones':'Conectá ML, TN o ambos primero';
  }

  function boot(){patch();setTimeout(patch,500);setTimeout(patch,1500);setTimeout(patch,2800)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setInterval(patch,4000);
})();
