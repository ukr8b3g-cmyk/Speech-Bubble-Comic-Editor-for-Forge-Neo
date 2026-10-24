"use strict";
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
let chromium;
try { ({ chromium } = require("playwright")); }
catch { console.log("manga_finish_browser_smoke: SKIP (playwright unavailable)"); process.exit(0); }

(async () => {
  const server = spawn(process.env.PYTHON || "python", ["-B", "-u", "tests/serve_browser_test.py"], { cwd: path.resolve(__dirname, "..") });
  let browser, page, base;
  let serverErrors = "";
  server.stderr.on("data", data => { serverErrors += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      let text = "";
      const timer = setTimeout(() => reject(new Error("API test server timeout: " + serverErrors)), 30000);
      server.stdout.on("data", chunk => { text += chunk; const match = /SBE_TEST_SERVER=(\d+)/.exec(text); if(match){clearTimeout(timer);resolve(Number(match[1]));} });
      server.on("exit", code => {clearTimeout(timer);reject(new Error(`Server exited ${code}: ${serverErrors}`));});
    });
    base = `http://127.0.0.1:${port}`;
    console.log(`Manga test service: pid=${server.pid}, port=${port}, command=python -B -u tests/serve_browser_test.py`);
    try { browser = await chromium.launch({headless:true,...(process.env.SBE_CHROMIUM_EXECUTABLE ? {executablePath:process.env.SBE_CHROMIUM_EXECUTABLE} : {})}); }
    catch(error) { if(!/Executable doesn't exist/.test(error.message))throw error;browser=await chromium.launch({headless:true,channel:"chrome"}); }
    page = await browser.newPage({viewport:{width:1600,height:1000}});
    page.setDefaultTimeout(30000);
    const errors = [];
    const requests = [];
    page.on("pageerror",error=>errors.push(error.message));
    page.on("request",request=>{if(request.url().includes('/comic-conversion/manga-finish'))requests.push(request.url());});
    page.on("dialog",dialog=>dialog.accept());
    const projectId = "project:77777777-7777-4777-8777-777777777777";
    await page.goto(`${base}/speech-bubble-forge/static/project-editor.html?host=forge-project&projectId=${projectId}`);
    await page.waitForFunction(()=>typeof forgeProjectAdapter!=="undefined"&&forgeProjectAdapter?.manifest()&&hasExplicitSavedLayout&&dirtyTrackingEnabled);
    const png = Buffer.from(await page.evaluate(()=>{
      const c=document.createElement('canvas');c.width=820;c.height=780;const x=c.getContext('2d');
      const g=x.createLinearGradient(0,0,820,780);g.addColorStop(0,'#183349');g.addColorStop(.5,'#e4b48c');g.addColorStop(1,'#ffffff');
      x.fillStyle=g;x.fillRect(0,0,820,780);x.strokeStyle='#101010';x.lineWidth=9;x.strokeRect(65,55,680,650);
      x.fillStyle='#333';x.font='bold 50px sans-serif';x.fillText('Manga Finish',110,160);x.clearRect(0,0,20,20);
      return c.toDataURL().split(',')[1];
    }),'base64');
    const file={name:'synthetic-manga.png',mimeType:'image/png',buffer:png};
    await page.locator('#backgroundFileInput').setInputFiles(file);
    await page.waitForFunction(()=>state.elements.filter(x=>x.type==='image').length===1);
    const initialId=await page.evaluate(()=>state.elements.find(x=>x.type==='image').id);
    const dialog=page.locator('dialog.comic-converter-dialog');
    const apply=dialog.locator('[data-converter-action="apply"]');
    const mode=dialog.locator('[data-converter-preset]');
    const preset=dialog.locator('[data-manga-preset]');
    const ready=()=>page.waitForFunction(()=>{
      const d=document.querySelector('dialog.comic-converter-dialog');
      return d.open&&!d.querySelector('[data-converter-action="apply"]').disabled;
    });
    const open=async()=>{await page.evaluate(()=>initializeComicConverter().open());await dialog.waitFor({state:'visible'});};
    const previewHash=async()=>createHash('sha256').update(await dialog.locator('[data-converter-result-canvas]').evaluate(canvas=>canvas.toDataURL())).digest('hex');
    const rapidReopen=async()=>{
      await page.evaluate(()=>{
        window.originalAuditBitmap=createImageBitmap;
        window.createImageBitmap=async(...args)=>{
          const bitmap=await window.originalAuditBitmap(...args);
          await new Promise(resolve=>setTimeout(resolve,40));
          return bitmap;
        };
        window.auditCloseWhileOpen=new Promise(resolve=>document.querySelector('dialog.comic-converter-dialog').addEventListener('close',()=>resolve(document.querySelector('dialog.comic-converter-dialog').open),{once:true}));
        comicConverter.close();comicConverter.open();
      });
      try {
        assert.equal(await page.evaluate(()=>window.auditCloseWhileOpen),true,'The old close event must arrive after reopening');
        await ready();
      } finally {
        await page.evaluate(()=>{window.createImageBitmap=window.originalAuditBitmap;delete window.originalAuditBitmap;delete window.auditCloseWhileOpen;});
      }
    };
    await open();
    assert.equal(await mode.inputValue(),'grayscale');
    await ready();const grayscaleHash=await previewHash();
    await mode.selectOption('comic');await ready();
    assert.notEqual(await previewHash(),grayscaleHash,'The fixture must distinguish the legacy algorithms');
    await dialog.locator('[data-converter-action="reset"]').click();await ready();
    assert.equal(await mode.inputValue(),'grayscale');
    assert.equal(await previewHash(),grayscaleHash,'Reset must actually restore grayscale pixels');
    await rapidReopen();assert.equal(await previewHash(),grayscaleHash);
    await mode.selectOption('manga_finish');
    await ready();
    assert.equal(await preset.inputValue(),'auto');
    assert.equal(await dialog.locator('[data-manga-check="auto_tone"]').isChecked(),true);
    assert.equal(await dialog.locator('[data-manga-number="antialias"]').inputValue(),'2');
    // The visible source preview accepts files while the old picker is closed.
    const beforeDrop=await page.evaluate(()=>sceneSnapshot());
    const transfer=await page.evaluateHandle(bytes=>{
      const transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)],'direct-drop.png',{type:'image/png'}));
      return transfer;
    },[...png]);
    await dialog.locator('[data-source-drop]').dispatchEvent('drop',{dataTransfer:transfer});
    await ready();await transfer.dispose();
    assert.equal(await dialog.locator('[data-converter-source-name]').textContent(),'direct-drop');
    assert.equal(await page.evaluate(()=>sceneSnapshot()),beforeDrop,'Dropping a source must not apply it to the document');
    for(const level of ['0','2','1']){
      await dialog.locator('[data-manga-number="antialias"]').selectOption(level);await ready();
    }
    await preset.selectOption('auto');await ready();
    const mangaHash=await previewHash();
    // Reopening selects the document source, which is the same raster as the drop.
    await rapidReopen();assert.equal(await previewHash(),mangaHash);
    assert.equal(await dialog.locator('[data-manga-number="gradation"]').inputValue(),'1');
    for(const id of ['crisp_lines','soft_tones','deep_blacks','fine_screen','smooth_gray','standard']){
      await preset.selectOption(id);await ready();
      assert.equal(await preset.inputValue(),id);
    }
    await dialog.locator('[data-manga-number="gradation"]').fill('0.65');
    await dialog.locator('[data-manga-number="gradation"]').press('Tab');
    await ready();assert.equal(await preset.inputValue(),'custom');
    await dialog.locator('[data-manga-reset]').click();await ready();
    assert.equal(await dialog.locator('[data-manga-number="gradation"]').inputValue(),'1');
    await dialog.locator('[data-manga-full]').click();await ready();
    assert.deepEqual(await dialog.locator('[data-converter-result-canvas]').evaluate(c=>[c.width,c.height]),[820,780]);
    await dialog.locator('[data-manga-zoom]').click();
    assert.equal(await dialog.locator('[data-converter-result-canvas]').evaluate(c=>c.clientWidth),820);
    await dialog.locator('[data-manga-fit]').click();
    fs.mkdirSync('artifacts',{recursive:true});
    await page.screenshot({path:'artifacts/manga-finish-full.png'});
    const beforeApplyRequests=requests.length;
    await apply.click();await dialog.waitFor({state:'hidden'});
    assert.equal(requests.length,beforeApplyRequests,'Full-resolution cache was not reused');
    assert.equal(await page.evaluate(()=>state.elements.filter(x=>x.type==='image').length),2);
    assert.equal(await page.evaluate(id=>state.elements.find(x=>x.id===id).visible,initialId),false);
    await page.evaluate(()=>undoAction());
    assert.equal(await page.evaluate(()=>state.elements.filter(x=>x.type==='image').length),1);
    await page.evaluate(()=>redoAction());
    assert.equal(await page.evaluate(()=>state.elements.filter(x=>x.type==='image').length),2);

    // Legacy modes stay on the browser worker, including after Manga Finish.
    await open();await ready();
    for(const id of ['grayscale','comic','monochrome','xdog100']){
      const before=requests.length;await mode.selectOption(id);await ready();
      assert.equal(requests.length,before,`${id} unexpectedly called the Manga API`);
    }
    await dialog.locator('[data-converter-action="cancel"]').click();
    await dialog.waitFor({state:'hidden'});

    // Both comic workspaces: real upload, undo/redo, and save/reload.
    for(const workspace of ['comic','comic_layout']){
      await page.locator(`button[data-editor-mode="${workspace}"]`).click();
      await page.waitForFunction(w=>activeWorkspace===w,workspace);
      const imageCount=()=>page.evaluate(w=>(w==='comic'?comicEditor:generalComicEditor).serialize().images.length,workspace);
      const before=await imageCount();
      await open();await dialog.locator('[data-converter-file]').setInputFiles(file);
      await mode.selectOption('manga_finish');await ready();
      await apply.click();await dialog.waitFor({state:'hidden'});
      assert.equal(await imageCount(),before+1);
      await page.evaluate(()=>undoAction());assert.equal(await imageCount(),before);
      await page.evaluate(()=>redoAction());assert.equal(await imageCount(),before+1);
    }
    // The current general-comic panel remains the target when conversion starts there.
    await page.evaluate(()=>{
      const panel=SpeechBubbleGeneralComicCore.collectPanels(generalComicEditor.state().tree)[0];
      panel.image_id=generalComicEditor.state().images[0].id;
      generalComicEditor.selectPanelImage(panel.id);requestRender();
    });
    const oldPanelImage=await page.evaluate(()=>generalComicEditor.selectedPanel().image_id);
    await open();await preset.selectOption('soft_tones');await ready();
    await apply.click();await dialog.waitFor({state:'hidden'});
    assert.notEqual(await page.evaluate(()=>generalComicEditor.selectedPanel().image_id),oldPanelImage);
    await page.evaluate(()=>undoAction());
    assert.equal(await page.evaluate(()=>SpeechBubbleGeneralComicCore.collectPanels(generalComicEditor.state().tree)[0].image_id),oldPanelImage);
    await page.evaluate(()=>redoAction());
    await page.locator('#saveLayout').click();
    await page.waitForFunction(()=>!forgeProjectAdapter.hasUnsavedChanges());
    const savedCounts=await page.evaluate(()=>[workspaces.single.elements.filter(x=>x.type==='image').length,comicEditor.serialize().images.length,generalComicEditor.serialize().images.length]);
    await page.reload();
    await page.waitForFunction(()=>typeof forgeProjectAdapter!=="undefined"&&hasExplicitSavedLayout&&dirtyTrackingEnabled);
    assert.deepEqual(await page.evaluate(()=>[workspaces.single.elements.filter(x=>x.type==='image').length,comicEditor.serialize().images.length,generalComicEditor.serialize().images.length]),savedCounts);

    // A successful server upload whose response arrives after a context switch
    // must not register an image in the new workspace, tray or conversion history.
    await page.locator('button[data-editor-mode="single"]').click();
    await open();await mode.selectOption('manga_finish');await preset.selectOption('deep_blacks');await ready();
    await dialog.locator('[data-manga-full]').click();await ready();
    const beforeRace=await page.evaluate(async()=>({layout:sceneSnapshot(),history:(await comicConverter.storageStatus()).conversion_history,tray:projectImageTray.serialize()}));
    let uploadEntered, releaseUpload;
    const entered=new Promise(r=>uploadEntered=r), release=new Promise(r=>releaseUpload=r);
    await page.route('**/projects/*/images',async route=>{
      const response=await route.fetch();uploadEntered();await release;await route.fulfill({response});
    });
    await apply.click();await Promise.race([entered,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Upload did not start')),15000))]);
    await page.evaluate(()=>document.querySelector('button[data-editor-mode="comic"]').click());
    releaseUpload();
    await page.waitForFunction(async n=>(await comicConverter.storageStatus()).conversion_history===n,beforeRace.history);
    assert.deepEqual(await page.evaluate(()=>projectImageTray.serialize()),beforeRace.tray);
    assert.equal(await page.evaluate(()=>workspaces.single.elements.filter(x=>x.type==='image').length),savedCounts[0]);
    await page.unroute('**/projects/*/images');

    // Failed uploads leave the existing image and undo stack unchanged and can be retried.
    await page.locator('button[data-editor-mode="single"]').click();
    await open();await ready();
    const beforeFailure=await page.evaluate(()=>({count:state.elements.length,undo:state.undo.length}));
    await page.route('**/projects/*/images',route=>route.fulfill({status:500,contentType:'application/json',body:'{"detail":"Simulated upload failure"}'}));
    await apply.click();
    await page.waitForFunction(()=>document.querySelector('[data-converter-status]').dataset.level==='error');
    assert.deepEqual(await page.evaluate(()=>({count:state.elements.length,undo:state.undo.length})),beforeFailure);
    await page.unroute('**/projects/*/images');
    await dialog.locator('[data-converter-action="cancel"]').click();
    await page.waitForFunction(()=>!document.querySelector('dialog.comic-converter-dialog').open);
    assert.deepEqual(errors,[]);
    console.log('manga_finish_browser_smoke: OK (legacy reset pixels, rapid reopen in both engines, six presets, full cache, legacy modes, three workspaces, panel target, undo/redo, save/reload, stale upload, upload failure)');
  } catch(error) {
    if(page){fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/manga-finish-failure.png'}).catch(()=>{});fs.writeFileSync('artifacts/manga-finish-failure.html',await page.content().catch(()=>''));}
    throw error;
  } finally {
    await browser?.close();
    if(server.exitCode===null){const ended=new Promise(resolve=>server.once('exit',resolve));server.kill();await ended;}
    if(base){await assert.rejects(fetch(base));console.log('Manga test service stopped: process exited and HTTP unavailable');}
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
