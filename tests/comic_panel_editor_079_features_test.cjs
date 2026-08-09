const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'web', 'project-editor.html'), 'utf8');

for (const id of ['imageCropToolbar','editImageCrop','resetImageCrop','multiAlignPanel','alignmentReference','groupRotationRange','groupRotation']) {
  assert(html.includes(`id="${id}"`), `missing #${id}`);
}
for (const action of ['left','hcenter','right','hdistribute','top','vcenter','bottom','vdistribute']) {
  assert(html.includes(`data-align-action="${action}"`), `missing alignment action ${action}`);
}
for (const value of ['selection','panel','page']) {
  assert(html.includes(`<option value="${value}"`), `missing alignment reference ${value}`);
}
for (const fn of [
  'normalizedImageCrop', 'drawSingleImageLayer', 'startImageCropEdit', 'confirmImageCropEdit',
  'cancelImageCropEdit', 'resetImageCrop', 'drawImageCropOverlay', 'alignSelectedObjects',
  'distributeSelectedObjects', 'replaceSingleImageLayerFromBlob', 'shouldResizeSingleCanvasForImage'
]) {
  assert(html.includes(`function ${fn}`), `missing function ${fn}`);
}
assert(html.includes('canvas.addEventListener("dblclick"'), 'missing image double-click crop entry');
assert(html.includes('key==="c"') && html.includes('selectedImage&&state.selection.length===1'), 'missing strict C-key crop entry');
assert(html.includes('new image') || html.includes('新しい画像のサイズにキャンバスを合わせますか？'), 'missing resize confirmation');
assert(html.includes('target==="__add__"'), 'explicit +Image/add route should remain additive');
assert(html.includes('imageCropEdit&&!editing&&modifier&&(key==="z"||key==="y")'), 'crop live edit must guard history shortcuts');
assert(html.includes('multi-text-edit') && html.includes('editableSelectedTextItems'), 'missing multi-text property editing');
assert(html.includes('beginGroupRotationEdit') && html.includes('commitGroupRotationEdit'), 'missing grouped relative rotation history');
console.log('comic_panel_editor_079_features_test OK');
