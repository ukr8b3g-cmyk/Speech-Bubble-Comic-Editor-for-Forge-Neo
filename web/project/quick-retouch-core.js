(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SpeechBubbleQuickRetouchCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SELECTION_OPERATIONS = Object.freeze([
    "replace",
    "add",
    "subtract",
    "intersect",
  ]);

  const clamp = (value, minimum, maximum) =>
    Math.max(minimum, Math.min(maximum, Number(value) || 0));

  function createMask(width, height, fill = 0) {
    const output = new Uint8ClampedArray(Math.max(0, width * height));
    if (fill) output.fill(clamp(fill, 0, 255));
    return output;
  }

  function cloneMask(mask) {
    return new Uint8ClampedArray(mask || 0);
  }

  function maskHasSelection(mask) {
    if (!mask) return false;
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index] > 0) return true;
    }
    return false;
  }

  function normalizeSelectionOperation(value) {
    return SELECTION_OPERATIONS.includes(value) ? value : "replace";
  }

  function combineMasks(base, incoming, operation = "replace") {
    const mode = normalizeSelectionOperation(operation);
    const size = Math.max(base?.length || 0, incoming?.length || 0);
    const output = new Uint8ClampedArray(size);
    for (let index = 0; index < size; index += 1) {
      const left = base?.[index] || 0;
      const right = incoming?.[index] || 0;
      if (mode === "add") output[index] = Math.max(left, right);
      else if (mode === "subtract") output[index] = Math.max(0, left - right);
      else if (mode === "intersect") output[index] = Math.min(left, right);
      else output[index] = right;
    }
    return output;
  }

  function invertMask(mask) {
    const output = new Uint8ClampedArray(mask?.length || 0);
    for (let index = 0; index < output.length; index += 1) {
      output[index] = 255 - (mask[index] || 0);
    }
    return output;
  }

  function boxBlurMask(mask, width, height, radius) {
    const r = Math.max(0, Math.min(64, Math.round(Number(radius) || 0)));
    if (!r || !mask?.length) return cloneMask(mask);
    const horizontal = new Float32Array(mask.length);
    const output = new Uint8ClampedArray(mask.length);
    const window = r * 2 + 1;

    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let x = -r; x <= r; x += 1) {
        const sampleX = Math.max(0, Math.min(width - 1, x));
        sum += mask[y * width + sampleX];
      }
      for (let x = 0; x < width; x += 1) {
        horizontal[y * width + x] = sum / window;
        const removeX = Math.max(0, Math.min(width - 1, x - r));
        const addX = Math.max(0, Math.min(width - 1, x + r + 1));
        sum += mask[y * width + addX] - mask[y * width + removeX];
      }
    }

    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let y = -r; y <= r; y += 1) {
        const sampleY = Math.max(0, Math.min(height - 1, y));
        sum += horizontal[sampleY * width + x];
      }
      for (let y = 0; y < height; y += 1) {
        output[y * width + x] = Math.round(sum / window);
        const removeY = Math.max(0, Math.min(height - 1, y - r));
        const addY = Math.max(0, Math.min(height - 1, y + r + 1));
        sum += horizontal[addY * width + x] - horizontal[removeY * width + x];
      }
    }
    return output;
  }

  function featherMask(mask, width, height, radius) {
    const r = Math.max(0, Math.round(Number(radius) || 0));
    if (!r) return cloneMask(mask);
    let output = cloneMask(mask);
    const passRadius = Math.max(1, Math.round(r / 2));
    output = boxBlurMask(output, width, height, passRadius);
    output = boxBlurMask(output, width, height, passRadius);
    return output;
  }

  function morphology(mask, width, height, radius, expand) {
    const r = Math.max(0, Math.min(32, Math.round(Number(radius) || 0)));
    if (!r || !mask?.length) return cloneMask(mask);
    let current = cloneMask(mask);
    for (let pass = 0; pass < r; pass += 1) {
      const next = new Uint8ClampedArray(current.length);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let value = expand ? 0 : 255;
          for (let dy = -1; dy <= 1; dy += 1) {
            const sy = Math.max(0, Math.min(height - 1, y + dy));
            for (let dx = -1; dx <= 1; dx += 1) {
              const sx = Math.max(0, Math.min(width - 1, x + dx));
              const sample = current[sy * width + sx];
              value = expand ? Math.max(value, sample) : Math.min(value, sample);
            }
          }
          next[y * width + x] = value;
        }
      }
      current = next;
    }
    return current;
  }

  const expandMask = (mask, width, height, radius) =>
    morphology(mask, width, height, radius, true);
  const shrinkMask = (mask, width, height, radius) =>
    morphology(mask, width, height, radius, false);

  function rectangleMask(width, height, x0, y0, x1, y1) {
    const output = createMask(width, height);
    const left = Math.max(0, Math.min(width, Math.floor(Math.min(x0, x1))));
    const right = Math.max(0, Math.min(width, Math.ceil(Math.max(x0, x1))));
    const top = Math.max(0, Math.min(height, Math.floor(Math.min(y0, y1))));
    const bottom = Math.max(0, Math.min(height, Math.ceil(Math.max(y0, y1))));
    for (let y = top; y < bottom; y += 1) {
      output.fill(255, y * width + left, y * width + right);
    }
    return output;
  }

  function ellipseMask(width, height, x0, y0, x1, y1) {
    const output = createMask(width, height);
    const left = Math.max(0, Math.min(width, Math.floor(Math.min(x0, x1))));
    const right = Math.max(0, Math.min(width, Math.ceil(Math.max(x0, x1))));
    const top = Math.max(0, Math.min(height, Math.floor(Math.min(y0, y1))));
    const bottom = Math.max(0, Math.min(height, Math.ceil(Math.max(y0, y1))));
    const radiusX = Math.max(0.5, (right - left) / 2);
    const radiusY = Math.max(0.5, (bottom - top) / 2);
    const centerX = left + radiusX;
    const centerY = top + radiusY;
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const dx = (x + 0.5 - centerX) / radiusX;
        const dy = (y + 0.5 - centerY) / radiusY;
        if (dx * dx + dy * dy <= 1) output[y * width + x] = 255;
      }
    }
    return output;
  }

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
      const a = points[index];
      const b = points[previous];
      const crosses = (a.y > y) !== (b.y > y) &&
        x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function polygonMask(width, height, points) {
    const output = createMask(width, height);
    if (!Array.isArray(points) || points.length < 3) return output;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const right = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (pointInPolygon(x + 0.5, y + 0.5, points)) output[y * width + x] = 255;
      }
    }
    return output;
  }

  function colorDistance(r1, g1, b1, r2, g2, b2) {
    const rMean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(
      (2 + rMean / 256) * dr * dr +
      4 * dg * dg +
      (2 + (255 - rMean) / 256) * db * db,
    );
  }

  function pixelColor(data, index) {
    const offset = index * 4;
    return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  }

  function floodSelect(imageData, startX, startY, tolerance = 36) {
    const width = imageData.width;
    const height = imageData.height;
    const x = Math.max(0, Math.min(width - 1, Math.floor(startX)));
    const y = Math.max(0, Math.min(height - 1, Math.floor(startY)));
    const output = createMask(width, height);
    const visited = new Uint8Array(width * height);
    const queue = new Int32Array(width * height);
    let read = 0;
    let write = 0;
    const seed = y * width + x;
    const [sr, sg, sb, sa] = pixelColor(imageData.data, seed);
    queue[write++] = seed;
    visited[seed] = 1;
    const threshold = Math.max(0, Number(tolerance) || 0) * 4.5;

    while (read < write) {
      const index = queue[read++];
      const [r, g, b, a] = pixelColor(imageData.data, index);
      const alphaDistance = Math.abs(a - sa) * 1.5;
      if (colorDistance(r, g, b, sr, sg, sb) + alphaDistance > threshold) continue;
      output[index] = 255;
      const px = index % width;
      const py = Math.floor(index / width);
      if (px > 0) {
        const next = index - 1;
        if (!visited[next]) { visited[next] = 1; queue[write++] = next; }
      }
      if (px + 1 < width) {
        const next = index + 1;
        if (!visited[next]) { visited[next] = 1; queue[write++] = next; }
      }
      if (py > 0) {
        const next = index - width;
        if (!visited[next]) { visited[next] = 1; queue[write++] = next; }
      }
      if (py + 1 < height) {
        const next = index + width;
        if (!visited[next]) { visited[next] = 1; queue[write++] = next; }
      }
    }
    return output;
  }

  function colorRangeMask(imageData, samples, excludedSamples = [], tolerance = 36, sampleStep = 1) {
    const output = createMask(imageData.width, imageData.height);
    const include = Array.isArray(samples) ? samples.filter(Boolean) : [];
    const exclude = Array.isArray(excludedSamples) ? excludedSamples.filter(Boolean) : [];
    if (!include.length) return output;
    const threshold = Math.max(0, Number(tolerance) || 0) * 4.5;
    const step = Math.max(1, Math.floor(Number(sampleStep) || 1));
    for (let y = 0; y < imageData.height; y += step) {
      for (let x = 0; x < imageData.width; x += step) {
      const index = y * imageData.width + x;
      const offset = index * 4;
      const r = imageData.data[offset];
      const g = imageData.data[offset + 1];
      const b = imageData.data[offset + 2];
      const alpha = imageData.data[offset + 3];
      if (!alpha) continue;
      let included = false;
      for (const sample of include) {
        if (colorDistance(r, g, b, sample.r, sample.g, sample.b) <= threshold) {
          included = true;
          break;
        }
      }
      if (!included) continue;
      let blocked = false;
      for (const sample of exclude) {
        if (colorDistance(r, g, b, sample.r, sample.g, sample.b) <= threshold) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        const blockRight = Math.min(imageData.width, x + step);
        const blockBottom = Math.min(imageData.height, y + step);
        for (let blockY = y; blockY < blockBottom; blockY += 1) {
          output.fill(255, blockY * imageData.width + x, blockY * imageData.width + blockRight);
        }
      }
      }
    }
    return output;
  }

  function normalizeCurvePoints(points) {
    const byX = new Map();
    for (const point of Array.isArray(points) ? points : []) {
      const x = Math.round(clamp(point?.x, 0, 255));
      const y = Math.round(clamp(point?.y, 0, 255));
      byX.set(x, { x, y });
    }
    if (!byX.has(0)) byX.set(0, { x: 0, y: 0 });
    if (!byX.has(255)) byX.set(255, { x: 255, y: 255 });
    return [...byX.values()].sort((left, right) => left.x - right.x);
  }

  function buildCurveLut(points) {
    const normalized = normalizeCurvePoints(points);
    const count = normalized.length;
    const slopes = new Float64Array(Math.max(0, count - 1));
    const tangents = new Float64Array(count);
    for (let index = 0; index < count - 1; index += 1) {
      const dx = normalized[index + 1].x - normalized[index].x;
      slopes[index] = dx ? (normalized[index + 1].y - normalized[index].y) / dx : 0;
    }
    tangents[0] = slopes[0] || 0;
    tangents[count - 1] = slopes[count - 2] || 0;
    for (let index = 1; index < count - 1; index += 1) {
      const left = slopes[index - 1];
      const right = slopes[index];
      tangents[index] = left * right <= 0 ? 0 : (left + right) / 2;
    }
    for (let index = 0; index < count - 1; index += 1) {
      const slope = slopes[index];
      if (!slope) {
        tangents[index] = 0;
        tangents[index + 1] = 0;
        continue;
      }
      const a = tangents[index] / slope;
      const b = tangents[index + 1] / slope;
      const magnitude = Math.hypot(a, b);
      if (magnitude > 3) {
        const scale = 3 / magnitude;
        tangents[index] = scale * a * slope;
        tangents[index + 1] = scale * b * slope;
      }
    }

    const lut = new Uint8Array(256);
    let segment = 0;
    for (let x = 0; x <= 255; x += 1) {
      while (segment + 1 < count - 1 && x > normalized[segment + 1].x) segment += 1;
      const p0 = normalized[segment];
      const p1 = normalized[Math.min(segment + 1, count - 1)];
      const dx = Math.max(1, p1.x - p0.x);
      const t = clamp((x - p0.x) / dx, 0, 1);
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      const y = h00 * p0.y + h10 * dx * tangents[segment] +
        h01 * p1.y + h11 * dx * tangents[Math.min(segment + 1, count - 1)];
      lut[x] = Math.round(clamp(y, 0, 255));
    }
    return lut;
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const maximum = Math.max(rn, gn, bn);
    const minimum = Math.min(rn, gn, bn);
    const lightness = (maximum + minimum) / 2;
    if (maximum === minimum) return [0, 0, lightness];
    const delta = maximum - minimum;
    const saturation = lightness > 0.5
      ? delta / (2 - maximum - minimum)
      : delta / (maximum + minimum);
    let hue;
    if (maximum === rn) hue = (gn - bn) / delta + (gn < bn ? 6 : 0);
    else if (maximum === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    return [hue / 6, saturation, lightness];
  }

  function hueToRgb(p, q, t) {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  }

  function hslToRgb(h, s, l) {
    if (!s) {
      const value = Math.round(clamp(l, 0, 1) * 255);
      return [value, value, value];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
      Math.round(clamp(hueToRgb(p, q, h + 1 / 3), 0, 1) * 255),
      Math.round(clamp(hueToRgb(p, q, h), 0, 1) * 255),
      Math.round(clamp(hueToRgb(p, q, h - 1 / 3), 0, 1) * 255),
    ];
  }

  const HUE_FAMILY_CENTERS = Object.freeze({
    red: 0,
    yellow: 60,
    green: 120,
    cyan: 180,
    blue: 240,
    magenta: 300,
  });

  function circularHueDistance(left, right) {
    const delta = Math.abs((((Number(left) || 0) - (Number(right) || 0)) % 360 + 360) % 360);
    return Math.min(delta, 360 - delta);
  }

  function hueTargetWeight(hueDegrees, settings = {}) {
    const target = String(settings.targetColor || "master");
    if (target === "master") return 1;
    const included = Array.isArray(settings.targetSamples) ? settings.targetSamples : [];
    const excluded = Array.isArray(settings.targetExcluded) ? settings.targetExcluded : [];
    const center = HUE_FAMILY_CENTERS[target];
    const centers = included.length
      ? included.map((value) => ((Number(value) || 0) % 360 + 360) % 360)
      : Number.isFinite(center) ? [center] : [];
    if (!centers.length) return 0;
    const inner = clamp(settings.targetWidth ?? 30, 1, 90);
    const softness = clamp(settings.targetSoftness ?? 30, 0, 90);
    const outer = Math.min(180, inner + softness);
    let weight = 0;
    for (const sample of centers) {
      const distance = circularHueDistance(hueDegrees, sample);
      const current = distance <= inner
        ? 1
        : distance >= outer
          ? 0
          : 1 - (distance - inner) / Math.max(1, outer - inner);
      weight = Math.max(weight, current);
    }
    for (const sample of excluded) {
      const distance = circularHueDistance(hueDegrees, Number(sample) || 0);
      if (distance <= inner) return 0;
      if (distance < outer) weight *= (distance - inner) / Math.max(1, outer - inner);
    }
    return clamp(weight, 0, 1);
  }

  function hueSaturationPixel(r, g, b, settings = {}) {
    let [hue, saturation, lightness] = rgbToHsl(r, g, b);
    const originalHue = hue;
    const targetWeight = hueTargetWeight(originalHue * 360, settings);
    if (targetWeight <= 0) return [r, g, b];
    const shift = clamp(settings.hue, -180, 180) / 360;
    const saturationAmount = clamp(settings.saturation, -100, 100) / 100;
    const lightnessAmount = clamp(settings.lightness, -100, 100) / 100;
    if (settings.colorize) {
      hue = (((clamp(settings.hue, -180, 180) + 180) / 360) % 1 + 1) % 1;
      saturation = clamp(Math.max(0.05, saturationAmount > 0 ? saturationAmount : 0.5), 0, 1);
    } else {
      hue = ((hue + shift) % 1 + 1) % 1;
      saturation = saturationAmount >= 0
        ? saturation + (1 - saturation) * saturationAmount
        : saturation * (1 + saturationAmount);
    }
    lightness = lightnessAmount >= 0
      ? lightness + (1 - lightness) * lightnessAmount
      : lightness * (1 + lightnessAmount);
    const adjusted = hslToRgb(hue, clamp(saturation, 0, 1), clamp(lightness, 0, 1));
    if (targetWeight >= 0.999) return adjusted;
    return adjusted.map((value, index) => Math.round([r, g, b][index] + (value - [r, g, b][index]) * targetWeight));
  }

  function brightnessContrastPixel(r, g, b, settings = {}) {
    const brightness = clamp(settings.brightness, -100, 100) * 2.55;
    const contrastValue = clamp(settings.contrast, -100, 100);
    const contrast = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
    const gamma = clamp(settings.gamma || 1, 0.2, 3);
    const transform = (value) => {
      const adjusted = clamp(contrast * (value - 128) + 128 + brightness, 0, 255) / 255;
      return Math.round(clamp(Math.pow(adjusted, 1 / gamma) * 255, 0, 255));
    };
    return [transform(r), transform(g), transform(b)];
  }

  function adjustmentProcessor(layer) {
    const type = layer.adjustmentType;
    if (type === "curves") {
      const channels = layer.settings?.channels || {};
      const rgb = buildCurveLut(channels.rgb);
      const red = buildCurveLut(channels.red);
      const green = buildCurveLut(channels.green);
      const blue = buildCurveLut(channels.blue);
      return (r, g, b) => [red[rgb[r]], green[rgb[g]], blue[rgb[b]]];
    }
    if (type === "brightness_contrast") {
      return (r, g, b) => brightnessContrastPixel(r, g, b, layer.settings);
    }
    return (r, g, b) => hueSaturationPixel(r, g, b, layer.settings);
  }

  function applyAdjustment(buffer, layer, mask) {
    if (!layer?.visible) return;
    const processor = adjustmentProcessor(layer);
    const opacity = clamp(layer.opacity ?? 1, 0, 1);
    for (let index = 0, pixel = 0; index < buffer.length; index += 4, pixel += 1) {
      const weight = opacity * ((mask?.[pixel] ?? 255) / 255);
      if (weight <= 0) continue;
      const originalR = buffer[index];
      const originalG = buffer[index + 1];
      const originalB = buffer[index + 2];
      const [nextR, nextG, nextB] = processor(originalR, originalG, originalB);
      buffer[index] = Math.round(originalR + (nextR - originalR) * weight);
      buffer[index + 1] = Math.round(originalG + (nextG - originalG) * weight);
      buffer[index + 2] = Math.round(originalB + (nextB - originalB) * weight);
    }
  }

  function blendPaint(buffer, paint, opacity = 1) {
    if (!paint) return;
    const layerOpacity = clamp(opacity, 0, 1);
    for (let index = 0; index < buffer.length; index += 4) {
      const sourceAlpha = (paint[index + 3] / 255) * layerOpacity;
      if (sourceAlpha <= 0) continue;
      const destinationAlpha = buffer[index + 3] / 255;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      if (outputAlpha <= 0) {
        buffer[index] = buffer[index + 1] = buffer[index + 2] = buffer[index + 3] = 0;
        continue;
      }
      buffer[index] = Math.round((paint[index] * sourceAlpha + buffer[index] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
      buffer[index + 1] = Math.round((paint[index + 1] * sourceAlpha + buffer[index + 1] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
      buffer[index + 2] = Math.round((paint[index + 2] * sourceAlpha + buffer[index + 2] * destinationAlpha * (1 - sourceAlpha)) / outputAlpha);
      buffer[index + 3] = Math.round(outputAlpha * 255);
    }
  }

  function renderStack(sourceData, layers, masks = new Map()) {
    const output = new Uint8ClampedArray(sourceData);
    for (const layer of Array.isArray(layers) ? layers : []) {
      if (!layer?.visible) continue;
      if (layer.type === "paint") blendPaint(output, layer.pixels, layer.opacity);
      else if (layer.type === "adjustment") applyAdjustment(output, layer, masks.get(layer.id));
    }
    return output;
  }

  return Object.freeze({
    SELECTION_OPERATIONS,
    clamp,
    createMask,
    cloneMask,
    maskHasSelection,
    normalizeSelectionOperation,
    combineMasks,
    invertMask,
    featherMask,
    expandMask,
    shrinkMask,
    rectangleMask,
    ellipseMask,
    polygonMask,
    pointInPolygon,
    colorDistance,
    floodSelect,
    colorRangeMask,
    normalizeCurvePoints,
    buildCurveLut,
    rgbToHsl,
    hslToRgb,
    circularHueDistance,
    hueTargetWeight,
    hueSaturationPixel,
    brightnessContrastPixel,
    renderStack,
  });
});
