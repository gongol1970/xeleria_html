const micButton = document.querySelector("#micButton");
const halo = document.querySelector("#halo");
const statusText = document.querySelector("#statusText");
const resultCard = document.querySelector("#result");
const emptyResult = document.querySelector("#emptyResult");
const candidatesCard = document.querySelector("#candidates");
const candidateList = document.querySelector("#candidateList");
const newSearchButton = document.querySelector("#newSearchButton");
const configuredApiBase = document.querySelector('meta[name="api-base"]').content.replace(/\/$/, "");
const apiBase = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://127.0.0.1:8000"
  : configuredApiBase;

let recorder = null;
let stream = null;
let chunks = [];
let monitorFrame = null;
let maxTimer = null;
let autoListenTimer = null;
let cancelled = false;
let currentCandidates = [];
let conversationHistory = [];

const setState = (state, message) => {
  halo.classList.toggle("listening", state === "listening");
  halo.classList.toggle("processing", state === "processing");
  micButton.disabled = state === "processing";
  micButton.setAttribute(
    "aria-label",
    state === "listening" ? "Terminar de hablar" : "Empezar a hablar",
  );
  statusText.textContent = message;
};

const formatPrice = (product) => product.precio == null
  ? "Sin precio cargado"
  : new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: product.moneda || "ARS",
      maximumFractionDigits: 2,
    }).format(product.precio);

const hideAllResults = () => {
  resultCard.hidden = true;
  emptyResult.hidden = true;
  candidatesCard.hidden = true;
};

const cleanupRecording = () => {
  if (monitorFrame) cancelAnimationFrame(monitorFrame);
  if (maxTimer) clearTimeout(maxTimer);
  monitorFrame = null;
  maxTimer = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
};

const stopRecording = () => {
  if (recorder?.state === "recording") recorder.stop();
};

const cancelRecording = (message) => {
  cancelled = true;
  stopRecording();
  cleanupRecording();
  setState("ready", message);
};

const watchSilence = (audioStream) => {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(audioStream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const samples = new Uint8Array(analyser.fftSize);
  const startedAt = performance.now();
  let lastVoiceAt = startedAt;
  let heardVoice = false;

  const tick = () => {
    if (!recorder || recorder.state !== "recording") {
      context.close();
      return;
    }
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const value = (sample - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / samples.length);
    const now = performance.now();
    if (rms > 0.035) {
      heardVoice = true;
      lastVoiceAt = now;
    }
    if (heardVoice && now - lastVoiceAt > 1150) {
      stopRecording();
      context.close();
      return;
    }
    if (!heardVoice && now - startedAt > 7000) {
      const hasCandidates = currentCandidates.length > 0;
      cancelRecording(
        hasCandidates
          ? "Sigo con estas opciones. Tocá el micrófono cuando quieras continuar."
          : "No escuché nada. Tocá el micrófono para probar otra vez.",
      );
      context.close();
      return;
    }
    monitorFrame = requestAnimationFrame(tick);
  };
  tick();
};

const preferredMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const startRecording = async ({ refinement = false } = {}) => {
  if (autoListenTimer) clearTimeout(autoListenTimer);
  if (!refinement) hideAllResults();
  else {
    resultCard.hidden = true;
    emptyResult.hidden = true;
    candidatesCard.hidden = false;
  }
  cancelled = false;
  chunks = [];

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setState("ready", "Este navegador no permite grabar audio. Probá con Chrome o Safari actualizado.");
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredMimeType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", async () => {
      cleanupRecording();
      if (cancelled) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      await sendAudio(blob);
    });
    recorder.start(200);
    setState(
      "listening",
      refinement ? "Te sigo escuchando… agregá cualquier detalle." : "Te escucho… hablá normalmente.",
    );
    watchSilence(stream);
    maxTimer = setTimeout(stopRecording, 14000);
  } catch (error) {
    cleanupRecording();
    const denied = error?.name === "NotAllowedError";
    setState(
      "ready",
      denied
        ? "Necesito permiso para usar el micrófono. Habilitalo y probá otra vez."
        : "No pude abrir el micrófono. Probá nuevamente.",
    );
  }
};

const sendAudio = async (blob) => {
  setState("processing", currentCandidates.length ? "Refinando las opciones…" : "Buscando el producto…");
  const extension = blob.type.includes("mp4") ? "m4a" : "webm";
  const form = new FormData();
  form.append("audio", blob, `prueba.${extension}`);
  if (currentCandidates.length) {
    form.append("candidate_ids", JSON.stringify(currentCandidates.map((product) => product.id)));
  }
  if (conversationHistory.length) {
    form.append("contexto", conversationHistory.slice(-4).join(" | "));
  }

  try {
    const response = await fetch(`${apiBase}/stock-voz/reconocer`, { method: "POST", body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || "No se pudo procesar la prueba.");
    if (data.transcripcion) conversationHistory.push(data.transcripcion);

    if (data.estado === "encontrado" && data.producto) {
      currentCandidates = [];
      showProduct(data);
      setState("ready", "Listo para otra prueba. Tocá el micrófono cuando quieras.");
      return;
    }

    if (data.estado === "candidatos" && data.candidatos?.length) {
      showCandidates(data);
      setState("ready", data.mensaje || "Encontré varias opciones. Te sigo escuchando para refinar.");
      autoListenTimer = setTimeout(
        () => startRecording({ refinement: true }),
        650,
      );
      return;
    }

    currentCandidates = [];
    showNoMatch(data.transcripcion);
    setState("ready", "No encontré una coincidencia segura. Ya podés volver a intentar.");
  } catch (error) {
    showNoMatch("", error.message);
    setState("ready", "Hubo un problema. Ya podés volver a intentar.");
  }
};

const showProduct = (data) => {
  const product = data.producto;
  document.querySelector("#productName").textContent = `${product.marca} ${product.modelo}`;
  document.querySelector("#brandValue").textContent = product.marca;
  document.querySelector("#modelValue").textContent = product.modelo;
  document.querySelector("#stockValue").textContent = `${product.stock} unidades`;
  document.querySelector("#priceValue").textContent = formatPrice(product);
  document.querySelector("#heardText").textContent = `Escuché: “${data.transcripcion}”`;
  candidatesCard.hidden = true;
  emptyResult.hidden = true;
  resultCard.hidden = false;
};

const chooseCandidate = (product) => {
  if (autoListenTimer) clearTimeout(autoListenTimer);
  if (recorder?.state === "recording") cancelRecording("");
  currentCandidates = [];
  showProduct({ producto: product, transcripcion: "selección en pantalla" });
  setState("ready", "Listo para otra prueba. Tocá el micrófono cuando quieras.");
};

const showCandidates = (data) => {
  currentCandidates = data.candidatos;
  document.querySelector("#candidateCount").textContent = String(currentCandidates.length);
  document.querySelector("#candidatesTitle").textContent = `${currentCandidates.length} opciones posibles`;
  document.querySelector("#candidatesHint").textContent = data.mensaje || (
    "Sigo escuchando. Describilo como quieras: por el nombre, posición, precio, presentación o cualquier otro detalle."
  );
  candidateList.replaceChildren();

  currentCandidates.forEach((product, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "candidate-option";
    button.setAttribute("aria-label", `Elegir opción ${index + 1}: ${product.marca} ${product.modelo}`);

    const name = document.createElement("span");
    name.className = "candidate-name";
    name.textContent = `${index + 1}. ${product.marca} ${product.modelo}`;
    const meta = document.createElement("span");
    meta.className = "candidate-meta";
    meta.textContent = `Stock: ${product.stock} unidades`;
    const price = document.createElement("span");
    price.className = "candidate-price";
    price.textContent = formatPrice(product);

    button.append(name, meta, price);
    button.addEventListener("click", () => chooseCandidate(product));
    candidateList.append(button);
  });

  resultCard.hidden = true;
  emptyResult.hidden = true;
  candidatesCard.hidden = false;
};

const showNoMatch = (transcript = "", customMessage = "") => {
  document.querySelector("#emptyText").textContent = customMessage || (
    transcript
      ? `Escuché “${transcript}”. Probá describirlo de otra manera.`
      : "Probá decir la marca, el modelo o describirlo de otra manera."
  );
  resultCard.hidden = true;
  candidatesCard.hidden = true;
  emptyResult.hidden = false;
};

const resetConversation = ({ listen = false } = {}) => {
  if (autoListenTimer) clearTimeout(autoListenTimer);
  const wasRecording = recorder?.state === "recording";
  if (wasRecording) cancelRecording("");
  currentCandidates = [];
  conversationHistory = [];
  hideAllResults();
  setState("ready", "Nueva búsqueda lista. Hablá como te salga.");
  if (listen) {
    setTimeout(() => startRecording(), wasRecording ? 300 : 0);
  }
};

micButton.addEventListener("click", () => {
  if (recorder?.state === "recording") stopRecording();
  else startRecording({ refinement: currentCandidates.length > 0 });
});

newSearchButton.addEventListener("click", () => resetConversation({ listen: true }));
