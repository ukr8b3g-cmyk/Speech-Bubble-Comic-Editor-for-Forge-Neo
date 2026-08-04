(() => {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : fallback;
  const FIELDS = Object.freeze({
    scale:{ja:"スケール",en:"Scale",min:1,max:400,step:1}, size:{ja:"サイズ",en:"Size",min:1,max:256,step:1},
    spacing:{ja:"間隔",en:"Spacing",min:1,max:256,step:1}, angle:{ja:"角度",en:"Angle",min:-180,max:180,step:1},
    strength:{ja:"強さ",en:"Strength",min:0,max:100,step:1}, detail:{ja:"ディテール",en:"Detail",min:1,max:8,step:1},
    contrast:{ja:"コントラスト",en:"Contrast",min:0,max:200,step:1}, seed:{ja:"シード",en:"Seed",min:0,max:999999,step:1},
    position:{ja:"位置",en:"Position",min:0,max:100,step:1}, centerX:{ja:"中心 X",en:"Center X",min:0,max:100,step:1},
    centerY:{ja:"中心 Y",en:"Center Y",min:0,max:100,step:1}, radius:{ja:"半径",en:"Radius",min:1,max:150,step:1}
  });
  const type = (id, ja, en, fields, presets) => Object.freeze({id,ja,en,fields:Object.freeze(fields),presets:Object.freeze(presets)});
  const preset = (id, ja, en, values) => Object.freeze({id,ja,en,values:Object.freeze(values)});
  const TYPES = Object.freeze([
    type("solid","単色","Solid",[],[preset("plain","標準","Default",{})]),
    type("linear-gradient","線形グラデーション","Linear Gradient",["angle","position"],[preset("soft","標準","Default",{angle:0,position:50}),preset("diagonal","斜め","Diagonal",{angle:45,position:50})]),
    type("radial-gradient","放射グラデーション","Radial Gradient",["centerX","centerY","radius"],[preset("center","中央","Centered",{centerX:50,centerY:50,radius:70}),preset("spotlight","スポットライト","Spotlight",{centerX:50,centerY:35,radius:55})]),
    type("halftone","網点","Halftone",["size","spacing","angle","strength","scale"],[preset("fine","細かい","Fine",{size:4,spacing:12,angle:0,strength:80,scale:100}),preset("bold","太い","Bold",{size:10,spacing:22,angle:15,strength:90,scale:100})]),
    type("parallel-lines","平行線","Parallel Lines",["size","spacing","angle","strength"],[preset("fine","細線","Fine",{size:2,spacing:12,angle:-20,strength:70}),preset("bold","太線","Bold",{size:6,spacing:24,angle:45,strength:85})]),
    type("crosshatch","クロスハッチ","Crosshatch",["size","spacing","angle","strength"],[preset("classic","標準","Classic",{size:2,spacing:14,angle:45,strength:75}),preset("dense","密","Dense",{size:2,spacing:8,angle:30,strength:80})]),
    type("checker","チェック","Checker",["size","angle","strength"],[preset("small","小","Small",{size:24,angle:0,strength:100}),preset("large","大","Large",{size:64,angle:0,strength:100})]),
    type("flowers","花柄","Flowers",["size","spacing","angle","strength"],[preset("small","小花","Small Flowers",{size:8,spacing:34,angle:0,strength:80}),preset("large","大花","Large Flowers",{size:15,spacing:60,angle:12,strength:85})]),
    type("pixel","ピクセル","Pixel",["size","scale","strength","seed"],[preset("fine","細かい","Fine",{size:8,scale:70,strength:70,seed:104}),preset("chunky","大きい","Chunky",{size:24,scale:120,strength:85,seed:104})]),
    type("tile","タイル","Tile",["size","spacing","angle","strength"],[preset("square","正方形","Square",{size:42,spacing:4,angle:0,strength:85}),preset("diamond","ひし形","Diamond",{size:42,spacing:5,angle:45,strength:85})]),
    type("scanline","スキャンライン","Scanline",["size","spacing","strength"],[preset("screen","画面","Screen",{size:2,spacing:5,strength:55}),preset("bold","太い","Bold",{size:4,spacing:10,strength:70})]),
    type("clouds","雲","Clouds",["scale","detail","contrast","strength","seed"],[preset("soft","柔らかい","Soft",{scale:90,detail:4,contrast:75,strength:70,seed:301}),preset("storm","濃い雲","Storm",{scale:150,detail:6,contrast:145,strength:90,seed:301})]),
    type("marble","マーブル","Marble",["scale","detail","contrast","strength","angle","seed"],[preset("classic","標準","Classic",{scale:90,detail:5,contrast:125,strength:80,angle:20,seed:702}),preset("fine","細い筋","Fine Veins",{scale:45,detail:6,contrast:160,strength:90,angle:-25,seed:702})]),
    type("cellular","セルノイズ","Cellular",["scale","contrast","strength","seed"],[preset("cells","セル","Cells",{scale:90,contrast:130,strength:85,seed:510}),preset("crystal","結晶","Crystal",{scale:45,contrast:175,strength:90,seed:510})]),
    type("turbulence","タービュランス","Turbulence",["scale","detail","contrast","strength","seed"],[preset("soft","柔らかい","Soft",{scale:110,detail:4,contrast:100,strength:75,seed:611}),preset("rough","荒い","Rough",{scale:55,detail:7,contrast:155,strength:90,seed:611})]),
    type("fractal","フラクタルノイズ","Fractal Noise",["scale","detail","contrast","strength","seed"],[preset("natural","自然","Natural",{scale:100,detail:5,contrast:115,strength:80,seed:808}),preset("dense","高密度","Dense",{scale:45,detail:7,contrast:145,strength:85,seed:808})]),
    type("wood","木目","Wood",["scale","detail","contrast","strength","angle","seed"],[preset("rings","年輪","Rings",{scale:90,detail:4,contrast:135,strength:80,angle:0,seed:415}),preset("grain","木目","Grain",{scale:45,detail:6,contrast:155,strength:90,angle:90,seed:415})]),
    type("wave3d","立体波","Wave 3D",["scale","angle","contrast","strength"],[preset("soft","柔らかい","Soft",{scale:80,angle:25,contrast:80,strength:65}),preset("deep","深い","Deep",{scale:42,angle:-25,contrast:145,strength:90})]),
    type("brick","レンガ","Brick",["size","spacing","angle","strength"],[preset("standard","標準","Standard",{size:48,spacing:4,angle:0,strength:85}),preset("small","小さい","Small",{size:28,spacing:3,angle:0,strength:80})]),
    type("weave","編み込み","Weave",["size","spacing","angle","strength"],[preset("cloth","布","Cloth",{size:10,spacing:3,angle:0,strength:75}),preset("basket","バスケット","Basket",{size:20,spacing:5,angle:0,strength:85})]),
    type("hexagon","六角形","Hexagon",["size","spacing","angle","strength"],[preset("honeycomb","ハニカム","Honeycomb",{size:28,spacing:2,angle:0,strength:85}),preset("large","大きい","Large",{size:52,spacing:3,angle:0,strength:85})]),
    type("focus-lines","集中線","Focus Lines",["centerX","centerY","size","spacing","strength","seed"],[preset("manga","漫画","Manga",{centerX:50,centerY:50,size:2,spacing:12,strength:85,seed:901}),preset("dense","密","Dense",{centerX:50,centerY:45,size:3,spacing:7,strength:90,seed:901})]),
    type("digital-camouflage","デジタル迷彩","Digital Camouflage",["size","scale","contrast","strength","seed"],[preset("standard","標準","Standard",{size:18,scale:100,contrast:120,strength:85,seed:120}),preset("micro","細かい","Micro",{size:8,scale:65,contrast:145,strength:90,seed:120})])
  ]);
  const TYPE_MAP = new Map(TYPES.map(entry => [entry.id, entry]));
  const DEFAULTS = Object.freeze({type:"solid",preset:"plain",color:"#ffffff",patternColor:"#111111",color2:"#808080",transparent:false,size:8,spacing:16,angle:0,strength:80,scale:100,detail:4,contrast:100,seed:1,position:50,centerX:50,centerY:50,radius:70});

  function normalize(value={}) {
    const selected = TYPE_MAP.get(String(value.type || "")) || TYPES[0];
    const presetItem = selected.presets.find(item => item.id === value.preset) || selected.presets[0];
    const merged = {...DEFAULTS,...presetItem.values,...value,type:selected.id,preset:presetItem.id};
    merged.color=color(merged.color,"#ffffff"); merged.patternColor=color(merged.patternColor,"#111111"); merged.color2=color(merged.color2,"#808080");
    merged.transparent=merged.transparent===true;
    for(const [key,field] of Object.entries(FIELDS)) merged[key]=clamp(merged[key],field.min,field.max);
    merged.detail=Math.round(merged.detail); merged.seed=Math.round(merged.seed);
    return merged;
  }
  function hash(x,y,seed){let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(seed,69069))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
  const smooth=t=>t*t*(3-2*t);
  function noise(x,y,seed){const x0=Math.floor(x),y0=Math.floor(y),tx=smooth(x-x0),ty=smooth(y-y0),a=hash(x0,y0,seed),b=hash(x0+1,y0,seed),c=hash(x0,y0+1,seed),d=hash(x0+1,y0+1,seed);return(a+(b-a)*tx)+((c+(d-c)*tx)-(a+(b-a)*tx))*ty;}
  function fbm(x,y,seed,detail=4){let total=0,amplitude=.5,frequency=1,sum=0;for(let i=0;i<detail;i++){total+=noise(x*frequency,y*frequency,seed+i*101)*amplitude;sum+=amplitude;amplitude*=.5;frequency*=2;}return total/sum;}
  function rgba(hex,alpha){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${clamp(alpha,0,1)})`;}
  function withPatternTransform(ctx,width,height,angle,draw){ctx.save();ctx.translate(width/2,height/2);ctx.rotate(angle*Math.PI/180);ctx.translate(-width/2,-height/2);draw();ctx.restore();}
  function raster(ctx,s,width,height,mode){const max=256,ratio=Math.min(1,max/Math.max(width,height)),w=Math.max(32,Math.round(width*ratio)),h=Math.max(32,Math.round(height*ratio)),off=document.createElement("canvas");off.width=w;off.height=h;const ox=off.getContext("2d"),data=ox.createImageData(w,h),scale=Math.max(1,s.scale)*ratio,detail=Math.round(s.detail),contrast=s.contrast/100;for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0,n=fbm(x/scale,y/scale,s.seed,detail);if(mode==="clouds")v=n;else if(mode==="turbulence")v=Math.abs(n*2-1);else if(mode==="fractal")v=n;else if(mode==="marble")v=(Math.sin((x*Math.cos(s.angle*Math.PI/180)+y*Math.sin(s.angle*Math.PI/180))/Math.max(2,scale)*8+n*8)+1)/2;else if(mode==="wood"){const dx=x-w/2,dy=y-h/2;v=(Math.sin(Math.hypot(dx,dy)/Math.max(2,scale)*16+n*8)+1)/2;}else if(mode==="wave3d")v=(Math.sin(x/Math.max(2,scale)*9)+Math.cos(y/Math.max(2,scale)*9)+2)/4;v=clamp((v-.5)*contrast+.5,0,1);const i=(y*w+x)*4,dataColor=parseInt((v>.5?s.patternColor:s.color).slice(1),16),mix=Math.abs(v-.5)*2*s.strength/100;data.data[i]=dataColor>>16;data.data[i+1]=(dataColor>>8)&255;data.data[i+2]=dataColor&255;data.data[i+3]=Math.round(255*mix);}ox.putImageData(data,0,0);ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(off,0,0,width,height);ctx.restore();}
  function cellular(ctx,s,width,height){const cell=Math.max(8,s.scale),off=document.createElement("canvas"),ratio=Math.min(1,220/Math.max(width,height));off.width=Math.max(24,Math.round(width*ratio));off.height=Math.max(24,Math.round(height*ratio));const ox=off.getContext("2d"),im=ox.createImageData(off.width,off.height);for(let y=0;y<off.height;y++)for(let x=0;x<off.width;x++){const px=x/ratio,py=y/ratio,cx=Math.floor(px/cell),cy=Math.floor(py/cell);let d=Infinity;for(let oy=-1;oy<=1;oy++)for(let oxCell=-1;oxCell<=1;oxCell++){const gx=cx+oxCell,gy=cy+oy,pointX=(gx+hash(gx,gy,s.seed))*cell,pointY=(gy+hash(gx,gy,s.seed+31))*cell;d=Math.min(d,Math.hypot(px-pointX,py-pointY));}const v=clamp(1-d/(cell*.8),0,1),i=(y*off.width+x)*4,n=parseInt(s.patternColor.slice(1),16);im.data[i]=n>>16;im.data[i+1]=(n>>8)&255;im.data[i+2]=n&255;im.data[i+3]=Math.round(255*v*s.strength/100);}ox.putImageData(im,0,0);ctx.drawImage(off,0,0,width,height);}
  function draw(ctx,input,width,height){const s=normalize(input),alpha=s.strength/100;if(!s.transparent){ctx.fillStyle=s.color;ctx.fillRect(0,0,width,height);}if(s.type==="solid")return;
    if(s.type==="linear-gradient"){const a=s.angle*Math.PI/180,cx=width/2,cy=height/2,len=Math.abs(width*Math.cos(a))+Math.abs(height*Math.sin(a)),g=ctx.createLinearGradient(cx-Math.cos(a)*len/2,cy-Math.sin(a)*len/2,cx+Math.cos(a)*len/2,cy+Math.sin(a)*len/2);g.addColorStop(0,s.color);g.addColorStop(clamp(s.position/100,.01,.99),s.color2);g.addColorStop(1,s.patternColor);ctx.fillStyle=g;ctx.fillRect(0,0,width,height);return;}
    if(s.type==="radial-gradient"){const x=width*s.centerX/100,y=height*s.centerY/100,r=Math.max(width,height)*s.radius/100,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,s.color2);g.addColorStop(1,s.patternColor);ctx.fillStyle=g;ctx.fillRect(0,0,width,height);return;}
    ctx.fillStyle=rgba(s.patternColor,alpha);ctx.strokeStyle=rgba(s.patternColor,alpha);ctx.lineWidth=Math.max(1,s.size);
    if(["clouds","marble","turbulence","fractal","wood","wave3d"].includes(s.type)){raster(ctx,s,width,height,s.type);return;}if(s.type==="cellular"){cellular(ctx,s,width,height);return;}
    if(s.type==="focus-lines"){const cx=width*s.centerX/100,cy=height*s.centerY/100,count=Math.max(12,Math.round(720/Math.max(2,s.spacing)));ctx.lineWidth=Math.max(1,s.size);for(let i=0;i<count;i++){const jitter=(hash(i,0,s.seed)-.5)*.03,a=i*Math.PI*2/count+jitter,r=Math.hypot(width,height);ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r*.13,cy+Math.sin(a)*r*.13);ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.stroke();}return;}
    if(s.type==="digital-camouflage"||s.type==="pixel"){const cell=Math.max(2,s.size);for(let y=0;y<height;y+=cell)for(let x=0;x<width;x+=cell)if(hash(Math.round(x/cell),Math.round(y/cell),s.seed)>.48){ctx.globalAlpha=alpha*(.35+hash(x,y,s.seed+7)*.65);ctx.fillRect(x,y,cell,cell);}ctx.globalAlpha=1;return;}
    withPatternTransform(ctx,width,height,s.angle,()=>{const span=Math.hypot(width,height),gap=Math.max(2,s.spacing),start=-span;
      const lines=()=>{ctx.lineWidth=Math.max(1,s.size);for(let y=start;y<span*2;y+=gap){ctx.beginPath();ctx.moveTo(start,y);ctx.lineTo(span*2,y);ctx.stroke();}};
      if(s.type==="parallel-lines"||s.type==="scanline"){lines();return;}if(s.type==="crosshatch"){lines();ctx.save();ctx.translate(width/2,height/2);ctx.rotate(Math.PI/2);ctx.translate(-width/2,-height/2);lines();ctx.restore();return;}
      const cell=Math.max(4,s.size),step=cell+Math.max(0,s.spacing||0);
      if(s.type==="halftone"){for(let y=start;y<span*2;y+=Math.max(cell*2,gap))for(let x=start;x<span*2;x+=Math.max(cell*2,gap)){ctx.beginPath();ctx.arc(x,y,cell/2,0,Math.PI*2);ctx.fill();}return;}
      if(s.type==="checker"){for(let y=start,ry=0;y<span*2;y+=cell,ry++)for(let x=start,rx=0;x<span*2;x+=cell,rx++)if((rx+ry)%2===0)ctx.fillRect(x,y,cell,cell);return;}
      if(s.type==="tile"){ctx.lineWidth=Math.max(1,s.spacing);for(let y=start;y<span*2;y+=step)for(let x=start;x<span*2;x+=step)ctx.strokeRect(x,y,cell,cell);return;}
      if(s.type==="flowers"){for(let y=start;y<span*2;y+=Math.max(cell*3,gap))for(let x=start;x<span*2;x+=Math.max(cell*3,gap)){for(let p=0;p<5;p++){const a=p*Math.PI*2/5;ctx.beginPath();ctx.arc(x+Math.cos(a)*cell,y+Math.sin(a)*cell,cell*.65,0,Math.PI*2);ctx.fill();}ctx.beginPath();ctx.arc(x,y,cell*.45,0,Math.PI*2);ctx.fill();}return;}
      if(s.type==="brick"){ctx.lineWidth=Math.max(1,s.spacing);for(let y=start,row=0;y<span*2;y+=cell*.55,row++)for(let x=start-(row%2)*cell/2;x<span*2;x+=cell)ctx.strokeRect(x,y,cell,cell*.55);return;}
      if(s.type==="weave"){ctx.lineWidth=Math.max(2,cell*.45);for(let y=start;y<span*2;y+=step){ctx.beginPath();ctx.moveTo(start,y);ctx.lineTo(span*2,y);ctx.stroke();}for(let x=start;x<span*2;x+=step){ctx.globalAlpha=alpha*.65;ctx.beginPath();ctx.moveTo(x,start);ctx.lineTo(x,span*2);ctx.stroke();}ctx.globalAlpha=1;return;}
      if(s.type==="hexagon"){const r=cell,hh=Math.sqrt(3)*r;ctx.lineWidth=Math.max(1,s.spacing);for(let row=0,y=start;y<span*2;row++,y+=hh)for(let x=start+(row%2)*r*1.5;x<span*2;x+=r*3){ctx.beginPath();for(let p=0;p<6;p++){const a=Math.PI/3*p,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;p?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}return;}
    });
  }
  window.SpeechBubbleCanvasBackgroundPatterns=Object.freeze({TYPES,FIELDS,normalize,draw,randomSeed:()=>Math.floor(Math.random()*1000000)});
})();
