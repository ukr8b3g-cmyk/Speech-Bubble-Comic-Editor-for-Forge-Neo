"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
    path.join(__dirname, "..", "web", "speech-bubble-editor.html"),
    "utf8",
);
const layoutSource = source.match(
    /function sfxCardPreviewLayout\(style,canvasW=152,canvasH=120\)\{[\s\S]*?\n    \}/,
)?.[0];
assert.ok(layoutSource, "sfxCardPreviewLayout must exist");
const sfxCardPreviewLayout = vm.runInNewContext(`(${layoutSource})`);

const largeCanvasGlow = sfxCardPreviewLayout({
    width: 1032,
    height: 640,
    stroke_width: 0,
    shadow_enabled: false,
    glow_enabled: true,
    glow_blur: 16,
    glow_spread: 0,
});
assert.ok(largeCanvasGlow.width > 120, "large-canvas stamp should remain readable");
assert.ok(largeCanvasGlow.height > 70, "large-canvas stamp should not collapse vertically");
assert.ok(largeCanvasGlow.scale < 1, "effects and content should share the thumbnail scale");

const effectEdge = largeCanvasGlow.effectPadding * largeCanvasGlow.scale;
assert.ok(largeCanvasGlow.x - effectEdge >= 0);
assert.ok(largeCanvasGlow.y - effectEdge >= 0);
assert.ok(largeCanvasGlow.x + largeCanvasGlow.width + effectEdge <= 152);
assert.ok(largeCanvasGlow.y + largeCanvasGlow.height + effectEdge <= 120);

const smallCanvasGlow = sfxCardPreviewLayout({
    width: 100,
    height: 50,
    stroke_width: 3,
    shadow_enabled: true,
    shadow_x: 6,
    shadow_y: 6,
    shadow_blur: 4,
    glow_enabled: true,
    glow_blur: 16,
    glow_spread: 2,
});
assert.ok(smallCanvasGlow.width > 60);
assert.ok(smallCanvasGlow.height > 30);

assert.match(source, /style\.glow_blur\*effectScale/);
assert.match(source, /shadowOffsetX=style\.shadow_x\*effectScale/);
assert.match(source, /scaledOutline=outline\*effectScale/);

console.log("sfx_card_thumbnail_layout_test: OK");
