"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const script = fs.readFileSync("web/project/editor-shell.js", "utf8");
function section(start, stop) {
  const from = script.indexOf(start), to = script.indexOf(stop, from + start.length);
  assert.ok(from >= 0 && to > from, "Missing production code: " + start);
  return script.slice(from, to);
}
const functions = [
  section("    function userSfxSource(", "    function sfxPresetFill("),
  section("    function sfxImageFor(", "    function clearSfxAssetCaches(")
].join("\n");
const urls = [];
const cache = new Map();
const hexId = "a".repeat(64);
const current = "http://127.0.0.1:8070/speech-bubble-forge/user-assets/asset/" + hexId;
const old = "http://127.0.0.1:8069/speech-bubble-forge/user-assets/asset/" + hexId;
const context = {
  URL,
  location: { href: "http://127.0.0.1:8070/speech-bubble-forge/static/project-editor.html" },
  forgeApiBase: "/speech-bubble-forge",
  SFX_ASSET_VERSION: "v1",
  sfxImageCache: cache,
  SFX_BY_ID: new Map(),
  console: { warn: () => undefined },
  requestRender() {},
  Image: class {
    set src(src) { this.currentSrc = src; urls.push(src); }
    get src() { return this.currentSrc; }
  }
};
vm.runInNewContext(functions, context);
assert.equal(context.userSfxSource(hexId), "/speech-bubble-forge/user-assets/asset/" + hexId);
assert.equal(context.userSfxSource("user:" + hexId), "/speech-bubble-forge/user-assets/asset/" + hexId);
assert.equal(context.userSfxSource("../../../bad"), "");
assert.equal(context.userSfxSource(hexId.toUpperCase()), "/speech-bubble-forge/user-assets/asset/" + hexId);
const oldPortLayer = { asset_id: "user:" + hexId, user_asset_id: hexId, asset_src: old };
const loaded = context.sfxImageFor(oldPortLayer);
assert.ok(loaded);
assert.equal(urls.length, 1);
assert.equal(new URL(urls[0]).origin, "http://127.0.0.1:8070");
assert.ok(urls[0].startsWith(current));
assert.equal(context.sfxImageFor(oldPortLayer), loaded, "repeated use should reuse asset cache");
assert.match(script, /item\.asset_src=savedUserAssetId\?\(userSfxSource\(savedUserAssetId\)/);
assert.match(script, /asset_src:preset\.userAssetId\?userSfxSource/);
console.log("project_stamp_url_portability_test: OK");
