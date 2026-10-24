"use strict";
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("project_persistence_browser_smoke: SKIP (playwright unavailable)"); process.exit(0); }

(async () => {
  const server = spawn(process.env.PYTHON || "python", ["-B", "-u", "tests/serve_browser_test.py"], { cwd: path.resolve(__dirname, "..") });
  let browser, page, base, stderr = "";
  server.stderr.on("data", chunk => { stderr += chunk; });
  try {
    const port = await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error(stderr || "API test server timeout")), 30000);
      server.stdout.on("data", chunk => { text += chunk; const found = /SBE_TEST_SERVER=(\d+)/.exec(text); if (found) { clearTimeout(timer); resolve(Number(found[1])); } });
      server.on("exit", code => { clearTimeout(timer); reject(new Error(`API test server exited ${code}: ${stderr}`)); });
    });
    base = `http://127.0.0.1:${port}`;
    console.log(`Persistence test service: pid=${server.pid}, port=${port}, command=python -B -u tests/serve_browser_test.py`);
    browser = await chromium.launch({ headless: true, ...(process.env.SBE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.SBE_CHROMIUM_EXECUTABLE } : {}) });
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    const projectId = "project:88888888-8888-4888-8888-888888888888";
    const endpoint = `${base}/speech-bubble-forge/projects/${encodeURIComponent(projectId)}`;
    const url = `${base}/speech-bubble-forge/static/project-editor.html?host=forge-project&projectId=${projectId}`;
    const ready = () => page.waitForFunction(() => typeof forgeProjectAdapter !== "undefined" && forgeProjectAdapter?.isReady());
    await page.goto(url); await ready();
    const makeFile = async (name, color) => ({ name, mimeType: "image/png", buffer: Buffer.from(await page.evaluate(color => {
      const canvas=document.createElement("canvas"); canvas.width=80; canvas.height=60;
      const ctx=canvas.getContext("2d"); ctx.fillStyle=color; ctx.fillRect(0,0,80,60);
      return canvas.toDataURL().split(",")[1];
    }, color), "base64") });
    const a = await makeFile("A.png", "red"), b = await makeFile("B.png", "blue");
    await page.locator("#backgroundFileInput").setInputFiles(a);
    await page.waitForFunction(() => workspaces.single.elements.some(item => item.type === "image"));
    assert.equal(await page.evaluate(() => forgeProjectAdapter.save()), true);
    const original = (await (await page.request.get(endpoint)).json()).project;
    const aId = original.images[0].id;
    // Existing projects acquire optional rendering defaults on load. Establish
    // that ordinary loaded-project baseline before testing exact discard payloads.
    await page.reload(); await ready();

    // Real tray file input, removal dialog, dirty recomputation and whole-project discard.
    for (const mode of ["shared", "separate"]) {
      await page.evaluate(mode => projectImageTray.applySettings({ mode }), mode);
      assert.equal(await page.evaluate(() => forgeProjectAdapter.save()), true);
      const saved = await page.evaluate(() => ({ layout: JSON.parse(currentLayoutJson()), trays: projectImageTray.serialize(), ids: forgeProjectAdapter.manifest().images.map(item => item.id) }));
      await page.locator("[data-project-tray-file]").setInputFiles(b);
      await page.waitForFunction(() => projectImageTray.imageIds().length === 2 && layoutDirty);
      assert.equal(await page.evaluate(() => { refreshDirtyState(); markLayoutDirty(); return layoutDirty; }), true, "layout comparison must not hide tray-only edits");
      await page.locator("#discardChanges").click(); await ready();
      assert.deepEqual(await page.evaluate(() => projectImageTray.serialize()), saved.trays);
      assert.equal(await page.evaluate(() => forgeProjectAdapter.hasUnsavedChanges()), false);
      // The unused B upload must not leak into the next save.
      assert.equal(await page.evaluate(() => forgeProjectAdapter.save()), true);
      let manifest = (await (await page.request.get(endpoint)).json()).project;
      assert.deepEqual(manifest.layout, saved.layout); assert.deepEqual(manifest.image_trays, saved.trays);
      assert.deepEqual(manifest.images.map(item => item.id), saved.ids);
      await page.locator(".project-image-tray").evaluate(node => node.classList.remove("collapsed"));
      await page.locator(`[data-project-image-id="${aId}"] [data-project-tray-remove]`).click();
      await page.locator('.project-image-tray-dialog [value="remove"]').click();
      await page.waitForFunction(() => projectImageTray.imageIds().length === 0);
      await page.locator("#discardChanges").click(); await ready();
      assert.deepEqual(await page.evaluate(() => projectImageTray.serialize()), saved.trays);
      assert.equal(await page.evaluate(() => workspaces.single.elements.filter(item => item.type === "image").length), 1);
    }
    // An in-flight PUT cannot race a discard and later resurrect discarded data.
    let release, intercepted;
    const blocked = new Promise(resolve => { intercepted = resolve; });
    const hold = new Promise(resolve => { release = resolve; });
    await page.route("**/projects/*", async route => {
      if (route.request().method() === "PUT") { intercepted(); await hold; }
      await route.continue();
    });
    await page.evaluate(() => { window.persistenceSave = forgeProjectAdapter.save(); });
    await blocked;
    assert.equal(await page.evaluate(() => forgeProjectAdapter.discard()), false);
    release(); assert.equal(await page.evaluate(() => window.persistenceSave), true);
    await page.unroute("**/projects/*");

    // A transient asset failure or corrupt image must not allow a PUT; retry restores the project.
    for (const failure of ["503", "decode", "schema"]) {
      const before = (await page.request.get(endpoint)).text();
      const beforeText = await before;
      let puts = 0;
      const onRequest = request => { if (request.method() === "PUT" && request.url() === endpoint) puts++; };
      page.on("request", onRequest);
      if (failure === "schema") await page.route("**/projects/*", async route => {
        const response = await route.fetch(); const payload = await response.json(); payload.project.layout.version = 999;
        await route.fulfill({ response, json: payload });
      });
      else await page.route("**/projects/*/images/*", route => route.fulfill({ status: failure === "503" ? 503 : 200, contentType: "image/png", body: "not an image" }));
      await page.reload();
      await page.locator("[data-forge-project-retry]").waitFor({ state: "visible" });
      assert.equal(await page.locator("[data-forge-project-save]").isDisabled(), true);
      assert.equal(await page.evaluate(() => document.querySelector(".layout").inert), true);
      assert.equal(await page.evaluate(() => forgeProjectAdapter.save()), false);
      await page.keyboard.press("Control+s");
      assert.equal(puts, 0, "failed initial restore must never PUT");
      assert.equal(await (await page.request.get(endpoint)).text(), beforeText);
      await page.unroute(failure === "schema" ? "**/projects/*" : "**/projects/*/images/*");
      await page.locator("[data-forge-project-retry]").click(); await ready();
      assert.equal(await page.evaluate(() => forgeProjectAdapter.save()), true);
      assert.equal(await page.evaluate(() => workspaces.single.elements.filter(item => item.type === "image").length), 1);
      page.off("request", onRequest);
    }
    // Exercise the browser's actual FileSystemDirectoryHandle/write/close API
    // in origin-private storage. No user-selected disk directory is touched.
    const nativeFiles = await page.evaluate(async () => {
      const root=await navigator.storage.getDirectory(),folderName="sbe-review-export";
      const folder=await root.getDirectoryHandle(folderName,{create:true});
      const read=async name=>(await (await folder.getFileHandle(name)).getFile()).text();
      const snapshot=async()=>{const values={};for await(const [name,handle] of folder.entries())if(handle.kind==="file")values[name]=await (await handle.getFile()).text();return values;};
      filenameFormat="source_only";dateSubfolder="none";backupEnabled=true;backupGenerations=2;
      try{
        await writeDirectoryFile(folder,"native.png",new Blob(["OLD_MAIN"]));
        await writeDirectoryFile(folder,"native_overlay.png",new Blob(["OLD_OVERLAY"]));
        await writeDirectoryFile(folder,"native_backup_01.png",new Blob(["OLDER_MAIN"]));
        const before=await snapshot(),canvas=document.createElement("canvas");canvas.width=4;canvas.height=3;
        const data=canvas.toDataURL(),payload={filename:"native.png",download_url:data,save_overlay:true,overlay_download_url:data};
        let downloadFailed=false;try{await saveClientExport(folder,{...payload,overlay_download_url:"/missing-overlay"});}catch{downloadFailed=true;}
        const afterDownload=await snapshot();
        let failOnce=true;
        const wrapped={
          entries:()=>folder.entries(),getDirectoryHandle:(...args)=>folder.getDirectoryHandle(...args),removeEntry:(...args)=>folder.removeEntry(...args),
          getFileHandle:async(name,...args)=>{
            const handle=await folder.getFileHandle(name,...args);
            if(name!=="native_overlay.png")return handle;
            return{getFile:()=>handle.getFile(),createWritable:async()=>{
              const writable=await handle.createWritable();
              return{write:value=>writable.write(value),abort:()=>writable.abort(),close:async()=>{await writable.close();if(failOnce){failOnce=false;throw new Error("Injected native close failure");}}};
            }};
          },
        };
        let writeFailed=false;try{await saveClientExport(wrapped,payload);}catch{writeFailed=true;}
        const afterWrite=await snapshot();
        await saveClientExport(folder,payload);
        const success={main:(await (await folder.getFileHandle("native.png")).getFile()).size,overlay:(await (await folder.getFileHandle("native_overlay.png")).getFile()).size,backup:await read("native_backup_01.png")};
        const remaining=[];for await(const [name] of folder.entries())if(name.startsWith(".sbe-recovery-"))remaining.push(name);
        return{before,afterDownload,afterWrite,downloadFailed,writeFailed,success,remaining};
      }finally{await root.removeEntry(folderName,{recursive:true});}
    });
    assert.equal(nativeFiles.downloadFailed,true);assert.equal(nativeFiles.writeFailed,true);
    assert.deepEqual(nativeFiles.afterDownload,nativeFiles.before);assert.deepEqual(nativeFiles.afterWrite,nativeFiles.before);
    assert.ok(nativeFiles.success.main>8&&nativeFiles.success.overlay>8);assert.equal(nativeFiles.success.backup,"OLD_MAIN");assert.deepEqual(nativeFiles.remaining,[]);
    // The export action's finally block must keep an actionable rollback error
    // visible rather than replacing it with the ordinary saved/dirty status.
    const failureStatus=await page.evaluate(async()=>{
      const previous={save:saveClientExport,picker:window.showDirectoryPicker,prompt:promptExportLocation,remember:rememberExportDirectory};
      try{
        promptExportLocation=true;rememberExportDirectory=false;
        window.showDirectoryPicker=async()=>({kind:"directory"});
        saveClientExport=async()=>{throw new Error("Some files could not be restored. Old copies for recovery: .sbe-recovery-ui-test\nnative.png");};
        await exportImage();
        updateActionState();refreshDirtyState();
        SpeechBubbleForgeProjectSettings.set({language:"ja"});
        SpeechBubbleForgeProjectSettings.set({language:"en"});
        const node=document.getElementById("saveState");
        return{message:node.textContent,title:node.title,level:node.dataset.level,enabled:!document.getElementById("exportImage").disabled};
      }finally{saveClientExport=previous.save;window.showDirectoryPicker=previous.picker;promptExportLocation=previous.prompt;rememberExportDirectory=previous.remember;}
    });
    assert.equal(failureStatus.level,"error");assert.equal(failureStatus.enabled,true);
    assert.match(failureStatus.message,/sbe-recovery-ui-test/);assert.match(failureStatus.title,/native.png/);
    // Placeholder metadata must preserve layer/tray IDs and remain savable.
    await page.route("**/projects/*", async route=>{
      if(route.request().method()!=="GET")return route.continue();
      const response=await route.fetch(),payload=await response.json();
      payload.project.images[0].missing=true;payload.project.images[0].missing_reason="registry";
      payload.project.repair_warnings=["Missing registry entry retained"];
      await route.fulfill({response,json:payload});
    });
    await page.reload();await ready();
    assert.equal(await page.evaluate(()=>singleImageAssets.size),0);
    assert.equal(await page.evaluate(()=>workspaces.single.elements.filter(item=>item.type==="image").length),1);
    assert.match(await page.locator(".project-image-tray-list").textContent(),/Missing image/);
    // Deferred layout/font refreshes must not replace the adapter warning.
    await page.evaluate(()=>{updateActionState();refreshDirtyState();});
    assert.match(await page.locator("#saveState").textContent(),/missing image reference/);
    await page.evaluate(()=>SpeechBubbleForgeProjectSettings.set({language:"ja"}));
    assert.match(await page.locator("#saveState").textContent(),/欠損画像/);
    await page.evaluate(()=>SpeechBubbleForgeProjectSettings.set({language:"en"}));
    assert.match(await page.locator("#saveState").textContent(),/missing image reference/);
    assert.equal(await page.evaluate(()=>forgeProjectAdapter.save()),true);
    await page.unroute("**/projects/*");
    assert.deepEqual(errors, []);
    fs.mkdirSync("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/review-five-browser.png" });
    console.log("project_persistence_browser_smoke: OK (shared/separate tray discard, saved payload, pending save, 503/decode/schema retry, native file API rollback, retained error status, missing placeholders)");
  } catch (error) {
    if (page) await page.screenshot({ path: "artifacts/review-five-browser-failure.png" }).catch(() => {});
    throw error;
  } finally {
    await browser?.close();
    if (server.exitCode === null) { const ended = new Promise(resolve => server.once("exit", resolve)); server.kill(); await ended; }
    if (base) { await assert.rejects(fetch(base)); console.log("Persistence test service stopped: process exited and HTTP unavailable"); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
