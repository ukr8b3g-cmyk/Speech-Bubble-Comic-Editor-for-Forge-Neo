const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const comicCore = require(path.join(root, 'web', 'project', 'comic-panels.js'));
const generalCore = require(path.join(root, 'web', 'project', 'general-comic-core.js'));
const imageRotation = require(path.join(root, 'web', 'project', 'image-layer-rotation.js'));
const html = fs.readFileSync(path.join(root, 'web', 'project-editor.html'), 'utf8');
const comicEditor = fs.readFileSync(path.join(root, 'web', 'project', 'comic-editor.js'), 'utf8');
const generalEditor = fs.readFileSync(path.join(root, 'web', 'project', 'general-comic-editor.js'), 'utf8');
const cropDialog = fs.readFileSync(path.join(root, 'web', 'project', 'image-crop-dialog.js'), 'utf8');

assert.deepStrictEqual(comicCore.normalizeImageCrop({x:.2,y:.1,w:.5,h:.6}), {x:.2,y:.1,w:.5,h:.6});
assert.deepStrictEqual(comicCore.panelNode(()=>'a', {image_crop:{x:.2,y:.1,w:.5,h:.6}}).image_crop, {x:.2,y:.1,w:.5,h:.6});
assert.deepStrictEqual(generalCore.panelNode(()=>'b', {image_crop:{x:.15,y:.2,w:.7,h:.5}}).image_crop, {x:.15,y:.2,w:.7,h:.5});
assert.strictEqual(comicCore.panelNode(()=>'c', {}).image_rotation, 0);
assert.strictEqual(generalCore.panelNode(()=>'d', {}).image_rotation, 0);
assert.strictEqual(comicCore.panelNode(()=>'e', {image_rotation:181}).image_rotation, 180);
assert.strictEqual(generalCore.panelNode(()=>'f', {image_rotation:-181}).image_rotation, -180);
for (const source of [comicEditor, generalEditor]) {
  assert(source.includes('edit-image-crop'), 'crop edit button missing');
  assert(source.includes('reset-image-crop'), 'crop reset button missing');
  assert(source.includes('image_crop'), 'crop state missing');
  assert(source.includes('startImageCropAt'), 'double-click crop API missing');
  assert(source.includes('startImageCrop:'), 'C-key crop API missing');
  assert(source.includes('image_rotation'), 'image rotation state missing');
  assert(source.includes('imageLayerRotation.drawCroppedImage'), 'shared rotated draw path missing');
}
assert(cropDialog.includes('sb-image-crop-handle'), 'interactive crop handles missing');
assert(cropDialog.includes('data-crop-confirm'), 'crop confirm button missing');
assert(cropDialog.includes('data-crop-cancel'), 'crop cancel button missing');
assert(html.includes('./project/image-crop-dialog.js'), 'crop dialog script not loaded');
assert(html.includes('./project/image-layer-rotation.js'), 'shared image rotation script not loaded');
assert(html.includes('id="backgroundRotationRange"'), 'single-image rotation slider missing');
assert(html.includes('id="backgroundRotation" type="number"'), 'single-image rotation number input missing');
assert(!html.includes('item.rotation=0;syncProperties();render();}\n    function fitSelectedImage'), 'reset position must preserve rotation');
const calls = [];
const target = {
  globalAlpha: 1,
  save: () => calls.push(['save']), restore: () => calls.push(['restore']),
  translate: (...args) => calls.push(['translate', ...args]), rotate: (...args) => calls.push(['rotate', ...args]),
  scale: (...args) => calls.push(['scale', ...args]), drawImage: (...args) => calls.push(['drawImage', ...args]),
};
imageRotation.drawCroppedImage(target, {naturalWidth:400,naturalHeight:300}, {x:10,y:20,w:100,h:60,sourceX:5,sourceY:6,sourceW:200,sourceH:150}, 90);
assert.deepStrictEqual(calls.find((entry) => entry[0] === 'translate'), ['translate',60,50]);
assert.strictEqual(calls.find((entry) => entry[0] === 'rotate')[1], Math.PI / 2);
assert.deepStrictEqual(calls.find((entry) => entry[0] === 'drawImage').slice(-4), [-50,-30,100,60]);
assert(html.includes('structuralEditor?.startImageCrop?.()'), 'structural C-key routing missing');
assert(html.includes('structuralEditor?.startImageCropAt?.(point)'), 'structural double-click routing missing');
assert(html.includes('shouldResizeSingleCanvasForImage'), 'single-image canvas-size tracking regressed');
console.log('comic_panel_editor_0710_crop_modes_test OK');
