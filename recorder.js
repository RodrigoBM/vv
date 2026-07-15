let mediaRecorder = null;
let chunks = [];
let timerInterval = null;
let elapsed = 0;

function log(...args) {
  console.log("[REC]", ...args);
}

function safeSend(msg, withResponse = false) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) log("send lastError:", chrome.runtime.lastError.message);
        resolve(res);
      });
    } catch (e) {
      log("send exception:", e);
      resolve(null);
    }
  });
}

async function startRecording() {
  const { pendingStreamId: streamId } = await chrome.storage.local.get("pendingStreamId");
  log("streamId:", streamId);
  if (!streamId) {
    log("no hay streamId, cerrando");
    document.getElementById("status").textContent = "No hay streamId";
    return;
  }

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
    try {
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
      log("desktopStream OK (solo video)");
    } catch (e2) {
      log("solo video falló:", e2.message);
      document.getElementById("status").textContent = "Error: " + e2.message;
      safeSend({ type: "RECORDING_ERROR", error: String(e2) });
      return;
    }
  }

  let mixedStream = desktopStream;

  // Mezclar micrófono
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
    if (desktopTrack) audioCtx.createMediaStreamSource(new MediaStream([desktopTrack])).connect(dest);
    if (micTrack) audioCtx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
    const videoTrack = desktopStream.getVideoTracks()[0];
    mixedStream = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()].filter(Boolean));
    log("audiomezclado");
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
    log("blob url creada");
    chrome.storage.local.get("state", (res) => {
      const next = { ...(res.state || {}), isRecording: false, videoUrl: url, startedAt: null };
      chrome.storage.local.set({ state: next }, () => {
        document.getElementById("status").textContent = "Grabación completada. Puedes descargarla.";
        stopTimer();
      });
    });
    mixedStream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000);
  log("MediaRecorder arrancado, state:", mediaRecorder.state);
  document.getElementById("status").textContent = "Grabando...";

  // Avisar al background
  safeSend({ type: "RECORDING_STARTED" });
  startTimer();
}

function startTimer() {
  const { state } = {};
  chrome.storage.local.get("state", (res) => {
    const startedAt = res.state?.startedAt || Date.now();
    elapsed = Math.floor((Date.now() - startedAt) / 1000);
    updateTimer();
    timerInterval = setInterval(() => {
      elapsed = Math.floor((Date.now() - startedAt) / 1000);
      updateTimer();
    }, 1000);
  });
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimer() {
  const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `${m}:${s}`;
}

// Detener desde la propia pestaña
document.getElementById("stop").addEventListener("click", () => {
  log("click Detener (pestaña)");
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
});

// Recibir orden de detener desde el popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log("mensaje recibido:", msg.type);
  if (msg.type === "RECORDER_STOP") {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    sendResponse({ ok: true });
  }
  return false;
});

document.addEventListener("DOMContentLoaded", () => {
  log("recorder cargado");
  startRecording();
});