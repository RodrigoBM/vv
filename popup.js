const startBtn = document.getElementById("start");
const stopBtn = document.getElementById("stop");
const downloadBtn = document.getElementById("download");
const statusEl = document.getElementById("status");
const timerEl = document.getElementById("timer");

let mediaRecorder = null;
let chunks = [];
let timerInterval = null;
let elapsed = 0;

function log(...args) {
  console.log("[POP]", ...args);
}

async function refreshState() {
  const { state } = await chrome.storage.local.get("state");
  log("estado:", state);
  if (!state) {
    applyState({ isRecording: false, videoUrl: null });
    return;
  }
  applyState(state);
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
    try {
      await startRecording(streamId);
    } catch (e) {
      log("ERROR startRecording:", e);
      statusEl.textContent = "Error: " + e.message;
    }
  });
});

async function startRecording(streamId) {
  log("startRecording, streamId:", streamId);

  // Capturar pantalla (video + audio del sistema)
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
    log("desktopStream OK, tracks:", desktopStream.getTracks().length);
  } catch (e1) {
    log("audio+video falló:", e1.message);
    // Reintentar solo video
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
    log("desktopStream OK (solo video), tracks:", desktopStream.getTracks().length);
  }

  let mixedStream = desktopStream;

  // Mezclar micrófono si está disponible
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    log("micrófono OK");
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const desktopTrack = desktopStream.getAudioTracks()[0];
    const micTrack = micStream.getAudioTracks()[0];
    if (desktopTrack) {
      audioCtx.createMediaStreamSource(new MediaStream([desktopTrack])).connect(dest);
    }
    if (micTrack) {
      audioCtx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
    }
    const videoTrack = desktopStream.getVideoTracks()[0];
    mixedStream = new MediaStream(
      [videoTrack, ...dest.stream.getAudioTracks()].filter(Boolean)
    );
    log("audio mezclado (sistema + micro)");
  } catch (e) {
    log("sin micrófono, audio del sistema solo (si lo hubo)");
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
    log("dataavailable, size:", e.data?.size);
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    log("onstop, chunks:", chunks.length, "total size:", chunks.reduce((a, c) => a + c.size, 0));
    const blob = new Blob(chunks, { type: "video/webm" });
    log("blob size:", blob.size);
    const url = URL.createObjectURL(blob);
    log("blob url creada");
    setState({ isRecording: false, videoUrl: url, startedAt: null });
    mixedStream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000);
  log("MediaRecorder arrancado, state:", mediaRecorder.state);
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