(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SpeechBubbleImageLayerRotation = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalize(value) {
    const number = Number(value);
    return Math.max(-180, Math.min(180, Math.round(Number.isFinite(number) ? number : 0)));
  }

  function drawCroppedImage(target, image, geometry, rotation = 0, options = {}) {
    if (!target || !image || !geometry) return false;
    const width = Math.max(1, Number(geometry.w) || 1);
    const height = Math.max(1, Number(geometry.h) || 1);
    const sourceX = Number(geometry.sourceX) || 0;
    const sourceY = Number(geometry.sourceY) || 0;
    const sourceWidth = Math.max(1, Number(geometry.sourceW) || image.naturalWidth || 1);
    const sourceHeight = Math.max(1, Number(geometry.sourceH) || image.naturalHeight || 1);
    target.save();
    try {
      target.translate((Number(geometry.x) || 0) + width / 2, (Number(geometry.y) || 0) + height / 2);
      target.rotate(normalize(rotation) * Math.PI / 180);
      target.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
      target.globalAlpha = Math.max(0, Math.min(1, Number.isFinite(Number(options.opacity)) ? Number(options.opacity) : 1));
      target.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, -width / 2, -height / 2, width, height);
    } finally {
      target.restore();
    }
    return true;
  }

  return Object.freeze({ normalize, drawCroppedImage });
});
