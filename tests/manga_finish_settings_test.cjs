const assert=require('node:assert/strict');
const m=require('../web/project/manga-finish-settings.js');
assert.equal(Object.keys(m.presets).length,7);
for(const p of Object.values(m.presets))assert.ok(m.valid(p.settings));
for(const bad of [null,{}, {version:1,basePresetId:'missing',custom:false,settings:m.defaults().settings}])assert.deepEqual(m.restore(bad),m.defaults());
const d=m.defaults();
assert.equal(d.basePresetId,'auto');
assert.equal(d.settings.auto_tone,true);
assert.equal(d.settings.antialias,2);
assert.equal(m.presets.standard.settings.antialias,2);
for(const [id,oldAA] of [['auto',1],['standard',0]]){
  const saved={version:1,basePresetId:id,custom:false,settings:{...m.presets[id].settings,antialias:oldAA}};
  assert.equal(m.restore(saved).settings.antialias,2);
  assert.equal(m.restore({...saved,custom:true}).settings.antialias,oldAA);
}
const oldSettings={...m.presets.standard.settings};
delete oldSettings.auto_tone;
delete oldSettings.antialias;
const migrated=m.restore({version:1,basePresetId:'standard',custom:true,settings:oldSettings});
assert.equal(migrated.settings.auto_tone,false);
assert.equal(migrated.settings.antialias,0);
assert.equal(migrated.custom,true);
assert.equal(d.settings.gradation,1);
const former={version:1,basePresetId:"standard",custom:false,settings:{...m.presets.standard.settings,gradation:.8}};
assert.equal(m.restore(former).settings.gradation,1);
assert.equal(m.restore({...former,custom:true}).settings.gradation,.8);
for(const [id,gradation] of Object.entries({crisp_lines:.55,soft_tones:.95,deep_blacks:.6,fine_screen:.75,smooth_gray:.95})){
  const saved={version:1,basePresetId:id,custom:false,settings:{...m.presets[id].settings}};
  assert.equal(saved.settings.gradation,gradation);
  assert.deepEqual(m.restore(saved),saved);
}
assert.equal(m.edit(d.settings,'white_point',0).white_point,.45);
assert.equal(m.edit(d.settings,'black_point',1).black_point,.7);
assert.equal(m.edit({...d.settings,white_point:.45},'black_point',.7).black_point,.43);
assert.equal(m.edit(d.settings,'light_tone',.5).light_tone,.42);
const key=m.key('doc',1,100,200,d.settings);
assert.notEqual(key,m.key('doc',1,100,200,{...d.settings,auto_tone:false}));
assert.notEqual(key,m.key('doc',1,100,200,{...d.settings,antialias:1}));
assert.notEqual(key,m.key('other',1,100,200,d.settings));
assert.notEqual(key,m.key('doc',2,100,200,d.settings));
assert.notEqual(key,m.key('doc',1,100,200,{...d.settings,halftone:false}));
console.log('manga_finish_settings_test: OK');
