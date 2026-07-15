const DEFAULT_STATE = {
  isRecording: false,
  videoUrl: null,
  startedAt: null,
  recWindowId: null,
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
      if (!state.recWindowId) {
        resolve();
        return;
      }
      chrome.windows.get(state.recWindowId, { populate: true }, (win) => {
        if (chrome.runtime.lastError || !win) {
          resolve();
          return;
        }
        const tab = win.tabs && win.tabs[0];
        if (tab) {
          chrome.tabs.sendMessage(tab.id, msg, () => {
            if (chrome.runtime.lastError) {
              console.log("[BG] ventana no respondió:", chrome.runtime.lastError.message);
            }
            resolve();
          });
        } else {
          resolve();
        }
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
    (async () => {
      const streamId = msg.desktopStreamId;
      await chrome.storage.local.set({ pendingStreamId: streamId });
      chrome.windows.create({
        url: chrome.runtime.getURL("recorder.html") + "?sid=" + encodeURIComponent(streamId),
        type: "popup",
        width: 360,
        height: 200,
      }, async (win) => {
        await setState({ recWindowId: win.id });
        sendResponse({ ok: true });
      });
    })();
    return true;
  }

  if (msg.type === "STOP_RECORDING") {
    (async () => {
      await sendToRecWindow({ type: "RECORDER_STOP" });
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

  if (msg.type === "RECORDING_ERROR") {
    console.error("[BG] error grabación:", msg.error);
    setState({ isRecording: false, startedAt: null });
    return false;
  }

  return false;
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const state = await getState();
  if (state.recWindowId === windowId) {
    await setState({ recWindowId: null, isRecording: false, startedAt: null });
  }
});