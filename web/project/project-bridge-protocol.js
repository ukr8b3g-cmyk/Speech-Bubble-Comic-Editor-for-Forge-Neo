(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpeechBubbleProjectBridgeProtocol = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const TYPES = Object.freeze({
    READY: "speech_bubble_project:ready",
    REQUEST_GALLERY_IMAGE: "speech_bubble_project:request_gallery_image",
    GALLERY_IMAGE: "speech_bubble_project:gallery_image",
    SET_THEME: "speech_bubble_project:set_theme",
    FOCUS: "speech_bubble_project:focus",
    WINDOW_STATE: "speech_bubble_project:window_state",
  });

  function requestId() {
    return (
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    );
  }

  function isMessage(value, type = "") {
    if (!value || typeof value !== "object") return false;
    if (value.protocolVersion !== VERSION) return false;
    return !type || value.type === type;
  }

  function galleryRequest(tab = "active") {
    return {
      type: TYPES.REQUEST_GALLERY_IMAGE,
      protocolVersion: VERSION,
      requestId: requestId(),
      tab: ["active", "txt2img", "img2img"].includes(tab) ? tab : "active",
    };
  }

  function gallerySuccess(requestIdValue, image) {
    if (!String(requestIdValue || "")) throw new TypeError("requestId is required");
    if (!(image?.blob instanceof Blob)) throw new TypeError("image Blob is required");
    return {
      type: TYPES.GALLERY_IMAGE,
      protocolVersion: VERSION,
      requestId: String(requestIdValue),
      ok: true,
      image,
    };
  }

  function galleryFailure(requestIdValue, error) {
    return {
      type: TYPES.GALLERY_IMAGE,
      protocolVersion: VERSION,
      requestId: String(requestIdValue || ""),
      ok: false,
      error: String(error?.message || error || "Unknown error"),
    };
  }

  return Object.freeze({
    VERSION,
    TYPES,
    requestId,
    isMessage,
    galleryRequest,
    gallerySuccess,
    galleryFailure,
  });
});
