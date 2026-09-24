"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const editor = fs.readFileSync(path.join(root, "web", "speech-bubble-editor.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "speech_bubble_forge", "renderer.py"), "utf8");
const launcher = fs.readFileSync(path.join(root, "javascript", "speech_bubble_forge.js"), "utf8");
const settings = fs.readFileSync(path.join(root, "javascript", "speech_bubble_settings.js"), "utf8");
const userAssets = fs.readFileSync(path.join(root, "speech_bubble_forge", "user_assets.py"), "utf8");

assert.match(editor, /async function loadUserAssetCatalog\(\)/);
assert.match(editor, /function normalizeUserAssetStyle\(/);
assert.match(editor, /styleDefaults:normalizeUserAssetStyle\(raw\.style_defaults,w,h\)/);
assert.match(editor, /function tintedSfxCardSurface\(surface,color\)/);
assert.match(editor, /style=preset\.userPreset\?\(preset\.styleDefaults\|\|normalizeUserAssetStyle/);
assert.match(editor, /style\?style\.shadow_enabled:false/);
assert.match(editor, /style\?style\.glow_enabled:false/);
assert.match(editor, /id="shadowColorSwatches"/);
assert.match(editor, /id="glowColorSwatches"/);
assert.match(editor, /\.compact-color-swatch \{ width:16px; min-width:16px; max-width:16px; height:16px; min-height:16px; max-height:16px; aspect-ratio:1;/);
assert.match(editor, /shadow:"shadow_color"/);
assert.match(editor, /glow:"glow_color"/);
assert.match(editor, /type==="glow"\?item\?\.type==="sfx"/);
assert.match(editor, /user_asset_id:preset\.userAssetId\|\|""/);
assert.match(editor, /data-sfx-color-mode="original"/);
assert.match(editor, /data-sfx-color-mode="fill"/);
assert.match(editor, /item\.mask_mode=savedUserAssetId\?\(item\.mask_mode\?\?false\)/);
assert.match(editor, /item\.user_fill_initialized=savedUserAssetId/);
assert.match(editor, /item\.mask_mode=next/);
assert.match(editor, /item\.asset_src=item\.asset_src\|\|preset\.src/);
assert.match(editor, /makeSfxLibrarySection\("My Presets"/);
assert.match(editor, /enablePresetDrag\(button,\{kind:"sfx",id:preset\.id\}\)/);
assert.match(editor, /BroadcastChannel\(USER_ASSET_CHANNEL\)/);
assert.match(editor, /type:"diagnostic_pong"/);
assert.match(editor, /loadSfxAssetCatalog\(\),loadUserAssetCatalog\(\)/);
assert.match(editor, /<option value="all">All SFX<\/option><option value="user">Presets<\/option><option value="builtin">Templates<\/option>/);
assert.match(editor, /category==="builtin"&&button\.dataset\.category!=="user"/);
assert.doesNotMatch(editor, /All languages/);
assert.match(renderer, /user_asset_id = str\(element\.get\("user_asset_id"\)/);
assert.match(renderer, /resolve_user_asset_path\(user_asset_id\)/);
assert.match(renderer, /glow_enabled = bool\(element\.get\("glow_enabled"\)\)/);
assert.match(settings, /既存: \$\{category\}「\$\{existing\.name\}」/);
assert.match(settings, /USER_ASSET_ENDPOINT\}\/archive\/organize/);
assert.match(userAssets, /def organize_archive\(self\)/);
assert.match(userAssets, /self\.archive_assets_dir/);

// V1 must not introduce another popup/window-launch implementation in the editor.
assert.equal((editor.match(/window\.open\(/g) || []).length, 0);
assert.ok((launcher.match(/window\.open\(/g) || []).length >= 1, "existing launcher remains responsible for window.open");
assert.match(launcher, /speech-bubble\/editor\/window-state:v1/);
assert.match(launcher, /function requestEditorFocus/);
assert.doesNotMatch(launcher, /function addQuickPanel/);

console.log("user_asset_editor_integration_test: OK");
