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
  loading: false,
  correction: null
};

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[char]);
const percent = value => Math.max(0, Math.min(99, Math.round(Number(value || 0) * 100)));
const timeLabel = value => value
  ? new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  : "";
const initials = name => String(name || "Cliente")
  .split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();

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
    ? { state: "identified", label: "SKU identificado" }
    : { state: "attention", label: "Requiere contexto" };
}

function renderConversationList() {
  const list = state.conversations;
  $("conversationCount").textContent = list.length;
  $("conversationList").innerHTML = list.length ? list.map(item => {
    const status = statusFor(item);
    return `
      <button class="conversation-item ${item.id === state.selectedId ? "active" : ""}" type="button" data-id="${escapeHtml(item.id)}">
        <span class="avatar">${escapeHtml(initials(item.display_name))}</span>
        <span class="item-copy">
          <span class="item-name">${escapeHtml(item.display_name)}</span>
          <span class="item-preview">${escapeHtml(item.preview || "Sin mensajes")}</span>
          <span class="item-signal ${status.state === "attention" ? "attention" : ""}"><i></i>${escapeHtml(status.label)}</span>
        </span>
        <span class="item-time">${escapeHtml(timeLabel(item.last_message_at))}</span>
      </button>`;
  }).join("") : '<div class="empty-list">No hay conversaciones en este filtro.</div>';

  document.querySelectorAll(".conversation-item").forEach(button => {
    button.addEventListener("click", () => selectConversation(button.dataset.id));
  });
}

function renderEmptyConversation() {
  $("contactInitials").textContent = "--";
  $("contactName").textContent = "Sin conversaci\u00f3n";
  $("contactMeta").textContent = "Cre\u00e1 una prueba para comenzar";
  $("messages").innerHTML = '<div class="empty-list chat-empty">No hay una conversaci\u00f3n seleccionada.</div>';
  $("focusSku").textContent = "Sin identificar";
  $("focusConfidence").textContent = "0%";
  $("confidenceFill").style.width = "0%";
  $("spyContent").innerHTML = '<div class="empty-list">El diagn\u00f3stico aparecer\u00e1 con el primer mensaje.</div>';
  $("messageInput").disabled = true;
}

function renderMessages(item) {
  const messages = item.messages || [];
  $("messages").innerHTML = messages.length ? `
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
  $("messages").scrollTop = $("messages").scrollHeight;
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
  const inSales = item.current_stage === "sales";
  const confidence = percent(item.confidence);
  $("contactInitials").textContent = initials(item.display_name);
  $("contactName").textContent = item.display_name;
  $("contactMeta").textContent = item.channel || "INTERNO";
  $("conversationState").textContent = item.status === "HUMAN" ? "Tomada" : "Bot";
  $("conversationState").className = `state ${inSales ? "" : "attention"}`;
  $("focusSku").textContent = item.current_sku || "Sin identificar";
  $("flowStage").textContent = inSales ? "Etapa 2 - Venta" : "Etapa 1 - Descubrimiento";
  $("phaseLabel").textContent = inSales
    ? `GENERAL + ${item.detected_skill_id || analysis.skill_id || "skill del producto"}`
    : "GENERAL + b\u00fasqueda por t\u00edtulos y tags";
  $("discoveryStep").className = `stage-step ${inSales ? "complete" : "active"}`;
  $("salesStep").className = `stage-step ${inSales ? "active" : ""}`;
  $("focusConfidence").textContent = `${confidence}%`;
  $("confidenceFill").style.width = `${confidence}%`;
  $("detectionBar").classList.toggle("attention", !inSales);
  $("analysisState").className = `analysis-state ${inSales ? "identified" : ""}`;
  $("analysisState").innerHTML = `<i></i>${inSales ? "Identificado" : "Analizando"}`;
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
  const maximum = Math.max(...candidates.map(item => Number(item.score || 0)), 1);
  const leaders = candidates.filter(item => Math.abs(Number(item.score || 0) - maximum) < 0.001).length;
  return candidates.map(candidate => {
    const relative = Math.round((Number(candidate.score || 0) / maximum) * 100);
    const selected = candidate.sku === analysis.primary_sku;
    return {
      ...candidate,
      relative,
      selected,
      label: selected ? "ELEGIDO" : (relative === 100 && leaders > 1 ? "EMPATE" : `${relative}%`)
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
      <span class="section-label">Hip\u00f3tesis principal</span>
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
      <span class="section-label">Tags coincidentes</span>
      <div class="tag-list">${tags.length ? tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : '<span class="muted-value">Sin coincidencias suficientes</span>'}</div>
    </section>
    <section class="spy-section">
      <span class="section-label">Candidatos</span>
      <div class="candidate-list">
        ${candidates.length ? candidates.map(candidate => `
          <div class="candidate-row ${candidate.selected ? "selected" : ""}"><div><div class="candidate-name"><code>${escapeHtml(candidate.sku)}</code></div><div class="candidate-bar"><i style="width:${candidate.relative}%"></i></div></div><span class="candidate-score">${candidate.label}</span></div>
        `).join("") : '<span class="muted-value">Esperando m\u00e1s contexto</span>'}
      </div>
    </section>
    <section class="spy-section">
      <span class="section-label">Dato a confirmar</span>
      <div class="missing-signal"><i data-lucide="circle-help"></i><div><strong>Siguiente se\u00f1al \u00fatil</strong><span>${escapeHtml(analysis.missing_signal || "Ninguna: el producto est\u00e1 identificado.")}</span></div></div>
    </section>`;
}

function renderSkills(item) {
  const active = item.activated_skills?.length
    ? item.activated_skills
    : (item.analysis?.active_skills || ["GENERAL"]);
  return `
    <section class="spy-section">
      <span class="section-label">Skills activadas en la conversación</span>
      <div class="skill-list">${active.map(skill => `
        <div class="skill-row"><div><strong>${escapeHtml(skill)}</strong><span>${skill === "GENERAL" ? "Reglas permanentes" : "Conocimiento incorporado"}</span></div><span class="skill-status">Activa</span></div>
      `).join("")}</div>
    </section>
    <section class="spy-section">
      <span class="section-label">L\u00edmite de conversaci\u00f3n</span>
      <div class="missing-signal"><i data-lucide="shield-check"></i><div><strong>Rubro controlado</strong><span>La atenci\u00f3n se mantiene dentro de productos, compra, disponibilidad y env\u00edo.</span></div></div>
    </section>`;
}

function renderContext(item) {
  const context = item.analysis?.product_context || {};
  const rows = [
    ["Publicaci\u00f3n", context.title || "Sin identificar"],
    ["Precio", context.price ?? "Sin dato"],
    ["Stock", context.stock ?? "Sin dato"],
    ["URL TN", context.publication_url || "Sin dato"],
    ["SKU", item.current_sku || "Sin identificar"],
    ["Mensajes", (item.messages || []).length]
  ];
  return `<section class="spy-section"><span class="section-label">Contexto recuperado</span><div class="context-list">
    ${rows.map(([label, value]) => `<div class="context-row"><div><span>${escapeHtml(label)}</span></div><strong>${escapeHtml(value)}</strong></div>`).join("")}
  </div></section>`;
}

function renderSpy() {
  const item = selectedConversation();
  if (!item) return;
  $("spyContent").innerHTML = state.spyTab === "skills"
    ? renderSkills(item)
    : state.spyTab === "context" ? renderContext(item) : renderDetection(item);
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
  $("connectionState").innerHTML = `<span></span>${escapeHtml(payload.database || "pia_app")} conectada`;
  $("pauseButton").setAttribute("aria-pressed", String(state.paused));
  $("pauseButton").innerHTML = `<i data-lucide="${state.paused ? "play" : "pause"}"></i>`;
}

async function loadConversations(preferredId = "") {
  const query = $("conversationSearch").value.trim();
  const params = new URLSearchParams({ state: state.filter });
  if (query) params.set("q", query);
  const payload = await api(`/pia/conversations?${params}`);
  state.conversations = payload.items || [];
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
$("soundButton").addEventListener("click", () => showToast("Sonido de aviso probado"));

$("spyToggle").addEventListener("click", () => {
  const hidden = $("spyPanel").classList.toggle("hidden");
  document.querySelector(".workspace").classList.toggle("spy-hidden", hidden);
  $("spyToggle").setAttribute("aria-pressed", String(!hidden));
});

refreshIcons();
if (state.token) {
  refreshAll().catch(error => {
    showToast(error.message, true);
    showLogin();
  });
} else {
  showLogin();
}
