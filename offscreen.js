let mediaRecorder = null;
let chunks = [];

function log(...args) {
  console.log("[OFF]", ...args);
}
function err(...args) {
  console.error("[OFF]", ...args);
}

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) {
        // receptor no disponible
      }
    });
  } catch (e) {
    // ignorar
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  log("mensaje:", msg.type);
  if (msg.type === "OFFSCREEN_START") {
    // Intentar arrancar si aún no se ha hecho
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      startRecordingFromStorage().catch((e) => {
        err("falló start:", e);
        safeSend({ type: "RECORDING_ERROR", error: String(e) });
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "OFFSCREEN_STOP") {
    try {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch (e) {
      err("stop:", e);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function startRecordingFromStorage() {
  const { pendingStreamId } = await chrome.storage.local.get("pendingStreamId");
  log("streamId pendiente:", pendingStreamId);
  if (!pendingStreamId) {
    throw new Error("No hay streamId pendiente");
  }

  // Capturar video (y audio del sistema con chromeMediaSource: desktop)
  const constraints = {
    audio: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: pendingStreamId,
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: pendingStreamId,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 30,
      },
    },
  };

  let desktopStream;
  try {
    desktopStream = await navigator.mediaDevices.getUserMedia(constraints);
    log("stream de pantalla OK, tracks:", desktopStream.getTracks().length);
  } catch (e1) {
    err("getUserMedia con audio falló:", e1);
    // Reintentar solo con video (sistema de audio quizás no soportado)
    try {
      const videoOnly = {
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: pendingStreamId,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      };
      desktopStream = await navigator.mediaDevices.getUserMedia(videoOnly);
      log("stream de pantalla (solo video) OK");
    } catch (e2) {
      err("getUserMedia solo video también falló:", e2);
      throw e2;
    }
  }

  let mixedStream = desktopStream;

  // Mezclar micrófono si está disponible (opcional)
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
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
    log("micrófono mezclado");
  } catch (e) {
    log("sin micrófono, usando audio del sistema (si lo hubo)");
  }

  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm";

  log("mime elegido:", mime);

  mediaRecorder = new MediaRecorder(mixedStream, { mimeType: mime });
  chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    log("onstop, chunks:", chunks.length);
    const blob = new Blob(chunks, { type: "video/webm" });
    log("blob size:", blob.size);
    const reader = new FileReader();
    reader.onload = () => {
      log("reader onload, length:", reader.result?.length);
      safeSend({
        type: "RECORDING_COMPLETE",
        dataUrl: reader.result,
      });
    };
    reader.onerror = () => {
      err("FileReader error");
      safeSend({ type: "RECORDING_ERROR", error: "FileReader falló" });
    };
    reader.readAsDataURL(blob);

    mixedStream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000);
  log("MediaRecorder arrancado");
  safeSend({ type: "RECORDING_STARTED" });
}

// Al cargar el documento offscreen, intentar arrancar si hay streamId pendiente
document.addEventListener("DOMContentLoaded", () => {
  log("offscreen cargado");
  chrome.storage.local.get("pendingStreamId", ({ pendingStreamId }) => {
    if (pendingStreamId) {
      log("streamId encontrado al cargar, arrancando...");
      startRecordingFromStorage().catch((e) => {
        err("falló start al cargar:", e);
        safeSend({ type: "RECORDING_ERROR", error: String(e) });
      });
    } else {
      log("no hay streamId pendiente al cargar");
    }
  });
});