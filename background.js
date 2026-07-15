let recordingState = {
  isRecording: false,
  videoUrl: null,
  startedAt: null,
};
let streamId = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_STATE") {
    sendResponse(recordingState);
    return false;
  }

  if (msg.type === "START_RECORDING") {
    chrome.desktopCapture.chooseDesktopMedia(["screen", "window", "tab"], (id) => {
      if (!id) {
        sendResponse({ ok: false, error: "Permiso denegado" });
        return;
      }
      streamId = id;
      startRecordingWithOffscreen(id)
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    });
    return true;
  }

  if (msg.type === "STOP_RECORDING") {
    chrome.runtime.sendMessage({ type: "OFFSCREEN_STOP" }, () => {
      recordingState.isRecording = false;
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "RECORDING_STARTED") {
    recordingState.isRecording = true;
    recordingState.videoUrl = null;
    recordingState.startedAt = Date.now();
    return false;
  }

  if (msg.type === "RECORDING_COMPLETE") {
    recordingState.isRecording = false;
    recordingState.videoUrl = msg.dataUrl;
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
      justification: "Grabación de pantalla",
    });
  }
  await chrome.runtime.sendMessage({
    type: "OFFSCREEN_START",
    desktopStreamId,
  });
}