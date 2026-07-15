const DEFAULT_STATE = {
  isRecording: false,
  videoUrl: null,
  startedAt: null,
  recTabId: null,
};

async function getState() {
  const { state } = await chrome.storage.local.get("state");
  return { ...DEFAULT_STATE, ...(state || {}) };
}

async function setState(patch) {
  const current = await getState();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ state: next });
  return next;
}

function sendToRecWindow(msg) {
  return new Promise((resolve) => {
    getState().then((state) => {
      if (!state.recTabId) {
        resolve();
        return;
      }
      chrome.tabs.sendMessage(state.recTabId, msg, () => {
        if (chrome.runtime.lastError) {
          console.log("[BG] pestaña no respondio:", chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[BG] mensaje:", msg.type);

  if (msg.type === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }

  if (msg.type === "OPEN_REC_WINDOW") {
    chrome.windows.create({
      url: chrome.runtime.getURL("recorder.html"),
      type: "popup",
      width: 380,
      height: 220,
    }, async (win) => {
      const tab = win.tabs[0];
      await setState({ recTabId: tab.id });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "STOP_RECORDING") {
    (async () => {
      await sendToRecWindow({ type: "RECORDER_STOP" });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === "DOWNLOAD_RECORDING") {
    (async () => {
      const state = await getState();
      if (!state.videoUrl) {
        sendResponse({ ok: false, error: "no hay grabacion disponible" });
        return;
      }
      const filename = `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      chrome.downloads.download({ url: state.videoUrl, filename, saveAs: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("[BG] error descarga:", chrome.runtime.lastError.message);
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true });
        }
      });
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

  if (msg.type === "RECORDING_ERROR") {
    console.error("[BG] error grabacion:", msg.error);
    setState({ isRecording: false, startedAt: null });
    return false;
  }

  return false;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state.recTabId === tabId) {
    await setState({ recTabId: null, isRecording: false, startedAt: null });
  }
});