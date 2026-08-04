(function (root) {
  "use strict";

  function requestId() {
    return (
      globalThis.crypto?.randomUUID?.() ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    );
  }

  function safeFileName(value, mime = "image/png") {
    const extension =
      mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
    const stem = String(value || "forge-generated-image")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\.[^.]+$/, "")
      .trim()
      .slice(0, 220);
    return `${stem || "forge-generated-image"}${extension}`;
  }

  function waitForGalleryImage(options = {}) {
    const timeoutMs = Math.max(1_000, Number(options.timeoutMs) || 30_000);
    const id = requestId();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("Forge選択画像の応答がタイムアウトしました。"));
      }, timeoutMs);

      function onMessage(event) {
        if (event.origin !== location.origin || event.source !== window.opener) {
          return;
        }
        const data = event.data;
        if (
          !data ||
          data.type !== "speech_bubble_project:gallery_image" ||
          data.protocolVersion !== 1 ||
          data.requestId !== id
        ) {
          return;
        }
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        if (!data.ok) {
          reject(new Error(data.error || "Forge選択画像を取得できませんでした。"));
          return;
        }
        const image = data.image;
        if (!(image?.blob instanceof Blob)) {
          reject(new Error("Forgeから受信した画像データが不正です。"));
          return;
        }
        resolve({
          blob: image.blob,
          name: safeFileName(image.name, image.mime || image.blob.type),
          mime: image.mime || image.blob.type || "image/png",
          width: Number(image.width) || 1,
          height: Number(image.height) || 1,
          sourceTab: image.sourceTab || "",
        });
      }

      window.addEventListener("message", onMessage);
      if (!window.opener || window.opener.closed) {
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        reject(new Error("Forgeウィンドウへ接続できません。"));
        return;
      }
      window.opener.postMessage(
        {
          type: "speech_bubble_project:request_gallery_image",
          protocolVersion: 1,
          requestId: id,
          tab: options.tab || "active",
        },
        location.origin,
      );
    });
  }

  root.SpeechBubbleForgeGalleryImport = Object.freeze({
    requestId,
    safeFileName,
    waitForGalleryImage,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
