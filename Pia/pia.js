const API_BASE = new URLSearchParams(window.location.search).get("api")
  || (["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://127.0.0.1:8010"
    : "https://api.xeleria.com.ar");

const state = {
  token: localStorage.getItem("pia_admin_token") || "",
  conversations: [],
  selectedId: "",
  selected: null,
  filter: "all",
  spyTab: "detection",
  paused: false,
  settings: {
    shipping_markup_type: "none",
    shipping_markup_value: 0,
    shipping_rounding_step: 500
  },
  loading: false,
  correction: null,
  polling: false,
  initialized: false,
  conversationSnapshots: new Map(),
  audioContext: null,
  soundUnlocked: false,
  suppressAlertsUntil: 0,
  renderedConversationId: "",
  renderedMessagesSignature: "",
  renderedConversationListSignature: "",
  renderedSpySignature: ""
};

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[char]);
const percent = value => Math.max(0, Math.min(99, Math.round(Number(value || 0) * 100)));
const timeLabel = value => value
  ? new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  : "";
const usd = value => `USD ${Number(value || 0).toLocaleString("es-AR", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 6
})}`;
const tokenCount = value => Number(value || 0).toLocaleString("es-AR");
const initials = name => String(name || "Cliente")
  .split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
const phoneLabel = item => {
  const value = String(item?.external_contact_id || "").trim();
  if (!value) return String(item?.channel || "INTERNO").toUpperCase();
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : value;
};
const ars = value => Number.isFinite(Number(value))
  ? `$${Number(value).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`
  : String(value ?? "");

function messagesSignature(messages) {
  return JSON.stringify((messages || []).map(message => ({
    id: message.id,
    direction: message.direction,
    body: message.body,
    created_at: message.created_at,
    attachments: (message.attachments || []).map(attachment => ({
      kind: attachment.kind,
      url: attachment.url,
      expired: attachment.expired,
      filename: attachment.filename
    }))
  })));
}

function selectionInside(element) {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  return element.contains(range.commonAncestorContainer);
}

function conversationUsage(item) {
  const usages = (item?.messages || [])
    .map(message => message.raw?.openai_usage)
    .filter(usage => usage && Number(usage.requests || 0) > 0);
  const totals = {
    requests: 0,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    chat_cost_gauge_usd: 1
  };
  for (const usage of usages) {
    for (const key of [
      "requests", "input_tokens", "cached_input_tokens", "output_tokens",
      "reasoning_tokens", "total_tokens"
    ]) totals[key] += Number(usage[key] || 0);
    totals.estimated_cost_usd += Number(usage.estimated_cost_usd || 0);
    totals.chat_cost_gauge_usd = Number(usage.chat_cost_gauge_usd || totals.chat_cost_gauge_usd);
  }
  return totals;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}), "x-pia-token": state.token };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let payload = {};
  try { payload = await response.json(); } catch (_) { payload = {}; }
  if (response.status === 401) {
    state.token = "";
    localStorage.removeItem("pia_admin_token");
    showLogin();
  }
  if (!response.ok) {
    const detail = typeof payload.detail === "string" ? payload.detail : payload.detail?.message;
    throw new Error(detail || payload.error || `Error ${response.status}`);
  }
  return payload;
}

function selectedConversation() {
  return state.selected;
}

function statusFor(item) {
  return item.current_stage === "sales"
    ? { state: "identified", label: "Producto en foco" }
    : { state: "attention", label: "Conversaci\u00f3n libre" };
}

function renderConversationList() {
  const list = state.conversations;
  const container = $("conversationList");
  const signature = JSON.stringify({
    selectedId: state.selectedId,
    items: list.map(item => [
      item.id,
      item.display_name,
      phoneLabel(item),
      item.current_stage,
      item.last_message_at
    ])
  });
  if (signature === state.renderedConversationListSignature) return false;
  const previousScrollTop = container.scrollTop;
  $("conversationCount").textContent = list.length;
  container.innerHTML = list.length ? list.map(item => {
    const status = statusFor(item);
    return `
      <button class="conversation-item ${item.id === state.selectedId ? "active" : ""}" type="button" data-id="${escapeHtml(item.id)}">
        <span class="avatar">${escapeHtml(initials(item.display_name))}</span>
        <span class="item-copy">
          <span class="item-name">${escapeHtml(item.display_name)}</span>
          <span class="item-preview">${escapeHtml(phoneLabel(item))}</span>
          <span class="item-signal ${status.state === "attention" ? "attention" : ""}"><i></i>${escapeHtml(status.label)}</span>
        </span>
        <span class="item-time">${escapeHtml(timeLabel(item.last_message_at))}</span>
      </button>`;
  }).join("") : '<div class="empty-list">No hay conversaciones en este filtro.</div>';

  document.querySelectorAll(".conversation-item").forEach(button => {
    button.addEventListener("click", () => selectConversation(button.dataset.id));
  });
  container.scrollTop = previousScrollTop;
  state.renderedConversationListSignature = signature;
  return true;
}

function renderEmptyConversation() {
  state.renderedConversationId = "";
  state.renderedMessagesSignature = "";
  $("contactInitials").textContent = "--";
  $("contactName").textContent = "Sin conversaci\u00f3n";
  $("contactMeta").textContent = "Cre\u00e1 una prueba para comenzar";
  $("messages").innerHTML = '<div class="empty-list chat-empty">No hay una conversaci\u00f3n seleccionada.</div>';
  $("focusSku").textContent = "Conversando";
  $("focusConfidence").textContent = "0%";
  $("confidenceFill").style.width = "0%";
  $("spyContent").innerHTML = '<div class="empty-list">El diagn\u00f3stico aparecer\u00e1 con el primer mensaje.</div>';
  $("chatCost").textContent = "USD 0,0000";
  $("messageInput").disabled = true;
}

function renderMessages(item) {
  const messages = item.messages || [];
  const container = $("messages");
  const signature = messagesSignature(messages);
  const conversationChanged = state.renderedConversationId !== item.id;
  if (!conversationChanged && signature === state.renderedMessagesSignature) return false;
  if (!conversationChanged && selectionInside(container)) return false;

  const previousScrollTop = container.scrollTop;
  const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
  const wasNearBottom = distanceFromBottom <= 96;
  container.innerHTML = messages.length ? `
    <div class="day-divider">Hoy</div>
    ${messages.map(message => {
      if (message.direction === "SYSTEM") {
        return `<div class="system-note">${escapeHtml(message.body)}</div>`;
      }
      const incoming = message.direction === "IN";
      const botMessage = message.direction === "BOT";
      const author = message.direction === "HUMAN" ? "Gonzalo" : "Atenci\u00f3n";
      const attachments = message.attachments || [];
      const media = attachments.map(attachment => attachment.expired || !attachment.url
        ? `<div class="message-attachment expired-attachment"><i data-lucide="timer-off"></i><span>Adjunto eliminado a los 3 d\u00edas</span></div>`
        : attachment.kind === "image"
          ? `<figure class="message-attachment"><img src="${escapeHtml(attachment.url)}" alt="Imagen enviada por el comprador" loading="lazy"><figcaption>${escapeHtml(attachment.filename || "Imagen")}</figcaption></figure>`
          : `<div class="message-attachment audio-attachment"><audio controls preload="metadata" src="${escapeHtml(attachment.url)}"></audio><span>${escapeHtml(attachment.filename || "Audio")}</span></div>`
      ).join("");
      return `
        <div class="message-row ${incoming ? "" : "outgoing"}">
          <div class="message">
            ${incoming ? "" : `<span class="message-author">${author}</span>`}
            ${media}
            <p>${escapeHtml(message.body)}</p>
            <div class="message-meta"><span>${escapeHtml(timeLabel(message.created_at))}</span>${incoming ? "" : '<i data-lucide="check-check"></i>'}</div>
            ${botMessage ? `<div class="message-training-actions">
              <button type="button" data-correction-target="general" data-message-id="${escapeHtml(message.id)}"><i data-lucide="book-plus"></i><span>General</span></button>
              <button type="button" data-correction-target="skill" data-message-id="${escapeHtml(message.id)}"><i data-lucide="badge-plus"></i><span>Skill</span></button>
            </div>` : ""}
          </div>
        </div>`;
    }).join("")}` : '<div class="empty-list chat-empty">Todav\u00eda no hay mensajes.</div>';
  document.querySelectorAll("[data-correction-target]").forEach(button => {
    button.addEventListener("click", () => openCorrectionDialog(
      button.dataset.messageId,
      button.dataset.correctionTarget
    ));
  });
  state.renderedConversationId = item.id;
  state.renderedMessagesSignature = signature;
  container.scrollTop = conversationChanged || wasNearBottom
    ? container.scrollHeight
    : previousScrollTop;
  return true;
}

function correctionSkill(item, message) {
  const values = [
    message?.raw?.skill_id,
    item.detected_skill_id,
    item.analysis?.skill_id,
    ...[...(item.activated_skills || [])].reverse()
  ];
  return values.map(value => String(value || "").trim().toUpperCase())
    .find(value => value && value !== "GENERAL") || "";
}

function precedingCustomerMessage(item, messageId) {
  let latest = "";
  for (const message of item.messages || []) {
    if (message.id === messageId) break;
    if (message.direction === "IN") latest = message.body || latest;
  }
  return latest;
}

function openCorrectionDialog(messageId, target) {
  const item = selectedConversation();
  const message = (item?.messages || []).find(candidate => candidate.id === messageId);
  if (!item || !message) return;
  const skillId = target === "general" ? "GENERAL" : correctionSkill(item, message);
  if (target === "skill" && !skillId) {
    showToast("Pia todav\u00eda no identific\u00f3 un skill de producto", true);
    return;
  }
  state.correction = {
    target,
    skillId,
    messageId,
    questionText: precedingCustomerMessage(item, messageId),
    proposedAnswer: message.body || ""
  };
  $("correctionTarget").textContent = skillId;
  $("correctionInput").value = "";
  $("correctionDialog").showModal();
  setTimeout(() => $("correctionInput").focus(), 0);
  refreshIcons();
}

function renderConversation() {
  const item = selectedConversation();
  if (!item) return renderEmptyConversation();
  const analysis = item.analysis || {};
  const products = analysis.product_context?.products || [];
  const hasFocus = products.length > 0 || Boolean(item.current_sku);
  const usedTools = analysis.product_context?.tools || [];
  const usage = conversationUsage(item);
  const confidence = percent(item.confidence);
  $("contactInitials").textContent = initials(item.display_name);
  $("contactName").textContent = item.display_name;
  $("contactMeta").textContent = phoneLabel(item);
  $("conversationState").textContent = item.status === "HUMAN" ? "Tomada" : "Bot";
  $("conversationState").className = `state ${hasFocus ? "" : "attention"}`;
  $("focusSku").textContent = products.length > 1
    ? `${products.length} productos en foco`
    : (item.current_sku || "Conversando");
  $("flowStage").textContent = hasFocus ? "Foco comercial" : "Conversaci\u00f3n libre";
  $("phaseLabel").textContent = "GPT-5.1 + inventario + conocimiento";
  $("discoveryStep").className = "stage-step complete";
  $("salesStep").className = `stage-step ${usedTools.length ? "active" : ""}`;
  $("focusConfidence").textContent = `${confidence}%`;
  $("confidenceFill").style.width = `${confidence}%`;
  $("detectionBar").classList.toggle("attention", !hasFocus);
  $("analysisState").className = `analysis-state ${hasFocus ? "identified" : ""}`;
  $("analysisState").innerHTML = `<i></i>${hasFocus ? "En foco" : "Libre"}`;
  $("chatCost").textContent = usd(usage.estimated_cost_usd);
  $("takeoverButton").classList.toggle("active", item.status === "HUMAN");
  $("takeoverButton").querySelector("span").textContent = item.status === "HUMAN" ? "Tomada" : "Tomar";
  $("messageInput").disabled = item.status !== "HUMAN";
  $("messageInput").placeholder = item.status === "HUMAN"
    ? "Escrib\u00ed como humano"
    : "Tom\u00e1 la conversaci\u00f3n para responder";
  renderMessages(item);
}

function candidateRows(analysis) {
  const candidates = analysis.candidate_skus || [];
  const focused = new Set(
    (analysis.product_context?.products || []).map(item => item.sku)
  );
  const maximum = Math.max(...candidates.map(item => Number(item.score || 0)), 1);
  const leaders = candidates.filter(item => Math.abs(Number(item.score || 0) - maximum) < 0.001).length;
  return candidates.map(candidate => {
    const relative = Math.round((Number(candidate.score || 0) / maximum) * 100);
    const selected = focused.has(candidate.sku) || candidate.sku === analysis.primary_sku;
    return {
      ...candidate,
      relative,
      selected,
      label: focused.has(candidate.sku)
        ? "EN FOCO"
        : (selected ? "ELEGIDO" : (relative === 100 && leaders > 1 ? "CONSIDERADO" : `${relative}%`))
    };
  });
}

function renderDetection(item) {
  const analysis = item.analysis || {};
  const product = analysis.product_context || {};
  const confidence = percent(analysis.confidence ?? item.confidence);
  const tags = analysis.matched_tags || [];
  const candidates = candidateRows(analysis);
  const visual = [...(item.messages || [])].reverse()
    .map(message => message.raw?.visual_detection)
    .find(Boolean);
  return `
    <section class="spy-section">
      <span class="section-label">Foco elegido por Pia</span>
      <div class="primary-sku">
        <div><strong>${escapeHtml(analysis.primary_sku || "Sin identificar")}</strong><span>${escapeHtml(product.title || analysis.missing_signal || "Sin producto confirmado")}</span></div>
        <div class="score-ring" style="--score:${confidence}%" data-score="${confidence}%"></div>
      </div>
    </section>
    ${visual ? `<section class="spy-section">
      <span class="section-label">Lectura de imagen</span>
      <div class="visual-reading"><i data-lucide="scan-eye"></i><div><strong>${escapeHtml(visual.primary_sku || "Sin confirmar")}</strong><span>${escapeHtml(visual.description || "Producto visible analizado")}</span>${visual.notes ? `<small>${escapeHtml(visual.notes)}</small>` : ""}</div></div>
    </section>` : ""}
    <section class="spy-section">
      <span class="section-label">Tags incorporados</span>
      <div class="tag-list">${tags.length ? tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : '<span class="muted-value">Sin coincidencias suficientes</span>'}</div>
    </section>
    <section class="spy-section">
      <span class="section-label">Productos en contexto</span>
      <div class="candidate-list">
        ${candidates.length ? candidates.map(candidate => `
          <div class="candidate-row ${candidate.selected ? "selected" : ""}"><div><div class="candidate-name"><code>${escapeHtml(candidate.sku)}</code></div><div class="candidate-bar"><i style="width:${candidate.relative}%"></i></div></div><span class="candidate-score">${candidate.label}</span></div>
        `).join("") : '<span class="muted-value">Esperando m\u00e1s contexto</span>'}
      </div>
    </section>
    <section class="spy-section">
      <span class="section-label">Foco del turno</span>
      <div class="missing-signal"><i data-lucide="scan-search"></i><div><strong>Lectura de Pia</strong><span>${escapeHtml(product.focus || analysis.missing_signal || "Conversaci\u00f3n abierta.")}</span></div></div>
    </section>`;
}

function renderSkills(item) {
  const active = item.activated_skills?.length
    ? item.activated_skills
    : (item.analysis?.active_skills || ["GENERAL"]);
  const tools = item.analysis?.product_context?.tools || [];
  return `
    <section class="spy-section">
      <span class="section-label">Skills activadas en la conversación</span>
      <div class="skill-list">${active.map(skill => `
        <div class="skill-row"><div><strong>${escapeHtml(skill)}</strong><span>${skill === "GENERAL" ? "Reglas permanentes" : "Conocimiento incorporado"}</span></div><span class="skill-status">Activa</span></div>
      `).join("")}</div>
    </section>
    <section class="spy-section">
      <span class="section-label">Herramientas invocadas</span>
      <div class="skill-list">${tools.length ? tools.map(tool => `
        <div class="skill-row"><div><strong>${escapeHtml(tool.name || "Herramienta")}</strong><span>Solicitada por Pia en este turno</span></div><span class="skill-status">Usada</span></div>
      `).join("") : '<span class="muted-value">Ninguna: respondi\u00f3 directamente con el contexto disponible</span>'}</div>
    </section>`;
}

function renderContext(item) {
  const context = item.analysis?.product_context || {};
  const products = context.products || [];
  const shipping = context.shipping || {};
  const shippingOptions = Array.isArray(shipping.options) ? shipping.options : [];
  const usage = conversationUsage(item);
  const gauge = Math.max(0.01, Number(usage.chat_cost_gauge_usd || 1));
  const gaugePercent = Math.min(100, Math.round(
    Number(usage.estimated_cost_usd || 0) / gauge * 100
  ));
  const gaugeState = gaugePercent >= 85 ? "danger" : gaugePercent >= 60 ? "warning" : "";
  const rows = [
    ["Productos en foco", products.length || "Ninguno"],
    ["Inventario le\u00eddo", context.inventory_items ?? "Sin dato"],
    ["Publicaciones le\u00eddas", context.inventory_listings ?? "Sin dato"],
    ["Herramientas usadas", (context.tools || []).map(tool => tool.name).join(", ") || "Ninguna"],
    ["Foco principal", item.current_sku || "Conversaci\u00f3n abierta"],
    ["Mensajes", (item.messages || []).length]
  ];
  if (Object.keys(shipping).length) {
    rows.push(
      ["Cotizaci\u00f3n", shipping.status || "Sin estado"],
      ["CP origen", shipping.origin_postal_code || "No configurado"],
      ["CP destino", shipping.destination_postal_code || "No informado"],
      ["Tienda Nube", shipping.storefront_status || "Sin consulta"],
      ["Correo Argentino", shipping.correo_status || shipping.status || "Sin consulta"],
      ["Opciones devueltas", shippingOptions.length
        ? shippingOptions.map(option => {
          const delivery = option.delivery_type ? ` ${option.delivery_type}` : "";
          return `${option.service || option.kind || "Env\u00edo"}${delivery}: ${ars(option.price)}`;
        }).join(" \u00b7 ")
        : (shipping.message || shipping.storefront_error || "Ninguna")]
    );
    if (shipping.storefront_error) {
      rows.push(["Error Tienda Nube", shipping.storefront_error]);
    }
    if (shipping.message) {
      rows.push(["Error Correo Argentino", shipping.message]);
    }
  }
  return `
    <section class="spy-section">
      <span class="section-label">Term&oacute;metro OpenAI del chat</span>
      <div class="usage-summary">
        <div><strong>${escapeHtml(usd(usage.estimated_cost_usd))}</strong><span>de ${escapeHtml(usd(gauge))}</span></div>
        <div class="usage-meter ${gaugeState}"><i style="width:${gaugePercent}%"></i></div>
        <div class="usage-grid">
          <span><b>${escapeHtml(usage.requests)}</b> llamadas</span>
          <span><b>${escapeHtml(tokenCount(usage.input_tokens))}</b> entrada</span>
          <span><b>${escapeHtml(tokenCount(usage.cached_input_tokens))}</b> cach&eacute;</span>
          <span><b>${escapeHtml(tokenCount(usage.output_tokens))}</b> salida</span>
        </div>
      </div>
    </section>
    <section class="spy-section"><span class="section-label">Contexto recuperado</span><div class="context-list">
    ${rows.map(([label, value]) => `<div class="context-row"><div><span>${escapeHtml(label)}</span></div><strong>${escapeHtml(value)}</strong></div>`).join("")}
  </div></section>`;
}

function renderSpy() {
  const item = selectedConversation();
  if (!item) return;
  const container = $("spyContent");
  const html = state.spyTab === "skills"
    ? renderSkills(item)
    : state.spyTab === "context" ? renderContext(item) : renderDetection(item);
  const signature = `${state.spyTab}:${item.id}:${item.analysis?.created_at || ""}:${html}`;
  if (signature !== state.renderedSpySignature && !selectionInside(container)) {
    container.innerHTML = html;
    state.renderedSpySignature = signature;
  }
  $("analysisTime").textContent = item.analysis?.created_at
    ? timeLabel(item.analysis.created_at)
    : "sin an\u00e1lisis";
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function renderAll() {
  renderConversationList();
  renderConversation();
  renderSpy();
  refreshIcons();
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.toggle("error", error);
  $("toast").classList.add("visible");
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 3200);
}

function setBusy(busy) {
  state.loading = busy;
  document.body.classList.toggle("is-busy", busy);
}

function showLogin() {
  if (!$("loginDialog").open) $("loginDialog").showModal();
  setTimeout(() => $("piaTokenInput").focus(), 0);
}

async function loadHealth() {
  const payload = await api("/pia/health");
  state.paused = Boolean(payload.settings?.bot_paused);
  state.settings = { ...state.settings, ...(payload.settings || {}) };
  $("connectionState").innerHTML = `<span></span>${escapeHtml(payload.database || "pia_app")} conectada`;
  $("metaState").textContent = payload.meta_enabled ? "Meta conectada" : "Sin Meta";
  $("pauseButton").setAttribute("aria-pressed", String(state.paused));
  $("pauseButton").innerHTML = `<i data-lucide="${state.paused ? "play" : "pause"}"></i>`;
}

function renderShippingMarkupFields() {
  const type = $("shippingMarkupType").value;
  $("shippingMarkupValueField").hidden = type === "none";
  $("shippingMarkupUnit").textContent = type === "percent" ? "%" : "$";
}

function openSettings() {
  $("shippingMarkupType").value = state.settings.shipping_markup_type || "none";
  $("shippingMarkupValue").value = Number(state.settings.shipping_markup_value || 0);
  $("shippingRoundingStep").value = String(state.settings.shipping_rounding_step ?? 500);
  renderShippingMarkupFields();
  $("settingsDialog").showModal();
  refreshIcons();
}

async function loadConversations(preferredId = "") {
  const query = $("conversationSearch").value.trim();
  const params = new URLSearchParams({ state: "all" });
  if (query) params.set("q", query);
  const payload = await api(`/pia/conversations?${params}`);
  const allItems = payload.items || [];
  handleConversationAlerts(allItems);
  state.conversations = allItems.filter(item => {
    if (state.filter === "attention") return statusFor(item).state === "attention";
    if (state.filter === "identified") return statusFor(item).state === "identified";
    return true;
  });
  const candidate = preferredId || state.selectedId;
  state.selectedId = state.conversations.some(item => item.id === candidate)
    ? candidate
    : (state.conversations[0]?.id || "");
  renderConversationList();
  if (state.selectedId) await selectConversation(state.selectedId, false);
  else {
    state.selected = null;
    renderAll();
  }
}

function soundContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!state.audioContext) state.audioContext = new AudioContextClass();
  return state.audioContext;
}

async function unlockSound() {
  const context = soundContext();
  if (!context) return false;
  if (context.state === "suspended") await context.resume();
  state.soundUnlocked = context.state === "running";
  return state.soundUnlocked;
}

async function playAlertSound() {
  if (!await unlockSound()) return false;
  const context = state.audioContext;
  const start = context.currentTime;
  [[0, 880], [0.18, 1175]].forEach(([offset, frequency]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(0.16, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + 0.15);
  });
  return true;
}

function handleConversationAlerts(items) {
  const nextSnapshots = new Map();
  const now = Date.now();
  let shouldSound = false;
  for (const item of items) {
    const current = {
      status: String(item.status || "BOT").toUpperCase(),
      lastDirection: String(item.last_direction || "").toUpperCase(),
      lastMessageAt: new Date(item.last_message_at || 0).getTime() || 0
    };
    const previous = state.conversationSnapshots.get(item.id);
    nextSnapshots.set(item.id, current);
    if (!state.initialized || !previous || now < state.suppressAlertsUntil) continue;
    const derivedToHuman = previous.status !== "HUMAN" && current.status === "HUMAN";
    const newCustomerMessage = current.lastDirection === "IN"
      && current.lastMessageAt > previous.lastMessageAt;
    const idleForFiveMinutes = current.lastMessageAt - previous.lastMessageAt >= 5 * 60 * 1000;
    if (derivedToHuman || (current.status === "HUMAN" && newCustomerMessage && idleForFiveMinutes)) {
      shouldSound = true;
    }
  }
  state.conversationSnapshots = nextSnapshots;
  state.initialized = true;
  if (shouldSound) playAlertSound().catch(() => {});
}

async function pollConversations() {
  if (!state.token || state.polling || state.loading || document.hidden) return;
  state.polling = true;
  try {
    await loadConversations(state.selectedId);
  } catch (_) {
    // The next interval retries without interrupting the operator.
  } finally {
    state.polling = false;
  }
}

async function selectConversation(id, redrawList = true) {
  state.selectedId = id;
  const payload = await api(`/pia/conversations/${encodeURIComponent(id)}`);
  state.selected = payload.item;
  if (redrawList) renderConversationList();
  renderConversation();
  renderSpy();
  refreshIcons();
}

async function refreshAll(preferredId = "") {
  setBusy(true);
  try {
    await loadHealth();
    await loadConversations(preferredId);
  } finally {
    setBusy(false);
    refreshIcons();
  }
}

document.querySelectorAll(".segment").forEach(button => {
  button.addEventListener("click", async () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".segment").forEach(item => item.classList.toggle("active", item === button));
    try { await loadConversations(); } catch (error) { showToast(error.message, true); }
  });
});

document.querySelectorAll(".spy-tab").forEach(button => {
  button.addEventListener("click", () => {
    state.spyTab = button.dataset.tab;
    document.querySelectorAll(".spy-tab").forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    renderSpy();
    refreshIcons();
  });
});

let searchTimer;
$("conversationSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadConversations().catch(error => showToast(error.message, true)), 250);
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  state.token = $("piaTokenInput").value.trim();
  localStorage.setItem("pia_admin_token", state.token);
  try {
    await refreshAll();
    $("loginDialog").close();
  } catch (error) {
    showToast(error.message, true);
  }
});

$("newConversationButton").addEventListener("click", () => $("newConversationDialog").showModal());
$("cancelNewConversation").addEventListener("click", () => $("newConversationDialog").close());
$("newConversationForm").addEventListener("submit", async event => {
  event.preventDefault();
  setBusy(true);
  try {
    const payload = await api("/pia/conversations", {
      method: "POST",
      body: JSON.stringify({
        display_name: $("newContactName").value.trim(),
        channel: "INTERNO",
        initial_message: $("newContactMessage").value.trim()
      })
    });
    const id = payload.conversation?.id;
    $("newConversationDialog").close();
    $("newContactMessage").value = "";
    await loadConversations(id);
    showToast(payload.ok ? "Conversaci\u00f3n creada" : payload.error || "Mensaje guardado sin respuesta", !payload.ok);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
});

$("customerMessageButton").addEventListener("click", () => {
  if (!selectedConversation()) return showToast("Primero seleccion\u00e1 una conversaci\u00f3n", true);
  $("customerMessageDialog").showModal();
});
$("cancelCustomerMessage").addEventListener("click", () => $("customerMessageDialog").close());
$("customerMessageForm").addEventListener("submit", async event => {
  event.preventDefault();
  const item = selectedConversation();
  if (!item) return;
  setBusy(true);
  try {
    const payload = await api(`/pia/conversations/${encodeURIComponent(item.id)}/customer-messages`, {
      method: "POST",
      body: JSON.stringify({ body: $("customerMessageInput").value.trim(), source: "INTERNAL_TEST" })
    });
    $("customerMessageDialog").close();
    $("customerMessageInput").value = "";
    await loadConversations(item.id);
    showToast(payload.ok ? "Mensaje procesado" : payload.error || "Mensaje guardado sin respuesta", !payload.ok);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
});

let pendingAttachment = null;
$("attachmentButton").addEventListener("click", () => {
  if (!selectedConversation()) return showToast("Primero seleccion\u00e1 una conversaci\u00f3n", true);
  $("attachmentFile").click();
});
$("attachmentFile").addEventListener("change", event => {
  pendingAttachment = event.target.files?.[0] || null;
  if (!pendingAttachment) return;
  $("attachmentFilename").textContent = pendingAttachment.name;
  const preview = $("attachmentPreview");
  preview.innerHTML = "";
  const url = URL.createObjectURL(pendingAttachment);
  preview.dataset.url = url;
  if (pendingAttachment.type.startsWith("image/")) {
    preview.innerHTML = `<img src="${escapeHtml(url)}" alt="Vista previa del adjunto">`;
  } else {
    preview.innerHTML = `<audio controls src="${escapeHtml(url)}"></audio>`;
  }
  $("attachmentDialog").showModal();
});
function resetAttachment() {
  const url = $("attachmentPreview").dataset.url;
  if (url) URL.revokeObjectURL(url);
  $("attachmentPreview").innerHTML = "";
  $("attachmentPreview").dataset.url = "";
  $("attachmentCaption").value = "";
  $("attachmentFile").value = "";
  pendingAttachment = null;
}
$("cancelAttachment").addEventListener("click", () => {
  $("attachmentDialog").close();
  resetAttachment();
});

$("cancelCorrection").addEventListener("click", () => {
  $("correctionDialog").close();
  state.correction = null;
});
$("correctionForm").addEventListener("submit", async event => {
  event.preventDefault();
  const item = selectedConversation();
  const correction = state.correction;
  const text = $("correctionInput").value.trim();
  if (!item || !correction || !text) return;
  setBusy(true);
  try {
    const payload = await api(
      `/pia/conversations/${encodeURIComponent(item.id)}/knowledge/${encodeURIComponent(correction.target)}`,
      {
        method: "POST",
        body: JSON.stringify({
          correction: text,
          skill_id: correction.skillId,
          question_text: correction.questionText,
          proposed_answer: correction.proposedAnswer
        })
      }
    );
    $("correctionDialog").close();
    $("correctionInput").value = "";
    state.correction = null;
    showToast(`Regla guardada en ${payload.skill_id}`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
});
$("attachmentForm").addEventListener("submit", async event => {
  event.preventDefault();
  const item = selectedConversation();
  if (!item || !pendingAttachment) return;
  const form = new FormData();
  form.append("file", pendingAttachment);
  form.append("caption", $("attachmentCaption").value.trim());
  setBusy(true);
  try {
    const payload = await api(`/pia/conversations/${encodeURIComponent(item.id)}/attachments`, {
      method: "POST", body: form
    });
    $("attachmentDialog").close();
    resetAttachment();
    await loadConversations(item.id);
    showToast(payload.ok ? "Adjunto procesado" : payload.error || "Adjunto guardado sin respuesta", !payload.ok);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
});

$("takeoverButton").addEventListener("click", async () => {
  const item = selectedConversation();
  if (!item) return;
  try {
    state.suppressAlertsUntil = Date.now() + 15000;
    await api(`/pia/conversations/${encodeURIComponent(item.id)}/takeover`, {
      method: "POST", body: JSON.stringify({ operator: "Gonzalo" })
    });
    await selectConversation(item.id);
    showToast("Conversaci\u00f3n tomada por Gonzalo");
  } catch (error) { showToast(error.message, true); }
});

$("releaseButton").addEventListener("click", async () => {
  const item = selectedConversation();
  if (!item) return;
  try {
    await api(`/pia/conversations/${encodeURIComponent(item.id)}/release`, { method: "POST" });
    await selectConversation(item.id);
    showToast("Conversaci\u00f3n liberada al bot");
  } catch (error) { showToast(error.message, true); }
});

$("deleteButton").addEventListener("click", () => {
  const item = selectedConversation();
  if (!item) return;
  $("deleteContactName").textContent = item.display_name;
  $("deleteDialog").showModal();
});

$("deleteDialog").addEventListener("close", async () => {
  if ($("deleteDialog").returnValue !== "confirm") return;
  const item = selectedConversation();
  if (!item) return;
  try {
    await api(`/pia/conversations/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    state.selectedId = "";
    state.selected = null;
    await loadConversations();
    showToast(`Conversaci\u00f3n de ${item.display_name} borrada`);
  } catch (error) { showToast(error.message, true); }
});

$("composer").addEventListener("submit", async event => {
  event.preventDefault();
  const item = selectedConversation();
  const input = $("messageInput");
  const body = input.value.trim();
  if (!item || !body) return;
  if (item.status !== "HUMAN") return showToast("Primero tom\u00e1 la conversaci\u00f3n", true);
  try {
    await api(`/pia/conversations/${encodeURIComponent(item.id)}/human-messages`, {
      method: "POST", body: JSON.stringify({ body, operator: "Gonzalo" })
    });
    input.value = "";
    input.style.height = "auto";
    await loadConversations(item.id);
  } catch (error) { showToast(error.message, true); }
});

$("messageInput").addEventListener("input", event => {
  event.target.style.height = "auto";
  event.target.style.height = `${Math.min(event.target.scrollHeight, 100)}px`;
});
$("messageInput").addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $("composer").requestSubmit();
  }
});

$("pauseButton").addEventListener("click", async () => {
  try {
    const payload = await api("/pia/settings", {
      method: "PUT", body: JSON.stringify({ paused: !state.paused })
    });
    state.paused = Boolean(payload.settings.bot_paused);
    $("pauseButton").setAttribute("aria-pressed", String(state.paused));
    $("pauseButton").innerHTML = `<i data-lucide="${state.paused ? "play" : "pause"}"></i>`;
    showToast(state.paused ? "Pia qued\u00f3 pausada" : "Pia volvi\u00f3 a estar activa");
    refreshIcons();
  } catch (error) { showToast(error.message, true); }
});

$("settingsButton").addEventListener("click", openSettings);
$("cancelSettings").addEventListener("click", () => $("settingsDialog").close());
$("shippingMarkupType").addEventListener("change", renderShippingMarkupFields);
$("settingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  const type = $("shippingMarkupType").value;
  const value = type === "none" ? 0 : Number($("shippingMarkupValue").value);
  const roundingStep = Number($("shippingRoundingStep").value);
  if (!Number.isFinite(value) || value < 0) {
    showToast("Ingresá un recargo válido", true);
    return;
  }
  try {
    const payload = await api("/pia/settings", {
      method: "PUT",
      body: JSON.stringify({
        shipping_markup_type: type,
        shipping_markup_value: value,
        shipping_rounding_step: roundingStep
      })
    });
    state.settings = { ...state.settings, ...(payload.settings || {}) };
    $("settingsDialog").close();
    showToast("Configuración de envíos guardada");
  } catch (error) {
    showToast(error.message, true);
  }
});

$("knowledgeButton").addEventListener("click", () => $("knowledgeFile").click());
$("downloadKnowledgeButton").addEventListener("click", async () => {
  setBusy(true);
  try {
    const response = await fetch(`${API_BASE}/pia/knowledge.xlsx`, {
      headers: { "x-pia-token": state.token }
    });
    if (response.status === 401) {
      state.token = "";
      localStorage.removeItem("pia_admin_token");
      showLogin();
    }
    if (!response.ok) {
      let payload = {};
      try { payload = await response.json(); } catch (_) { payload = {}; }
      throw new Error(payload.detail || `Error ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "conocimiento_Pia.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Conocimiento descargado");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
});
$("knowledgeFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  setBusy(true);
  try {
    const payload = await api("/pia/knowledge.xlsx", { method: "POST", body: form });
    showToast(`Conocimiento cargado: ${payload.sku_rows} SKUs`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
    event.target.value = "";
  }
});

$("catalogMediaButton").addEventListener("click", async () => {
  setBusy(true);
  try {
    const payload = await api("/pia/catalog-media/refresh?limit=500", { method: "POST" });
    const detail = payload.errors?.length ? `, ${payload.errors.length} con error` : "";
    showToast(`Fotos actualizadas: ${payload.saved}; en cach\u00e9: ${payload.cached}${detail}`, Boolean(payload.errors?.length));
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setBusy(false);
  }
});

$("refreshButton").addEventListener("click", () => {
  refreshAll(state.selectedId)
    .then(() => showToast("Vista actualizada"))
    .catch(error => showToast(error.message, true));
});
$("soundButton").addEventListener("click", async () => {
  const played = await playAlertSound();
  showToast(played ? "Sonido de aviso probado" : "El navegador bloque\u00f3 el sonido", !played);
});

$("spyToggle").addEventListener("click", () => {
  const hidden = $("spyPanel").classList.toggle("hidden");
  document.querySelector(".workspace").classList.toggle("spy-hidden", hidden);
  $("spyToggle").setAttribute("aria-pressed", String(!hidden));
});

refreshIcons();
document.addEventListener("pointerdown", () => unlockSound().catch(() => {}), { once: true });
document.addEventListener("keydown", () => unlockSound().catch(() => {}), { once: true });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pollConversations();
});
window.setInterval(pollConversations, 5000);
if (state.token) {
  refreshAll().catch(error => {
    showToast(error.message, true);
    showLogin();
  });
} else {
  showLogin();
}
