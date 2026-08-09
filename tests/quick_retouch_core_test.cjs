"use strict";

const assert = require("node:assert/strict");
const core = require("../web/project/quick-retouch-core.js");

{
  const left = new Uint8ClampedArray([0, 64, 255, 128]);
  const right = new Uint8ClampedArray([255, 128, 0, 128]);
  assert.deepEqual([...core.combineMasks(left, right, "replace")], [255, 128, 0, 128]);
  assert.deepEqual([...core.combineMasks(left, right, "add")], [255, 128, 255, 128]);
  assert.deepEqual([...core.combineMasks(left, right, "subtract")], [0, 0, 255, 0]);
  assert.deepEqual([...core.combineMasks(left, right, "intersect")], [0, 64, 0, 128]);
  assert.deepEqual([...core.invertMask(new Uint8ClampedArray([0, 64, 255]))], [255, 191, 0]);
}

{
  const mask = core.rectangleMask(5, 5, 1, 1, 4, 4);
  assert.equal(mask.reduce((count, value) => count + (value > 0 ? 1 : 0), 0), 9);
  const ellipse = core.ellipseMask(7, 7, 1, 1, 6, 6);
  assert.equal(ellipse[3 * 7 + 3], 255);
  assert.equal(ellipse[1 * 7 + 1], 0);
  const polygon = core.polygonMask(6, 6, [
    { x: 1, y: 1 },
    { x: 5, y: 1 },
    { x: 1, y: 5 },
  ]);
  assert.ok(polygon[2 * 6 + 2] > 0);
  assert.equal(polygon[5 * 6 + 5], 0);
}

{
  const source = new Uint8ClampedArray(25);
  source[12] = 255;
  const expanded = core.expandMask(source, 5, 5, 1);
  assert.equal(expanded.reduce((count, value) => count + (value > 0 ? 1 : 0), 0), 9);
  const shrunk = core.shrinkMask(expanded, 5, 5, 1);
  assert.ok(shrunk[12] > 0);
  const feathered = core.featherMask(source, 5, 5, 2);
  assert.ok(feathered[12] > 0);
  assert.ok(feathered[11] > 0);
}

{
  const identity = core.buildCurveLut([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
  for (const value of [0, 32, 64, 128, 192, 255]) {
    assert.ok(Math.abs(identity[value] - value) <= 1, `${value}: ${identity[value]}`);
  }
  const contrast = core.buildCurveLut([
    { x: 0, y: 0 },
    { x: 64, y: 40 },
    { x: 192, y: 220 },
    { x: 255, y: 255 },
  ]);
  assert.ok(contrast[64] < 64);
  assert.ok(contrast[192] > 192);
  for (let index = 1; index < contrast.length; index += 1) {
    assert.ok(contrast[index] >= contrast[index - 1] - 1, "curve should remain monotonic");
  }
}

{
  const shifted = core.hueSaturationPixel(255, 0, 0, {
    hue: 120,
    saturation: 0,
    lightness: 0,
    colorize: false,
  });
  assert.ok(shifted[1] > 240 && shifted[0] < 20 && shifted[2] < 20, shifted);
  const bright = core.brightnessContrastPixel(100, 100, 100, {
    brightness: 20,
    contrast: 0,
    gamma: 1,
  });
  assert.ok(bright[0] > 100);
}

{
  const yellowShifted = core.hueSaturationPixel(255, 220, 0, {
    hue: 45,
    saturation: 0,
    lightness: 0,
    colorize: false,
    targetColor: "yellow",
    targetWidth: 30,
    targetSoftness: 20,
  });
  const blueProtected = core.hueSaturationPixel(0, 80, 255, {
    hue: 45,
    saturation: 0,
    lightness: 0,
    colorize: false,
    targetColor: "yellow",
    targetWidth: 30,
    targetSoftness: 20,
  });
  assert.notDeepEqual(yellowShifted, [255, 220, 0]);
  assert.deepEqual(blueProtected, [0, 80, 255]);
  assert.equal(core.hueTargetWeight(60, { targetColor: "yellow", targetWidth: 20, targetSoftness: 20 }), 1);
  assert.equal(core.hueTargetWeight(240, { targetColor: "yellow", targetWidth: 20, targetSoftness: 20 }), 0);
}

{
  const image = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([
      255, 0, 0, 255,
      250, 5, 5, 255,
      0, 0, 255, 255,
    ]),
  };
  const range = core.colorRangeMask(image, [{ r: 255, g: 0, b: 0 }], [], 10);
  assert.equal(range[0], 255);
  assert.equal(range[1], 255);
  assert.equal(range[2], 0);
  const flood = core.floodSelect(image, 0, 0, 10);
  assert.equal(flood[0], 255);
  assert.equal(flood[1], 255);
  assert.equal(flood[2], 0);
}

{
  const source = new Uint8ClampedArray([100, 100, 100, 255]);
  const paint = new Uint8ClampedArray([255, 0, 0, 128]);
  const layers = [
    { id: "paint", type: "paint", visible: true, opacity: 1, pixels: paint },
    {
      id: "brightness",
      type: "adjustment",
      visible: true,
      opacity: 1,
      adjustmentType: "brightness_contrast",
      settings: { brightness: 10, contrast: 0, gamma: 1 },
    },
  ];
  const masks = new Map([["brightness", new Uint8ClampedArray([255])]]);
  const output = core.renderStack(source, layers, masks);
  assert.ok(output[0] > output[1]);
  assert.ok(output[0] > 170);
  assert.equal(output[3], 255);
}

{
  const source = new Uint8ClampedArray([
    255, 0, 0, 255,
    255, 0, 0, 255,
  ]);
  const selectedEyes = new Uint8ClampedArray([255, 0]);
  const inverted = core.invertMask(selectedEyes);
  const layers = [{
    id: "hue",
    type: "adjustment",
    visible: true,
    opacity: 1,
    adjustmentType: "hue_saturation",
    settings: { hue: 120, saturation: 0, lightness: 0, colorize: false, targetColor: "master" },
  }];
  const output = core.renderStack(source, layers, new Map([["hue", inverted]]));
  assert.deepEqual([...output.slice(0, 4)], [255, 0, 0, 255], "inverted mask must protect the originally selected eye pixel");
  assert.ok(output[5] > 220 && output[4] < 30, "outside the original selection should receive the H/S adjustment");
}

console.log("quick_retouch_core_test: OK");
