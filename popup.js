const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const downloadBtn = document.getElementById("download");
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");

let chunkUrl = null;
let timerInterval = null;
let elapsed = 0;

function sendCommand(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(res);
    });
  });
}

async function refreshState() {
  const { state } = await chrome.storage.local.get("state");
  applyState(state || { isRecording: false, videoUrl: null, startedAt: null });
}

function applyState(state) {
  if (state.isRecording) {
    statusEl.textContent = "Grabando...";
    statusEl.classList.add("recording");
    startBtn.style.display = "none";
    stopBtn.style.display = "block";
    downloadBtn.style.display = "none";
    startTimer(state.startedAt);
  } else if (state.videoUrl) {
    chunkUrl = state.videoUrl;
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

startBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  statusEl.textContent = "Elige fuente...";
  chrome.desktopCapture.chooseDesktopMedia(["screen", "window", "tab"], async (streamId) => {
    startBtn.disabled = false;
    if (!streamId) {
      statusEl.textContent = "Permiso denegado";
      return;
    }
    // Limpiar grabación anterior antes de empezar
    await chrome.storage.local.remove("state");
    const res = await sendCommand({ type: "START_RECORDING", desktopStreamId: streamId });
    console.log("[POP] START_RECORDING respuesta:", res);
    refreshState();
  });
});

stopBtn.addEventListener("click", async () => {
  await sendCommand({ type: "STOP_RECORDING" });
  refreshState();
});

downloadBtn.addEventListener("click", () => {
  if (!chunkUrl) return;
  const filename = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
  chrome.downloads.download({ url: chunkUrl, filename, saveAs: true });
});

// Escuchar cambios de estado en storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.state) {
    applyState(changes.state.newValue);
  }
});

document.addEventListener("DOMContentLoaded", refreshState);