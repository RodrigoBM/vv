const DEFAULT_STATE = {
  isRecording: false,
  videoUrl: null,
  startedAt: null,
};

async function getState() {
  const { state } = await chrome.storage.local.get("state");
  return state || DEFAULT_STATE;
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

// Utilidad para enviar mensajes esperando respuesta, ignorando "no receptor"
function sendToOffscreen(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) {
        // No hay receptor (offscreen no existe o ya cerró)
      }
      resolve();
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }

  if (msg.type === "START_RECORDING") {
    (async () => {
      try {
        if (!msg.desktopStreamId) throw new Error("Falta streamId");
        await startRecordingWithOffscreen(msg.desktopStreamId);
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (msg.type === "STOP_RECORDING") {
    (async () => {
      await sendToOffscreen({ type: "OFFSCREEN_STOP" });
      await setState({ isRecording: false, startedAt: null });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "RECORDING_STARTED") {
    setState({ isRecording: true, videoUrl: null, startedAt: Date.now() });
    return false;
  }

  if (msg.type === "RECORDING_COMPLETE") {
    setState({ isRecording: false, videoUrl: msg.dataUrl, startedAt: null });
    return false;
  }

  return false;
});

async function startRecordingWithOffscreen(desktopStreamId) {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA", "DISPLAY_MEDIA"],
      justification: "Grabacion de pantalla",
    });
  }
  await sendToOffscreen({
    type: "OFFSCREEN_START",
    desktopStreamId,
  });
}