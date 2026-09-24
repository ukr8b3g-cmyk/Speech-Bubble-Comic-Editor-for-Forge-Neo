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
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    const projectId = "project:22222222-2222-4222-8222-222222222222";
    const base = `http://127.0.0.1:${port}`;
    const url = `${base}/speech-bubble-forge/static/project-editor.html?host=forge-project&projectId=${projectId}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // The manifest is assigned before async asset restoration; status text can
    // then change to the empty-canvas hint, so wait on completed layout state.
    await page.waitForFunction(() => typeof forgeProjectAdapter !== "undefined" && forgeProjectAdapter?.manifest() && hasExplicitSavedLayout && dirtyTrackingEnabled);
    assert.equal(await page.locator("button[data-editor-mode]").count(), 3);
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof forgeProjectAdapter !== "undefined" && forgeProjectAdapter?.manifest()?.images.length === 1 && hasExplicitSavedLayout && dirtyTrackingEnabled);
    assert.equal(await page.evaluate(() => state.elements.filter(item => item.type === "image").length), 1);
    assert.deepEqual(pageErrors, []);
    fs.mkdirSync("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/project-editor-smoke.png" });
    console.log("project_editor_browser_smoke: OK (real API, three modes, crop entry/cancel, image save/reload)");
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
