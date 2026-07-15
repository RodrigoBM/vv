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

// Encontrar la pestaña de grabación y enviarle un mensaje
function sendToRecorder(msg) {
  return new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const rec = tabs.find((t) => t.url && t.url.includes("recorder.html"));
      if (rec) {
        chrome.tabs.sendMessage(rec.id, msg, () => {
          if (chrome.runtime.lastError) {
            console.log("[BG] recorder no respondió:", chrome.runtime.lastError.message);
          }
          resolve();
        });
      } else {
        console.log("[BG] no hay pestaña recorder");
        resolve();
      }
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[BG] mensaje:", msg.type);

  if (msg.type === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }

  if (msg.type === "STOP_RECORDING") {
    (async () => {
      await sendToRecorder({ type: "RECORDER_STOP" });
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
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "RECORDING_ERROR") {
    console.error("[BG] error grabación:", msg.error);
    setState({ isRecording: false, startedAt: null });
    return false;
  }

  return false;
});