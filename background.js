const DEFAULT_STATE = { isRecording: false, videoUrl: null, startedAt: null };

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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[BG] mensaje:", msg.type);
  if (msg.type === "GET_STATE") {
    getState().then(sendResponse);
    return true;
  }
  if (msg.type === "STOP_RECORDING") {
    setState({ isRecording: false, startedAt: null });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});