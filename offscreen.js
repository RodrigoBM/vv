let mediaRecorder = null;
let chunks = [];

function log(...args) {
  console.log("[OFF]", ...args);
}
function errlog(...args) {
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
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      startRecording(msg.desktopStreamId).catch((e) => {
        errlog("falló start:", e);
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
      errlog("stop:", e);
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function startRecording(desktopStreamId) {
  if (!desktopStreamId) throw new Error("Falta streamId");
  log("streamId:", desktopStreamId);

  // Capturar audio+video del escritorio
  let desktopStream;
  try {
    desktopStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: desktopStreamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: desktopStreamId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: 30,
        },
      },
    });
    log("stream OK (audio+video), tracks:", desktopStream.getTracks().length);
  } catch (e1) {
    errlog("getUserMedia audio+video falló:", e1);
    // Reintentar solo con video
    try {
      desktopStream = await navigator.mediaDevices.getUserMedia({
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: desktopStreamId,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30,
          },
        },
      });
      log("stream OK (solo video)");
    } catch (e2) {
      errlog("getUserMedia solo video también falló:", e2);
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
    const reader = new FileReader();
    reader.onload = () => {
      log("reader onload, length:", reader.result?.length);
      safeSend({ type: "RECORDING_COMPLETE", dataUrl: reader.result });
    };
    reader.onerror = () => {
      errlog("FileReader error");
      safeSend({ type: "RECORDING_ERROR", error: "FileReader falló" });
    };
    reader.readAsDataURL(blob);
    mixedStream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000);
  log("MediaRecorder arrancado");
  safeSend({ type: "RECORDING_STARTED" });
}