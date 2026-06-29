// XelerIA runtime patch v2.35-a
// Acciones pendientes + notificaciones: ocultar = marcar revisado/read, no borrar auditoría.
(function(){
  if(window.XELERIA_ACTIONS_PATCH_V235)return;
  window.XELERIA_ACTIONS_PATCH_V235=true;

  function q(id){return document.getElementById(id)}
  function e(v){return window.esc?window.esc(v):String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
  function d(v){return window.dateAR?window.dateAR(v):(v||'')}
  function st(id,msg,ok){if(window.setStatus)window.setStatus(id,msg,ok)}
  function setNavText(btn,text){if(!btn)return;let badge=btn.querySelector('.navAlertBadge');btn.textContent=text;if(badge)btn.appendChild(badge)}

  function installStyle(){
    if(q('xeleriaActionsPatchStyle'))return;
    let s=document.createElement('style');
    s.id='xeleriaActionsPatchStyle';
    s.textContent='.iconMini{width:32px;height:32px;padding:0;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:#fffaf0;border:1px solid #d8c89d;cursor:pointer}.iconMini.danger{background:#fff5f3;border-color:#d99;color:#9d1c13}.itemActions{position:absolute;right:8px;top:8px}.notificationItem{position:relative;padding-right:48px}.notificationRow{grid-template-columns:125px 1fr 54px 42px!important}.opsLogActions{align-items:center}.opsLogActions .iconMini{margin-left:4px}';
    document.head.appendChild(s);
  }

  function renameBitacora(){
    setNavText(document.querySelector('.navBtn[data-view="bitacora"]'),'Acciones pendientes');
    let h=document.querySelector('#bitacora h3');
    if(h)h.textContent='Acciones pendientes';
    let p=document.querySelector('#bitacora p');
    if(p)p.textContent='Errores, advertencias y avisos que requieren intervención. El tacho oculta/marca revisado; no borra auditoría.';
  }

  async function markNotificationRead(id,statusId){
    if(!id)return;
    try{
      await window.fetchJson('/admin/notifications/'+encodeURIComponent(id)+'/read',{method:'POST'});
      st(statusId,'Ocultado / marcado como revisado.',true);
      if(window.loadNotifications)await window.loadNotifications(false);
      if(window.loadOpsLog)window.loadOpsLog(false).catch(()=>{});
    }catch(err){
      st(statusId,'No pude ocultar: '+(window.errText?window.errText(err):JSON.stringify(err)),false);
    }
  }

  window.dismissNotification=function(id){return markNotificationRead(id,'notificationsStatus')};
  window.dismissOpsLogItem=async function(id){
    if(!id)return;
    try{
      await window.fetchJson('/admin/notifications/'+encodeURIComponent(id)+'/read',{method:'POST'});
      st('opsLogStatus','Acción ocultada / marcada como revisada.',true);
    }catch(err1){
      try{
        await window.fetchJson('/admin/ops-log/'+encodeURIComponent(id),{method:'DELETE'});
        st('opsLogStatus','Acción ocultada.',true);
      }catch(err2){
        st('opsLogStatus','No pude ocultar: '+(window.errText?window.errText(err2):JSON.stringify(err2)),false);
        return;
      }
    }
    if(window.loadOpsLog)window.loadOpsLog(false).catch(()=>{});
    if(window.loadNotifications)window.loadNotifications(false).catch(()=>{});
  };
  window.deleteOpsLogItem=window.dismissOpsLogItem;

  window.opsLogActionsHtml=function(n={}){
    let acts=Array.isArray(n.actions)?n.actions:[];
    let html='';
    acts.forEach(a=>{
      let k=String(a.kind||'');
      if(k==='retry_import'&&a.job_id)html+='<button class="secondary" onclick="retryInventoryImportErrors(\''+e(a.job_id)+'\',true)">'+e(a.label||'Reintentar')+'</button>';
      else if(k==='repair_save'&&a.job_id)html+='<button class="secondary" onclick="repairInventoryImportSaveObservations(\''+e(a.job_id)+'\')">'+e(a.label||'Reparar')+'</button>';
    });
    if(n.id)html+='<button class="iconMini danger" title="Ocultar / marcar revisado" onclick="dismissOpsLogItem(\''+e(n.id)+'\')">&#128465;</button>';
    return html||'<button class="secondary" disabled>Sin acción automática</button>';
  };

  window.renderNotifications=function(){
    let groups=window.notificationGroups?window.notificationGroups():{};
    let rows=(window.NOTIFICATION_GROUPS||[]).map(g=>{
      let items=groups[g.key]||[];
      let unread=items.filter(window.notificationIsUnread||((x)=>!x.read_at)).length;
      let latest=items[0]||null;
      let txt=(g.key==='inventory_import'&&window.notificationImportState)?window.notificationImportState(items):(latest?(latest.title||'Novedad'):'Sin novedades');
      let meta=latest?'<div class="notificationMeta">'+d(latest.created_at)+(latest.body?' · '+e(latest.body):'')+'</div>':'';
      return '<div class="notificationRow '+(unread?'':'zero')+'"><div class="notificationSource">'+e(g.source)+'</div><div><div class="notificationSlot">'+e(g.slot)+'</div><div class="notificationState">'+e(txt)+'</div>'+meta+'</div><div><span class="pill '+(unread?'bad':'ok')+' notificationCount">'+unread+'</span></div><button class="iconMini" title="Ver" onclick="viewNotificationGroup(\''+g.key+'\')">›</button></div>';
    }).join('');
    let sum=q('notificationsSummary');if(sum)sum.innerHTML=rows;
    let unreadItems=((window.state&&state.notifications&&state.notifications.items)||[]).filter(window.notificationIsUnread||((x)=>!x.read_at));
    let list=q('notificationsList');
    if(list){
      if(unreadItems.length){
        list.innerHTML='<div class="card" style="box-shadow:none;margin-top:14px;background:#fffdf8"><h3>Últimas no leídas</h3>'+unreadItems.slice(0,12).map(n=>'<div class="notificationItem"><div class="itemActions"><button class="iconMini danger" title="Ocultar / marcar leída" onclick="dismissNotification(\''+e(n.id||'')+'\')">&#128465;</button></div><h4>'+e(n.title||n.type||'Notificación')+'</h4><p>'+e(n.body||'')+'<br>'+d(n.created_at)+'</p></div>').join('')+'</div>';
      }else list.innerHTML='<div class="dashEmpty" style="margin-top:14px">No hay notificaciones pendientes.</div>';
    }
    if(window.renderNotificationsBadge)window.renderNotificationsBadge();
  };

  function patchShowView(){
    if(window._xeleriaShowViewActionsPatch)return;
    window._xeleriaShowViewActionsPatch=window.showView;
    window.showView=function(id){let r=window._xeleriaShowViewActionsPatch.apply(this,arguments);renameBitacora();return r};
  }

  function init(){installStyle();renameBitacora();patchShowView();if(q('notificaciones')?.classList.contains('active')&&window.renderNotifications)window.renderNotifications();if(q('bitacora')?.classList.contains('active')&&window.renderOpsLog)window.renderOpsLog();console.info('XelerIA actions patch v2.35 loaded')}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
