"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("quick_retouch_browser_smoke: SKIP (playwright unavailable)");
  process.exit(0);
}

const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};

const server = http.createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\/+/, "");
  const target = path.resolve(root, relative || "tests/quick_retouch_browser_harness.html");
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
  fs.createReadStream(target).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (!/Executable doesn't exist/i.test(String(error?.message || error))) throw error;
    browser = await chromium.launch({ headless: true, channel: "chrome" });
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/quick_retouch_browser_harness.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__ready === true);
    await page.locator("[data-quick-retouch-open]").click();
    await page.waitForSelector("dialog.quick-retouch-dialog[open]");
    await page.waitForFunction(() => document.querySelector("[data-retouch-result]")?.width > 1);
    await page.waitForFunction(() => document.querySelectorAll("[data-retouch-layer-id]").length === 1);
    assert.equal(await page.locator("[data-retouch-layer-id]").count(), 1);
    assert.equal(await page.locator('[data-retouch-tool="brush"].active').count(), 1);
    assert.equal(await page.locator('[data-retouch-panel]').count(), 3);
    assert.equal(await page.locator('[data-retouch-original]').isHidden(), true);
    assert.equal(await page.locator('[data-retouch-tool-options] [data-tool-setting="brushSize"]').count(), 1);

    const result = page.locator('[data-retouch-result]');
    const box = await result.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(40);
    const brushRing = page.locator('.quick-retouch-brush-ring');
    assert.match(await brushRing.getAttribute('class'), /visible/);
    const ringBox = await brushRing.boundingBox();
    const initialBrushSize = Number(await page.locator('[data-tool-setting="brushSize"]').inputValue());
    assert.ok(Math.abs(ringBox.width - initialBrushSize / 96 * box.width) < 1.5);

    await page.keyboard.down('Alt');
    await page.waitForTimeout(20);
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'eyedropper-temporary');
    assert.doesNotMatch(await brushRing.getAttribute('class'), /visible/);
    await page.keyboard.up('Alt');
    await result.dispatchEvent('pointerdown', { button: 2, pointerId: 44, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
    await result.dispatchEvent('pointermove', { buttons: 2, pointerId: 44, clientX: box.x + box.width / 2 + 35, clientY: box.y + box.height / 2 });
    await result.dispatchEvent('pointerup', { button: 2, pointerId: 44, clientX: box.x + box.width / 2 + 35, clientY: box.y + box.height / 2 });
    assert.ok(Number(await page.locator('[data-tool-setting="brushSize"]').inputValue()) > 40);
    assert.equal(await page.locator('.quick-retouch-brush-ring.resizing').count(), 0);

    await page.keyboard.press('Control+A');
    await page.waitForFunction(() => document.querySelector('[data-retouch-selection-panel] strong')?.textContent.includes('選択範囲あり'));
    await page.keyboard.press('Control+D');
    await page.waitForFunction(() => document.querySelector('[data-retouch-selection-panel] strong')?.textContent.includes('選択範囲なし'));
    await page.keyboard.press('Control+Shift+D');
    await page.waitForFunction(() => document.querySelector('[data-retouch-selection-panel] strong')?.textContent.includes('選択範囲あり'));
    await page.keyboard.press('Control+D');

    const widthBeforeWheel = await page.locator('[data-retouch-stage]').evaluate((node) => node.getBoundingClientRect().width);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -240);
    const widthAfterWheel = await page.locator('[data-retouch-stage]').evaluate((node) => node.getBoundingClientRect().width);
    assert.ok(widthAfterWheel > widthBeforeWheel);

    await page.locator('[data-retouch-tool="wand"]').click();
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'wand');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(20);
    assert.equal(await page.locator('[data-selection-operation="add"]').getAttribute('class'), 'active temporary');
    await page.keyboard.down('Alt');
    await page.waitForTimeout(20);
    assert.equal(await page.locator('[data-selection-operation="intersect"]').getAttribute('class'), 'active temporary');
    await page.keyboard.up('Alt');
    await page.keyboard.up('Shift');

    await page.locator('[data-retouch-tool="color_range"]').click();
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'color-range-replace');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(20);
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'color-range-add');
    await page.keyboard.up('Shift');
    await page.keyboard.down('Alt');
    await page.waitForTimeout(20);
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'color-range-exclude');
    await page.keyboard.up('Alt');

    await page.locator('[data-retouch-tool="eraser"]').click();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(30);
    assert.match(await brushRing.getAttribute('class'), /eraser/);

    await page.locator('[data-retouch-tool="hand"]').click();
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'hand');
    await page.locator('[data-retouch-tool="zoom"]').click();
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'zoom');

    await result.dispatchEvent('pointerdown', { button: 1, buttons: 4, pointerId: 46, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });
    assert.equal(await page.locator('[data-retouch-stage]').getAttribute('data-cursor-tool'), 'panning');
    await result.dispatchEvent('pointerup', { button: 1, pointerId: 46, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 });

    await page.locator('[data-retouch-tool="lasso"]').click();
    await result.dispatchEvent('pointerdown', { button: 0, pointerId: 45, clientX: box.x + box.width * 0.2, clientY: box.y + box.height * 0.2 });
    for (const [x, y] of [[0.55,0.2],[0.55,0.55],[0.2,0.55],[0.2,0.2]]) {
      await result.dispatchEvent('pointermove', { buttons: 1, pointerId: 45, clientX: box.x + box.width * x, clientY: box.y + box.height * y });
    }
    await result.dispatchEvent('pointerup', { button: 0, pointerId: 45, clientX: box.x + box.width * 0.2, clientY: box.y + box.height * 0.2 });
    await page.waitForFunction(() => document.querySelector('[data-retouch-selection-panel] strong')?.textContent.includes('選択範囲あり'));

    await page.locator("[data-retouch-add='curves']").click();
    await page.locator("[data-retouch-curve-preset]").selectOption("contrast");
    await page.locator("[data-retouch-action='apply']").click();
    await page.waitForFunction(() => Boolean(window.__applied));
    const applied = await page.evaluate(() => window.__applied);
    assert.equal(applied.type, "image/png");
    assert.ok(applied.size > 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__errors), []);
  } finally {
    await browser.close();
    server.close();
  }
  console.log("quick_retouch_browser_smoke: OK");
})().catch((error) => {
  server.close();
  console.error(error);
  process.exitCode = 1;
});
