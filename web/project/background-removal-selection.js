(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpeechBubbleBackgroundSelection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function positiveInteger(value, label) {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number) || number <= 0) {
      throw new TypeError(`${label} must be a positive integer`);
    }
    return number;
  }

  /**
   * Select a 4-connected RGBA region whose pixels are within `tolerance`
   * of the original clicked pixel. Comparison always uses the seed color;
   * it does not chain through a gradient.
   */
  function selectContiguousRgba(
    pixels,
    width,
    height,
    startX,
    startY,
    tolerance = 16,
  ) {
    width = positiveInteger(width, "width");
    height = positiveInteger(height, "height");

    const total = width * height;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Image dimensions are too large");
    }
    if (!pixels || typeof pixels.length !== "number" || pixels.length < total * 4) {
      throw new TypeError("RGBA pixel data is missing or too short");
    }

    const x = Math.floor(Number(startX));
    const y = Math.floor(Number(startY));
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) {
      return {
        indices: new Int32Array(0),
        count: 0,
        seedColor: [0, 0, 0, 0],
      };
    }

    const limit = Math.round(clamp(Number(tolerance) || 0, 0, 255));
    const seedIndex = y * width + x;
    const seedOffset = seedIndex * 4;
    const seedR = pixels[seedOffset];
    const seedG = pixels[seedOffset + 1];
    const seedB = pixels[seedOffset + 2];
    const seedA = pixels[seedOffset + 3];
    const visited = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    function tryPush(index) {
      if (visited[index]) return;
      visited[index] = 1;

      const offset = index * 4;
      const difference = Math.max(
        Math.abs(pixels[offset] - seedR),
        Math.abs(pixels[offset + 1] - seedG),
        Math.abs(pixels[offset + 2] - seedB),
        Math.abs(pixels[offset + 3] - seedA),
      );
      if (difference <= limit) queue[tail++] = index;
    }

    tryPush(seedIndex);

    while (head < tail) {
      const index = queue[head++];
      const currentX = index % width;

      if (currentX > 0) tryPush(index - 1);
      if (currentX + 1 < width) tryPush(index + 1);
      if (index >= width) tryPush(index - width);
      if (index + width < total) tryPush(index + width);
    }

    return {
      indices: queue.subarray(0, tail),
      count: tail,
      seedColor: [seedR, seedG, seedB, seedA],
    };
  }

  return { selectContiguousRgba };
});
