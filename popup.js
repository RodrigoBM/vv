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

function sendCommand(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) {
        log("error:", chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(res);
    });
  });
}

async function refreshState() {
  const state = await sendCommand({ type: "GET_STATE" });
  log("estado:", state);
  applyState(state || { isRecording: false, videoUrl: null });
}

function applyState(state) {
  if (state.isRecording) {
    statusEl.textContent = "Grabando... (puedes cerrar el popup)";
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
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimer() {
  const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  timerEl.textContent = `${m}:${s}`;
}

startBtn.addEventListener("click", () => {
  log("click Iniciar");
  startBtn.disabled = true;
  statusEl.textContent = "Abriendo ventana de grabacion...";
  // La ventana recorder llamará chooseDesktopMedia ella misma
  sendCommand({ type: "OPEN_REC_WINDOW" }).then(() => {
    log("ventana abierta");
    window.close();
  });
});

stopBtn.addEventListener("click", async () => {
  log("click Detener");
  await sendCommand({ type: "STOP_RECORDING" });
  refreshState();
});

downloadBtn.addEventListener("click", () => {
  log("click Descargar");
  sendCommand({ type: "DOWNLOAD_RECORDING" }).then((res) => {
    log("descarga resultado:", res);
    if (res && !res.ok) {
      statusEl.textContent = "Error: no se pudo descargar ( graba de nuevo)";
    }
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