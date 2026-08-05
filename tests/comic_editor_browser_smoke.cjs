const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.log("comic_editor_browser_smoke: SKIP (playwright unavailable)");
  process.exit(0);
}

const webRoot = path.resolve(__dirname, "..", "web");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  const requested = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relative = requested === "/" ? "speech-bubble-editor.html" : requested.replace(/^\/+/, "");
  const target = path.resolve(webRoot, relative);
  if (!target.startsWith(webRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime[path.extname(target)] || "application/octet-stream" });
  fs.createReadStream(target).pipe(response);
});

function leafCount(node) {
  return node?.kind === "split" ? leafCount(node.first) + leafCount(node.second) : 1;
}

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
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/speech-bubble-editor.html?host=forge&mode=standalone`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector('[data-comic-mode="panels"]');
  assert.equal(await page.locator(".comic-mode-toggle button").count(), 3);
  await page.locator('[data-comic-mode="panels"]').click();
  const trayState = await page.locator(".comic-image-tray").evaluate((element) => ({
    hidden: element.hidden,
    display: getComputedStyle(element).display,
    rect: element.getBoundingClientRect().toJSON(),
  }));
  const afterModeClick = await page.evaluate(() => JSON.parse(currentLayoutJson()));
  assert.equal(trayState.hidden, false, JSON.stringify({ trayState, afterModeClick, pageErrors }));
  assert.equal(await page.locator(".comic-panel-tools").isVisible(), true);
  await page.locator('[data-comic-template="vertical_four"]').click();
  const enabledLayout = await page.evaluate(() => JSON.parse(currentLayoutJson()));
  assert.equal(enabledLayout.comic.enabled, true);
  assert.equal(leafCount(enabledLayout.comic.tree), 4);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAf4mZ5QAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator("[data-comic-image-input]").setInputFiles({
    name: "panel-test.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.waitForSelector(".comic-image-card");
  await page.locator(".comic-image-card").click();
  const imageLayout = await page.evaluate(() => JSON.parse(currentLayoutJson()));
  const firstPanel = (() => {
    let node = imageLayout.comic.tree;
    while (node.kind === "split") node = node.first;
    return node;
  })();
  assert.match(firstPanel.image_id, /^image-/);
  await page.locator('[data-comic-mode="single"]').click();
  const disabledLayout = await page.evaluate(() => JSON.parse(currentLayoutJson()));
  assert.equal(disabledLayout.comic.enabled, false);
  assert.deepEqual(pageErrors, []);
  } finally {
  await browser.close();
  server.close();
  }
  console.log("comic_editor_browser_smoke: OK");
})().catch((error) => {
  server.close();
  console.error(error);
  process.exitCode = 1;
});
