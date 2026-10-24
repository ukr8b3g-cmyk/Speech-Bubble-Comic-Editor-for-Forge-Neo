"use strict";
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("project_editor_browser_smoke: SKIP (playwright unavailable)"); process.exit(0); }
(async () => {
  const server = spawn(process.env.PYTHON || "python", ["-u", "tests/serve_browser_test.py"], { cwd: path.resolve(__dirname, "..") });
  let browser;
  let page;
  let errors = "";
  server.stderr.on("data", data => { errors += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error("API test server timeout: " + errors)), 30000);
      server.stdout.on("data", chunk => { text += chunk; const found = /SBE_TEST_SERVER=(\d+)/.exec(text); if (found) { clearTimeout(timer); resolve(Number(found[1])); } });
      server.on("exit", code => { clearTimeout(timer); reject(new Error(`API test server exited ${code}: ${errors}`)); });
    });
    browser = await chromium.launch({ headless: true, ...(process.env.SBE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SBE_CHROMIUM_EXECUTABLE } : {}) });
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const pageErrors = [];
    const dialogs = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("dialog", dialog => { dialogs.push(dialog.message()); return dialog.accept(); });
    const projectId = "project:22222222-2222-4222-8222-222222222222";
    const base = `http://127.0.0.1:${port}`;
    const url = `${base}/speech-bubble-forge/static/project-editor.html?host=forge-project&projectId=${projectId}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // The manifest is assigned before async asset restoration; status text can
    // then change to the empty-canvas hint, so wait on completed layout state.
    await page.waitForFunction(() => typeof forgeProjectAdapter !== "undefined" && forgeProjectAdapter?.manifest() && hasExplicitSavedLayout && dirtyTrackingEnabled);
    assert.equal(await page.locator("button[data-editor-mode]").count(), 3);
    await page.waitForFunction(() => SFX_PRESETS.length === 286 && DYNAMIC_SFX_PRESETS.length > 0);
    assert.equal(await page.locator("body > header > strong").textContent(), "Comic Panel Editor 1.1.0");
    assert.ok((await page.title()).endsWith("Comic Panel Editor 1.1.0"));
    assert.equal((await (await page.request.get(`${base}/speech-bubble-forge/config`)).json()).version, "1.1.0");
    assert.equal(await page.evaluate(() => SpeechBubbleQuickRetouch.version), "1.1.0");
    const cjk = /[\u3040-\u30ff\u3400-\u9fff]/;
    // Real API catalog overlays the bundled presets; all display names must survive it.
    const counts = await page.evaluate(() => ({
      sfx: sfxPresetsForMode("sfx").length, stamps: sfxPresetsForMode("stamps").length,
      missing: SFX_PRESETS.filter(p => /[\u3040-\u30ff\u3400-\u9fff]/.test(sfxDisplayLabel(p))).map(p => p.id),
    }));
    assert.deepEqual(counts, {sfx: 190, stamps: 94, missing: []});
    await page.locator("#openShapeDrawer").click();
    assert.equal(await page.locator("#userPresetSection .sfx-library-empty").textContent(), "Choose and edit a built-in bubble, then save it as a user preset in Properties.");
    await page.evaluate(() => SpeechBubbleForgeProjectSettings.set({language: "ja"}));
    await page.evaluate(() => forgeProjectAdapter.markDirty());
    assert.match(await page.locator("#userPresetSection .sfx-library-empty").textContent(), /ユーザープリセット/);
    await page.evaluate(() => SpeechBubbleForgeProjectSettings.set({language: "en"}));
    assert.doesNotMatch(await page.locator("#userPresetSection .sfx-library-empty").textContent(), cjk);
    await page.locator("#closeShapeDrawer").click();
    await page.locator("#openSfxDrawer").click();
    await page.locator("#sfxSort").selectOption("name");
    const labels = await page.locator("#allSfx button[data-sfx] .shape-name").allTextContents();
    assert.equal(labels.length, 190);
    for (let i = 1; i < labels.length; i++) assert.ok(labels[i - 1].localeCompare(labels[i], "en") <= 0);
    for (const query of ["ドン", "Don! (Impact)"]) {
      await page.locator("#sfxSearch").fill(query);
      assert.equal(await page.locator('#allSfx button[data-sfx="don-exclamation-mask"]').isVisible(), true);
    }
    await page.locator("#sfxSearch").fill("");
    const don = page.locator('#allSfx button[data-sfx="don-exclamation-mask"]');
    assert.match(await don.getAttribute("title"), /^Don! \(Impact\)/);
    assert.match(await don.getAttribute("aria-label"), /^Don! \(Impact\)/);
    await don.locator(".asset-favorite").click();
    assert.equal(await page.locator('#quickSfx button[data-sfx="don-exclamation-mask"] .shape-name').textContent(), "Don! (Impact)");
    assert.equal(await don.locator(".asset-favorite").getAttribute("aria-label"), "Remove Don! (Impact) from favorites");
    await don.click();
    await page.evaluate(() => SpeechBubbleForgeProjectSettings.set({language: "ja"}));
    assert.equal(await page.evaluate(() => builtinAssetDisplayLabel(state.elements.find(p => p.asset_id === "don-exclamation-mask"))), "ドン！");
    assert.match(await page.locator('#quickSfx button[data-sfx="don-exclamation-mask"] .asset-favorite').getAttribute("aria-label"), /ドン！/);
    await page.evaluate(() => SpeechBubbleForgeProjectSettings.set({language: "en"}));
    assert.equal(await page.evaluate(() => builtinAssetDisplayLabel(state.elements.find(p => p.asset_id === "don-exclamation-mask"))), "Don! (Impact)");
    assert.equal(await page.evaluate(() => state.elements.find(p => p.asset_id === "don-exclamation-mask").asset_label), "ドン！");
    await page.locator("#closeSfxDrawer").click();
    await page.locator("#openStampDrawer").click();
    assert.equal(await page.locator("#allSfx button[data-sfx]").count(), 94);
    assert.doesNotMatch((await page.locator("#allSfx .shape-name").allTextContents()).join(" "), cjk);
    await page.locator("#closeSfxDrawer").click();
    const untranslated = await page.evaluate(() => {
      const result = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        if (!p || !p.getClientRects().length || p.closest("script,style,.layers,.font-sample")) continue;
        if (/[\u3040-\u30ff\u3400-\u9fff]/.test(n.nodeValue)) result.push(n.nodeValue.trim());
      }
      return result;
    });
    assert.deepEqual(untranslated, [], "Visible English editor chrome contains Japanese");
    // User text/names are data, including Japanese text while the UI is English.
    await page.evaluate(() => {
      const custom = defaultSfx("ban-mask"); custom.asset_label = "手入力の素材名";
      state.elements.push(custom); addTextLayer();
      state.elements.find(p => p.type === "text").text = "私のセリフ";
      render();
    });
    assert.equal(await page.evaluate(() => builtinAssetDisplayLabel(state.elements.find(p => p.asset_id === "ban-mask"))), "手入力の素材名");
    const png = await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 160; c.height = 120; const x = c.getContext("2d"); x.fillStyle = "#345678"; x.fillRect(0, 0, 160, 120); return c.toDataURL().split(",")[1]; });
    await page.locator("#backgroundFileInput").setInputFiles({ name: "smoke.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await page.waitForFunction(() => state.elements.some(item => item.type === "image"));
    await page.locator("#editImageCrop").click();
    assert.equal(await page.locator("#imageCropToolbar").isVisible(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#imageCropToolbar").isVisible(), false);
    for (const mode of ["comic", "comic_layout", "single"]) {
      await page.locator(`button[data-editor-mode="${mode}"]`).click();
      await page.waitForFunction(mode => activeWorkspace === mode, mode);
    }
    await page.locator("#saveLayout").click();
    await page.waitForFunction(() => !forgeProjectAdapter.hasUnsavedChanges() && forgeProjectAdapter.manifest().images.length === 1);
    const saved = await (await page.request.get(`${base}/speech-bubble-forge/projects/${encodeURIComponent(projectId)}`)).json();
    assert.equal(saved.project.images.length, 1);
    assert.ok(JSON.stringify(saved.project.layout).includes("手入力の素材名"));
    assert.ok(JSON.stringify(saved.project.layout).includes("私のセリフ"));
    assert.ok(JSON.stringify(saved.project.layout).includes("ドン！"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof forgeProjectAdapter !== "undefined" && forgeProjectAdapter?.manifest()?.images.length === 1 && hasExplicitSavedLayout && dirtyTrackingEnabled);
    assert.equal(await page.evaluate(() => state.elements.filter(item => item.type === "image").length), 1);
    await page.waitForFunction(() => DYNAMIC_SFX_PRESETS.length > 0 && deferredResourcesStarted && (fontCatalog.length > 0 || fontCatalogErrorKind));
    assert.equal(await page.evaluate(() => state.elements.find(p => p.type === "text").text), "私のセリフ");
    await page.route("**/fonts?*", route => route.fulfill({status: 500, contentType: "application/json", body: "{}"}));
    const englishFontFailure = await page.evaluate(async () => {
      await loadSystemFonts();
      return {language: document.documentElement.lang, kind: fontCatalogErrorKind, html: document.getElementById("fontList").textContent.slice(0,200), families: fontFamilies.length};
    });
    assert.equal(englishFontFailure.kind, "failed", JSON.stringify(englishFontFailure));
    assert.match(englishFontFailure.html, /System fonts could not be loaded/, JSON.stringify(englishFontFailure));
    assert.equal(await page.locator("#fontList .font-family-select").textContent(), "System fonts could not be loaded. — Retry");
    const fontFailure = await page.evaluate(async () => {
      SpeechBubbleForgeProjectSettings.set({language: "ja"}); await loadSystemFonts();
      return {language: document.documentElement.lang, kind: fontCatalogErrorKind, html: document.getElementById("fontList").textContent.slice(0,200)};
    });
    assert.equal(fontFailure.language, "ja", JSON.stringify(fontFailure));
    assert.equal(fontFailure.kind, "failed", JSON.stringify(fontFailure));
    assert.match(await page.locator("#fontList .font-family-select").textContent(), /システムフォントを読み込めませんでした/);
    await page.evaluate(() => SpeechBubbleForgeProjectSettings.set({language: "en"}));
    await page.unroute("**/fonts?*");
    assert.equal(await page.evaluate(() => state.elements.find(p => p.asset_id === "ban-mask").asset_label), "手入力の素材名");
    assert.equal(await page.evaluate(() => builtinAssetDisplayLabel(state.elements.find(p => p.asset_id === "don-exclamation-mask"))), "Don! (Impact)");
    await page.waitForFunction(() => state.elements.filter(p => p.type === "sfx").every(p => { const image = sfxImageFor(p); return image?.complete && image.naturalWidth; }));
    const exportResponse = page.waitForResponse(r => r.url().endsWith("/speech-bubble-forge/export") && r.request().method() === "POST");
    await page.locator("#exportImage").click();
    const exported = await (await exportResponse).json();
    assert.equal(exported.ok, true);
    const output = await page.request.get(base + exported.download_url);
    assert.equal(output.status(), 200);
    const bytes = await output.body();
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    fs.mkdirSync("artifacts", { recursive: true });
    fs.writeFileSync("artifacts/project-editor-export.png", bytes);
    await page.waitForFunction(() => document.getElementById("saveState").textContent.startsWith("Export complete"));
    assert.doesNotMatch(await page.locator("#saveState").getAttribute("title"), cjk);
    // Failed saves render the known server error in the current UI language.
    await page.route("**/speech-bubble-forge/projects/*", route => route.request().method() === "PUT"
      ? route.fulfill({status: 400, contentType: "application/json", body: JSON.stringify({detail: "出力フォルダーが存在しません。"})})
      : route.continue());
    await page.locator("#saveLayout").click();
    await page.waitForFunction(() => document.getElementById("saveState").dataset.level === "error");
    assert.equal(await page.locator("#saveState").textContent(), "The output folder does not exist.");
    await page.unroute("**/speech-bubble-forge/projects/*");
    await page.evaluate(() => { pushUndo(); state.elements.find(p => p.type === "text").text += "追加"; render(); });
    await page.locator("#discardChanges").click();
    assert.equal(dialogs.at(-1), "Discard unsaved changes and restore the last saved layout?");
    await page.waitForFunction(() => forgeProjectAdapter.isReady() && state.elements.find(p => p.type === "text").text === "私のセリフ");
    assert.equal(await page.evaluate(() => state.elements.find(p => p.type === "text").text), "私のセリフ");
    assert.deepEqual(pageErrors, []);
    fs.mkdirSync("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/project-editor-smoke.png" });
    console.log("project_editor_browser_smoke: OK (real API, bilingual assets/help/search/favorites, three modes, crop, save/reload, PNG, save/font errors, discard)");
  } catch (error) {
    if (page) {
      fs.mkdirSync("artifacts", { recursive: true });
      await page.screenshot({ path: "artifacts/project-editor-failure.png" }).catch(() => {});
      fs.writeFileSync("artifacts/project-editor-failure.html", await page.content().catch(() => ""));
    }
    throw error;
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
