"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "javascript", "speech_bubble_settings.js");
const source = fs.readFileSync(modulePath, "utf8");
const styleSource = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");
delete global.document;
delete global.SpeechBubbleForgeSettingsCore;
require(modulePath);

const core = global.SpeechBubbleForgeSettingsCore;
assert.ok(core, "settings core should be exposed without a browser DOM");
assert.equal(core.SETTINGS_UI_VERSION, "1.0.0");
assert.equal(core.RECOMMENDED_SIDE, 512);
assert.equal(core.RESIZE_SIDE, 768);
assert.equal(core.MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
assert.equal(core.MAX_SOURCE_PIXELS, 25_000_000);
assert.equal(core.MAX_PREVIEW_BACKGROUND_BYTES, 32 * 1024 * 1024);
assert.equal(core.MAX_PREVIEW_BACKGROUND_PIXELS, 100_000_000);
assert.equal(core.MAX_PREVIEW_BACKGROUND_HISTORY, 3);
assert.equal(core.NAME_MAX_LENGTH, 48);
assert.equal(core.formatBytes(1024), "1.0 KB");
assert.equal(core.filenameStem("  ドン!!.PNG  "), "ドン!!");
assert.equal(core.normalizedName("  A\u0000   B  "), "A B");
assert.deepEqual(core.defaultStyleDefaults(320, 240), {
    mask_mode: false,
    width: 320,
    height: 240,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#111111",
    stroke_width: 0,
    shadow_enabled: false,
    shadow_color: "#000000",
    shadow_x: 6,
    shadow_y: 6,
    shadow_blur: 4,
    glow_enabled: false,
    glow_color: "#ffffff",
    glow_opacity: 0.75,
    glow_blur: 16,
    glow_spread: 0,
});
assert.deepEqual(
    core.normalizedStyleDefaults({ mask_mode: true, opacity: 2, fill: "#FACC15", stroke_width: 3 }, 320, 240),
    {
        ...core.defaultStyleDefaults(320, 240),
        mask_mode: true,
        opacity: 1,
        fill: "#facc15",
        stroke_width: 3,
    },
);
assert.deepEqual(core.registrationRequestSpec(""), {
    path: "/speech-bubble-forge/user-assets",
    method: "POST",
    replacingImage: false,
});
assert.deepEqual(core.registrationRequestSpec("preset-id"), {
    path: "/speech-bubble-forge/user-assets/preset-id/image",
    method: "PUT",
    replacingImage: true,
});
assert.deepEqual(core.styleShadowDirection(6, 6, -1, 0), { enabled: true, x: -6, y: 0 });
assert.deepEqual(core.styleShadowDirection(12, -8, 1, 1), { enabled: true, x: 12, y: 12 });
assert.deepEqual(core.styleShadowDirection(12, -8, 0, 0), { enabled: false, x: 0, y: 0 });

assert.equal(
    core.canonicalImageDataUrl({ type: "application/octet-stream", name: "sample.webp" }, "data:application/octet-stream;base64,AAAA"),
    "data:image/webp;base64,AAAA",
);

const png = new Blob([Buffer.from("png")], { type: "image/png" });
Object.defineProperty(png, "name", { value: "sample.png" });
assert.equal(core.acceptedImageFile(png), true);
const jpeg = new Blob([Buffer.from("jpg")], { type: "image/jpeg" });
Object.defineProperty(jpeg, "name", { value: "sample.jpg" });
assert.equal(core.acceptedImageFile(jpeg), false);
assert.equal(core.acceptedPreviewBackgroundFile(jpeg), true);
assert.equal(core.previewFitScale(640, 360, 1920, 1080), 1 / 3);
assert.deepEqual(
    core.previewStampRect(640, 360, 1920, 1080, 0.5, 0, 0, 960, 540, 320, 160),
    { x: 240, y: 140, width: 160, height: 80, originX: -160, originY: -90 },
);
assert.doesNotMatch(source, /resizeConfirmed/);
assert.match(source, /speech-bubble-user-editor-layout/);
assert.match(source, /style_defaults: styleDefaultsFromDialog\(dialog\)/);
assert.match(source, /node\.dataset\.speechBubbleSettingKey = key/);
assert.match(source, /root\.querySelector\(`#refresh_\$\{key\}`\)/);
assert.match(source, /node\.dataset\.speechBubbleSettingRefresh = "true"/);
assert.match(source, /--speech-bubble-swatch-color/);
assert.match(source, /data-style-shadow-palette/);
assert.match(source, /data-style-shadow-dir="-1,-1"/);
assert.match(source, /speech-bubble-user-style-mode-row/);
assert.match(source, /speech-bubble-user-style-dimensions/);
assert.match(source, /data-style-glow-enabled/);
assert.match(source, /data-style-glow-palette/);
assert.match(source, /function drawStyleOuterGlow\(/);
assert.match(source, /data-preview-background-mode="transparent"/);
assert.match(source, /data-preview-background-mode="gray"/);
assert.match(source, /PREVIEW_BACKGROUND_KEY/);
assert.match(source, /PREVIEW_CUSTOM_COLOR_KEY/);
assert.match(source, /data-preview-background-choose/);
assert.match(source, /data-preview-background-history-list/);
assert.match(source, /data-preview-area-mode="expanded"/);
assert.match(source, /speech-bubble-user-preview-area-mode/);
assert.doesNotMatch(source, /data-preview-reset-area/);
assert.match(source, /function resetPreviewAreaMode\(dialog\)/);
assert.match(source, /dialog\.classList\.remove\("preview-expanded"\)/);
assert.match(source, /data-preview-view-fit/);
assert.match(source, /data-preview-view-actual/);
assert.match(source, /MAX_PREVIEW_BACKGROUND_HISTORY/);
assert.match(source, /function setPreviewZoomAtPoint\(/);
assert.match(source, /session\.drag\.type === "stamp"/);
assert.match(source, /background\.image/);
assert.match(source, /viewControls\.hidden = !background/);
const thumbnailRenderer = source.match(/function styledPresetThumbnailDataUrl\(preset, image\) \{([\s\S]*?)\n    \}/)?.[1] || "";
const previewRenderer = source.match(/function renderStylePreview\(dialog\) \{([\s\S]*?)\n    \}/)?.[1] || "";
const imageAnalyzer = source.match(/async function analyzeImageFile\(file\) \{([\s\S]*?)\n    \}/)?.[1] || "";
const editAction = source.match(/async function handlePresetAction\(action, preset\) \{([\s\S]*?)\n    \}/)?.[1] || "";
const clearBackgrounds = source.match(/function clearPreviewBackgrounds\(\) \{([\s\S]*?)\n    \}/)?.[1] || "";
assert.doesNotMatch(thumbnailRenderer, /\bbackground\s*\?\s*scale/, "thumbnail renderer must not reference preview-only background state");
assert.match(previewRenderer, /const effectScale = background \? scale : 1;/, "preview renderer must define effectScale locally");
assert.doesNotMatch(imageAnalyzer, /readFileDataUrl/, "initial analysis must not convert the source image to Base64");
assert.match(source, /globalThis\.createImageBitmap\(file\)/);
assert.match(source, /function setDecodedStylePreviewImage\(/);
assert.match(source, /function pendingImageDataUrl\(/);
assert.match(source, /registrationPayload\(conflict, await pendingImageDataUrl\(\)\)/);
assert.match(source, /releasePendingPreviewImage\(state\.pending\)/);
assert.match(editAction, /clearStylePreviewImage\(dialog\);[\s\S]*if \(!dialog\.open\) dialog\.showModal\(\);/);
assert.ok(
    clearBackgrounds.indexOf("renderPreviewBackgroundHistory();") < clearBackgrounds.indexOf("URL.revokeObjectURL(entry.url)"),
    "history UI must be cleared before its object URLs are revoked",
);
assert.match(source, /data-user-manager-archive/);
assert.match(source, /async function organizeUserAssetArchive\(\)/);
assert.match(source, /data-user-dialog-conflict-edit/);
assert.match(source, /function styledPresetThumbnailDataUrl\(preset, image\)/);
assert.match(source, /applyStyledPresetThumbnail\(thumbnail, preset\)/);
assert.match(source, /data-user-edit-save-as>別名で保存/);
assert.match(source, /function prepareAlternateRegistrationName\(dialog\)/);
assert.match(source, /function confirmConflictReplacement\(dialog\)/);
assert.match(source, /async function savePresetAs\(\)/);
assert.doesNotMatch(source, /data-user-dialog-conflict-rename]"\)\.addEventListener\("click", \(\) => submitRegistration\("rename"\)/);
assert.match(source, /if \(target === "fill"\) selectStyleMode\(root, "fill"\)/);
assert.match(source, /input\.matches\("\[data-style-fill\]"\)/);
const exportGroup = source.match(/export:\s*\[([\s\S]*?)\]/)?.[1] || "";
assert.ok(exportGroup.indexOf("speech_bubble_forge_output_format") < exportGroup.indexOf("speech_bubble_forge_png_compression"));
assert.ok(exportGroup.indexOf("speech_bubble_forge_png_compression") < exportGroup.indexOf("speech_bubble_forge_filename_format"));
assert.ok(exportGroup.indexOf("speech_bubble_forge_filename_format") < exportGroup.indexOf("speech_bubble_forge_backup_enabled"));
assert.ok(exportGroup.indexOf("speech_bubble_forge_backup_enabled") < exportGroup.indexOf("speech_bubble_forge_prompt_export_location_v2"));
assert.match(styleSource, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
assert.match(styleSource, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*5\.2rem/);
assert.match(styleSource, /\.speech-bubble-user-editor-controls-column\s*\{[\s\S]*?overflow-y:\s*auto/);
assert.match(styleSource, /data-preview-background="black"/);
assert.match(styleSource, /data-preview-background="gray"/);
assert.match(styleSource, /data-preview-background="custom"/);
assert.match(styleSource, /data-preview-background="image"/);
assert.match(styleSource, /\.preview-expanded \.speech-bubble-user-editor-layout/);
assert.match(styleSource, /\.speech-bubble-user-preview-area-mode button\[aria-pressed="true"\][\s\S]*?#22c55e/);
assert.match(styleSource, /\.speech-bubble-user-preview-history\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(styleSource, /\.speech-bubble-user-preview-view\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(styleSource, /\.speech-bubble-user-dialog-drop\s*\{[\s\S]*?min-height:\s*4\.8rem/);
assert.match(styleSource, /\.preview-expanded \.speech-bubble-user-dialog-drop\s*\{\s*display:\s*none;/);
assert.match(styleSource, /\.speech-bubble-user-direction-pad\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*1rem\)/);
assert.match(styleSource, /\.speech-bubble-user-direction-pad button\s*\{[\s\S]*?width:\s*1rem;[\s\S]*?height:\s*1rem;/);
assert.match(styleSource, /\.speech-bubble-user-editor-preview-column\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/);
assert.match(styleSource, /\.speech-bubble-user-style-preview\s*\{[\s\S]*?flex:\s*0 0 auto;/);
assert.match(styleSource, /\.speech-bubble-user-preview-tools\s*\{[\s\S]*?grid-auto-rows:\s*max-content;/);
assert.match(styleSource, /\.speech-bubble-user-style-mode-row\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\)/);
assert.match(styleSource, /\.speech-bubble-user-style-dimensions\s*\{[\s\S]*?width:\s*min\(15rem,\s*100%\)/);
assert.match(styleSource, /@media \(max-height:\s*900px\)/);

assert.doesNotMatch(
    source,
    /if \(panel\.dataset\.speechBubbleSettingsReady === "1"\) \{\s*updateCatalogUi\(\);/,
    "repeated Forge UI updates must not replace manager cards while an action menu is open",
);

console.log("speech_bubble_settings_core_test: OK");
