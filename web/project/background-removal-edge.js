(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpeechBubbleBackgroundEdge = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_EDGE_WIDTH = 10;
  const DEFAULT_DONOR_ALPHA = 240;

  function clamp(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return minimum;
    return Math.max(minimum, Math.min(maximum, number));
  }

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
  }

  function defaultSettings() {
    return {
      width: 1,
      defringe: false,
      decontaminateAmount: 0,
      matte: "none",
    };
  }

  function normalizeSettings(value = {}) {
    return {
      width: Math.round(clamp(value.width, 1, MAX_EDGE_WIDTH)),
      defringe: value.defringe === true,
      decontaminateAmount: clamp(value.decontaminateAmount, 0, 1),
      matte: value.matte === "white" || value.matte === "black" ? value.matte : "none",
    };
  }

  function validateBuffers(rgba, alpha, width, height) {
    const cleanWidth = Math.round(Number(width));
    const cleanHeight = Math.round(Number(height));
    if (!Number.isInteger(cleanWidth) || cleanWidth <= 0 ||
        !Number.isInteger(cleanHeight) || cleanHeight <= 0) {
      throw new TypeError("width and height must be positive integers");
    }
    const pixels = cleanWidth * cleanHeight;
    if (!rgba || typeof rgba.length !== "number" || rgba.length !== pixels * 4) {
      throw new TypeError("RGBA buffer length does not match width and height");
    }
    if (!alpha || typeof alpha.length !== "number" || alpha.length !== pixels) {
      throw new TypeError("Alpha buffer length does not match width and height");
    }
    return { width: cleanWidth, height: cleanHeight, pixels };
  }

  function forEachNeighbor4(index, width, height, callback) {
    const x = index % width;
    const y = (index / width) | 0;
    if (x > 0) callback(index - 1);
    if (x + 1 < width) callback(index + 1);
    if (y > 0) callback(index - width);
    if (y + 1 < height) callback(index + width);
  }

  function buildEdgeDistance(alpha, width, height) {
    const pixels = width * height;
    const distance = new Uint16Array(pixels);
    const queue = new Int32Array(pixels);
    let head = 0;
    let tail = 0;

    for (let index = 0; index < pixels; index += 1) {
      if (alpha[index] <= 0) continue;
      const x = index % width;
      const y = (index / width) | 0;
      const touchesOutside = x === 0 || x + 1 === width || y === 0 || y + 1 === height;
      const touchesTransparent =
        (x > 0 && alpha[index - 1] <= 0) ||
        (x + 1 < width && alpha[index + 1] <= 0) ||
        (y > 0 && alpha[index - width] <= 0) ||
        (y + 1 < height && alpha[index + width] <= 0);
      if (touchesOutside || touchesTransparent) {
        distance[index] = 1;
        queue[tail++] = index;
      }
    }

    while (head < tail) {
      const index = queue[head++];
      const nextDistance = Math.min(65535, distance[index] + 1);
      forEachNeighbor4(index, width, height, (neighbor) => {
        if (alpha[neighbor] <= 0 || distance[neighbor] !== 0) return;
        distance[neighbor] = nextDistance;
        queue[tail++] = neighbor;
      });
    }
    return distance;
  }

  function buildDonorMap(alpha, distance, width, height, edgeWidth, donorAlpha = DEFAULT_DONOR_ALPHA) {
    const pixels = width * height;
    const donors = new Int32Array(pixels);
    donors.fill(-1);
    const queue = new Int32Array(pixels);
    let head = 0;
    let tail = 0;

    const seed = (minimumAlpha) => {
      for (let index = 0; index < pixels; index += 1) {
        if (donors[index] === -1 && alpha[index] >= minimumAlpha && distance[index] > edgeWidth) {
          donors[index] = index;
          queue[tail++] = index;
        }
      }
    };
    seed(donorAlpha);
    if (tail === 0) seed(1);

    while (head < tail) {
      const index = queue[head++];
      const donor = donors[index];
      forEachNeighbor4(index, width, height, (neighbor) => {
        if (alpha[neighbor] <= 0 || donors[neighbor] !== -1) return;
        donors[neighbor] = donor;
        queue[tail++] = neighbor;
      });
    }
    return donors;
  }

  function removeMatteInPlace(rgba, alpha, matte) {
    if (matte !== "white" && matte !== "black") return;
    const matteValue = matte === "white" ? 255 : 0;
    for (let pixel = 0, offset = 0; pixel < alpha.length; pixel += 1, offset += 4) {
      const alphaByte = alpha[pixel];
      if (alphaByte <= 0 || alphaByte >= 255) continue;
      const normalizedAlpha = Math.max(1 / 255, alphaByte / 255);
      const hiddenMatte = matteValue * (1 - normalizedAlpha);
      rgba[offset] = clampByte((rgba[offset] - hiddenMatte) / normalizedAlpha);
      rgba[offset + 1] = clampByte((rgba[offset + 1] - hiddenMatte) / normalizedAlpha);
      rgba[offset + 2] = clampByte((rgba[offset + 2] - hiddenMatte) / normalizedAlpha);
    }
  }

  function blendTowardDonorsInPlace(rgba, alpha, width, height, settings) {
    if (!settings.defringe && settings.decontaminateAmount <= 0) return;
    const distance = buildEdgeDistance(alpha, width, height);
    const donors = buildDonorMap(alpha, distance, width, height, settings.width);

    for (let pixel = 0, offset = 0; pixel < alpha.length; pixel += 1, offset += 4) {
      const edgeDistance = distance[pixel];
      const donorPixel = donors[pixel];
      if (alpha[pixel] <= 0 || edgeDistance <= 0 || edgeDistance > settings.width || donorPixel < 0 || donorPixel === pixel) continue;
      const taper = (settings.width - edgeDistance + 1) / settings.width;
      const strength = settings.defringe ? 1 : settings.decontaminateAmount * taper;
      if (strength <= 0) continue;
      const donorOffset = donorPixel * 4;
      rgba[offset] = clampByte(rgba[offset] + (rgba[donorOffset] - rgba[offset]) * strength);
      rgba[offset + 1] = clampByte(rgba[offset + 1] + (rgba[donorOffset + 1] - rgba[offset + 1]) * strength);
      rgba[offset + 2] = clampByte(rgba[offset + 2] + (rgba[donorOffset + 2] - rgba[offset + 2]) * strength);
    }
  }

  function applyEdgeCorrection(sourceRgba, alphaMask, width, height, rawSettings = {}) {
    const size = validateBuffers(sourceRgba, alphaMask, width, height);
    const settings = normalizeSettings(rawSettings);
    const output = new Uint8ClampedArray(sourceRgba);
    removeMatteInPlace(output, alphaMask, settings.matte);
    blendTowardDonorsInPlace(output, alphaMask, size.width, size.height, settings);
    for (let pixel = 0, offset = 3; pixel < size.pixels; pixel += 1, offset += 4) output[offset] = clampByte(alphaMask[pixel]);
    return output;
  }

  return {
    MAX_EDGE_WIDTH,
    DEFAULT_DONOR_ALPHA,
    defaultSettings,
    normalizeSettings,
    buildEdgeDistance,
    buildDonorMap,
    removeMatteInPlace,
    applyEdgeCorrection,
  };
});
