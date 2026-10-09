const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'web/project/editor-shell.js'),'utf8');
const names=require('../web/project/asset-labels.js');
const builtin=vm.runInNewContext(html.match(/const BUILTIN_SFX_PRESETS = (\[[\s\S]*?\n    \]);/)[1],{COMIC_YELLOW:'#ffd42a'});
const manifest=JSON.parse(fs.readFileSync(path.join(root,'web/assets/sfx/sfx-png-corrected-list-v2/manifest.json'),'utf8'));
const merged=new Map(builtin.map(p=>[p.id,p]));manifest.items.forEach(p=>merged.set(p.id,p));
assert.equal(merged.size,286);
const visible=[...merged.values()].filter(p=>!p.hidden);
const stamp=p=>['symbols','effects','kawaii','corners'].includes(p.category);
assert.equal(visible.filter(stamp).length,94);
assert.equal(visible.filter(p=>!stamp(p)).length,190);
for(const p of merged.values()){
 const before=JSON.stringify(p),label=names.labels[p.id];
 assert.ok(label?.ja&&label.en,`Missing names: ${p.id}`);
 assert.doesNotMatch(names.display(p,'en'),/[\u3040-\u30ff\u3400-\u9fff]/,p.id);
 assert.ok(names.search(p).includes(p.label.toLocaleLowerCase()),p.id+' Japanese search');
 assert.ok(names.search(p).includes(label.en.toLocaleLowerCase()),p.id+' English search');
 assert.equal(JSON.stringify(p),before,'Display must not mutate project/catalog data');
}
assert.equal(names.display({id:'basic-circle-mask',label:'私の素材',userPreset:true},'en'),'私の素材');
assert.equal(names.display({id:'external',displayName:'任意',displayNameEn:'External Name'},'en'),'External Name');
const line=name=>html.split('\n').find(l=>l.trimStart().startsWith('function '+name+'('));
const normalize=new Function(`${line('normalizeCatalogSfxPreset')};return normalizeCatalogSfxPreset;`)();
for(const raw of [{displayNameEn:'Catalog English'},{display_name_en:'Catalog English'},{labelEn:'Catalog English'},{labels:{en:'Catalog English',ja:'動的'}}]){
 const p=normalize({id:'dynamic',src:'asset.webp',label:'日本語',keywords:'original keyword',...raw});
 assert.equal(names.display(p,'en'),'Catalog English');assert.ok(names.search(p).includes('日本語'));assert.ok(names.search(p).includes('original keyword'));
}
let english=true;
const layer=new Function('SFX_BY_ID','BUILTIN_SFX_PRESETS','window','uiEnglish','sfxDisplayLabel',`${line('builtinAssetDisplayLabel')};return builtinAssetDisplayLabel;`)(merged,builtin,{SpeechBubbleAssetLabels:names},()=>english,p=>names.display(p,english?'en':'ja'));
const saved={asset_id:'don-exclamation-mask',asset_label:'ドン！'};
assert.equal(layer(saved),names.display(merged.get(saved.asset_id),'en'));
english=false;assert.equal(layer(saved),'ドン！');english=true;
assert.equal(layer({...saved,asset_label:'手入力の素材名'}),'手入力の素材名');
assert.equal(layer({...saved,user_asset_id:'user-image',asset_label:'ユーザー素材'}),'ユーザー素材');
assert.equal(saved.asset_label,'ドン！');
const sort=new Function('sfxSortMode','sfxDisplayLabel','uiEnglish',`${line('sortedSfxPresets')};return sortedSfxPresets;`)('name',p=>names.display(p,'en'),()=>true);
const sorted=sort([...merged.values()]);for(let i=1;i<sorted.length;i++)assert.ok(names.display(sorted[i-1],'en').localeCompare(names.display(sorted[i],'en'),'en')<=0);
assert.ok(names.search(normalize({id:'dynamic',src:'asset.webp',labels:{ja:'動的素材',en:'Dynamic Asset'}})).includes('動的素材'));
const messages=require('../web/project/ui-messages.js');
assert.equal(messages.error('出力フォルダーが存在しません。','en'),'The output folder does not exist.');
assert.equal(messages.error('出力フォルダーが存在しません。','ja'),'出力フォルダーが存在しません。');
assert.equal(messages.error('手入力の素材名','en'),'手入力の素材名');
assert.equal(messages.error('モデルを取得できませんでした: モデルのSHA-256が一致しません。','en'),'Could not download the model: The model SHA-256 does not match.');
console.log('asset_localization_test: OK (286 IDs, 190 SFX / 94 stamps)');
