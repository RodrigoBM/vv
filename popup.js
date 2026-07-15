const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const downloadBtn = document.getElementById("download");
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");

let timerInterval = null;
let elapsed = 0;

function log(...args) {
  console.log("[POP]", ...args);
}

async function refreshState() {
  const { state } = await chrome.storage.local.get("state");
  log("estado:", state);
  applyState(state || { isRecording: false, videoUrl: null });
}

function applyState(state) {
  if (state.isRecording) {
    statusEl.textContent = "Grabando...";
    statusEl.classList.add("recording");
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    downloadBtn.style.display = "none";
    startTimer(state.startedAt || Date.now());
  } else if (state.videoUrl) {
    statusEl.textContent = "Grabacion lista";
    statusEl.classList.remove("recording");
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
    downloadBtn.style.display = "block";
    stopTimer();
    timerEl.textContent = "00:00";
  } else {
    statusEl.textContent = "Listo para grabar";
    statusEl.classList.remove("recording");
    startBtn.style.display = "block";
    stopBtn.style.display = "none";
    downloadBtn.style.display = "none";
    stopTimer();
    timerEl.textContent = "00:00";
  }
}

function startTimer(startedAt) {
  stopTimer();
  elapsed = Math.floor((Date.now() - startedAt) / 1000);
  updateTimer();
  timerInterval = setInterval(() => {
    elapsed = Math.floor((Date.now() - startedAt) / 1000);
    updateTimer();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimer() {
  const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  timerEl.textContent = `${m}:${s}`;
}

async function setState(patch) {
  const { state } = await chrome.storage.local.get("state");
  const next = { ...(state || {}), ...patch };
  await chrome.storage.local.set({ state: next });
}

startBtn.addEventListener("click", () => {
  log("click Iniciar");
  startBtn.disabled = true;
  statusEl.textContent = "Elige fuente...";
  chrome.desktopCapture.chooseDesktopMedia(["screen", "window", "tab"], async (streamId) => {
    log("streamId:", streamId);
    startBtn.disabled = false;
    if (!streamId) {
      statusEl.textContent = "Permiso denegado";
      return;
    }
    // Limpiar estado y guardar streamId para la pestaña recorder
    await chrome.storage.local.set({
      state: { isRecording: false, videoUrl: null, startedAt: null },
      pendingStreamId: streamId,
    });
    log("abriendo recorder.html");
    chrome.tabs.create({ url: chrome.runtime.getURL("recorder.html") });
    refreshState();
  });
});

stopBtn.addEventListener("click", () => {
  log("click Detener");
  chrome.runtime.sendMessage({ type: "STOP_RECORDING" }, () => {
    if (chrome.runtime.lastError) log("error:", chrome.runtime.lastError.message);
    refreshState();
  });
});

downloadBtn.addEventListener("click", () => {
  log("click Descargar");
  chrome.storage.local.get("state", ({ state }) => {
    if (!state?.videoUrl) return;
    const filename = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    log("descargando:", filename);
    chrome.downloads.download({ url: state.videoUrl, filename, saveAs: true });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.state) {
    log("storage.onChanged:", changes.state.newValue);
    applyState(changes.state.newValue);
  }
});

document.addEventListener("DOMContentLoaded", () => {
  log("popup cargado");
  refreshState();
});