let mediaRecorder = null;
let chunks = [];

function log(...args) {
  console.log("[POP]", ...args);
}

async function getState() {
  const { state } = await chrome.storage.local.get("state");
  return state || { isRecording: false, videoUrl: null, startedAt: null };
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

startBtn.addEventListener("click", async () => {
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
    try {
      await startRecording(streamId);
    } catch (e) {
      log("ERROR:", e);
      statusEl.textContent = "Error: " + e.message;
    }
  });
});

async function startRecording(streamId) {
  log("startRecording");
  let desktopStream;
  try {
    desktopStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
    });
    log("stream OK, tracks:", desktopStream.getTracks().length);
  } catch (e1) {
    log("audio+video falló:", e1.message);
    desktopStream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: streamId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
    });
    log("stream OK (solo video)");
  }

  let mixedStream = desktopStream;
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    log("micrófono OK");
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const dt = desktopStream.getAudioTracks()[0];
    const mt = micStream.getAudioTracks()[0];
    if (dt) audioCtx.createMediaStreamSource(new MediaStream([dt])).connect(dest);
    if (mt) audioCtx.createMediaStreamSource(new MediaStream([mt])).connect(dest);
    mixedStream = new MediaStream([desktopStream.getVideoTracks()[0], ...dest.stream.getAudioTracks()].filter(Boolean));
  } catch (e) {
    log("sin micrófono");
  }

  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm";
  log("mime:", mime);

  mediaRecorder = new MediaRecorder(mixedStream, { mimeType: mime });
  chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    log("onstop, chunks:", chunks.length);
    const blob = new Blob(chunks, { type: "video/webm" });
    log("blob size:", blob.size);
    const url = URL.createObjectURL(blob);
    setState({ isRecording: false, videoUrl: url, startedAt: null });
    mixedStream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000);
  log("MediaRecorder state:", mediaRecorder.state);
  await setState({ isRecording: true, videoUrl: null, startedAt: Date.now() });
}

stopBtn.addEventListener("click", () => {
  log("click Detener");
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
});

downloadBtn.addEventListener("click", () => {
  log("click Descargar");
  chrome.storage.local.get("state", ({ state }) => {
    if (!state?.videoUrl) return;
    const filename = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    chrome.downloads.download({ url: state.videoUrl, filename, saveAs: true });
  });
});

// Si cierras el popup mientras graba, detener y guardar
window.addEventListener("beforeunload", () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.state) {
    applyState(changes.state.newValue);
  }
});

async function refreshState() {
  const state = await getState();
  log("estado:", state);
  applyState(state);
}

function applyState(state) {
  if (state.isRecording) {
    statusEl.textContent = "Grabando... (no cierres el popup)";
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

document.addEventListener("DOMContentLoaded", () => {
  log("popup cargado");
  refreshState();
});