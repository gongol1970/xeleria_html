// Temporary XelerIA console safety patch.
// It clears the raw console before each fetch and caps large JSON output.
(function () {
  const RAW_LIMIT = 12000;

  function rawBox() {
    return document.getElementById('rawConsole');
  }

  function clearRaw(message) {
    const el = rawBox();
    if (el) el.textContent = message || '';
  }

  function compact(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const out = { ...value };
    for (const key of Object.keys(out)) {
      if (Array.isArray(out[key]) && out[key].length > 10) {
        const originalLength = out[key].length;
        out[key] = out[key].slice(0, 10);
        out[key].push({ truncated: `${originalLength - 10} filas más` });
      }
    }
    return out;
  }

  function safeText(value) {
    let text = typeof value === 'string' ? value : JSON.stringify(compact(value), null, 2);
    if (text.length > RAW_LIMIT) {
      text = text.slice(0, RAW_LIMIT) + '\n...\n[truncado para no colgar la página]';
    }
    return text;
  }

  window.xeleriaClearRaw = clearRaw;
  window.xeleriaSafeRaw = function (value) {
    const el = rawBox();
    if (el) el.textContent = safeText(value);
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || 'request';
    clearRaw(`Consultando ${url}…`);
    return originalFetch(input, init);
  };
})();
