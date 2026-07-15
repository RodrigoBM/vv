let mediaRecorder = null;
let chunks = [];
let timerInterval = null;
let elapsed = 0;

function log(...args) {
  console.log("[REC]", ...args);
}

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) log("send lastError:", chrome.runtime.lastError.message);
    });
  } catch (e) {
    log("send exception:", e);
  }
}

async function startRecording() {
  log("recorder cargado, pidiendo fuente...");

  // Llamar chooseDesktopMedia AQUI (mismo contexto que getUserMedia)
  const streamId = await new Promise((resolve) => {
    chrome.desktopCapture.chooseDesktopMedia(["screen", "window", "tab"], resolve);
  });

  log("streamId:", streamId);
  if (!streamId) {
    document.getElementById("status").textContent = "Permiso denegado";
    safeSend({ type: "RECORDING_ERROR", error: "Permiso denegado" });
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
    log("stream OK, tracks:", desktopStream.getTracks().length);
  } catch (e1) {
    log("audio+video fallo:", e1.message);
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
      log("stream OK (solo video)");
    } catch (e2) {
      log("solo video fallo:", e2.message);
      document.getElementById("status").textContent = "Error: " + e2.message;
      safeSend({ type: "RECORDING_ERROR", error: String(e2) });
      return;
    }
  }

  let mixedStream = desktopStream;
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    log("microfono OK");
    const audioCtx = new AudioContext();
    const dest = audioCtx.createMediaStreamDestination();
    const dt = desktopStream.getAudioTracks()[0];
    const mt = micStream.getAudioTracks()[0];
    if (dt) audioCtx.createMediaStreamSource(new MediaStream([dt])).connect(dest);
    if (mt) audioCtx.createMediaStreamSource(new MediaStream([mt])).connect(dest);
    mixedStream = new MediaStream(
      [desktopStream.getVideoTracks()[0], ...dest.stream.getAudioTracks()].filter(Boolean)
    );
    log("audio mezclado");
  } catch (e) {
    log("sin microfono");
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
    safeSend({ type: "RECORDING_COMPLETE", dataUrl: url });
    document.getElementById("status").textContent = "Grabacion completada. Puedes cerrar.";
    document.getElementById("stop").style.display = "none";
    document.querySelector(".dot").style.display = "none";
    stopTimer();
    mixedStream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000);
  log("MediaRecorder arrancado");
  document.getElementById("status").textContent = "Grabando...";
  safeSend({ type: "RECORDING_STARTED" });
  startTimer();
}

function startTimer() {
  elapsed = 0;
  updateTimer();
  timerInterval = setInterval(() => {
    elapsed++;
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
  document.getElementById("timer").textContent = `${m}:${s}`;
}

document.getElementById("stop").addEventListener("click", () => {
  log("click Detener");
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log("mensaje:", msg.type);
  if (msg.type === "RECORDER_STOP") {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    sendResponse({ ok: true });
  }
  return false;
});

document.addEventListener("DOMContentLoaded", startRecording);