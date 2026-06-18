(function(){
  const qp = new URLSearchParams(location.search);
  const s = (qp.get('session') || '').trim();
  if (s) {
    localStorage.setItem('xeleria_session', s);
    qp.delete('session');
    history.replaceState(null, '', location.pathname + (qp.toString() ? '?' + qp.toString() : '') + location.hash);
  }
})();
