let mediaRecorder = null;
let chunks = [];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OFFSCREEN_START") {
    startRecording(msg.desktopStreamId)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "OFFSCREEN_STOP") {
    try {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
    } catch (e) {
      // ignore
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) {
        // receptor no disponible, ignorar
      }
    });
  } catch (e) {
    // ignorar
  }
}

async function startRecording(desktopStreamId) {
  const desktopStream = await navigator.mediaDevices.getUserMedia({
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
    mixedStream = new MediaStream([
      videoTrack,
      ...dest.stream.getAudioTracks(),
    ].filter(Boolean));
  } catch (e) {
    // Sin micrófono: continuar solo con audio del sistema
    console.warn("Micrófono no disponible:", e);
  }

  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";

  mediaRecorder = new MediaRecorder(mixedStream, { mimeType: mime });
  chunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const reader = new FileReader();
    reader.onload = () => {
      safeSend({
        type: "RECORDING_COMPLETE",
        dataUrl: reader.result,
      });
    };
    reader.readAsDataURL(blob);

    mixedStream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start(1000);

  safeSend({ type: "RECORDING_STARTED" });
}