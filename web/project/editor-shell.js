
    const params = new URLSearchParams(location.search);
    const isPaletteWindow=params.get("palette")==="1";
    if(isPaletteWindow)document.documentElement.dataset.paletteWindow="1";
    const uiEnglish=()=>document.documentElement.lang==="en";
    const uiText=(ja,en)=>uiEnglish()?en:ja;
    const PROJECT_STORAGE_PREFIX = "speech-bubble/project-editor/";
    const requestedProjectId = params.get("projectId") || "";
    const jsonKey = params.get("jsonKey") || (params.get("host") === "forge-project" ? `${PROJECT_STORAGE_PREFIX}${requestedProjectId}` : `speech_bubble:standalone:${Date.now()}`);
    const directFileMode = location.protocol === "file:";
    const hostMode = params.get("host") || (directFileMode ? "desktop-file" : "standalone");
    const isForgeProjectHost = hostMode === "forge-project";
    document.documentElement.dataset.hostMode=hostMode;
    const forgeEditorSettings = isForgeProjectHost
      ? window.SpeechBubbleForgeProjectSettings?.get?.() || {}
      : {};
    const forgeProjectId = isForgeProjectHost
      ? window.SpeechBubbleForgeProjectApi.normalizeProjectId(requestedProjectId)
      : "";
    let imageUrl = params.get("imageUrl") || "";
    let imageHash = params.get("imageHash") || "";
    let documentMode = isForgeProjectHost ? "project" : (params.get("mode")==="image"||imageUrl||imageHash?"image":"standalone");
    function createUuid(){
      if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
      const bytes=new Uint8Array(16);globalThis.crypto?.getRandomValues?.(bytes);
      if(!bytes.some(Boolean))for(let index=0;index<bytes.length;index++)bytes[index]=Math.floor(Math.random()*256);
      bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
      const hex=[...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");
      return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
    let standaloneId=params.get("standaloneId")||createUuid();
    let documentId=isForgeProjectHost?forgeProjectId:(documentMode==="standalone"?`standalone:${standaloneId}`:(imageHash?`image:${imageHash}`:""));
    let sourceName = params.get("sourceName") || "speech_bubble";
    let sourceTab = params.get("sourceTab") || params.get("tabName") || "";
    const apiBase = (params.get("apiBase") || "/speech_bubble").replace(/\/$/, "");
    const requestedForgeApiBase = String(params.get("forgeApiBase") || "/speech-bubble-forge").trim();
    const forgeApiBase = `${requestedForgeApiBase.startsWith("/") ? "" : "/"}${requestedForgeApiBase}`.replace(/\/$/, "");
    const forgeProjectApiClient = isForgeProjectHost
      ? new window.SpeechBubbleForgeProjectApi.ForgeProjectApi({ base: forgeApiBase })
      : null;
    const forgeProjectImageStore = isForgeProjectHost ? {
      put: async (metadata, blob) => {
        const sourceKind = metadata?.source === "converted"
          ? "converted"
          : metadata?.source === "background-removal"
            ? "background-removal"
            : metadata?.source === "quick-retouch"
              ? "retouched"
              : "local-file";
        const asset = await forgeProjectApiClient.uploadImage(forgeProjectId, blob, {
          name: metadata?.name || "project-image",
          sourceKind,
          sourceTab,
        });
        projectImageTray?.register(asset, { notify: false });
        return asset;
      },
      get: (imageId) => forgeProjectApiClient.imageBlob(forgeProjectId, imageId),
      // Project画像はUndo保護のためUI削除では物理削除しない。
      remove: async () => undefined,
    } : null;
    const desktopLaunchToken = params.get("token") || "";
    let autoSaveEnabled = !isForgeProjectHost && params.get("autoSave") !== "0";
    let showEmptyCanvasGuide = isForgeProjectHost
      ? forgeEditorSettings.show_empty_guide === true
      : params.get("showEmptyCanvasGuide") !== "0";
    let forgeProjectTitle = "Untitled Comic Project";
    const startupBehavior = ["resume","new"].includes(params.get("startupBehavior")) ? params.get("startupBehavior") : "ask";
    let autoSaveDelay = Math.max(5000, Math.min(3600000, Number(params.get("autoSaveDelay")) || 30000));
    let lastRecoveryCheckpoint=Date.now();
    const keepLayoutEnabled = params.get("keepLayout") !== "0";
    const promptExportLocation = params.get("promptExportLocation") === "1";
    const useForgeOutputDir = params.get("useForgeOutputDir") !== "0";
    const rememberExportDirectory = params.get("rememberExportDirectory") !== "0";
    const exportDirectoryVersion = params.get("exportDirectoryVersion") || "0";
    const forgeOutputDir = params.get("forgeOutputDir") || "";
    const filenameFormat = params.get("filenameFormat") || "source_datetime";
    const dateSubfolder = params.get("dateSubfolder") || "none";
    const backupEnabled = params.get("backupEnabled") !== "0";
    const backupGenerations = Math.max(1,Math.min(20,Number(params.get("backupGenerations"))||5));
    const saveOverlay = params.get("saveOverlay") === "1";
    const exportTransport = params.get("exportTransport") || (isForgeProjectHost ? "multipart_canvas_v1" : "legacy_json_v1");
    const assetCacheVersion = params.get("assetVersion") || "20260802-04";
    const SAVED_LAYOUT_PREFIX = isForgeProjectHost ? `${PROJECT_STORAGE_PREFIX}layout/` : "speech-bubble/layout/";
    const DRAFT_LAYOUT_PREFIX = isForgeProjectHost ? `${PROJECT_STORAGE_PREFIX}draft/` : "speech-bubble/draft/";
    const LEGACY_SAVED_LAYOUT_PREFIX = "speech_bubble:forge:layout:saved:";
    const LEGACY_DRAFT_LAYOUT_PREFIX = "speech_bubble:forge:layout:draft:";
    const DRAFT_META_KEY = isForgeProjectHost ? `${PROJECT_STORAGE_PREFIX}draft-meta:v1` : "speech-bubble/draft-meta:v1";
    const MAX_DRAFT_DOCUMENTS = 100;
    const DRAFT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
    const MAX_STANDALONE_BACKGROUNDS = 10;
    const MAX_GENERATED_BACKGROUNDS = 10;
    const LAST_STANDALONE_ID_KEY = isForgeProjectHost ? `${PROJECT_STORAGE_PREFIX}last-document-id` : "speech-bubble/standalone/last-document-id";
    const EDITOR_WINDOW_STATE_KEY = isForgeProjectHost ? `${PROJECT_STORAGE_PREFIX}window-state:v1` : "speech-bubble/editor/window-state:v1";
    const DOCUMENT_DB_NAME = isForgeProjectHost ? "speech-bubble-forge-project-images" : "speech-bubble-editor-documents";
    const DOCUMENT_DB_STORE = "backgrounds";
    const EXPORT_DIRECTORY_DB_NAME = "speech-bubble-editor-export-directory";
    const EXPORT_DIRECTORY_DB_STORE = "directories";
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const cleanSceneCanvas = document.createElement("canvas");
    const cleanSceneContext = cleanSceneCanvas.getContext("2d");
    const viewport = document.getElementById("viewport");
    const stage = document.getElementById("stage");
    const image = new Image();
    image.decoding = "async";
    let sourceBlob = null;
    let sourceObjectUrl = null;
    let imageLoaded = false;
    let layoutDirty = false;
    let hasExplicitSavedLayout = false;
    let lastSavedLayout = "{}";
    let dirtyTrackingEnabled = false;
    let pendingReplacementSource = null;
    let pendingFreshBaseline = false;
    let imageRestoreResolver = null;
    let standaloneResumeResolver = null;
    let standaloneResumePromise = null;
    let currentProjectPath = "";
    let nativeClosePrepared = false;
    let nativeCloseInFlight = false;
    const DEBUG_RENDER = false;
    let renderFrameId = 0;
    let renderRevision = Math.max(0, Math.round(Number(params.get("revisionBase")) || 0));
    let pendingRenderOptions = {canvas:false,layers:false,preview:false};
    const BACKGROUND_LAYER_ID="__single_background_layer__";
    function normalizedBackgroundImage(value={}){return{attached:value.attached!==false,locked:value.locked!==false,scale:Math.max(.1,Math.min(8,Number(value.scale)||1)),offsetX:Number(value.offsetX)||0,offsetY:Number(value.offsetY)||0};}
    const canvasBackgroundPatterns=window.SpeechBubbleCanvasBackgroundPatterns;
    const projectSchema=window.SpeechBubbleProjectSchema;
    function normalizedCanvasBackground(value={}){return canvasBackgroundPatterns?.normalize(value)||{color:"#ffffff",transparent:value.transparent===true};}
    const SINGLE_IMAGE_ASSET_PREFIX="single-image:";
    const singleImageAssets=new Map();
    let primarySingleImageAssetId="",lastSingleProcessingLayerId="",pendingImageLayerReplacementId="";
    function clearSingleImageAssets(){for(const asset of singleImageAssets.values())if(asset.url)URL.revokeObjectURL(asset.url);singleImageAssets.clear();primarySingleImageAssetId="";lastSingleProcessingLayerId="";}
    function loadSingleImageElement(url){return new Promise((resolve,reject)=>{const node=new Image();node.decoding="async";node.onload=()=>resolve(node);node.onerror=()=>reject(new Error("画像レイヤーを読み込めませんでした。"));node.src=url;});}
    async function registerSingleImageAsset(blob,name="image",assetId=""){
      let id=assetId;
      let stored=null;
      if(isForgeProjectHost&&!id){
        stored=await forgeProjectImageStore.put({name,source:"single"},blob);
        id=String(stored?.id||"");
        if(!id)throw new Error(uiText("Project画像を保存できませんでした","Could not store the Project image"));
      }
      id=id||`${SINGLE_IMAGE_ASSET_PREFIX}${createUuid()}`;
      const previous=singleImageAssets.get(id);if(previous?.url)URL.revokeObjectURL(previous.url);
      const url=URL.createObjectURL(blob),node=await loadSingleImageElement(url),asset={id,name:String(stored?.name||name||"image").replace(/\.[^.]+$/,""),mime:stored?.mime||blob.type||"image/png",blob,url,image:node,width:node.naturalWidth,height:node.naturalHeight};singleImageAssets.set(id,asset);return asset;
    }
    function singleImageAssetFor(item){return item?.type==="image"?singleImageAssets.get(String(item.image_asset_id||"")):null;}
    const imageLayerRotation=window.SpeechBubbleImageLayerRotation;
    if(!imageLayerRotation)throw new Error("SpeechBubbleImageLayerRotation must be loaded before the project editor");
    function normalizedImageCrop(value){const x=Math.max(0,Math.min(.999,finiteOr(value?.x,0))),y=Math.max(0,Math.min(.999,finiteOr(value?.y,0))),w=Math.max(.001,Math.min(1-x,finiteOr(value?.w,1))),h=Math.max(.001,Math.min(1-y,finiteOr(value?.h,1)));return{x,y,w,h};}
    function imageCropFor(item){return normalizedImageCrop(item?.crop);}
    function imageCropIsFull(item){const crop=imageCropFor(item);return crop.x<.0005&&crop.y<.0005&&crop.w>.999&&crop.h>.999;}
    function imageFullGeometry(item){const crop=imageCropFor(item),w=Math.max(1,Number(item?.w)||1),h=Math.max(1,Number(item?.h)||1),fullW=w/Math.max(.001,crop.w),fullH=h/Math.max(.001,crop.h);return{x:(Number(item?.x)||0)-fullW*crop.x,y:(Number(item?.y)||0)-fullH*crop.y,w:fullW,h:fullH};}
    function applyCropGeometry(item,crop,full=imageFullGeometry(item)){crop=normalizedImageCrop(crop);item.crop=crop;item.x=full.x+full.w*crop.x;item.y=full.y+full.h*crop.y;item.w=Math.max(1,full.w*crop.w);item.h=Math.max(1,full.h*crop.h);return item;}
    function resetImageCropGeometry(item){if(!item||item.type!=="image")return false;const full=imageFullGeometry(item);item.crop={x:0,y:0,w:1,h:1};item.x=full.x;item.y=full.y;item.w=full.w;item.h=full.h;return true;}
    function selectedSingleImageLayer(){const selected=state.elements.find(item=>item.id===state.selected&&item.type==="image");if(selected)return selected;return[...state.elements].reverse().find(item=>item.type==="image"&&item.visible!==false)||state.elements.find(item=>item.type==="image")||null;}
    function imageLayerScale(item){const full=imageFullGeometry(item);return Math.max(10,Math.min(800,Math.round((full.w/Math.max(1,Number(item?.base_width)||full.w))*100)));}
    function fitImageLayerGeometry(asset,mode="cover"){const ratio=(mode==="contain"?Math.min:Math.max)(state.width/Math.max(1,asset.width),state.height/Math.max(1,asset.height)),w=asset.width*ratio,h=asset.height*ratio;return{x:(state.width-w)/2,y:(state.height-h)/2,w,h,base_width:w,base_height:h};}
    function createSingleImageLayer(asset,{name=asset.name,inherit=null,role="image",visible=true,locked=false,fit="cover"}={}){const geometry=inherit?imageFullGeometry(inherit):fitImageLayerGeometry(asset,fit),crop=inherit?imageCropFor(inherit):{x:0,y:0,w:1,h:1},layer={id:id(),type:"image",image_asset_id:asset.id,image_name:name,source_role:role,x:geometry.x,y:geometry.y,w:geometry.w,h:geometry.h,base_width:geometry.base_width||inherit?.base_width||geometry.w,base_height:geometry.base_height||inherit?.base_height||geometry.h,rotation:Number(inherit?.rotation)||0,opacity:Math.max(0,Math.min(1,finiteOr(inherit?.opacity,1))),lock_aspect_ratio:true,locked:inherit?inherit.locked===true:locked,visible,comic_scope:"free",comic_panel_id:"",crop};if(inherit){layer.base_width=Math.max(1,finiteOr(inherit.base_width,geometry.w));layer.base_height=Math.max(1,finiteOr(inherit.base_height,geometry.h));applyCropGeometry(layer,crop,{x:geometry.x,y:geometry.y,w:geometry.w,h:geometry.h});}return layer;}
    async function addSingleImageLayerFromBlob(blob,name,{inherit=null,role="image",hideSource=false,select=true,assetId="",locked=false,fit="cover"}={}){const asset=await registerSingleImageAsset(blob,name,assetId),layer=createSingleImageLayer(asset,{name,inherit,role,locked,fit});if(inherit)layer.source_image_layer_id=inherit.id;pushUndo();if(hideSource&&inherit)inherit.visible=false;const lastImageIndex=state.elements.reduce((last,item,index)=>item.type==="image"?index:last,-1);state.elements.splice(lastImageIndex+1,0,layer);if(select)setSelection([layer.id],layer.id);captureActiveWorkspace();syncProperties();render();updateActionState();return layer;}
    function ensurePrimarySingleImageLayer(assetId=primarySingleImageAssetId){if(activeWorkspace!=="single"||!assetId)return null;const asset=singleImageAssets.get(assetId);if(!asset)return null;let layer=state.elements.find(item=>item.type==="image"&&item.image_asset_id===assetId);if(layer)return layer;const legacy=normalizedBackgroundImage(state.backgroundImage),base=Math.max(state.width/asset.width,state.height/asset.height),w=asset.width*base*legacy.scale,h=asset.height*base*legacy.scale;layer=createSingleImageLayer(asset,{role:"original",visible:state.backgroundVisible,locked:legacy.locked});Object.assign(layer,{x:(state.width-w)/2+legacy.offsetX,y:(state.height-h)/2+legacy.offsetY,w,h,base_width:asset.width*base,base_height:asset.height*base});state.elements.unshift(layer);state.backgroundImage=normalizedBackgroundImage({attached:false});state.backgroundVisible=true;captureActiveWorkspace();return layer;}
    const state = { width: 1024, height: 1024, zoom: 1, panX: 0, panY: 0, backgroundVisible: true, canvasBackground:normalizedCanvasBackground(), backgroundImage:normalizedBackgroundImage({attached:false}), elements: [], selected: null, selection: [], vectorEditId: null, vectorAnchorIndex: null, vectorAddMode: false, drag: null, undo: [], redo: [], propertyEditSnapshot: null, canvasFromLayout: false, spaceDown: false };
    let imageCropEdit=null;
    let alignmentReference="selection";
    const WORKSPACE_VIEW_KEY=isForgeProjectHost?`${PROJECT_STORAGE_PREFIX}workspace-views:v1`:"speech_bubble:workspace_views:v1";
    function storedWorkspaceViews(){try{const value=JSON.parse(localStorage.getItem(WORKSPACE_VIEW_KEY)||"{}");return value&&typeof value==="object"?value:{};}catch{return{};}}
    const storedViews=storedWorkspaceViews();
    const firstApplicationView=!storedViews.single&&!storedViews.comic&&!storedViews.comic_layout;
    function normalizedWorkspaceView(value){const zoom=Number(value?.zoom),panX=Number(value?.panX),panY=Number(value?.panY);return Number.isFinite(zoom)&&Number.isFinite(panX)&&Number.isFinite(panY)?{zoom:Math.max(.1,Math.min(4,zoom)),panX,panY}:null;}
    function saveWorkspaceViews(){try{localStorage.setItem(WORKSPACE_VIEW_KEY,JSON.stringify({single:workspaces.single.view||null,comic:workspaces.comic.view||null,comic_layout:workspaces.comic_layout.view||null}));}catch{}}
    let activeWorkspace="single";
    const workspaces={
      single:{width:1024,height:1024,backgroundVisible:true,canvasBackground:normalizedCanvasBackground(),backgroundImage:normalizedBackgroundImage({attached:false}),elements:[],view:normalizedWorkspaceView(storedViews.single)},
      comic:{width:720,height:2200,backgroundVisible:true,elements:[],view:normalizedWorkspaceView(storedViews.comic)},
      comic_layout:{width:2480,height:3508,backgroundVisible:true,canvasBackground:normalizedCanvasBackground({color:"#ffffff",transparent:false}),backgroundImage:normalizedBackgroundImage({attached:false}),elements:[],view:normalizedWorkspaceView(storedViews.comic_layout)},
    };
    function captureActiveWorkspace(){
      const target=workspaces[activeWorkspace];
      target.width=state.width;target.height=state.height;target.backgroundVisible=state.backgroundVisible;target.canvasBackground=normalizedCanvasBackground(state.canvasBackground);target.backgroundImage=normalizedBackgroundImage(state.backgroundImage);target.elements=state.elements;
      target.view={zoom:state.zoom,panX:state.panX,panY:state.panY};saveWorkspaceViews();
    }
    function restoreWorkspaceView(source,renderCanvas=false){const view=normalizedWorkspaceView(source?.view);if(!view){fitView(renderCanvas);return;}state.zoom=view.zoom;state.panX=view.panX;state.panY=view.panY;applyViewTransform();if(renderCanvas)requestRender({canvas:true});}
    function switchEditorWorkspace(requested){
      const next=["single","comic","comic_layout"].includes(requested)?requested:"single";
      if(next===activeWorkspace)return;
      if(hostMode==="desktop")window.SpeechBubbleDesktopShell?.saveRecovery?.(true).catch?.(error=>console.warn("Speech Bubble workspace checkpoint failed",error));
      captureActiveWorkspace();
      activeWorkspace=next;
      projectImageTray?.setWorkspace(next);
      const source=workspaces[next];
      state.width=Math.max(1,Math.round(Number(source.width)||1));
      state.height=Math.max(1,Math.round(Number(source.height)||1));
      state.backgroundVisible=source.backgroundVisible!==false;
      state.canvasBackground=normalizedCanvasBackground(source.canvasBackground);
      state.backgroundImage=normalizedBackgroundImage(source.backgroundImage||{attached:imageLoaded});
      state.elements=source.elements;
      state.selected=null;state.selection=[];state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;state.drag=null;
      document.getElementById("addSingleImageLayerFromLayers").hidden=next!=="single";
      restoreWorkspaceView(source,false);
    }
    let modeController=null,comicEditor=null,generalComicEditor=null,comicConverter=null,backgroundRemoval=null,quickRetouch=null,comicOverlayExport=false;
    function activeStructuralEditor(){return generalComicEditor?.isActive()?generalComicEditor:comicEditor?.isActive()?comicEditor:null;}

    function initializeModeController(){
      if(!["desktop","desktop-file","forge-project"].includes(hostMode)||modeController||!window.SpeechBubbleEditorModeController)return modeController;
      modeController=window.SpeechBubbleEditorModeController.create({host:document.querySelector("[data-toolbar-mode-host]"),initialMode:activeWorkspace,onChanged:({active})=>{document.documentElement.dataset.editorMode=active;syncProperties();updateActionState();requestRender({canvas:true,layers:true});requestAnimationFrame(()=>fitView(false));}});
      return modeController;
    }
    function registerEditorModes(){
      if(!modeController)return;
      const switchMode=target=>({control={}}={})=>{
        if(activeWorkspace!==target&&control.recordUndo!==false)pushUndo();
        comicEditor?.setActive(false,{switchWorkspace:false,recordUndo:false,fitView:false,notify:false});
        generalComicEditor?.setActive(false,{switchWorkspace:false,recordUndo:false,fitView:false,notify:false});
        switchEditorWorkspace(target);
        comicEditor?.setActive(target==="comic",{switchWorkspace:false,recordUndo:false,fitView:false,notify:false});
        generalComicEditor?.setActive(target==="comic_layout",{switchWorkspace:false,recordUndo:false,fitView:false,notify:false});
        if(control.notify!==false&&activeWorkspace===target){layoutDirty=true;scheduleAutoSave();notifyForgeProjectChanged();}
        return true;
      };
      modeController.register("single",switchMode("single"));
      modeController.register("comic",switchMode("comic"));
      modeController.register("comic_layout",switchMode("comic_layout"));
    }
    function syncEditorModeFromWorkspace(){
      comicEditor?.setActive(activeWorkspace==="comic",{switchWorkspace:false,recordUndo:false,fitView:false,notify:false});
      generalComicEditor?.setActive(activeWorkspace==="comic_layout",{switchWorkspace:false,recordUndo:false,fitView:false,notify:false});
      modeController?.setCurrent(activeWorkspace);
      document.documentElement.dataset.editorMode=activeWorkspace;
    }
    async function selectedSingleImageSource(){const layer=selectedSingleImageLayer(),asset=singleImageAssetFor(layer);if(layer&&asset){lastSingleProcessingLayerId=layer.id;return{blob:asset.blob,name:layer.image_name||asset.name,width:asset.width,height:asset.height,layer_id:layer.id,source_kind:"layer",visible:layer.visible!==false};}if(!imageLoaded||!image.naturalWidth)return null;lastSingleProcessingLayerId="";return{blob:await sourceImageBlob(),name:sourceName||"speech_bubble",width:image.naturalWidth,height:image.naturalHeight,source_kind:"legacy-background"};}
    async function applyProcessedSingleImage(blob,name,role,sourceContext){if(!blob)return false;const sourceId=String(sourceContext?.layer_id||"");const source=sourceId?state.elements.find(item=>item.id===sourceId&&item.type==="image"):null;const hasImage=workspaces.single.elements.some(item=>item.type==="image");if(!source&&!hasImage&&Number(sourceContext?.width)>0&&Number(sourceContext?.height)>0&&activeWorkspace==="single")scaleStateToImageSize(Number(sourceContext.width),Number(sourceContext.height));await addSingleImageLayerFromBlob(blob,name,{inherit:source||undefined,role,hideSource:Boolean(source),fit:source?"cover":"contain"});layoutDirty=true;scheduleAutoSave();updateActionState();notifyForgeProjectChanged();return true;}
    function initializeComicEditor(){
      if(!["desktop","desktop-file","forge-project"].includes(hostMode)||comicEditor||!window.SpeechBubbleComicEditor)return comicEditor;
      comicEditor=window.SpeechBubbleComicEditor.create({
        modeController,
        getCanvasState:()=>state,
        getDocumentId:()=>documentId,
        getSourceImage:()=>image,
        getSourceBlob:()=>sourceImageBlob(),
         getSourceName:()=>sourceName,
         imageStore:forgeProjectImageStore||undefined,
         pushUndo,
         clearLayerSelection:()=>setSelection([],null),
         hasLayerSelection:()=>state.selection.length>0,
         assignLayerComicTarget:(layerId,panelId,stack="above_image")=>{
           const item=state.elements.find(element=>element.id===layerId);
           if(!item||item.type==="frame")return false;
           pushUndo();
           if(panelId){
             item.comic_scope="panel";
             item.comic_panel_id=panelId;
             item.comic_stack=stack==="below_image"?"below_image":"above_image";
           }else{
             item.comic_scope=item.type==="emphasis_lines"?"page":"free";
             item.comic_panel_id="";
             item.comic_stack="above_image";
           }
           setSelection([item.id],item.id);
           syncProperties();
           render();
           return true;
         },
         layerAt:point=>{const selected=state.elements.find(element=>element.id===state.selected);return selected?.type==="emphasis_lines"&&findEmphasisCenterHandle(selected,point)?selected:findHit(point,false);},
         resizeCanvas:(width,height)=>{scaleStateToImageSize(width,height);fitView(false);},
         requestRender,
         fitView,
         syncProperties,
         syncActionState:updateActionState,
         setStatus:setSaveState,
         switchWorkspace:switchEditorWorkspace,
         syncInsertTargetStatus,
       });
      return comicEditor;
    }
    function initializeGeneralComicEditor(){
      if(!["desktop","desktop-file","forge-project"].includes(hostMode)||generalComicEditor||!window.SpeechBubbleGeneralComicEditor)return generalComicEditor;
      generalComicEditor=window.SpeechBubbleGeneralComicEditor.create({
        defaultWidth:2480,defaultHeight:3508,
        getCanvasState:()=>state,getDocumentId:()=>documentId,
        pushUndo,clearLayerSelection:()=>setSelection([],null),hasLayerSelection:()=>state.selection.length>0,
        imageStore:forgeProjectImageStore||undefined,
        layerAt:point=>findHit(point,false),
        resizeCanvas:(width,height)=>{scaleStateToImageSize(width,height);fitView(false);},
        requestRender,fitView,syncProperties,syncActionState:updateActionState,setStatus:setSaveState,
        switchWorkspace:switchEditorWorkspace,syncInsertTargetStatus,
        onDocumentChanged:()=>{layoutDirty=true;scheduleAutoSave();updateActionState();notifyForgeProjectChanged();},
        assignLayerGeneralComicTarget,
        reassignPanelTargets:reassignGeneralComicPanelTargets,
        detachPanelTargetsToPage:detachGeneralComicPanelTargetsToPage,
        hasPanelTargetedLayers:()=>workspaces.comic_layout.elements.some(item=>item.general_comic_scope==="panel"),
        colorSwatches:COMIC_SWATCHES,
        openBackgroundRemoval:()=>initializeBackgroundRemoval()?.open?.(),
        openComicConversion:()=>initializeComicConverter()?.open?.(),
      });
      return generalComicEditor;
    }
    function assignLayerGeneralComicTarget(layerId,panelId=null){
      const item=state.elements.find(element=>element.id===layerId);if(!item||!generalComicEditor?.isActive())return false;
      pushUndo();generalComicEditor.assignElementTarget(item,panelId?{scope:"panel",panelId}:{scope:"page"});setSelection([item.id],item.id);syncProperties();render();return true;
    }
    function reassignGeneralComicPanelTargets(removedPanelIds,keptPanelId){
      const removed=new Set(removedPanelIds||[]);for(const item of workspaces.comic_layout.elements)if(item.general_comic_scope==="panel"&&removed.has(item.general_comic_panel_id))item.general_comic_panel_id=keptPanelId;
    }
    function detachGeneralComicPanelTargetsToPage(){for(const item of workspaces.comic_layout.elements)if(item.general_comic_scope==="panel"){item.general_comic_scope="page";item.general_comic_panel_id=null;}}
    function initializeComicConverter(){
      if(comicConverter||!window.SpeechBubbleComicConverter)return comicConverter;
      comicConverter=window.SpeechBubbleComicConverter.create({
        getMode:()=>comicEditor?.isActive()||generalComicEditor?.isActive()?"comic":"single",
        getDocumentId:()=>documentId,
        getSingleSource:selectedSingleImageSource,
        getComicSources:()=>generalComicEditor?.isActive()?generalComicEditor.getConversionSources?.()||Promise.resolve([]):comicEditor?.getConversionSources?.()||Promise.resolve([]),
        addPageImage:(blob,name)=>generalComicEditor?.isActive()?generalComicEditor.addConvertedImage?.(blob,name):comicEditor?.addConvertedImage?.(blob,name),
        applySingleImage:(blob,name,source)=>applyProcessedSingleImage(blob,name||`${sourceName||"speech_bubble"}-comic`,"comic-conversion",source),
        setStatus:setSaveState,
      });
      return comicConverter;
    }
    function initializeBackgroundRemoval(){
      if(backgroundRemoval||!window.SpeechBubbleBackgroundRemoval||!(hostMode.startsWith("desktop")||isForgeProjectHost))return backgroundRemoval;
      backgroundRemoval=window.SpeechBubbleBackgroundRemoval.create({
        getMode:()=>comicEditor?.isActive()||generalComicEditor?.isActive()?"comic":"single",
        getSingleSource:selectedSingleImageSource,
        getComicSources:()=>generalComicEditor?.isActive()?generalComicEditor.getConversionSources?.()||Promise.resolve([]):comicEditor?.getConversionSources?.()||Promise.resolve([]),
        addPageImage:(blob,name)=>generalComicEditor?.isActive()?generalComicEditor.addConvertedImage?.(blob,name):comicEditor?.addConvertedImage?.(blob,name),
        applySingleImage:(blob,name,source)=>applyProcessedSingleImage(blob,name||`${sourceName||"speech_bubble"}-no-bg`,"background-removal",source),
        setStatus:setSaveState,
        aiInferenceAvailable:true,
        aiApiBase:isForgeProjectHost?`${forgeApiBase}/background-removal`:"/desktop/background-removal",
      });
      return backgroundRemoval;
    }
    function initializeQuickRetouch(){
      if(quickRetouch||!window.SpeechBubbleQuickRetouch)return quickRetouch;
      quickRetouch=window.SpeechBubbleQuickRetouch.create({
        getMode:()=>comicEditor?.isActive()||generalComicEditor?.isActive()?"comic":"single",
        getSingleSource:selectedSingleImageSource,
        getComicSources:()=>generalComicEditor?.isActive()?generalComicEditor.getConversionSources?.()||Promise.resolve([]):comicEditor?.getConversionSources?.()||Promise.resolve([]),
        addPageImage:(blob,name)=>generalComicEditor?.isActive()?generalComicEditor.addConvertedImage?.(blob,name):comicEditor?.addConvertedImage?.(blob,name),
        applySingleImage:(blob,name,source)=>applyProcessedSingleImage(blob,name||`${sourceName||"speech_bubble"}-retouched`,"quick-retouch",source),
        setStatus:setSaveState,
      });
      return quickRetouch;
    }
    const savedLayoutKey = (id=documentId) => id ? `${SAVED_LAYOUT_PREFIX}${id}` : "";
    const draftLayoutKey = (id=documentId) => id ? `${DRAFT_LAYOUT_PREFIX}${id}` : "";
    function legacyImageHash(id=documentId){return id?.startsWith("image:")?id.slice(6):"";}
    function postHost(type,payload={}){window.opener?.postMessage({type,key:jsonKey,source_tab:sourceTab,...payload},location.origin);}
    function editorConnectionState(){return{jsonKey,documentId,mode:documentMode,sourceTab,sourceName};}
    function safeStoredLayout(value){if(typeof value!=="string"||!value.trim())return"{}";try{return JSON.stringify(JSON.parse(value),null,2);}catch{return"{}";}}
    function localLayoutCache(id=documentId){if(!id)return{saved:"{}",draft:"",hasSaved:false,hasDraft:false};let saved="{}",draft="",hasSaved=false,hasDraft=false;try{let savedRaw=localStorage.getItem(savedLayoutKey(id)),draftRaw=autoSaveEnabled?localStorage.getItem(draftLayoutKey(id)):null;const legacyHash=legacyImageHash(id);if(savedRaw===null&&legacyHash)savedRaw=localStorage.getItem(`${LEGACY_SAVED_LAYOUT_PREFIX}${legacyHash}`);if(draftRaw===null&&legacyHash&&autoSaveEnabled)draftRaw=localStorage.getItem(`${LEGACY_DRAFT_LAYOUT_PREFIX}${legacyHash}`);hasSaved=typeof savedRaw==="string";hasDraft=typeof draftRaw==="string";saved=safeStoredLayout(savedRaw||"{}");draft=hasDraft?safeStoredLayout(draftRaw):"";}catch{}return{saved,draft,hasSaved,hasDraft};}
    function openDocumentDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DOCUMENT_DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(DOCUMENT_DB_STORE))request.result.createObjectStore(DOCUMENT_DB_STORE,{keyPath:"documentId"});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
    function draftCacheMetadata(){try{const value=JSON.parse(localStorage.getItem(DRAFT_META_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return{};}}
    function saveDraftCacheMetadata(value){try{localStorage.setItem(DRAFT_META_KEY,JSON.stringify(value));}catch{}}
    function removeDraftCache(id=documentId){if(!id)return;try{localStorage.removeItem(draftLayoutKey(id));const metadata=draftCacheMetadata();delete metadata[id];saveDraftCacheMetadata(metadata);}catch{}}
    function pruneDraftCache(){
      try{
        const now=Date.now(),cutoff=now-DRAFT_MAX_AGE_MS,metadata=draftCacheMetadata(),entries=[];
        for(let index=0;index<localStorage.length;index++){
          const key=localStorage.key(index);
          if(!key?.startsWith(DRAFT_LAYOUT_PREFIX))continue;
          const id=key.slice(DRAFT_LAYOUT_PREFIX.length),updatedAt=Number(metadata[id])||now;
          if(updatedAt<cutoff){localStorage.removeItem(key);delete metadata[id];index--;continue;}
          entries.push({id,key,updatedAt});
        }
        entries.sort((left,right)=>right.updatedAt-left.updatedAt);
        for(const entry of entries.slice(MAX_DRAFT_DOCUMENTS)){localStorage.removeItem(entry.key);delete metadata[entry.id];}
        const retained={};for(const entry of entries.slice(0,MAX_DRAFT_DOCUMENTS)){retained[entry.id]=entry.updatedAt;}
        saveDraftCacheMetadata(retained);
        return{count:Object.keys(retained).length,removed:Math.max(0,entries.length-MAX_DRAFT_DOCUMENTS)};
      }catch{return{count:0,removed:0};}
    }
    function touchDraftCache(id=documentId){if(!id)return;const metadata=draftCacheMetadata();metadata[id]=Date.now();saveDraftCacheMetadata(metadata);pruneDraftCache();}
    function backgroundRecordKind(record){const id=String(record?.documentId||"");return record?.kind==="generated"||id.startsWith("generated:")?"generated":"standalone";}
    function retainedBackgroundRecords(records,kind,maximum){return records.filter(record=>backgroundRecordKind(record)===kind).sort((left,right)=>(Number(right.updatedAt)||0)-(Number(left.updatedAt)||0)).slice(0,maximum);}
    async function pruneDocumentBackgrounds(){
      try{
        const db=await openDocumentDb();let records=[];
        await new Promise((resolve,reject)=>{const transaction=db.transaction(DOCUMENT_DB_STORE,"readonly"),request=transaction.objectStore(DOCUMENT_DB_STORE).getAll();request.onsuccess=()=>{records=Array.isArray(request.result)?request.result:[];};transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});
        db.close();
        const standalone=retainedBackgroundRecords(records,"standalone",MAX_STANDALONE_BACKGROUNDS),generated=retainedBackgroundRecords(records,"generated",MAX_GENERATED_BACKGROUNDS),retainedIds=new Set([...standalone,...generated].map(record=>record.documentId));
        const removed=records.filter(record=>!retainedIds.has(record.documentId));
        if(removed.length){const cleanupDb=await openDocumentDb();await new Promise((resolve,reject)=>{const transaction=cleanupDb.transaction(DOCUMENT_DB_STORE,"readwrite"),store=transaction.objectStore(DOCUMENT_DB_STORE);removed.forEach(record=>store.delete(record.documentId));transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});cleanupDb.close();}
        const previous=localStorage.getItem(LAST_STANDALONE_ID_KEY)||"";
        if(removed.some(record=>record.documentId===previous)){const newest=standalone[0]?.documentId;if(newest)localStorage.setItem(LAST_STANDALONE_ID_KEY,newest);else localStorage.removeItem(LAST_STANDALONE_ID_KEY);}
        return{standalone:standalone.length,generated:generated.length,removed:removed.length};
      }catch(error){console.warn("Speech Bubble standalone background cleanup failed",error);return{count:0,removed:0};}
    }
    function openExportDirectoryDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(EXPORT_DIRECTORY_DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(EXPORT_DIRECTORY_DB_STORE))request.result.createObjectStore(EXPORT_DIRECTORY_DB_STORE,{keyPath:"id"});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
    async function clearRememberedExportDirectory(){try{const db=await openExportDirectoryDb();await new Promise((resolve,reject)=>{const transaction=db.transaction(EXPORT_DIRECTORY_DB_STORE,"readwrite");transaction.objectStore(EXPORT_DIRECTORY_DB_STORE).delete("last");transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});db.close();}catch(error){console.warn("Speech Bubble export directory reset failed",error);}}
    async function loadRememberedExportDirectory(){if(!rememberExportDirectory){await clearRememberedExportDirectory();return null;}try{const db=await openExportDirectoryDb();let record=null;await new Promise((resolve,reject)=>{const transaction=db.transaction(EXPORT_DIRECTORY_DB_STORE,"readonly"),request=transaction.objectStore(EXPORT_DIRECTORY_DB_STORE).get("last");request.onsuccess=()=>{record=request.result||null;};transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});db.close();if(record?.version!==exportDirectoryVersion){if(record)await clearRememberedExportDirectory();return null;}return record?.handle?.kind==="directory"?record.handle:null;}catch(error){console.warn("Speech Bubble remembered export directory unavailable",error);return null;}}
    async function storeRememberedExportDirectory(handle){if(!rememberExportDirectory||!handle)return;try{const db=await openExportDirectoryDb();await new Promise((resolve,reject)=>{const transaction=db.transaction(EXPORT_DIRECTORY_DB_STORE,"readwrite");transaction.objectStore(EXPORT_DIRECTORY_DB_STORE).put({id:"last",handle,version:exportDirectoryVersion,updatedAt:Date.now()});transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});db.close();}catch(error){console.warn("Speech Bubble export directory save failed",error);}}
    async function cachedBackground(id){if(!id)return null;try{const db=await openDocumentDb();return await new Promise((resolve,reject)=>{const transaction=db.transaction(DOCUMENT_DB_STORE,"readonly"),request=transaction.objectStore(DOCUMENT_DB_STORE).get(id);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);transaction.oncomplete=()=>db.close();});}catch(error){console.warn("Speech Bubble cached background unavailable",error);return null;}}
    async function documentBackground(id){return id?.startsWith("standalone:")?cachedBackground(id):null;}
    async function storeCachedBackground(record){if(!record?.documentId||!record?.blob)return;const db=await openDocumentDb();await new Promise((resolve,reject)=>{const transaction=db.transaction(DOCUMENT_DB_STORE,"readwrite");transaction.objectStore(DOCUMENT_DB_STORE).put({...record,updatedAt:Date.now()});transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error);});db.close();await pruneDocumentBackgrounds();}
    async function storeDocumentBackground(id,blob,name){if(!id?.startsWith("standalone:")||!blob)return;try{await storeCachedBackground({documentId:id,kind:"standalone",blob,sourceName:name||"speech_bubble"});localStorage.setItem(LAST_STANDALONE_ID_KEY,id);}catch(error){console.warn("Speech Bubble standalone background save failed",error);}}
    async function generatedBackgroundId(name,tab,url){const cleanUrl=String(url||"").split("?")[0],fallback=cleanUrl.split("/").pop()||"speech_bubble",identity=`${String(tab||"unknown").toLowerCase()}\n${String(name||fallback).toLowerCase()}`;try{const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity));return`generated:${Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("")}`;}catch{let hash=2166136261;for(let index=0;index<identity.length;index++){hash^=identity.charCodeAt(index);hash=Math.imul(hash,16777619);}return`generated:${(hash>>>0).toString(16).padStart(8,"0")}`;}}
    async function storeGeneratedBackground(id,blob,name,tab,url){if(!id?.startsWith("generated:")||!blob)return;try{await storeCachedBackground({documentId:id,kind:"generated",blob,sourceName:name||"speech_bubble",sourceTab:tab||"",sourceUrl:String(url||"")});}catch(error){console.warn("Speech Bubble generated background save failed",error);}}
    function setSaveState(message,level="info",detail=""){const node=document.getElementById("saveState");if(!node)return;node.textContent=message;node.title=detail||message;node.dataset.level=level;}
    function hasEditableDocument(){const defaultBackground=normalizedCanvasBackground(),customizedSingleCanvas=activeWorkspace==="single"&&(JSON.stringify(normalizedCanvasBackground(state.canvasBackground))!==JSON.stringify(defaultBackground)||state.backgroundVisible===false);return Boolean(imageLoaded&&state.backgroundImage.attached&&image.naturalWidth)||Boolean(workspaces.single.elements.length)||customizedSingleCanvas||Boolean(comicEditor?.isActive())||Boolean(generalComicEditor?.hasPage());}
    function updateActionState(){const hasDocument=hasEditableDocument();document.getElementById("saveLayout").disabled=!hasDocument;document.getElementById("exportImage").disabled=!hasDocument;document.getElementById("discardChanges").disabled=!hasDocument||!layoutDirty;document.getElementById("emptyCanvasState").hidden=hasDocument||activeWorkspace!=="single"||!showEmptyCanvasGuide;if(!hasDocument)setSaveState(generalComicEditor?.isActive()?uiText("コミックページを作成してください","Create a comic page"):uiText("画像を読み込んでください","Load an image to begin"),"info");else if(layoutDirty)setSaveState(autoSaveEnabled?uiText("未保存の変更（下書き保存対象）","Unsaved changes (included in draft)"):uiText("未保存の変更があります","Unsaved changes"),"dirty");else if(hasExplicitSavedLayout)setSaveState(uiText("レイアウト保存済み","Layout saved"),"saved");else setSaveState(activeStructuralEditor()&&!imageLoaded?uiText("新規漫画ページ","New comic page"):uiText("新規レイアウト","New layout"),"info");}
    let forgeProjectChangeQueued=false;
    function notifyForgeProjectChanged(){
      projectImageTray?.render();
      if(!isForgeProjectHost||forgeProjectChangeQueued)return;
      forgeProjectChangeQueued=true;
      queueMicrotask(()=>{forgeProjectChangeQueued=false;window.dispatchEvent(new CustomEvent("speech-bubble:document-changed"));});
    }
    function markLayoutDirty(){if(!dirtyTrackingEnabled||!hasEditableDocument())return;layoutDirty=currentLayoutJson()!==lastSavedLayout;updateActionState();if(layoutDirty)notifyForgeProjectChanged();}
    let sfxBrowseMode="sfx";
    let sfxSortMode="recommended";
    let userPresets = [];
    let layerClipboard = null;
    let layerPasteCount = 0;
    let fontCatalog = [];
    let fontFamilies = [];
    let fontFilter = "all";
    const expandedFontFamilies = new Set();
    const FONT_FAVORITES_KEY = "speech_bubble:font_favorites:v1";
    const FONT_RECENT_KEY = "speech_bubble:font_recent:v1";
    const ASSET_FAVORITES_KEY = "speech_bubble:asset_favorites:v1";
    const FONT_LANGUAGE_ORDER = ["ja","zh-hans","zh-hant","ko","latin","arabic","hebrew","devanagari","emoji","symbol","other"];
    const FONT_LANGUAGE_LABELS = {ja:"日本語","zh-hans":"简体中文","zh-hant":"繁體中文",ko:"한국어",latin:"Latin",arabic:"العربية",hebrew:"עברית",devanagari:"देवनागरी",emoji:"Emoji",symbol:"Symbols",other:"Other"};
    const FONT_LANGUAGE_LABELS_EN = {ja:"Japanese","zh-hans":"Simplified Chinese","zh-hant":"Traditional Chinese",ko:"Korean",latin:"Latin",arabic:"Arabic",hebrew:"Hebrew",devanagari:"Devanagari",emoji:"Emoji",symbol:"Symbols",other:"Other"};
    function fontLanguageLabel(language){return(uiEnglish()?FONT_LANGUAGE_LABELS_EN:FONT_LANGUAGE_LABELS)[language]||"Other";}
    const COMIC_YELLOW = "#ffd42a";
    const SFX_ASSET_VERSION = assetCacheVersion;
    const SFX_SORT_KEY = "speech_bubble:sfx_sort:v1";
    const COMIC_SWATCHES = ["#111111","#ffffff","#808080","#e53935","#fb8c00",COMIC_YELLOW,"#aeea00","#43a047","#26c6da","#6ec6ff","#1e88e5","#3949ab","#8e24aa","#ec407a","#8d6e63","#f1c39b","#d9d9d9","#4a4a4a","#7a1f2b","#ff6b6b","#ffc857","#f6e58d","#6b8e23","#1b5e20","#00897b","#0d3b66","#6c4ab6","#f4a6c1"];
    // Emphasis Lines core start
    const EMPHASIS_EDGE_OVERSHOOT = .035;
    const EMPHASIS_PRESETS = Object.freeze([
      Object.freeze({id:"center",label:"Center",line_count:180,inner_x:.5,inner_y:.5,line_width:.006,line_length:1,taper:1,center_x:.5,center_y:.5,length_random:0,inner_random:.5,width_random:.48,spacing_random:.38}),
      Object.freeze({id:"wide",label:"Wide",line_count:210,inner_x:.45,inner_y:.45,line_width:.005,line_length:1,taper:1,center_x:.5,center_y:.5,length_random:0,inner_random:.5,width_random:.55,spacing_random:.42}),
      Object.freeze({id:"tall",label:"Tall",line_count:190,inner_x:.45,inner_y:.45,line_width:.0055,line_length:1,taper:1,center_x:.5,center_y:.5,length_random:0,inner_random:.5,width_random:.50,spacing_random:.42}),
      Object.freeze({id:"side",label:"One Side",line_count:130,inner_x:.45,inner_y:.45,line_width:.008,line_length:1,taper:1,center_x:-.12,center_y:.5,length_random:0,inner_random:.5,width_random:.50,spacing_random:.34}),
    ]);
    const EMPHASIS_BY_ID = new Map(EMPHASIS_PRESETS.map(preset=>[preset.id,preset]));
    const EMPHASIS_GEOMETRY_KEYS = new Set(["preset","line_count","inner_x","inner_y","line_width","line_length","taper","center_x","center_y","length_random","inner_random","width_random","spacing_random","seed","w","h"]);
    const EMPHASIS_GAP_MIN = .03;
    const EMPHASIS_GAP_MAX = .65;
    function emphasisClamp(value,minimum,maximum,fallback){const number=Number(value);return Math.max(minimum,Math.min(maximum,Number.isFinite(number)?number:fallback));}
    function emphasisCenterGapValue(item){const x=Math.max(1e-8,Number(item?.inner_x)||.15),y=Math.max(1e-8,Number(item?.inner_y)||.20);return Math.sqrt(x*y);}
    function scaleCenterGapPair(startX,startY,requestedGap){startX=emphasisClamp(startX,EMPHASIS_GAP_MIN,EMPHASIS_GAP_MAX,.15);startY=emphasisClamp(startY,EMPHASIS_GAP_MIN,EMPHASIS_GAP_MAX,.20);const startGap=emphasisCenterGapValue({inner_x:startX,inner_y:startY}),requested=emphasisClamp(requestedGap,EMPHASIS_GAP_MIN,EMPHASIS_GAP_MAX,startGap),minimumScale=Math.max(EMPHASIS_GAP_MIN/startX,EMPHASIS_GAP_MIN/startY),maximumScale=Math.min(EMPHASIS_GAP_MAX/startX,EMPHASIS_GAP_MAX/startY),scale=emphasisClamp(requested/startGap,minimumScale,maximumScale,1);return{inner_x:startX*scale,inner_y:startY*scale};}
    function emphasisMulberry32(seed){let value=Number(seed)>>>0;return()=>{value|=0;value=value+0x6D2B79F5|0;let result=Math.imul(value^value>>>15,1|value);result=result+Math.imul(result^result>>>7,61|result)^result;return((result^result>>>14)>>>0)/4294967296;};}
    function normalizeEmphasisParams(source={}){
      const preset=EMPHASIS_BY_ID.get(source.preset)||EMPHASIS_PRESETS[0];
      return{
        preset:preset.id,
        line_count:Math.round(emphasisClamp(source.line_count,20,500,preset.line_count)),
        inner_x:emphasisClamp(source.inner_x,.03,.65,preset.inner_x),
        inner_y:emphasisClamp(source.inner_y,.03,.65,preset.inner_y),
        line_width:emphasisClamp(source.line_width,.0005,.035,preset.line_width),
        line_length:emphasisClamp(source.line_length,.15,1,preset.line_length),
        taper:emphasisClamp(source.taper,0,1,preset.taper),
        overshoot:EMPHASIS_EDGE_OVERSHOOT,
        center_x:emphasisClamp(source.center_x,-.5,1.5,preset.center_x),
        center_y:emphasisClamp(source.center_y,-.5,1.5,preset.center_y),
        length_random:emphasisClamp(source.length_random,0,1,preset.length_random),
        inner_random:emphasisClamp(source.inner_random,0,1,preset.inner_random),
        width_random:emphasisClamp(source.width_random,0,1,preset.width_random),
        spacing_random:emphasisClamp(source.spacing_random,0,1,preset.spacing_random),
        seed:Number(source.seed)>>>0,
      };
    }
    function emphasisEllipseRadius(radiusX,radiusY,angle){const cosine=Math.cos(angle),sine=Math.sin(angle);return 1/Math.sqrt(cosine*cosine/(radiusX*radiusX)+sine*sine/(radiusY*radiusY));}
    function emphasisRayBoxInterval(originX,originY,directionX,directionY,width,height){
      let enter=-Infinity,exit=Infinity;
      for(const [origin,direction,minimum,maximum] of [[originX,directionX,0,width],[originY,directionY,0,height]]){
        if(Math.abs(direction)<1e-12){if(origin<minimum||origin>maximum)return null;continue;}
        let near=(minimum-origin)/direction,far=(maximum-origin)/direction;if(near>far)[near,far]=[far,near];
        enter=Math.max(enter,near);exit=Math.min(exit,far);if(enter>exit)return null;
      }
      return!Number.isFinite(exit)||exit<=0?null:[Math.max(0,enter),exit];
    }
    function generateNormalizedEmphasisRays(source,width,height){
      const params=normalizeEmphasisParams(source);width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);
      const random=emphasisMulberry32(params.seed),centerX=params.center_x*width,centerY=params.center_y*height,baseSize=Math.min(width,height),radiusX=Math.max(2,params.inner_x*width),radiusY=Math.max(2,params.inner_y*height),overshoot=baseSize*params.overshoot,rays=[];
      for(let index=0;index<params.line_count;index+=1){
        const regular=index/params.line_count*Math.PI*2,jitter=(random()-.5)*(Math.PI*2/params.line_count)*params.spacing_random*1.9,angle=regular+jitter,directionX=Math.cos(angle),directionY=Math.sin(angle),interval=emphasisRayBoxInterval(centerX,centerY,directionX,directionY,width,height);
        if(!interval)continue;
        const [entry,exit]=interval,inner=emphasisEllipseRadius(radiusX,radiusY,angle),innerRandomSample=random(),lengthRandomSample=random(),widthRandomSample=random(),innerJitter=inner*params.inner_random*(innerRandomSample-.5)*.8,minimumStart=entry-overshoot,nominalStart=Math.max(minimumStart,inner),startBase=Math.max(minimumStart,inner+innerJitter),outer=exit+overshoot,nominalUsable=Math.max(0,outer-nominalStart);
        if(nominalUsable<=1e-6)continue;
        const start=Math.max(0,startBase),lengthFactor=1-params.length_random*lengthRandomSample,end=outer-nominalUsable*(1-params.line_length*lengthFactor);
        if(end<=start+1e-6)continue;
        const widthFactor=1+(widthRandomSample-.5)*2*params.width_random,outerWidth=Math.max(.3,baseSize*params.line_width*widthFactor),innerWidth=Math.max(.05,outerWidth*(1-params.taper)),perpendicularX=-directionY,perpendicularY=directionX,startX=centerX+directionX*start,startY=centerY+directionY*start,endX=centerX+directionX*end,endY=centerY+directionY*end;
        rays.push([
          [(startX+perpendicularX*innerWidth/2)/width,(startY+perpendicularY*innerWidth/2)/height],
          [(endX+perpendicularX*outerWidth/2)/width,(endY+perpendicularY*outerWidth/2)/height],
          [(endX-perpendicularX*outerWidth/2)/width,(endY-perpendicularY*outerWidth/2)/height],
          [(startX-perpendicularX*innerWidth/2)/width,(startY-perpendicularY*innerWidth/2)/height],
        ]);
      }
      return rays;
    }
    function validEmphasisRays(value){if(!Array.isArray(value)||!value.length||value.length>500)return null;const output=[];for(const polygon of value){if(!Array.isArray(polygon)||polygon.length!==4)return null;const clean=[];for(const point of polygon){if(!Array.isArray(point)||point.length!==2)return null;const x=Number(point[0]),y=Number(point[1]);if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>4||Math.abs(y)>4)return null;clean.push([x,y]);}output.push(clean);}return output;}
    // Emphasis Lines core end
    let FRAME_ASSET_VERSION = "20260719-08";
    const FALLBACK_FRAME_PRESETS = [
      {id:"frame-border",label:"Frame Border",category:"border",frame_kind:"border",frame_mode:"border",pin_to_top:true,border_color:"#ffffff",border_width:36,inner_stroke_color:"#111111",inner_stroke_width:4,keywords:"white border black inner outline panel"},
      {id:"black-border",label:"Black Border",category:"border",frame_kind:"border",frame_mode:"border",pin_to_top:true,border_color:"#111111",border_width:24,inner_stroke_color:"#111111",inner_stroke_width:0,keywords:"black comic panel border"},
    ];
    function normalizeFramePreset(preset) {
      const value = {...preset};
      const rawParts = value.parts || value.frame_parts || {};
      const rawLayout = value.edgeLayout || value.layout || value.frame_layout || {};
      const rawBase = value.baseBorder || value.base_border || {};
      const rawDecorations = value.decorations || {};
      const partAliases = {
        cornerTL:"corner_tl", cornerTR:"corner_tr", cornerBL:"corner_bl", cornerBR:"corner_br",
        edgeTop:"edge_top", edgeBottom:"edge_bottom", edgeLeft:"edge_left", edgeRight:"edge_right"
      };
      const cornerAliases = {topLeft:"corner_tl", topRight:"corner_tr", bottomLeft:"corner_bl", bottomRight:"corner_br"};
      value.id = String(value.id || "").trim();
      value.label = String(value.label || value.id || "Frame");
      value.category = String(value.category || "border");
      value.asset_src = value.asset_src || value.runtimeAsset || "";
      value.asset_src_2x = value.asset_src_2x || value.runtimeAsset2x || "";
      value.preview_src = value.preview_src || value.previewUrl || value.preview || "";
      value.source_size = value.source_size || value.nativeSize || {width:1024,height:1536};
      value.source_size_2x = value.source_size_2x || value.nativeSize2x || null;
      value.frame_kind = value.frame_kind || value.kind || (value.asset_src ? "decorative" : "border");
      value.frame_mode = value.frame_mode || value.render_mode || value.renderMode || (value.asset_src ? "nine-slice" : "border");
      value.frame_slice = value.frame_slice || value.slice || null;
      value.frame_parts = {};
      for (const [key, source] of Object.entries(rawParts)) value.frame_parts[partAliases[key] || key] = source;
      value.frame_layout = {
        distribution: rawLayout.distribution || "space-evenly",
        preserve_aspect_ratio: rawLayout.preserve_aspect_ratio ?? rawLayout.preserveAspectRatio ?? true,
        minimum_tiles: Math.max(0, Math.round(finiteOr(rawLayout.minimum_tiles ?? rawLayout.minimumTiles, 1))),
        maximum_tiles: Math.max(1, Math.round(finiteOr(rawLayout.maximum_tiles ?? rawLayout.maximumTiles, 64))),
        clip_per_tile: rawLayout.clip_per_tile ?? rawLayout.clipPerTile ?? false,
        safe_padding_ratio: Math.max(0, Math.min(.49, finiteOr(rawLayout.safe_padding_ratio ?? rawLayout.safePaddingRatio, 0)))
      };
      value.base_border = {
        enabled: rawBase.enabled !== false,
        shape: String(rawBase.shape || "rounded-rectangle"),
        inset: finiteOr(rawBase.inset, 0),
        radius: Math.max(0, finiteOr(rawBase.radius, 0)),
        layers: Array.isArray(rawBase.layers) ? rawBase.layers.map(layer => ({
          color: String(layer?.color || "#ffffff"),
          width: Math.max(.1, finiteOr(layer?.width, 1)),
          style: ["solid","dotted","dashed"].includes(String(layer?.style || "solid")) ? String(layer?.style || "solid") : "solid",
          dash: Array.isArray(layer?.dash) ? layer.dash.map(value => Math.max(.1, finiteOr(value, 1))) : [],
          offset: finiteOr(layer?.offset, 0)
        })) : []
      };
      const existingDecoratedCorners = value.decorated_corners || {};
      const existingDecoratedItems = value.decorated_items || {};
      const existingDecoratedEdges = value.decorated_edges || {};
      const existingDecoratedFillers = value.decorated_fillers || {};
      const existingDecoratedLayout = value.decorated_layout || {};
      value.decorated_corners = {};
      for (const [key, source] of Object.entries(rawDecorations.corners || existingDecoratedCorners)) {
        value.decorated_corners[cornerAliases[key] || key] = source;
      }
      value.decorated_items = {...(rawDecorations.items || existingDecoratedItems)};
      value.decorated_edges = {
        top: [...(rawDecorations.edges?.top || existingDecoratedEdges.top || [])],
        bottom: [...(rawDecorations.edges?.bottom || existingDecoratedEdges.bottom || [])],
        left: [...(rawDecorations.edges?.left || existingDecoratedEdges.left || [])],
        right: [...(rawDecorations.edges?.right || existingDecoratedEdges.right || [])]
      };
      value.decorated_fillers = {
        top: [...(rawDecorations.fillers?.top || existingDecoratedFillers.top || [])],
        bottom: [...(rawDecorations.fillers?.bottom || existingDecoratedFillers.bottom || [])],
        left: [...(rawDecorations.fillers?.left || existingDecoratedFillers.left || [])],
        right: [...(rawDecorations.fillers?.right || existingDecoratedFillers.right || [])]
      };
      const rawDecorationTargets = value.decorationTargets || value.decoration_targets || {};
      const rawDecorationMeta = value.decorationMeta || value.decoration_meta || {};
      value.decorated_targets = {...rawDecorationTargets};
      value.decorated_item_meta = {...rawDecorationMeta};
      const rawAdaptive = value.adaptiveLayout || value.adaptive_layout || {};
      value.decorated_adaptive_layout = {
        enabled: rawAdaptive.enabled === true,
        reference_short_side: finiteOr(rawAdaptive.reference_short_side ?? rawAdaptive.referenceShortSide, 1024),
        minimum_item_scale: finiteOr(rawAdaptive.minimum_item_scale ?? rawAdaptive.minimumItemScale, .88),
        maximum_item_scale: finiteOr(rawAdaptive.maximum_item_scale ?? rawAdaptive.maximumItemScale, 1),
        minimum_gap_px: finiteOr(rawAdaptive.minimum_gap_px ?? rawAdaptive.minimumGapPx, 8),
        target_gap_px: finiteOr(rawAdaptive.target_gap_px ?? rawAdaptive.targetGapPx, 16),
        maximum_gap_px: finiteOr(rawAdaptive.maximum_gap_px ?? rawAdaptive.maximumGapPx, 24),
        never_scale_whole_sequence_to_fit: rawAdaptive.never_scale_whole_sequence_to_fit ?? rawAdaptive.neverScaleWholeSequenceToFit ?? true,
        overflow_mode: rawAdaptive.overflow_mode || rawAdaptive.overflowMode || "reduce-count",
        underflow_mode: rawAdaptive.underflow_mode || rawAdaptive.underflowMode || "repeat-primary-before-large-gap",
        remove_priority: [...(rawAdaptive.remove_priority || rawAdaptive.removePriority || ["filler","flower","primary"])],
        minimum_primary_items_per_edge: Math.max(0, Math.round(finiteOr(rawAdaptive.minimum_primary_items_per_edge ?? rawAdaptive.minimumPrimaryItemsPerEdge, 1))),
        maximum_items_per_edge: Math.max(1, Math.round(finiteOr(rawAdaptive.maximum_items_per_edge ?? rawAdaptive.maximumItemsPerEdge, 18))),
        edge_inset_ratio: Math.max(0, Math.min(.49, finiteOr(rawAdaptive.edge_inset_ratio ?? rawAdaptive.edgeInsetRatio, 0)))
      };
      const decoratedLayout = rawDecorations.layout || existingDecoratedLayout;
      value.decorated_layout = {
        distribution: decoratedLayout.distribution || "space-evenly",
        preserve_aspect_ratio: decoratedLayout.preserve_aspect_ratio ?? decoratedLayout.preserveAspectRatio ?? true,
        clip_per_item: decoratedLayout.clip_per_item ?? decoratedLayout.clipPerItem ?? false,
        safe_padding_ratio: Math.max(0, Math.min(.49, finiteOr(decoratedLayout.safe_padding_ratio ?? decoratedLayout.safePaddingRatio, .08))),
        corner_scale: Math.max(.05, finiteOr(decoratedLayout.corner_scale ?? decoratedLayout.cornerScale, 1)),
        edge_scale: Math.max(.05, finiteOr(decoratedLayout.edge_scale ?? decoratedLayout.edgeScale, value.decorated_adaptive_layout.enabled ? 1 : .72)),
        avoid_corner_overlap: decoratedLayout.avoid_corner_overlap ?? decoratedLayout.avoidCornerOverlap ?? true
      };
      value.fit_mode = value.fit_mode || value.fitMode || "cover";
      value.fit_mode = ["cover","contain","stretch","tile"].includes(value.fit_mode) ? value.fit_mode : "cover";
      value.pin_to_top = (value.pin_to_top ?? value.pinToTop) !== false;
      value.mouse_transparent = (value.mouse_transparent ?? value.mouseTransparent) !== false;
      value.default_scale = finiteOr(value.default_scale ?? value.defaultScale, 100);
      value.default_inset = finiteOr(value.default_inset ?? value.defaultInset, 0);
      value.attached_decorations = (value.attached_decorations || value.attachedDecorations || []).map(decoration => ({
        id:String(decoration.id || ""), label:String(decoration.label || decoration.id || "Decoration"),
        asset_src:decoration.asset_src || decoration.asset || "", asset_src_2x:decoration.asset_src_2x || decoration.asset2x || "",
        x_ratio:finiteOr(decoration.x_ratio ?? decoration.xRatio, .5), bottom_ratio:finiteOr(decoration.bottom_ratio ?? decoration.bottomRatio, 0),
        scale:Math.max(.01, finiteOr(decoration.scale, 1))
      })).filter(decoration => decoration.id && decoration.asset_src);
      return value;
    }
        let FRAME_PRESETS = FALLBACK_FRAME_PRESETS.map(normalizeFramePreset);
    let FRAME_BY_ID = new Map(FRAME_PRESETS.map(preset=>[preset.id,preset]));
    async function loadFrameManifest(){try{const response=await fetch(`${apiBase}/frame-assets?v=${encodeURIComponent(assetCacheVersion)}`,{cache:"force-cache"});if(!response.ok)throw new Error(`Frame asset API failed (${response.status})`);const payload=await response.json(),frames=Array.isArray(payload?.frames)?payload.frames.map(normalizeFramePreset).filter(frame=>frame.id):[];if(frames.length){FRAME_PRESETS=frames;FRAME_BY_ID=new Map(frames.map(frame=>[frame.id,frame]));FRAME_ASSET_VERSION=String(payload.assetVersion||payload.asset_version||FRAME_ASSET_VERSION);}for(const warning of payload?.warnings||[])console.warn(`Speech Bubble frame asset warning: ${warning}`);}catch(error){console.warn("Speech Bubble frame asset API unavailable; using built-in fallback",error);}}
    try{const savedSort=localStorage.getItem(SFX_SORT_KEY);if(["recommended","usage","name"].includes(savedSort))sfxSortMode=savedSort;}catch{}
    const BUILTIN_SFX_PRESETS = [
      {id:"don-exclamation-mask",label:"ドン！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/don-exclamation-mask.webp",mask:true,w:360,h:360,keywords:"don entrance impact presence japanese"},
      {id:"ban-mask",label:"バン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/ban-mask.webp",mask:true,w:360,h:360,keywords:"ban impact entrance japanese"},
      {id:"doka-mask",label:"ドカ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/doka-mask.webp",mask:true,w:360,h:360,keywords:"doka heavy impact japanese"},
      {id:"baki-mask",label:"バキ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/baki-mask.webp",mask:true,w:360,h:360,keywords:"baki crack strike japanese"},
      {id:"gashaan-mask",label:"ガシャーン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gashaan-mask.webp",mask:true,w:420,h:300,keywords:"gashaan crash breaking japanese"},
      {id:"jaan-mask",label:"ジャーン！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/jaan-mask.webp",mask:true,fill:"#ffd42a",w:470,h:230,keywords:"jaan reveal fanfare announcement japanese horizontal"},
      {id:"parin-mask",label:"パリン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/parin-mask.webp",mask:true,w:380,h:300,keywords:"parin glass break japanese"},
      {id:"shu-mask",label:"シュ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/shu-mask.webp",mask:true,w:320,h:260,keywords:"shu speed slice movement japanese small yu"},
      {id:"exclamation-mask",label:"！",category:"symbols",format:"WebP Mask",src:"./assets/sfx/exclamation-mask.webp",mask:true,w:180,h:260,keywords:"exclamation punctuation symbol"},
      {id:"question-mask",label:"？",category:"symbols",format:"WebP Mask",src:"./assets/sfx/question-mask.webp",mask:true,w:220,h:280,keywords:"question punctuation symbol"},
      {id:"dakuten-mask",label:"濁点 ゛",category:"symbols",format:"WebP Mask",src:"./assets/sfx/dakuten-mask.webp",mask:true,w:160,h:160,keywords:"dakuten voiced mark japanese symbol"},
      {id:"small-tsu-mask",label:"小さいッ",category:"symbols",format:"WebP Mask",src:"./assets/sfx/small-tsu-mask.webp",mask:true,w:180,h:180,keywords:"small tsu sokuon japanese symbol"},
      {id:"basic-circle-mask",label:"丸",category:"symbols",format:"WebP Mask",src:"./assets/sfx/basic-circle-mask.webp",symbolKind:"circle",mask:true,fill:"#ffffff",stroke:"#111111",outlineWidth:3,w:320,h:320,keywords:"circle basic shape symbol"},
      {id:"basic-triangle-mask",label:"三角",category:"symbols",format:"WebP Mask",src:"./assets/sfx/basic-triangle-mask.webp",symbolKind:"triangle",mask:true,fill:"#ffffff",stroke:"#111111",outlineWidth:3,w:320,h:320,keywords:"triangle basic shape symbol"},
      {id:"basic-square-mask",label:"四角",category:"symbols",format:"WebP Mask",src:"./assets/sfx/basic-square-mask.webp",symbolKind:"square",mask:true,fill:"#ffffff",stroke:"#111111",outlineWidth:3,w:320,h:320,keywords:"square rectangle basic shape symbol"},
      {id:"basic-trapezoid-mask",label:"台形",category:"symbols",format:"WebP Mask",src:"./assets/sfx/basic-trapezoid-mask.webp",symbolKind:"trapezoid",mask:true,fill:"#ffffff",stroke:"#111111",outlineWidth:3,w:340,h:300,keywords:"trapezoid basic shape symbol"},
      {id:"punpun-mask",label:"ぷんぷん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/punpun-mask.webp",mask:true,w:390,h:260,keywords:"punpun angry emotion hiragana japanese brush"},
      {id:"jii-mask",label:"じーっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/jii-mask.webp",mask:true,w:360,h:240,keywords:"jii stare gaze hiragana japanese brush"},
      {id:"wakuwaku-mask",label:"わくわく",category:"japanese",format:"WebP Mask",src:"./assets/sfx/wakuwaku-mask.webp",mask:true,w:410,h:250,keywords:"wakuwaku excited anticipation hiragana japanese brush"},
      {id:"mochimochi-mask",label:"もちもち",category:"japanese",format:"WebP Mask",src:"./assets/sfx/mochimochi-mask.webp",mask:true,w:410,h:250,keywords:"mochimochi soft chewy hiragana japanese brush"},
      {id:"mushamusha-mask",label:"むしゃむしゃ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/mushamusha-mask.webp",mask:true,w:440,h:250,keywords:"mushamusha eating chewing hiragana japanese brush"},
      {id:"mogumogu-mask",label:"もぐもぐ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/mogumogu-mask.webp",mask:true,w:410,h:250,keywords:"mogumogu eating chewing hiragana japanese brush"},
      {id:"zuruzuru-mask",label:"ズルズル",category:"japanese",format:"WebP Mask",src:"./assets/sfx/zuruzuru-mask.webp",mask:true,w:420,h:250,keywords:"zuruzuru noodles slurp katakana japanese brush"},
      {id:"gyuu-mask",label:"ぎゅーっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gyuu-mask.webp",mask:true,w:380,h:250,keywords:"gyuu hug squeeze hiragana japanese brush"},
      {id:"nadenade-mask",label:"なでなで",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nadenade-mask.webp",mask:true,w:410,h:250,keywords:"nadenade pat stroke gentle hiragana japanese brush"},
      {id:"dokidoki-mask",label:"どきどき",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dokidoki-mask.webp",mask:true,w:410,h:250,keywords:"dokidoki heartbeat emotion hiragana japanese brush"},
      {id:"kirakira-mask",label:"きらきら",category:"japanese",format:"WebP Mask",src:"./assets/sfx/kirakira-mask.webp",mask:true,w:410,h:250,keywords:"kirakira sparkle light hiragana japanese brush"},
      {id:"fuwafuwa-mask",label:"ふわふわ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/fuwafuwa-mask.webp",mask:true,w:410,h:250,keywords:"fuwafuwa soft fluffy hiragana japanese brush"},
      {id:"pyonpyon-mask",label:"ぴょんぴょん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pyonpyon-mask.webp",mask:true,w:440,h:250,keywords:"pyonpyon jump bounce hiragana japanese brush"},
      {id:"anger-mark-mask",label:"怒りマーク",category:"effects",format:"WebP Mask",src:"./assets/sfx/anger-mark-mask.webp",mask:true,fill:"#e53935",w:220,h:220,keywords:"anger vein mark emotion effect manga brush"},
      {id:"brush-exclamation-mask",label:"筆 ！",category:"symbols",format:"WebP Mask",src:"./assets/sfx/brush-exclamation-mask.webp",mask:true,w:180,h:270,keywords:"brush exclamation punctuation japanese symbol"},
      {id:"brush-question-mask",label:"筆 ？",category:"symbols",format:"WebP Mask",src:"./assets/sfx/brush-question-mask.webp",mask:true,w:220,h:280,keywords:"brush question punctuation japanese symbol"},
      {id:"brush-heart-mask",label:"筆ハート",category:"symbols",format:"WebP Mask",src:"./assets/sfx/brush-heart-mask.webp",mask:true,w:260,h:250,keywords:"brush outline heart love japanese symbol"},
      {id:"biku-katakana-mask",label:"ビクッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/biku-katakana-mask.webp",mask:true,w:300,h:280,keywords:"biku twitch shock katakana japanese brush"},
      {id:"biku-katakana-mask-original-01",label:"ビクッ 01",category:"japanese",format:"WebP Mask",src:"./assets/sfx/biku-katakana-mask-original-01.webp",mask:true,w:300,h:280,keywords:"biku twitch shock katakana japanese overwritten original"},
      {id:"biku-hiragana-mask",label:"びくっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/biku-hiragana-mask.webp",mask:true,w:300,h:280,keywords:"biku twitch shock hiragana japanese brush"},
      {id:"biku-hiragana-mask-original-01",label:"びくっ 01",category:"japanese",format:"WebP Mask",src:"./assets/sfx/biku-hiragana-mask-original-01.webp",mask:true,w:164,h:300,keywords:"biku twitch shock hiragana japanese overwritten original"},
      {id:"bikun-mask",label:"びくん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/bikun-mask.webp",mask:true,w:330,h:260,keywords:"bikun twitch reaction hiragana japanese brush"},
      {id:"bikun-mask-original-01",label:"びくん 01",category:"japanese",format:"WebP Mask",src:"./assets/sfx/bikun-mask-original-01.webp",mask:true,w:330,h:260,keywords:"bikun twitch reaction hiragana japanese overwritten original"},
      {id:"zokuzoku-mask",label:"ぞくぞく",category:"japanese",format:"WebP Mask",src:"./assets/sfx/zokuzoku-mask.webp",mask:true,w:400,h:250,keywords:"zokuzoku shiver thrill hiragana japanese brush"},
      {id:"gyu-katakana-mask",label:"ギュッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gyu-katakana-mask.webp",mask:true,w:300,h:300,keywords:"gyu squeeze katakana japanese brush"},
      {id:"katakata-mask",label:"カタカタ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/katakata-mask.webp",mask:true,w:420,h:250,keywords:"katakata rattle tremble katakana japanese brush"},
      {id:"dokidoki-katakana-mask",label:"ドキドキ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dokidoki-katakana-mask.webp",mask:true,w:420,h:250,keywords:"dokidoki heartbeat katakana japanese brush"},
      {id:"gugu-mask",label:"ぐぐっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gugu-mask.webp",mask:true,w:380,h:260,keywords:"gugu strain press hiragana japanese brush"},
      {id:"piku-mask",label:"ぴくっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/piku-mask.webp",mask:true,w:280,h:320,keywords:"piku small twitch hiragana japanese brush"},
      {id:"hiku-mask",label:"ひくっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/hiku-mask.webp",mask:true,w:280,h:320,keywords:"hiku startled twitch hiragana japanese brush"},
      {id:"rerorero-mask",label:"れろれろ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/rerorero-mask.webp",mask:true,w:420,h:250,keywords:"rerorero repeated fluid motion hiragana japanese brush"},
      {id:"kunekune-mask",label:"くねくね",category:"japanese",format:"WebP Mask",src:"./assets/sfx/kunekune-mask.webp",mask:true,w:152,h:360,keywords:"kunekune wavy twisting hiragana japanese brush"},
      {id:"sawasawa-mask",label:"さわさわ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/sawasawa-mask.webp",mask:true,w:300,h:360,keywords:"sawasawa gentle touch rustle hiragana japanese brush"},
      {id:"taputapu-mask",label:"たぷたぷ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/taputapu-mask.webp",mask:true,w:420,h:250,keywords:"taputapu soft jiggle slosh hiragana japanese brush"},
      {id:"jupu-mask",label:"じゅぷ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/jupu-mask.webp",mask:true,w:280,h:330,keywords:"jupu small wet sound hiragana japanese brush"},
      {id:"nyuru-mask",label:"にゅる",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nyuru-mask.webp",mask:true,w:129,h:340,keywords:"nyuru slippery flow hiragana japanese brush"},
      {id:"buchu-mask",label:"ブチュ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/buchu-mask.webp",mask:true,w:380,h:260,keywords:"buchu kiss wet katakana japanese brush horizontal"},
      {id:"buchu-small-tsu-mask",label:"ブチュッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/buchu-small-tsu-mask.webp",mask:true,w:400,h:270,keywords:"buchu kiss wet katakana japanese brush horizontal"},
      {id:"buchupon-mask",label:"ブチュポン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/buchupon-mask.webp",mask:true,w:280,h:420,keywords:"buchupon wet pop katakana japanese brush vertical"},
      {id:"chu-small-tsu-mask",label:"チュッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chu-small-tsu-mask.webp",mask:true,w:340,h:260,keywords:"chu kiss katakana japanese brush horizontal"},
      {id:"chupu-mask",label:"チュプ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chupu-mask.webp",mask:true,w:360,h:260,keywords:"chupu wet katakana japanese brush horizontal"},
      {id:"chupu-small-tsu-mask",label:"チュプッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chupu-small-tsu-mask.webp",mask:true,w:380,h:270,keywords:"chupu wet katakana japanese brush horizontal"},
      {id:"chupun-mask",label:"チュプン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chupun-mask.webp",mask:true,w:280,h:400,keywords:"chupun wet katakana japanese brush vertical"},
      {id:"chupo-mask",label:"チュポ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chupo-mask.webp",mask:true,w:360,h:260,keywords:"chupo wet pop katakana japanese brush horizontal"},
      {id:"chupon-mask",label:"チュポン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chupon-mask.webp",mask:true,w:280,h:400,keywords:"chupon wet pop katakana japanese brush vertical"},
      {id:"chupa-mask",label:"チュパ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chupa-mask.webp",mask:true,w:360,h:260,keywords:"chupa lick wet katakana japanese brush horizontal"},
      {id:"chupachupa-mask",label:"チュパチュパ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chupachupa-mask.webp",mask:true,w:300,h:440,keywords:"chupachupa repeated wet katakana japanese brush vertical"},
      {id:"puchu-mask",label:"プチュ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/puchu-mask.webp",mask:true,w:360,h:260,keywords:"puchu wet katakana japanese brush horizontal"},
      {id:"puchu-small-tsu-mask",label:"プチュッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/puchu-small-tsu-mask.webp",mask:true,w:390,h:270,keywords:"puchu wet katakana japanese brush horizontal"},
      {id:"puchun-mask",label:"プチュン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/puchun-mask.webp",mask:true,w:390,h:260,keywords:"puchun wet katakana japanese brush diagonal"},
      {id:"nuchu-mask",label:"ぬちゅ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nuchu-mask.webp",mask:true,w:380,h:260,keywords:"nuchu wet hiragana japanese brush horizontal"},
      {id:"nupu-mask",label:"ぬぷ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nupu-mask.webp",mask:true,w:360,h:260,keywords:"nupu wet hiragana japanese brush horizontal"},
      {id:"nupu-small-tsu-mask",label:"ぬぷっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nupu-small-tsu-mask.webp",mask:true,w:380,h:270,keywords:"nupu wet hiragana japanese brush horizontal"},
      {id:"picha-mask",label:"ぴちゃ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/picha-mask.webp",mask:true,w:360,h:260,keywords:"picha splash wet hiragana japanese brush horizontal"},
      {id:"pichapicha-mask",label:"ぴちゃぴちゃ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pichapicha-mask.webp",mask:true,w:300,h:440,keywords:"pichapicha repeated splash wet hiragana japanese brush vertical"},
      {id:"kapu-mask",label:"かぷ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/kapu-mask.webp",mask:true,w:360,h:260,keywords:"kapu bite hiragana japanese brush horizontal"},
      {id:"kapu-small-tsu-mask",label:"かぷっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/kapu-small-tsu-mask.webp",mask:true,w:380,h:270,keywords:"kapu bite hiragana japanese brush horizontal"},
      {id:"pan-small-tsu-mask",label:"ぱんっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pan-small-tsu-mask.webp",mask:true,w:260,h:400,keywords:"pan slap tap cute handwriting hiragana japanese vertical"},
      {id:"topo-small-tsu-mask",label:"とぽっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/topo-small-tsu-mask.webp",mask:true,w:260,h:400,keywords:"topo drop liquid cute handwriting hiragana japanese vertical"},
      {id:"an-katakana-small-tsu-mask",label:"アンっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/an-katakana-small-tsu-mask.webp",mask:true,w:260,h:400,keywords:"an reaction cute handwriting katakana japanese vertical"},
      {id:"haa-long-small-tsu-mask",label:"はーっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/haa-long-small-tsu-mask.webp",mask:true,w:250,h:420,keywords:"haa breath sigh cute handwriting hiragana japanese vertical"},
      {id:"faaa-small-tsu-mask",label:"ふぁぁっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/faaa-small-tsu-mask.webp",mask:true,w:280,h:420,keywords:"faaa breath voice cute handwriting hiragana japanese vertical"},
      {id:"tapun-small-tsu-mask",label:"たぷんっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/tapun-small-tsu-mask.webp",mask:true,w:280,h:420,keywords:"tapun soft bounce liquid cute handwriting hiragana japanese vertical"},
      {id:"a-small-tsu-mask",label:"あっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/a-small-tsu-mask.webp",mask:true,w:220,h:300,keywords:"a reaction cute handwriting hiragana japanese vertical"},
      {id:"an-hiragana-mask",label:"あん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/an-hiragana-mask.webp",mask:true,w:240,h:350,keywords:"an reaction cute handwriting hiragana japanese vertical"},
      {id:"gyupu-mask",label:"ぎゅぷ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gyupu-mask.webp",mask:true,w:260,h:400,keywords:"gyupu squeeze wet cute handwriting hiragana japanese vertical"},
      {id:"buchupo-small-tsu-mask",label:"ぶちゅぽっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/buchupo-small-tsu-mask.webp",mask:true,w:280,h:430,keywords:"buchupo wet pop cute handwriting hiragana japanese vertical"},
      {id:"haa-mask",label:"はぁ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/haa-mask.webp",mask:true,w:240,h:360,keywords:"haa breath sigh cute handwriting hiragana japanese vertical"},
      {id:"haa-small-tsu-mask",label:"はぁっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/haa-small-tsu-mask.webp",mask:true,w:250,h:380,keywords:"haa breath sigh cute handwriting hiragana japanese vertical"},
      {id:"ipu-small-tsu-mask",label:"イプッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/ipu-small-tsu-mask.webp",mask:true,w:240,h:380,keywords:"ipu reaction cute handwriting katakana japanese vertical"},
      {id:"dobyuu-small-tsu-mask",label:"ドビュッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dobyuu-small-tsu-mask.webp",mask:true,w:270,h:430,keywords:"dobyuu fast release cute handwriting katakana japanese vertical"},
      {id:"aha-small-tsu-mask",label:"あはっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/aha-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:300,h:340,keywords:"aha voice reaction cute handwriting hiragana japanese dynamic"},
      {id:"aha-katakana-small-tsu-mask",label:"アハッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/aha-katakana-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:300,h:340,keywords:"aha voice reaction cute handwriting katakana japanese dynamic"},
      {id:"hachun-small-tsu-mask",label:"ぱちゅんっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/hachun-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:240,h:430,keywords:"pachun voice wet cute handwriting hiragana japanese vertical"},
      {id:"n-small-tsu-ellipsis-mask",label:"ん゛っ…",category:"japanese",format:"WebP Mask",src:"./assets/sfx/n-small-tsu-ellipsis-mask.webp",mask:true,fill:"#ffd42a",w:380,h:181,keywords:"n dakuten voice reaction ellipsis cute handwriting hiragana japanese horizontal"},
      {id:"u-small-tsu-ellipsis-mask",label:"うっ…",category:"japanese",format:"WebP Mask",src:"./assets/sfx/u-small-tsu-ellipsis-mask.webp",mask:true,fill:"#ffd42a",w:260,h:390,keywords:"u voice reaction ellipsis cute handwriting hiragana japanese vertical"},
      {id:"iccha-mask",label:"いっちゃ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/iccha-mask.webp",mask:true,fill:"#ffd42a",w:240,h:430,keywords:"iccha voice cute handwriting hiragana japanese vertical"},
      {id:"ii-small-tsu-mask",label:"いいっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/ii-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:250,h:410,keywords:"ii voice reaction cute handwriting hiragana japanese vertical"},
      {id:"uwaaa-small-tsu-mask",label:"うわぁああっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/uwaaa-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:480,h:260,keywords:"uwaaa shout reaction energetic brush japanese horizontal"},
      {id:"oo-dakuten-small-tsu-mask",label:"おぉおおっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/oo-dakuten-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:480,h:280,keywords:"oo dakuten dots reaction energetic brush japanese horizontal"},
      {id:"iguuu-mask",label:"いぐぅう",category:"japanese",format:"WebP Mask",src:"./assets/sfx/iguuu-mask.webp",mask:true,fill:"#ffd42a",w:480,h:280,keywords:"iguuu reaction energetic brush japanese horizontal"},
      {id:"viin-mask",label:"ヴィ～ン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/viin-mask.webp",mask:true,fill:"#ffd42a",w:480,h:170,keywords:"viin hum buzz mechanical sound effect japanese horizontal"},
      {id:"nichaa-mask",label:"ニチャア",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nichaa-mask.webp",mask:true,fill:"#ffd42a",w:480,h:220,keywords:"nichaa sticky wet sound effect katakana japanese horizontal"},
      {id:"gori-small-tsu-mask",label:"ゴリッ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gori-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:270,h:480,keywords:"gori scrape grind impact brush japanese vertical"},
      {id:"deru-small-tsu-mask",label:"でるっ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/deru-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:270,h:480,keywords:"deru reaction impact brush japanese vertical"},
      {id:"dokun-small-tsu-mask",label:"ドクンッ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dokun-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:115,h:480,keywords:"dokun heartbeat tension brush japanese vertical"},
      {id:"uguuu-ellipsis-mask",label:"うぐぅ...",category:"japanese",format:"WebP Mask",src:"./assets/sfx/uguuu-ellipsis-mask.webp",mask:true,fill:"#ffd42a",w:142,h:480,keywords:"uguu reaction groan ellipsis brush japanese vertical"},
      {id:"au-small-tsu-mask",label:"あぅっ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/au-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"au reaction pain brush japanese vertical"},
      {id:"kaha-small-tsu-mask",label:"かはっ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/kaha-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"kaha reaction cough brush japanese vertical"},
      {id:"igu-small-tsu-mask",label:"イグッ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/igu-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"igu reaction katakana brush japanese vertical"},
      {id:"tehepero-mask",label:"テヘペロ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/tehepero-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"tehepero playful reaction brush japanese vertical"},
      {id:"iee-small-tsu-mask",label:"イエーイ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/iee-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"ieei celebration brush japanese vertical"},
      {id:"oke-mask",label:"オーケー",category:"japanese",format:"WebP Mask",src:"./assets/sfx/oke-mask.webp",mask:true,fill:"#ffd42a",w:480,h:230,keywords:"okay agreement brush japanese horizontal"},
      {id:"dokkunn-vertical-gpt-v1",label:"ドックン！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dokkunn-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:181,h:560,keywords:"dokkunn heartbeat tension gpt brush japanese vertical"},
      {id:"bubyuu-vertical-gpt-v1",label:"ぶびゅっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/bubyuu-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:520,keywords:"bubyuu wet sound effect gpt brush japanese vertical"},
      {id:"giri-small-tsu-vertical-mask",label:"ギリッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/giri-small-tsu-vertical-mask.webp",mask:true,fill:"#ffd42a",w:300,h:500,keywords:"giri grinding clench tension brush japanese vertical"},
      {id:"nuron-angular-vertical-mask",label:"ぬろん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nuron-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:300,h:500,keywords:"nuron wet angular handwritten japanese vertical"},
      {id:"dochu-exclamation-angular-vertical-mask",label:"どちゅ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dochu-exclamation-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:143,h:500,keywords:"dochu wet impact angular handwritten japanese vertical"},
      {id:"chiro-vertical-uniform-mask",label:"チロ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chiro-vertical-uniform-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"chiro vertical uniform angular handwritten japanese sfx"},
      {id:"upu-vertical-uniform-mask",label:"うぷ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/upu-vertical-uniform-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"upu vertical uniform angular handwritten japanese sfx"},
      {id:"chuu-vertical-uniform-mask",label:"ちゅう",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chuu-vertical-uniform-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:134,h:500,keywords:"chuu vertical uniform angular handwritten japanese sfx"},
      {id:"boto-small-tsu-vertical-uniform-mask",label:"ボトッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/boto-small-tsu-vertical-uniform-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:140,h:500,keywords:"boto vertical uniform angular handwritten japanese sfx"},
      {id:"dochu-vertical-uniform-mask",label:"どちゅ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dochu-vertical-uniform-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:152,h:500,keywords:"dochu vertical uniform angular handwritten japanese sfx"},
      {id:"giu-long-angular-vertical-mask",label:"ぎう～",category:"japanese",format:"WebP Mask",src:"./assets/sfx/giu-long-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:158,h:500,keywords:"giu long squeeze angular handwritten japanese vertical"},
      {id:"hiku-small-tsu-angular-vertical-mask",label:"ひくっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/hiku-small-tsu-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:300,h:500,keywords:"hiku twitch angular handwritten japanese vertical"},
      {id:"giu-angular-vertical-mask",label:"ぎう",category:"japanese",format:"WebP Mask",src:"./assets/sfx/giu-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:300,h:500,keywords:"giu squeeze angular handwritten japanese vertical"},
      {id:"zuru-angular-vertical-mask",label:"ずる",category:"japanese",format:"WebP Mask",src:"./assets/sfx/zuru-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:300,h:500,keywords:"zuru slide angular handwritten japanese vertical"},
      {id:"dokun-hiragana-angular-vertical-mask",label:"どくん（縦）",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dokun-hiragana-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:300,h:500,keywords:"dokun heartbeat angular handwritten hiragana japanese vertical"},
      {id:"dokun-hiragana-angular-horizontal-mask",label:"どくん（横）",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dokun-hiragana-angular-horizontal-mask.webp",mask:true,fill:"#ffd42a",w:500,h:260,keywords:"dokun heartbeat angular handwritten hiragana japanese horizontal"},
      {id:"zubu-small-tsu-angular-vertical-mask",label:"ずぶっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/zubu-small-tsu-angular-vertical-mask.webp",mask:true,fill:"#ffd42a",w:300,h:500,keywords:"zubu wet plunge angular handwritten japanese vertical"},
      {id:"sore-dame-horizontal-gpt-v1",label:"それ、ダメ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/sore-dame-horizontal-gpt-v1.webp",mask:true,fill:"#ffd42a",w:500,h:260,keywords:"sore dame speech reaction gpt brush japanese horizontal"},
      {id:"nani-kore-horizontal-gpt-v1",label:"ナニコレ？",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nani-kore-horizontal-gpt-v1.webp",mask:true,fill:"#ffd42a",w:500,h:260,keywords:"nani kore question reaction gpt brush japanese horizontal"},
      {id:"shii-horizontal-gpt-v1",label:"しーっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/shii-horizontal-gpt-v1.webp",mask:true,fill:"#ffd42a",w:500,h:260,keywords:"shii hush speech command gpt brush japanese horizontal"},
      {id:"naisho-horizontal-gpt-v1",label:"ナイショ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/naisho-horizontal-gpt-v1.webp",mask:true,fill:"#ffd42a",w:500,h:260,keywords:"naisho secret speech gpt brush japanese horizontal"},
      {id:"ikisou-horizontal-gpt-v1",label:"イキそう",category:"japanese",format:"WebP Mask",src:"./assets/sfx/ikisou-horizontal-gpt-v1.webp",mask:true,fill:"#ffd42a",w:500,h:260,keywords:"ikisou reaction speech gpt brush japanese horizontal"},
      {id:"joo-vertical-gpt-v1",label:"ジョーッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/joo-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:520,keywords:"joo pouring stream sound effect gpt brush japanese vertical"},
      {id:"gokkun-vertical-gpt-v1",label:"ごっくん！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gokkun-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:520,keywords:"gokkun swallow gulp sound effect gpt brush japanese vertical"},
      {id:"pushaa-vertical-gpt-v1",label:"プシャァ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pushaa-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:520,keywords:"pushaa spray burst sound effect gpt brush japanese vertical"},
      {id:"chira-vertical-gpt-v1",label:"チラッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/chira-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:520,keywords:"chira glance motion sound effect gpt brush japanese vertical"},
      {id:"woo-vertical-gpt-v1",label:"うぉおお",category:"japanese",format:"WebP Mask",src:"./assets/sfx/woo-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:560,keywords:"woo long shout sound effect gpt brush japanese vertical"},
      {id:"rerorero-vertical-gpt-v1",label:"レロレロ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/rerorero-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:560,keywords:"rerorero tongue motion sound effect gpt brush japanese vertical"},
      {id:"haa-katakana-vertical-gpt-v1",label:"ハァ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/haa-katakana-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:520,keywords:"haa sigh breath sound effect gpt brush japanese vertical"},
      {id:"dokkunn-hiragana-vertical-gpt-v1",label:"どっくん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/dokkunn-hiragana-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",w:320,h:560,keywords:"dokkunn heartbeat sound effect gpt brush hiragana japanese vertical"},
      {id:"n-small-tsu-gpt-v2",label:"んっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/n-small-tsu-gpt-v2.webp",mask:true,fill:"#ffd42a",outlineWidth:3,w:280,h:578,keywords:"n small tsu reaction angular handwritten japanese vertical"},
      {id:"yamero-horizontal-gpt-v1",label:"やめろぉ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/yamero-horizontal-gpt-v1.webp",mask:true,fill:"#ffd42a",outlineWidth:3,w:560,h:166,keywords:"yamero stop command angular handwritten japanese horizontal"},
      {id:"sore-iku-horizontal-gpt-v1",label:"それ、イクっ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/sore-iku-horizontal-gpt-v1.webp",mask:true,fill:"#ffd42a",outlineWidth:3,w:620,h:127,keywords:"sore iku reaction angular handwritten japanese horizontal"},
      {id:"baka-vertical-gpt-v1",label:"バカ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/baka-vertical-gpt-v1.webp",mask:true,fill:"#ffd42a",outlineWidth:3,w:300,h:866,keywords:"baka anger reaction angular handwritten japanese vertical"},
      {id:"damee-mask",label:"ダメぇ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/damee-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"damee refusal reaction brush japanese vertical"},
      {id:"u-dakuten-long-small-tsu-mask",label:"う゛～っ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/u-dakuten-long-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"u dakuten groan long brush japanese vertical"},
      {id:"moo-long-small-tsu-mask",label:"もぉ～～っ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/moo-long-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"moo complaint long brush japanese vertical"},
      {id:"e-small-tsu-question-mask",label:"えっ？",category:"japanese",format:"WebP Mask",src:"./assets/sfx/e-small-tsu-question-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"surprise question brush japanese vertical"},
      {id:"yadaa-mask",label:"やだぁ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/yadaa-mask.webp",mask:true,fill:"#ffd42a",w:280,h:480,keywords:"yadaa refusal reaction brush japanese vertical"},
      {id:"burun-katakana-small-tsu-mask",label:"ブルンッ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/burun-katakana-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:480,h:240,keywords:"burun vibration movement brush katakana japanese horizontal"},
      {id:"burun-small-tsu-mask",label:"ぶるんっ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/burun-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:480,h:240,keywords:"burun vibration movement brush hiragana japanese horizontal"},
      {id:"purun-small-tsu-mask",label:"ぷるんっ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/purun-small-tsu-mask.webp",mask:true,fill:"#ffd42a",w:480,h:240,keywords:"purun bounce movement brush hiragana japanese horizontal"},
      {id:"gyuu-reference-vertical-mask",label:"ぎゅう",category:"japanese",format:"WebP Mask",src:"./assets/sfx/gyuu-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"gyuu squeeze reference handwritten japanese vertical"},
      {id:"pito-reference-vertical-mask",label:"ぴと",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pito-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"pito touch reference handwritten japanese vertical"},
      {id:"norun-reference-vertical-mask",label:"のるん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/norun-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"norun soft reference handwritten japanese vertical"},
      {id:"kuu-reference-vertical-mask",label:"くぅ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/kuu-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"kuu voice reference handwritten japanese vertical"},
      {id:"ki-katakana-reference-vertical-mask",label:"キ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/ki-katakana-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"ki katakana reference handwritten japanese vertical"},
      {id:"munyu-reference-vertical-mask",label:"むにゅ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/munyu-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"munyu soft reference handwritten japanese vertical"},
      {id:"piyo-reference-vertical-mask",label:"ぴよ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/piyo-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"piyo reference handwritten japanese vertical"},
      {id:"nuri-small-tsu-reference-vertical-mask",label:"ぬりっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nuri-small-tsu-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"nuri reference handwritten japanese vertical"},
      {id:"oga-reference-vertical-mask",label:"おが",category:"japanese",format:"WebP Mask",src:"./assets/sfx/oga-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"oga reference handwritten japanese vertical"},
      {id:"oa-exclamation-reference-vertical-mask",label:"おあ！",category:"japanese",format:"WebP Mask",src:"./assets/sfx/oa-exclamation-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"oa exclamation reference handwritten japanese vertical"},
      {id:"nuru-small-tsu-reference-vertical-mask",label:"ぬるっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/nuru-small-tsu-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"nuru reference handwritten japanese vertical"},
      {id:"boyon-reference-vertical-mask",label:"ぼよん",category:"japanese",format:"WebP Mask",src:"./assets/sfx/boyon-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"boyon bounce reference handwritten japanese vertical"},
      {id:"byon-katakana-reference-vertical-mask",label:"ビョン",category:"japanese",format:"WebP Mask",src:"./assets/sfx/byon-katakana-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"byon katakana bounce reference handwritten japanese vertical"},
      {id:"zucha-reference-vertical-mask",label:"ずちゃ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/zucha-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"zucha reference handwritten japanese vertical"},
      {id:"sucha-reference-vertical-mask",label:"すちゃ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/sucha-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"sucha reference handwritten japanese vertical"},
      {id:"byuu-long-reference-vertical-mask",label:"びゅー",category:"japanese",format:"WebP Mask",src:"./assets/sfx/byuu-long-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"byuu speed reference handwritten japanese vertical"},
      {id:"goku-reference-vertical-mask",label:"ごく",category:"japanese",format:"WebP Mask",src:"./assets/sfx/goku-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"goku gulp reference handwritten japanese vertical"},
      {id:"doku-small-tsu-katakana-reference-vertical-mask",label:"ドクッ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/doku-small-tsu-katakana-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"doku heartbeat katakana reference handwritten japanese vertical"},
      {id:"haga-small-tsu-reference-vertical-mask",label:"はがっ",category:"japanese",format:"WebP Mask",src:"./assets/sfx/haga-small-tsu-reference-vertical-mask.webp",mask:true,fill:"#ffd42a",outlineWidth:2.5,w:300,h:500,keywords:"haga reference handwritten japanese vertical"},
      {id:"filled-heart-mask",label:"塗りハート",category:"symbols",format:"WebP Mask",src:"./assets/sfx/filled-heart-mask.webp",mask:true,w:300,h:300,keywords:"filled heart love cute symbol"},
      {id:"handdrawn-filled-heart-mask",label:"手描き塗りハート",category:"symbols",format:"WebP Mask",src:"./assets/sfx/handdrawn-filled-heart-mask.webp",mask:true,w:300,h:300,keywords:"filled rough hand drawn brush heart love cute symbol"},
      {id:"pink-stamp-dyurururu",label:"ドュルルル",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pink-stamp-dyurururu.webp",mask:true,fill:"#ec407a",stroke:"#111111",outlineWidth:3,w:160,h:420,keywords:"pink reaction stamp japanese vertical"},
      {id:"pink-stamp-dyu-heart",label:"ドュ♡",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pink-stamp-dyu-heart.webp",mask:true,fill:"#ec407a",stroke:"#111111",outlineWidth:3,w:250,h:414,keywords:"pink reaction stamp heart japanese vertical"},
      {id:"pink-stamp-double-heart",label:"ダブルハート",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pink-stamp-double-heart.webp",mask:true,fill:"#ec407a",stroke:"#111111",outlineWidth:3,w:245,h:360,keywords:"pink reaction double heart stamp symbol"},
      {id:"pink-stamp-biku-heart",label:"ビクッ♡",category:"japanese",format:"WebP Mask",src:"./assets/sfx/pink-stamp-biku-heart.webp",mask:true,fill:"#ec407a",stroke:"#111111",outlineWidth:3,w:210,h:404,keywords:"pink reaction biku heart stamp japanese vertical"},
      {id:"suit-club-mask",label:"クローバー",category:"symbols",format:"WebP Mask",src:"./assets/sfx/suit-club-mask.webp",mask:true,fill:COMIC_YELLOW,w:300,h:300,keywords:"four leaf clover hand drawn symbol"},
      {id:"arrow-thick-right-mask",label:"太矢印",category:"symbols",format:"WebP Mask",src:"./assets/sfx/arrow-thick-right-mask.webp",mask:true,fill:"#111111",w:380,h:220,keywords:"thick block straight right arrow hand drawn symbol"},
      {id:"arrow-thin-right-mask",label:"細矢印",category:"symbols",format:"WebP Mask",src:"./assets/sfx/arrow-thin-right-mask.webp",mask:true,fill:"#111111",w:380,h:220,keywords:"thin straight right arrow hand drawn symbol"},
      {id:"arrow-handdrawn-right-mask",label:"手描き矢印",category:"symbols",format:"WebP Mask",src:"./assets/sfx/arrow-handdrawn-right-mask.webp",mask:true,fill:"#111111",w:380,h:220,keywords:"rough hand drawn sketch right arrow symbol"},
      {id:"arrow-curved-right-mask",label:"曲線矢印",category:"symbols",format:"WebP Mask",src:"./assets/sfx/arrow-curved-right-mask.webp",mask:true,fill:"#111111",w:330,h:330,keywords:"curved right arrow turn hand drawn symbol"},
      {id:"arrow-loop-mask",label:"ループ矢印",category:"symbols",format:"WebP Mask",src:"./assets/sfx/arrow-loop-mask.webp",mask:true,fill:"#111111",w:330,h:330,keywords:"loop circular arrow hand drawn symbol"},
      {id:"arrow-double-mask",label:"両矢印",category:"symbols",format:"WebP Mask",src:"./assets/sfx/arrow-double-mask.webp",mask:true,fill:"#111111",w:380,h:220,keywords:"double ended both directions arrow symbol"},
      {id:"star-outline-mask",label:"手描き星",category:"symbols",format:"WebP Mask",src:"./assets/sfx/star-outline-mask.webp",mask:true,fill:"#ffd42a",w:260,h:260,keywords:"outline rough hand drawn star symbol"},
      {id:"star-filled-mask",label:"塗り星",category:"symbols",format:"WebP Mask",src:"./assets/sfx/star-filled-mask.webp",mask:true,fill:"#ffd42a",w:250,h:250,keywords:"filled hand drawn star symbol"},
      {id:"sparkle-four-mask",label:"四方光",category:"effects",format:"WebP Mask",src:"./assets/sfx/sparkle-four-mask.webp",mask:true,fill:"#ffd42a",w:240,h:240,keywords:"four point sparkle shine light effect"},
      {id:"sparkle-cluster-mask",label:"キラキラ光",category:"effects",format:"WebP Mask",src:"./assets/sfx/sparkle-cluster-mask.webp",mask:true,fill:"#ffd42a",w:280,h:280,keywords:"sparkle cluster shine light stars effect"},
      {id:"sparkle-radiant-mask",label:"放射星",category:"effects",format:"WebP Mask",src:"./assets/sfx/sparkle-radiant-mask.webp",mask:true,fill:"#ffd42a",w:280,h:280,keywords:"radiant star shine rays effect"},
      {id:"anger-mark-small-mask",label:"怒りマーク 小",category:"effects",format:"WebP Mask",src:"./assets/sfx/anger-mark-small-mask.webp",mask:true,fill:"#e53935",w:210,h:210,keywords:"anger vein small red emotion manga effect"},
      {id:"sweat-glossy",label:"光沢汗",category:"effects",format:"WebP RGBA",src:"./assets/sfx/sweat-glossy.webp",mask:false,w:260,h:260,keywords:"single blue glossy sweat drop white highlight nervous manga effect"},
      {id:"sweat-flying",label:"飛び散る汗",category:"effects",format:"WebP RGBA",src:"./assets/sfx/sweat-flying.webp",mask:false,w:300,h:300,keywords:"single flying blue glossy sweat drop white highlight nervous motion manga effect"},
      {id:"sweat-drop-mask",label:"汗 1滴",category:"effects",format:"WebP Mask",src:"./assets/sfx/sweat-drop-mask.webp",mask:true,fill:"#6ec6ff",w:180,h:250,keywords:"single blue sweat drop nervous manga effect",hidden:true},
      {id:"sweat-drops-mask",label:"汗 2滴",category:"effects",format:"WebP Mask",src:"./assets/sfx/sweat-drops-mask.webp",mask:true,fill:"#6ec6ff",w:240,h:260,keywords:"double blue sweat drops nervous manga effect",hidden:true},
      {id:"emphasis-lines-mask",label:"強調線",category:"effects",format:"WebP Mask",src:"./assets/sfx/emphasis-lines-mask.webp",mask:true,fill:"#111111",w:260,h:240,keywords:"three emphasis attention lines manga effect"},
      {id:"shock-lines-mask",label:"衝撃線",category:"effects",format:"WebP Mask",src:"./assets/sfx/shock-lines-mask.webp",mask:true,fill:"#111111",w:280,h:280,keywords:"shock surprise radial lines manga effect"},
      {id:"tension-lines-mask",label:"緊張線",category:"effects",format:"WebP Mask",src:"./assets/sfx/tension-lines-mask.webp",mask:true,fill:"#111111",w:250,h:280,keywords:"vertical tension gloom lines manga effect"},
      {id:"worry-squiggle-mask",label:"不安波線",category:"effects",format:"WebP Mask",src:"./assets/sfx/worry-squiggle-mask.webp",mask:true,fill:"#111111",w:350,h:190,keywords:"worry trembling squiggle unease manga effect"},
      {id:"breath-puff-mask",label:"息・ため息",category:"effects",format:"WebP Mask",src:"./assets/sfx/breath-puff-mask.webp",mask:true,w:280,h:230,keywords:"breath sigh puff cloud manga effect"},
      {id:"dizzy-spiral-mask",label:"うずまき",category:"effects",format:"WebP Mask",src:"./assets/sfx/dizzy-spiral-mask.webp",mask:true,fill:"#111111",w:250,h:250,keywords:"dizzy spiral confusion manga effect"},
      {id:"hot-spring-mask",label:"温泉マーク",category:"symbols",format:"WebP Mask",src:"./assets/sfx/hot-spring-mask.webp",mask:true,fill:"#111111",w:250,h:250,keywords:"hot spring onsen japanese steam symbol"},
      {id:"bandage-mask",label:"絆創膏",category:"symbols",format:"WebP Mask",src:"./assets/sfx/bandage-mask.webp",mask:true,fill:"#f1c39b",w:250,h:250,keywords:"bandage plaster crossed healing symbol"},
      {id:"music-notes-mask",label:"音符",category:"symbols",format:"WebP Mask",src:"./assets/sfx/music-notes-mask.webp",mask:true,fill:"#111111",w:260,h:260,keywords:"black music musical notes sound symbol"},
      {id:"sleep-zzz-mask",label:"Zzz",category:"effects",format:"WebP Mask",src:"./assets/sfx/sleep-zzz-mask.webp",mask:true,fill:"#111111",w:280,h:250,keywords:"sleep sleeping zzz manga effect"},
      {id:"lightning-zap-mask",label:"稲妻",category:"effects",format:"WebP Mask",src:"./assets/sfx/lightning-zap-mask.webp",mask:true,fill:"#ffd42a",w:230,h:280,keywords:"yellow lightning bolt electric zap manga effect"},
      {id:"motion-swish-mask",label:"動き線",category:"effects",format:"WebP Mask",src:"./assets/sfx/motion-swish-mask.webp",mask:true,fill:"#111111",w:340,h:260,keywords:"motion swish speed curved lines manga effect"},
      {id:"rarity-crown-ssr-gold",label:"SSR Crown Gold",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/crown_ssr_gold.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:397,h:349,keywords:"rarity crown SSR gold symbol stamp"},
      {id:"rarity-crown-sr-silver",label:"SR Crown Silver",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/crown_sr_silver.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:373,h:350,keywords:"rarity crown SR silver symbol stamp"},
      {id:"rarity-crown-r-red",label:"R Crown Red",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/crown_r_red.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:363,h:349,keywords:"rarity crown R red symbol stamp"},
      {id:"rarity-crown-n-green",label:"N Crown Green",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/crown_n_green.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:355,h:348,keywords:"rarity crown N green symbol stamp"},
      {id:"rarity-ribbon-super-rare-gold",label:"超激レア Ribbon Gold",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/ribbon_super_rare_gold.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:420,h:209,keywords:"rarity ribbon super rare gold symbol stamp"},
      {id:"rarity-ribbon-very-rare-silver",label:"激レア Ribbon Silver",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/ribbon_very_rare_silver.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:395,h:207,keywords:"rarity ribbon very rare silver symbol stamp"},
      {id:"rarity-ribbon-rare-red",label:"レア Ribbon Red",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/ribbon_rare_red.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:390,h:208,keywords:"rarity ribbon rare red symbol stamp"},
      {id:"rarity-ribbon-normal-green",label:"ノーマル Ribbon Green",category:"symbols",format:"PNG RGBA",src:"./assets/sfx/ribbon_normal_green.png",mask:false,stroke:"#ffffff",outlineWidth:2,w:396,h:209,keywords:"rarity ribbon normal green symbol stamp"},
      {id:"kawaii-shortcake",label:"ショートケーキ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_shortcake.png",mask:false,w:378,h:400,sortGroup:70,sortRank:1,keywords:"kawaii cute sweet cake strawberry ショートケーキ"},
      {id:"kawaii-cupcake",label:"カップケーキ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_cupcake.png",mask:false,w:327,h:400,sortGroup:70,sortRank:2,keywords:"kawaii cute sweet cupcake ribbon カップケーキ"},
      {id:"kawaii-macaron",label:"マカロン",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_macaron.png",mask:false,w:375,h:344,sortGroup:70,sortRank:3,keywords:"kawaii cute sweet pink macaron マカロン"},
      {id:"kawaii-donut",label:"ドーナツ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_donut.png",mask:false,w:383,h:348,sortGroup:70,sortRank:4,keywords:"kawaii cute sweet chocolate donut ドーナツ"},
      {id:"kawaii-candy",label:"キャンディ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_candy.png",mask:false,w:400,h:334,sortGroup:70,sortRank:5,keywords:"kawaii cute sweet pink candy キャンディ"},
      {id:"kawaii-strawberry",label:"いちご",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_strawberry.png",mask:false,w:367,h:398,sortGroup:70,sortRank:6,keywords:"kawaii cute fruit strawberry いちご 苺"},
      {id:"kawaii-cherries",label:"さくらんぼ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_cherries.png",mask:false,w:363,h:380,sortGroup:70,sortRank:7,keywords:"kawaii cute fruit cherries cherry さくらんぼ"},
      {id:"kawaii-gift",label:"プレゼント",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_gift.png",mask:false,w:367,h:391,sortGroup:70,sortRank:8,keywords:"kawaii cute present gift box ribbon プレゼント"},
      {id:"kawaii-teddy-bear",label:"くまぬいぐるみ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_teddy_bear.png",mask:false,w:345,h:400,sortGroup:70,sortRank:9,keywords:"kawaii cute teddy bear plush toy くま ぬいぐるみ"},
      {id:"kawaii-rabbit",label:"うさぎぬいぐるみ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_rabbit.png",mask:false,w:282,h:400,sortGroup:70,sortRank:10,keywords:"kawaii cute white rabbit bunny plush toy うさぎ ぬいぐるみ"},
      {id:"kawaii-cat",label:"ねこ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_cat.png",mask:false,w:336,h:400,sortGroup:70,sortRank:11,keywords:"kawaii cute calico cat kitten ねこ 猫"},
      {id:"kawaii-chick",label:"ひよこ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_chick.png",mask:false,w:366,h:378,sortGroup:70,sortRank:12,keywords:"kawaii cute yellow chick bird ひよこ"},
      {id:"kawaii-paw",label:"肉球",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_paw.png",mask:false,w:350,h:333,sortGroup:70,sortRank:13,keywords:"kawaii cute paw pad cookie animal 肉球"},
      {id:"kawaii-fluffy-cloud",label:"ふわふわ雲",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_fluffy_cloud.png",mask:false,w:385,h:315,sortGroup:70,sortRank:14,keywords:"kawaii cute fluffy smiling cloud sky ふわふわ 雲"},
      {id:"kawaii-soap-bubble",label:"シャボン玉",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_soap_bubble.png",mask:false,w:348,h:351,sortGroup:70,sortRank:15,keywords:"kawaii cute soap bubble orb シャボン玉"},
      {id:"kawaii-small-flowers",label:"小花",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_small_flowers.png",mask:false,w:369,h:367,sortGroup:70,sortRank:16,keywords:"kawaii cute small flowers bouquet floral 小花 花"},
      {id:"kawaii-butterfly",label:"蝶",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_butterfly.png",mask:false,w:361,h:329,sortGroup:70,sortRank:17,keywords:"kawaii cute pink butterfly insect 蝶 ちょう"},
      {id:"kawaii-feather",label:"羽",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_feather.png",mask:false,w:359,h:363,sortGroup:70,sortRank:18,keywords:"kawaii cute blue feather wing 羽 羽根"},
      {id:"kawaii-manga-meat",label:"漫画肉",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_manga_meat.png",mask:false,w:387,h:357,sortGroup:70,sortRank:19,keywords:"kawaii cute cartoon manga meat drumstick bone 漫画肉 肉"},
      {id:"kawaii-temari",label:"手まり",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_temari.png",mask:false,w:344,h:345,sortGroup:70,sortRank:20,keywords:"kawaii cute japanese temari ball traditional 手まり 手毬"},
      {id:"kawaii-maneki-neko",label:"招き猫",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_maneki_neko.png",mask:false,w:311,h:400,sortGroup:70,sortRank:21,keywords:"kawaii cute japanese lucky beckoning cat maneki neko 招き猫"},
      {id:"kawaii-crown",label:"王冠",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_crown.png",mask:false,w:375,h:322,sortGroup:70,sortRank:22,keywords:"kawaii cute princess gold crown jewel 王冠"},
      {id:"kawaii-magic-wand",label:"魔法ステッキ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_magic_wand.png",mask:false,w:272,h:400,sortGroup:70,sortRank:23,keywords:"kawaii cute magical girl star wand wings 魔法 ステッキ"},
      {id:"kawaii-perfume-bottle",label:"香水瓶",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_perfume_bottle.png",mask:false,w:300,h:400,sortGroup:70,sortRank:24,keywords:"kawaii cute pink perfume bottle fragrance 香水瓶"},
      {id:"kawaii-teacup",label:"ティーカップ",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_teacup.png",mask:false,w:400,h:330,sortGroup:70,sortRank:25,keywords:"kawaii cute tea cup saucer rose ティーカップ 紅茶"},
      {id:"kawaii-origami-crane",label:"折り鶴",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_origami_crane.png",mask:false,w:400,h:375,sortGroup:70,sortRank:26,keywords:"kawaii cute japanese pink origami crane paper 折り鶴"},
      {id:"kawaii-wind-chime",label:"風鈴",category:"kawaii",format:"PNG RGBA",src:"./assets/stamps/kawaii/kawaii_wind_chime.png",mask:false,w:309,h:400,sortGroup:70,sortRank:27,keywords:"kawaii cute japanese glass wind chime summer 風鈴"},
      {id:"corner-kawaii-ribbon-lace",label:"リボンレースコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_kawaii_ribbon_lace.png",mask:false,w:400,h:349,sortGroup:80,sortRank:1,keywords:"corner kawaii ribbon lace cute リボン レース コーナー"},
      {id:"corner-kawaii-heart-lace",label:"ハートレースコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_kawaii_heart_lace.png",mask:false,w:400,h:330,sortGroup:80,sortRank:2,keywords:"corner kawaii heart lace cute ハート レース コーナー"},
      {id:"corner-kawaii-flower-vine",label:"花唐草コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_kawaii_flower_vine.png",mask:false,w:400,h:363,sortGroup:80,sortRank:3,keywords:"corner kawaii flower vine floral 花 唐草 コーナー"},
      {id:"corner-kawaii-star-vine",label:"星唐草コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_kawaii_star_vine.png",mask:false,w:400,h:376,sortGroup:80,sortRank:4,keywords:"corner kawaii star vine gold 星 唐草 コーナー"},
      {id:"corner-kawaii-clover-vine",label:"クローバーコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_kawaii_clover_vine.png",mask:false,w:382,h:400,sortGroup:80,sortRank:5,keywords:"corner kawaii clover vine green クローバー コーナー"},
      {id:"corner-kawaii-frill",label:"フリルコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_kawaii_frill.png",mask:false,w:400,h:385,sortGroup:80,sortRank:6,keywords:"corner kawaii frill ribbon pink フリル リボン コーナー"},
      {id:"corner-shoujo-rose-vine",label:"薔薇唐草コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_shoujo_rose_vine.png",mask:false,w:400,h:396,sortGroup:80,sortRank:7,keywords:"corner shoujo manga rose vine 薔薇 バラ 唐草 コーナー"},
      {id:"corner-shoujo-lace-pearl",label:"レースパールコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_shoujo_lace_pearl.png",mask:false,w:400,h:398,sortGroup:80,sortRank:8,keywords:"corner shoujo manga lace pearl ribbon レース パール コーナー"},
      {id:"corner-shoujo-feather",label:"羽根コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_shoujo_feather.png",mask:false,w:400,h:395,sortGroup:80,sortRank:9,keywords:"corner shoujo manga feather silver 羽根 コーナー"},
      {id:"corner-shoujo-lily",label:"百合コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_shoujo_lily.png",mask:false,w:400,h:398,sortGroup:80,sortRank:10,keywords:"corner shoujo manga lily flower 百合 花 コーナー"},
      {id:"corner-shoujo-gem-chain",label:"宝石チェーンコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_shoujo_gem_chain.png",mask:false,w:400,h:399,sortGroup:80,sortRank:11,keywords:"corner shoujo manga gem jewel chain gold 宝石 チェーン コーナー"},
      {id:"corner-shoujo-monochrome-rose",label:"モノクロ薔薇コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_shoujo_monochrome_rose.png",mask:false,w:400,h:400,sortGroup:80,sortRank:12,keywords:"corner shoujo manga monochrome rose black white モノクロ 薔薇 コーナー"},
      {id:"corner-standard-geometric",label:"幾何学コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_standard_geometric.png",mask:false,w:400,h:399,sortGroup:80,sortRank:13,keywords:"corner standard geometric modern line 幾何学 コーナー"},
      {id:"corner-standard-laurel",label:"月桂樹コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_standard_laurel.png",mask:false,w:371,h:400,sortGroup:80,sortRank:14,keywords:"corner standard laurel olive leaf green 月桂樹 葉 コーナー"},
      {id:"corner-standard-art-deco",label:"アールデココーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_standard_art_deco.png",mask:false,w:400,h:399,sortGroup:80,sortRank:15,keywords:"corner standard art deco gold geometric アールデコ 金 コーナー"},
      {id:"corner-standard-japanese-wave",label:"和柄コーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_standard_japanese_wave.png",mask:false,w:377,h:400,sortGroup:80,sortRank:16,keywords:"corner standard japanese wave cloud seigaiha 和柄 青海波 雲 コーナー"},
      {id:"corner-standard-classic-leaf",label:"クラシックリーフコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_standard_classic_leaf.png",mask:false,w:362,h:400,sortGroup:80,sortRank:17,keywords:"corner standard classic leaf bronze bookplate クラシック 葉 コーナー"},
      {id:"corner-standard-monochrome",label:"モノクロラインコーナー",category:"corners",format:"PNG RGBA",src:"./assets/stamps/corners/corner_standard_monochrome.png",mask:false,w:386,h:400,sortGroup:80,sortRank:18,keywords:"corner standard monochrome line leaf black white モノクロ ライン 葉 コーナー"}
    ];
    let DYNAMIC_SFX_PRESETS = [];
    let USER_ASSET_PRESETS = [];
    let USER_ASSET_REVISION = 0;
    let SFX_PRESETS = [...BUILTIN_SFX_PRESETS];
    let SFX_BY_ID = new Map(SFX_PRESETS.map(preset=>[preset.id,preset]));
    function rebuildSfxPresetIndex(){const merged=new Map(BUILTIN_SFX_PRESETS.map(preset=>[preset.id,preset]));DYNAMIC_SFX_PRESETS.forEach(preset=>merged.set(preset.id,preset));USER_ASSET_PRESETS.forEach(preset=>merged.set(preset.id,preset));SFX_PRESETS=[...merged.values()];SFX_BY_ID=new Map(SFX_PRESETS.map(preset=>[preset.id,preset]));}
    function normalizeCatalogSfxPreset(raw={}){const id=String(raw.id||"").trim(),src=String(raw.src||"").trim(),ocrLabel=String(raw.ocrLabel||raw.ocr_label||"").trim(),displayName=String(raw.displayName||raw.display_name||ocrLabel||raw.label||id).trim(),sortKey=String(raw.sortKey||raw.sort_key||ocrLabel||displayName||"").trim();if(!id||!src)return null;return{id,label:displayName,displayName,ocrLabel:ocrLabel||undefined,sortKey:sortKey||undefined,sortGroup:Number.isFinite(Number(raw.sortGroup))?Number(raw.sortGroup):undefined,sortRank:Number.isFinite(Number(raw.sortRank))?Number(raw.sortRank):undefined,category:String(raw.category||"japanese"),format:String(raw.format||"WebP Mask"),src,mask:raw.mask!==false,fill:raw.fill||undefined,stroke:raw.stroke||undefined,outlineWidth:Number.isFinite(Number(raw.outlineWidth))?Number(raw.outlineWidth):undefined,opacity:Number.isFinite(Number(raw.opacity))?Number(raw.opacity):undefined,w:Math.max(1,Number(raw.w)||360),h:Math.max(1,Number(raw.h)||360),keywords:String(raw.keywords||"")};}
    function normalizeUserAssetStyle(raw={},width=360,height=360){const value=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{},number=(key,min,max,fallback)=>{const candidate=Number(value[key]);return Number.isFinite(candidate)?Math.max(min,Math.min(max,candidate)):fallback;},color=(key,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value[key]||""))?String(value[key]).toLowerCase():fallback;return{mask_mode:value.mask_mode===true,width:number("width",1,8192,Math.max(1,width)),height:number("height",1,8192,Math.max(1,height)),opacity:number("opacity",0,1,1),fill:color("fill","#ffffff"),stroke:color("stroke","#111111"),stroke_width:number("stroke_width",0,100,0),shadow_enabled:value.shadow_enabled===true,shadow_color:color("shadow_color","#000000"),shadow_x:number("shadow_x",-500,500,6),shadow_y:number("shadow_y",-500,500,6),shadow_blur:number("shadow_blur",0,200,4),glow_enabled:value.glow_enabled===true,glow_color:color("glow_color","#ffffff"),glow_opacity:number("glow_opacity",0,1,.75),glow_blur:number("glow_blur",0,200,16),glow_spread:number("glow_spread",0,100,0)};}
    function authenticatedAssetUrl(value){const raw=String(value||"").trim();if(!raw)return"";try{const url=new URL(raw,location.href);if(desktopLaunchToken&&url.origin===location.origin)url.searchParams.set("token",desktopLaunchToken);return url.href;}catch{return raw;}}
    function normalizeUserAssetPreset(raw={}){const presetId=String(raw.id||"").trim(),assetId=String(raw.asset_id||"").trim().replace(/^user:/,""),src=authenticatedAssetUrl(raw.asset_url);if(!presetId||!/^[a-f0-9-]{36}$/i.test(presetId)||!/^[a-f0-9]{64}$/i.test(assetId)||!src)return null;const label=String(raw.name||"User Preset").trim()||"User Preset",userCategory=raw.category==="stamp"?"stamp":"sfx",w=Math.max(1,Number(raw.width)||360),h=Math.max(1,Number(raw.height)||360);return{id:`user-preset:${presetId}`,label,displayName:label,sortKey:label,category:"user",userCategory,userPreset:true,userPresetId:presetId,userAssetId:assetId,format:String(raw.format||"png").toUpperCase()+" RGBA",src,thumbnailSrc:authenticatedAssetUrl(raw.thumbnail_url||src),mask:false,w,h,styleDefaults:normalizeUserAssetStyle(raw.style_defaults,w,h),keywords:`user preset my ${userCategory} ${label}`};}
    async function loadSfxAssetCatalog(){try{const response=await fetch(`${apiBase}/assets/sfx?v=${encodeURIComponent(assetCacheVersion)}`,{cache:"force-cache"});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json();DYNAMIC_SFX_PRESETS=(Array.isArray(payload?.items)?payload.items:[]).map(normalizeCatalogSfxPreset).filter(Boolean);rebuildSfxPresetIndex();for(const warning of payload?.warnings||[])console.warn("SFX asset warning:",warning);}catch(error){console.warn("Could not load dynamic SFX catalog; using bundled presets.",error);DYNAMIC_SFX_PRESETS=[];rebuildSfxPresetIndex();}}
    async function loadUserAssetCatalog(){try{const response=await fetch(`${forgeApiBase}/user-assets`,{cache:"no-store",credentials:"same-origin"});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json();clearSfxAssetCaches();USER_ASSET_REVISION=Math.max(0,Number(payload?.revision)||0);USER_ASSET_PRESETS=(Array.isArray(payload?.presets)?payload.presets:[]).map(normalizeUserAssetPreset).filter(Boolean);rebuildSfxPresetIndex();return payload;}catch(error){console.warn("Could not load user SFX/stamp presets.",error);clearSfxAssetCaches();USER_ASSET_PRESETS=[];rebuildSfxPresetIndex();return null;}}
    const COMIC_STAMP_FILLS = new Map([
      ["exclamation-mask",COMIC_YELLOW],["question-mask",COMIC_YELLOW],["brush-exclamation-mask",COMIC_YELLOW],["brush-question-mask",COMIC_YELLOW],["dakuten-mask",COMIC_YELLOW],["small-tsu-mask",COMIC_YELLOW],
      ["brush-heart-mask","#e53935"],["filled-heart-mask","#e53935"],["handdrawn-filled-heart-mask","#e53935"],["suit-club-mask",COMIC_YELLOW],["anger-mark-mask","#e53935"],["anger-mark-small-mask","#e53935"],
      ["star-outline-mask",COMIC_YELLOW],["star-filled-mask",COMIC_YELLOW],["sparkle-four-mask",COMIC_YELLOW],["sparkle-cluster-mask",COMIC_YELLOW],["sparkle-radiant-mask",COMIC_YELLOW],["lightning-zap-mask",COMIC_YELLOW],
      ["sweat-drop-mask","#6ec6ff"],["sweat-drops-mask","#6ec6ff"],["bandage-mask","#f1c39b"],["music-notes-mask","#ffffff"]
    ]);
    const sfxImageCache = new Map();
    const bubblePreviewImageCache = new Map();
    const frameImageCache = new Map();
    const sfxTintCache = new Map();
    const MAX_SFX_TINT_CACHE = 192;
    const frameSurfaceCache = new Map();
    const tintedFrameSurfaceCache = new Map();
    const frameSurfaceKeys = new WeakMap();
    const MAX_FRAME_SURFACE_CACHE = 32;
    const MAX_TINTED_FRAME_CACHE = 24;
    const DRAWER_MIN_WIDTH = 224;
    const DRAWER_WIDTHS_KEY = "speech_bubble:drawer_widths:v2";
    const LEGACY_DRAWER_WIDTH_KEY = "speech_bubble:drawer_width:v1";
    const SFX_SECTION_STATE_KEY = "speech_bubble:sfx_drawer_sections:v1";

    let BUBBLE_PRESETS = [
      {id:"base-oval",label:"Classic Oval",category:"dialogue",shape:"custom",w:380,h:245,tail:"bottom-left",path:"base-oval",keywords:"classic natural manga dialogue oval asymmetric"},
      {id:"base-oval-alt",label:"Classic Oval 2",category:"dialogue",shape:"custom",w:335,h:275,tail:"bottom-left",path:"base-oval-alt",keywords:"classic manga dialogue oval tall egg asymmetric"},
      {id:"base-box",label:"Box",category:"narration",shape:"custom",w:390,h:220,tail:"none",path:"base-box",keywords:"box rectangle rounded narration"},
      {id:"base-jagged",label:"Hard Jagged",category:"emotion",shape:"custom",w:425,h:245,tail:"none",path:"base-jagged",keywords:"sharp jagged shout explosion manga asymmetric spikes"},
      {id:"base-soft-burst",label:"Soft Burst",category:"emotion",shape:"custom",w:420,h:245,tail:"none",path:"base-soft-burst",keywords:"soft curved burst manga emphasis asymmetric"},
      {id:"base-thought",label:"Thinking Cloud",category:"thought",shape:"custom",w:385,h:270,tail:"bottom-left",tail_style:"dots",path:"base-thought",keywords:"thinking thought cloud japanese manga fixed rounded lobes body only",tuning:{family:"fixed-cloud",asymmetry:0,radial:0,tangent:0},fixed_path:true,allow_morph:false,allow_path_edit:false,lock_aspect_ratio:true,defaults:{shadow_enabled:false}},
      {id:"base-heart",label:"Heart",category:"special",shape:"custom",w:340,h:300,tail:"none",path:"base-heart",keywords:"heart love romantic"},
      {id:"comic_tall_panel_soft",label:"Comic Tall Panel Soft",category:"dialogue",shape:"custom",w:360,h:480,tail:"bottom-left",tail_style:"pointed",path:"comic_tall_panel_soft",keywords:"vertical comic speech bubble tall panel soft manga dialogue",tuning:{family:"comic-panel-soft"}},
      {id:"comic_tall_panel_irregular",label:"Comic Tall Panel Irregular",category:"dialogue",shape:"custom",w:360,h:480,tail:"bottom-left",tail_style:"pointed",path:"comic_tall_panel_irregular",keywords:"vertical comic speech bubble irregular asymmetric manga dialogue",tuning:{family:"comic-panel-irregular"}},
      {id:"comic_vertical_oval_notched",label:"Comic Vertical Oval Accented v4",category:"dialogue",shape:"custom",w:360,h:480,tail:"bottom-left",tail_style:"pointed",path:"comic_vertical_oval_notched",keywords:"vertical comic speech bubble oval accented manga dialogue",tuning:{family:"comic-vertical-oval-accented"}},
      {id:"rpg-dialogue-box-no-marker",label:"RPG Dialogue Box",category:"dialogue",shape:"dialogue",render_mode:"layered-rounded-rectangle",dialogue_style:"rpg",preview_src:"./assets/shapes/dialogue/rpg_dialogue_box_no_marker.png",w:630,h:154,tail:"none",dialogue_defaults:{outerColor:"#000000",borderColor:"#FFFFFF",fillColor:"#000000",textColor:"#FFFFFF",outerEdge:5,borderWidth:8,cornerRadius:20,paddingLeft:32,paddingRight:32,paddingTop:28,paddingBottom:28}},
      {id:"classic-sticky-note",label:"Classic Sticky Note",category:"dialogue",shape:"dialogue",render_mode:"asset-overlay",dialogue_style:"sticky-note",preview_src:"./assets/shapes/dialogue/classic_sticky_note_preview.png",asset_src:"./assets/shapes/dialogue/classic_sticky_note.webp",w:420,h:402,tail:"none",lock_aspect_ratio:true,keywords:"sticky note memo classic yellow folded corner dialog",dialogue_defaults:{fillColor:"#FFF4AA",textColor:"#2B2B2B",borderWidth:0,cornerRadius:0,paddingLeft:36,paddingRight:55,paddingTop:38,paddingBottom:72}}
    ];
     let PRESET_BY_ID = new Map(BUBBLE_PRESETS.map(preset=>[preset.id,preset]));
     const SVG_SHAPE_PATHS = new Map();
     let bubbleShapeAssetsReady=false;
        const LEGACY_PRESET = {oval:"base-oval",rounded_rect:"base-box",sharp_rect:"base-box",cloud:"base-thought",double_cloud:"base-thought",wavy:"base-thought",soft_burst:"base-soft-burst",spike:"base-jagged",angular:"base-jagged",hexagon:"base-box",custom:"base-heart"};
    const REMOVED_PRESET_ALIAS = {
      "dialogue-natural":"base-oval","dialogue-tall":"base-oval","dialogue-round":"base-oval","dialogue-wide":"base-oval","dialogue-egg":"base-oval","dialogue-shared":"base-oval","dialogue-linked":"base-oval","dialogue-overlap":"base-oval","dialogue-inward-tail":"base-oval","quiet-whisper":"base-oval","quiet-partial-line":"base-oval",
      "dialogue-round-rect":"base-box","dialogue-off-panel":"base-box","dialogue-low-radius":"base-box","dialogue-round-square":"base-box","dialogue-sharp-square":"base-box","narration-rect":"base-box","narration-square":"base-box","narration-rounded":"base-box","special-radio":"base-box","special-telephone":"base-box","special-notched":"base-box","narration-voiceover":"base-box",
      "thought-cloud":"base-thought","thought-double-cloud":"base-thought","thought-fuzzy":"base-thought","thought-oval-dots":"base-thought","quiet-wavy":"base-thought","quiet-tremble":"base-thought","special-ghost":"base-thought",
      "emotion-jagged":"base-jagged","emotion-explosion":"base-jagged","emotion-concave":"base-jagged","emotion-needle":"base-jagged","emotion-icicle":"base-jagged","emotion-radial":"base-jagged","emotion-drip":"base-jagged","special-electric":"base-jagged","special-robot":"base-jagged","special-distorted":"base-jagged","dialogue-hand-square":"base-jagged",
      "emotion-soft-burst":"base-soft-burst","dialogue-heart":"base-heart","dialogue-hexagon":"base-box","base-hexagon":"base-box","base-melting":"base-thought","base-shoujo-aura":"base-oval"
    };
    let SHAPE_TUNING = {
      "base-oval":{family:"oval",intensity:68,asymmetry:18,roundness:64,radial:.18,tangent:.08},
      "base-oval-alt":{family:"oval",intensity:58,asymmetry:20,roundness:46,radial:.18,tangent:.08},
      "base-box":{family:"box",intensity:100,asymmetry:0,roundness:34,radial:.08,tangent:.04},
      "base-jagged":{family:"jagged",intensity:72,asymmetry:58,spikeCount:17,valleyStyle:"straight",valleyConcavity:64,radial:.24,tangent:.09},
      "base-soft-burst":{family:"soft",intensity:62,asymmetry:42,spikeCount:13,radial:.18,tangent:.08},
      "base-thought":{family:"fixed-cloud",asymmetry:0,radial:0,tangent:0},
      "base-heart":{family:"heart",intensity:70,asymmetry:14,radial:.10,tangent:.04},
      "base-hexagon":{family:"special",intensity:100,asymmetry:18,radial:.25,tangent:.10},
      "base-melting":{family:"special",intensity:0,asymmetry:12,radial:.10,tangent:.04}
    };

    function svgPathTokens(data){return String(data||"").match(/[MLCZmlcz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)||[];}
    function parseSvgBubblePath(svgText){
      const parser=new DOMParser(),documentNode=parser.parseFromString(svgText,"image/svg+xml"),svg=documentNode.documentElement,pathNode=documentNode.querySelector("#bubble-shape")||documentNode.querySelector("path");
      if(!pathNode||svg.nodeName.toLowerCase()!=="svg")throw new Error("SVG bubble path is missing");
      const viewBox=String(svg.getAttribute("viewBox")||`0 0 ${svg.getAttribute("width")||1000} ${svg.getAttribute("height")||700}`).trim().split(/[ ,]+/).map(Number),[minX,minY,width,height]=viewBox;
      if(viewBox.length!==4||![minX,minY,width,height].every(Number.isFinite)||width<=0||height<=0)throw new Error("Invalid SVG viewBox");
      const tokens=svgPathTokens(pathNode.getAttribute("d")),points=[];let index=0,command="",current={x:0,y:0},first=null;
      const point=(x,y)=>({x:(x-minX)/width,y:(y-minY)/height});
      const read=()=>Number(tokens[index++]);
      while(index<tokens.length){
        if(/[MLCZmlcz]/.test(tokens[index]))command=tokens[index++];
        const relative=command===command.toLowerCase(),upper=command.toUpperCase();
        if(upper==="Z")break;
        if(upper==="M"||upper==="L"){
          let x=read(),y=read();if(!Number.isFinite(x)||!Number.isFinite(y))break;if(relative){x+=current.x;y+=current.y;}
          const normalized=point(x,y),entry={x:normalized.x,y:normalized.y,in_x:normalized.x,in_y:normalized.y,out_x:normalized.x,out_y:normalized.y};
          points.push(entry);current={x,y};if(!first)first={x,y};if(upper==="M")command=relative?"l":"L";
        }else if(upper==="C"){
          let x1=read(),y1=read(),x2=read(),y2=read(),x=read(),y=read();if(![x1,y1,x2,y2,x,y].every(Number.isFinite))break;
          if(relative){x1+=current.x;y1+=current.y;x2+=current.x;y2+=current.y;x+=current.x;y+=current.y;}
          if(!points.length)throw new Error("Cubic path must start with M");
          const control1=point(x1,y1),control2=point(x2,y2),endPoint=point(x,y),previous=points[points.length-1];
          previous.out_x=control1.x;previous.out_y=control1.y;
          points.push({x:endPoint.x,y:endPoint.y,in_x:control2.x,in_y:control2.y,out_x:endPoint.x,out_y:endPoint.y});current={x,y};
        }else throw new Error(`Unsupported SVG path command: ${command}`);
      }
      if(points.length>3){const firstPoint=points[0],lastPoint=points[points.length-1];if(Math.hypot(firstPoint.x-lastPoint.x,firstPoint.y-lastPoint.y)<1e-6){firstPoint.in_x=lastPoint.in_x;firstPoint.in_y=lastPoint.in_y;points.pop();}}
      if(points.length<3)throw new Error("SVG path has fewer than three anchors");
      return points;
    }
    function installBubbleFallbackAssets(){
      const inlineShapes={
        "base-oval":`<svg viewBox="0 0 1000 700"><path id="bubble-shape" d="M 512 38 C 703 20 876 76 955 225 C 1012 333 982 470 872 568 C 742 683 515 694 318 650 C 146 612 48 519 42 371 C 35 226 121 112 272 68 C 353 45 431 48 512 38 Z"/></svg>`,
        "base-oval-alt":`<svg viewBox="0 0 1000 700"><path id="bubble-shape" d="M 494 27 C 666 17 827 68 910 188 C 987 299 986 446 899 560 C 802 688 608 706 422 680 C 237 655 91 575 62 438 C 30 287 84 149 218 76 C 302 31 399 34 494 27 Z"/></svg>`,
        "base-box":`<svg viewBox="0 0 1000 700"><path id="bubble-shape" d="M 128 46 L 872 46 C 929 46 960 81 960 136 L 960 564 C 960 620 927 654 872 654 L 128 654 C 72 654 40 620 40 564 L 40 136 C 40 80 72 46 128 46 Z"/></svg>`,
        "base-jagged":`<svg viewBox="0 0 1000 700"><path id="bubble-shape" d="M 500.05 2.35 L 546.53 149.46 L 657.55 37.20 L 640.42 184.02 L 830.14 106.34 L 740.02 223.04 L 901.64 208.83 L 761.88 294.33 L 995.10 327.58 L 821.96 371.13 L 979.24 437.41 L 749.90 440.15 L 875.89 561.32 L 676.30 491.84 L 756.85 648.73 L 624.48 563.51 L 588.19 683.76 L 491.54 579.70 L 417.31 664.10 L 392.92 547.30 L 249.91 634.03 L 276.59 515.68 L 97.90 553.45 L 214.04 445.68 L 32.61 446.92 L 179.77 363.06 L 11.35 313.98 L 223.76 299.56 L 86.12 191.09 L 264.01 225.89 L 158.07 95.61 L 355.44 172.50 L 316.59 29.44 L 440.85 148.66 Z"/></svg>`,
        "base-soft-burst":`<svg viewBox="0 0 1000 700"><path id="bubble-shape" d="M 494.21 45.84 C 511.65 45.41 559.20 107.13 580.90 112.13 C 602.61 117.13 689.04 88.26 704.24 94.21 C 719.45 100.17 713.38 160.29 728.06 169.76 C 742.75 179.23 837.77 175.29 846.35 185.84 C 854.93 196.39 803.29 258.20 811.07 271.85 C 818.84 285.50 918.99 306.82 921.59 317.93 C 924.18 329.04 835.76 364.54 836.19 379.35 C 836.61 394.17 930.44 450.38 925.68 461.31 C 920.92 472.24 805.53 473.75 790.11 485.10 C 774.69 496.45 790.20 563.07 776.42 571.14 C 762.64 579.22 673.34 554.64 656.76 563.23 C 640.18 571.82 631.99 652.90 615.96 654.26 C 599.92 655.63 524.35 575.44 501.60 576.41 C 478.85 577.38 412.09 666.59 395.79 663.66 C 379.50 660.73 364.65 556.47 343.91 548.03 C 323.17 539.59 206.66 589.79 195.09 581.97 C 183.52 574.15 245.93 484.23 231.95 472.34 C 217.97 460.45 66.99 476.80 59.80 466.94 C 52.61 457.08 162.44 393.08 162.40 376.93 C 162.35 360.79 57.43 321.75 59.36 310.73 C 61.29 299.71 171.51 283.60 181.05 270.26 C 190.59 256.91 141.93 191.16 151.65 181.57 C 161.38 171.98 259.94 186.11 275.19 177.42 C 290.44 168.73 285.07 103.79 299.22 97.47 C 313.37 91.15 391.99 121.57 412.14 116.23 C 432.29 110.90 476.77 46.26 494.21 45.84 Z"/></svg>`,
        "base-thought":`<svg viewBox="0 0 1000 700"><path id="bubble-shape" d="M 150 260 C 112 210 145 145 225 135 C 270 92 340 86 390 126 C 430 58 525 42 585 112 C 640 70 735 76 770 140 C 850 120 900 182 855 250 C 930 282 936 355 865 382 C 920 442 870 515 785 493 C 765 560 680 583 615 540 C 565 607 475 612 430 555 C 365 594 280 560 285 495 C 205 516 130 462 157 402 C 83 372 82 296 150 260 Z"/></svg>`,
        "base-heart":`<svg viewBox="0 0 1000 700"><path id="bubble-shape" d="M 500 654 C 438 591 202 441 123 306 C 47 176 117 48 257 45 C 359 42 441 105 500 191 C 559 105 641 42 743 45 C 883 48 953 176 877 306 C 798 441 562 591 500 654 Z"/></svg>`,
        "comic_tall_panel_soft":`<svg viewBox="0 0 1200 1600"><path id="bubble-shape" d="M 215 250 C 280 295 360 305 470 305 C 590 305 700 300 805 245 C 800 330 820 405 905 430 C 875 500 860 600 865 760 L 865 1110 C 855 1210 865 1280 910 1335 C 835 1325 790 1365 775 1435 C 680 1390 590 1395 505 1465 C 420 1395 330 1385 240 1435 C 245 1360 200 1325 130 1335 C 160 1250 155 1160 150 1050 L 150 585 C 145 505 130 455 95 420 C 165 410 200 340 215 250 Z"/></svg>`,
        "comic_tall_panel_irregular":`<svg viewBox="0 0 1200 1600"><path id="bubble-shape" d="M 210 250 C 265 315 325 335 375 295 C 455 335 585 325 690 245 C 690 325 710 350 745 295 C 742 365 765 385 805 325 C 805 410 845 450 910 420 C 865 510 850 610 855 750 L 855 1105 C 850 1200 865 1260 910 1310 C 835 1310 805 1365 800 1430 C 710 1385 635 1395 555 1465 C 480 1390 405 1380 330 1440 C 320 1370 285 1340 230 1355 C 255 1270 250 1210 190 1195 C 220 1120 220 1045 210 970 C 205 900 190 850 155 820 C 205 780 220 725 205 660 C 195 610 170 560 130 520 C 205 505 225 425 210 350 C 205 315 200 280 210 250 Z"/></svg>`,
        "comic_vertical_oval_notched":`<svg viewBox="0 0 1200 1600"><path id="bubble-shape" d="M 355 215 C 470 155 705 150 835 205 C 890 230 920 275 940 330 L 965 365 L 940 390 C 955 455 960 555 960 690 L 960 1035 C 960 1110 950 1170 935 1225 L 960 1260 L 925 1268 C 900 1330 850 1380 790 1415 C 675 1480 500 1480 385 1418 C 320 1385 270 1330 245 1268 L 210 1258 L 235 1228 C 220 1168 212 1100 212 1020 L 212 610 C 212 530 220 455 235 390 L 205 360 L 245 350 C 270 285 310 240 355 215 Z"/></svg>`
      };
      for(const [presetId,svg] of Object.entries(inlineShapes)){
        // Keep the original Desktop procedural ovals. The later SVG fallback
        // changed only these two built-ins into visibly lopsided shapes.
        if(presetId==="base-oval"||presetId==="base-oval-alt")continue;
        const points=parseSvgBubblePath(svg),preset=BUBBLE_PRESETS.find(candidate=>candidate.id===presetId);
        SVG_SHAPE_PATHS.set(presetId,points);
        if(preset)preset.path_points=clonePath(points);
      }
      PRESET_BY_ID=new Map(BUBBLE_PRESETS.map(preset=>[preset.id,preset]));
      bubbleShapeAssetsReady=true;
    }
    installBubbleFallbackAssets();
    async function loadBubbleShapeManifest(){
      try{
        const response=await fetch(`./assets/shapes/manifest.json?v=${encodeURIComponent(assetCacheVersion)}`,{cache:"force-cache"});if(!response.ok)throw new Error(`Shape manifest failed (${response.status})`);
        const payload=await response.json(),presets=Array.isArray(payload?.presets)?payload.presets:[];
        const loaded=(await Promise.all(presets.map(async raw=>{
          const preset={...raw,path:raw.svg?String(raw.id||raw.path||""):""};if(!preset.id)return null;
          if(raw.svg&&preset.id!=="base-oval"&&preset.id!=="base-oval-alt"){
            const shapeResponse=await fetch(`./assets/shapes/${raw.svg}?v=${encodeURIComponent(payload.assetVersion||"")}`,{cache:"force-cache"});if(!shapeResponse.ok)throw new Error(`Shape SVG failed: ${raw.svg}`);
            const points=parseSvgBubblePath(await shapeResponse.text());SVG_SHAPE_PATHS.set(preset.path,points);preset.path_points=clonePath(points);
          }
           const preview=raw.preview||raw.thumbnail;if(preview)preset.preview_src=`./assets/shapes/${preview}`;
           if(raw.asset)preset.asset_src=`./assets/shapes/${raw.asset}`;
           preset.render_mode=raw.render_mode||raw.renderMode||"";
          preset.dialogue_style=raw.dialogue_style||raw.dialogueStyle||raw.style_id||raw.styleId||"";
          return preset;
        }))).filter(Boolean);
        if(loaded.length){BUBBLE_PRESETS=loaded;PRESET_BY_ID=new Map(loaded.map(preset=>[preset.id,preset]));SHAPE_TUNING=Object.fromEntries(loaded.filter(preset=>preset.path).map(preset=>[preset.path,{...(preset.tuning||{}),family:preset.tuning?.family||"oval"}]));bubbleShapeAssetsReady=true;}
      }catch(error){installBubbleFallbackAssets();console.warn("Speech Bubble SVG shape manifest unavailable; using the complete built-in fallback",error);}
    }

        function id() { return `layer-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
    function finiteOr(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
    function integerFontSize(value,fallback=48){return Math.max(1,Math.floor(finiteOr(value,fallback)));}
    function fontScaleValue(value,fallback=100){return Math.max(10,Math.min(500,Math.round(finiteOr(value,fallback))));}
    function trackingValue(value,fallback=0){return Math.max(-200,Math.min(500,Math.round(finiteOr(value,fallback))));}
    function storedStringList(key){try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value.filter(item=>typeof item==="string"):[];}catch{return[];}}
    function saveStringList(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}
    const DRAWER_MAX_WIDTH = 440;
    function drawerWidthLimit(){return Math.max(DRAWER_MIN_WIDTH,Math.min(DRAWER_MAX_WIDTH,window.innerWidth-400));}
    function drawerWidthKey(drawer){if(drawer?.id==="sfxDrawer")return sfxBrowseMode==="stamps"?"stamps":"sfx";return{shapeDrawer:"bubbles",frameDrawer:"frames",emphasisDrawer:"emphasis"}[drawer?.id]||"bubbles";}
    function storedDrawerWidths(){try{const value=JSON.parse(localStorage.getItem(DRAWER_WIDTHS_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return{};}}
    function savedDrawerWidth(drawer){const widths=storedDrawerWidths(),key=drawerWidthKey(drawer);if(Number.isFinite(Number(widths[key])))return Number(widths[key]);try{return Number(localStorage.getItem(LEGACY_DRAWER_WIDTH_KEY))||DRAWER_MIN_WIDTH;}catch{return DRAWER_MIN_WIDTH;}}
    function setDrawerWidth(drawer,value,save=true){if(!drawer)return DRAWER_MIN_WIDTH;const width=Math.max(DRAWER_MIN_WIDTH,Math.min(drawerWidthLimit(),Math.round(finiteOr(value,DRAWER_MIN_WIDTH))));drawer.style.width=`${width}px`;if(save){try{const widths=storedDrawerWidths();widths[drawerWidthKey(drawer)]=width;localStorage.setItem(DRAWER_WIDTHS_KEY,JSON.stringify(widths));}catch{}}return width;}
    function restoreDrawerWidth(drawer){return setDrawerWidth(drawer,savedDrawerWidth(drawer),false);}
    function initializeDrawerResize(){document.querySelectorAll(".drawer").forEach(restoreDrawerWidth);document.querySelectorAll(".drawer-resizer").forEach(resizer=>{const drawer=resizer.closest(".drawer");resizer.addEventListener("pointerdown",event=>{event.preventDefault();event.stopPropagation();const startX=event.clientX,startWidth=drawer?.getBoundingClientRect().width||DRAWER_MIN_WIDTH;resizer.classList.add("active");resizer.setPointerCapture(event.pointerId);const move=moveEvent=>setDrawerWidth(drawer,startWidth+moveEvent.clientX-startX);const end=endEvent=>{resizer.classList.remove("active");if(resizer.hasPointerCapture(endEvent.pointerId))resizer.releasePointerCapture(endEvent.pointerId);resizer.removeEventListener("pointermove",move);resizer.removeEventListener("pointerup",end);resizer.removeEventListener("pointercancel",end);};resizer.addEventListener("pointermove",move);resizer.addEventListener("pointerup",end);resizer.addEventListener("pointercancel",end);});resizer.addEventListener("dblclick",event=>{event.preventDefault();event.stopPropagation();setDrawerWidth(drawer,DRAWER_MIN_WIDTH);});});window.addEventListener("resize",()=>document.querySelectorAll(".drawer").forEach(drawer=>setDrawerWidth(drawer,drawer.getBoundingClientRect().width||savedDrawerWidth(drawer),false)));}
    function fontFamilyKey(value){return String(value||"").trim().toLocaleLowerCase();}
    function fontStylePriority(font){if(font.primary_style)return 0;const style=String(font.style||"").toLowerCase();if(["regular","normal","book","roman"].includes(style))return 0;if(style.includes("medium"))return 1;if(style.includes("bold")||style.includes("heavy")||style.includes("black"))return 2;if(style.includes("italic")||style.includes("oblique"))return 3;return 4;}
    function buildFontFamilies(catalog){const map=new Map();catalog.forEach(font=>{const key=fontFamilyKey(font.family);if(!key)return;if(!map.has(key))map.set(key,{key,family:font.family,variants:[]});map.get(key).variants.push(font);});const families=[...map.values()];families.forEach(family=>{family.variants.sort((a,b)=>fontStylePriority(a)-fontStylePriority(b)||String(a.style).localeCompare(String(b.style)));family.primary=family.variants[0];family.language=family.primary.language||"other";family.languageLabel=family.primary.language_label||FONT_LANGUAGE_LABELS[family.language]||"Other";family.sample=family.primary.sample||"Sample";family.recommended=family.variants.some(font=>font.recommended);family.supportsLatin=family.variants.some(font=>font.supports_latin);family.searchText=`${family.family} ${family.variants.map(font=>`${font.name} ${font.style}`).join(" ")} ${family.languageLabel}`.toLocaleLowerCase();});return families.sort((a,b)=>Number(b.recommended)-Number(a.recommended)||a.family.localeCompare(b.family));}
    function fontLanguageBadge(font){if(!font)return"AUTO";const base={ja:"JP","zh-hans":"SC","zh-hant":"TC",ko:"KR",latin:"EN",arabic:"AR",hebrew:"HE",devanagari:"HI",emoji:"EMOJI",symbol:"SYM",other:"OTHER"}[font.language]||"OTHER";return font.supports_latin&&base!=="EN"&&!["EMOJI","SYM","OTHER"].includes(base)?`${base}+EN`:base;}
    const loadedFontFaces=new Set(),fontLoadPromises=new Map(),failedFontFaces=new Map();
    function fontCssFamily(font){return font?.id?`SpeechBubbleFont_${font.id}`:String(font?.family||"sans-serif").replaceAll('"','');}
    function fontFaceSource(font){const family=String(font?.family||"").trim(),style=String(font?.style||"").trim(),names=[];if(family&&style&&!/^(regular|normal)$/i.test(style))names.push(`${family} ${style}`);if(family)names.push(family);const escaped=[...new Set(names)].map(name=>`local("${name.replaceAll("\\","\\\\").replaceAll('"','\\"')}")`);escaped.push(`url("${fontFileUrl(font.id)}")`);return escaped.join(", ");}
    function hasSavedFontIdentity(item){const family=fontFamilyKey(item?.font_family);return Boolean(item?.font_id||item?.font_path||(family&&family!=="sans-serif"));}
    function matchingSavedFont(item,catalog=fontCatalog){return catalog.find(candidate=>candidate.id===item?.font_id)||catalog.find(candidate=>candidate.path&&candidate.path===item?.font_path)||catalog.find(candidate=>fontFamilyKey(candidate.family)===fontFamilyKey(item?.font_family))||null;}
    function applyResolvedFont(item,font){item.font_id=font.id;item.font_family=font.family;item.font_css_family=fontCssFamily(font);item.font_path="";}
    function fontFileUrl(fontId){const url=new URL(`${apiBase}/font-file/${encodeURIComponent(fontId)}`,location.href);if(desktopLaunchToken)url.searchParams.set("token",desktopLaunchToken);return url.href;}
    async function ensureFontLoaded(font){if(!font?.id)return false;if(loadedFontFaces.has(font.id))return true;if(!fontLoadPromises.has(font.id)){const promise=(async()=>{const face=new FontFace(fontCssFamily(font),fontFaceSource(font));await face.load();document.fonts.add(face);loadedFontFaces.add(font.id);failedFontFaces.delete(font.id);return true;})().catch(error=>{const name=font.name||font.family||font.id;failedFontFaces.set(font.id,`${name}: ${error?.message||"load failed"}`);console.warn(`Speech Bubble font could not be loaded: ${name}`,error);if(fontLoadPromises.get(font.id)===promise)fontLoadPromises.delete(font.id);return false;});fontLoadPromises.set(font.id,promise);}return fontLoadPromises.get(font.id);}
    function applyFontPreviewStyle(node,font){const family=fontCssFamily(font),style=String(font?.style||"").toLowerCase();node.style.fontFamily=`"${family}", sans-serif`;node.style.fontStyle=style.includes("italic")||style.includes("oblique")?"italic":"normal";node.style.fontWeight=style.includes("black")||style.includes("heavy")?"900":style.includes("bold")?"700":style.includes("semi")||style.includes("demi")?"600":style.includes("medium")?"500":style.includes("light")?"300":style.includes("thin")?"200":"400";}
    function selectedTextItems(){const items=selectedItems();return items.length&&items.every(item=>item.type==="text")?items:[];}
    function editableSelectedTextItems(){return selectedTextItems().filter(item=>!item.locked);}
    function textFontIdentity(item){return item?.font_id||item?.font_path||fontFamilyKey(item?.font_family)||"";}
    function selectedFont(){const items=selectedTextItems();if(!items.length||!items.every(item=>textFontIdentity(item)===textFontIdentity(items[0])))return null;return matchingSavedFont(items[0]);}
    function updateFontPicker(item){const name=document.getElementById("fontCurrentName"),badge=document.getElementById("fontCurrentBadge"),button=document.getElementById("fontPickerButton");if(!name||!badge||!button)return;const items=selectedTextItems(),mixed=items.length>1&&!items.every(candidate=>textFontIdentity(candidate)===textFontIdentity(items[0])),target=items.length?items[0]:item;if(mixed){name.textContent=uiText("複数のフォント","Mixed fonts");badge.textContent="MIX";applyFontPreviewStyle(name,null);button.setAttribute("aria-label",uiText("複数のテキストへフォントを一括適用","Apply a font to the selected text layers"));button.title=button.getAttribute("aria-label");return;}const font=target?.type==="text"?(fontCatalog.find(candidate=>candidate.id===target.font_id)||fontCatalog.find(candidate=>fontFamilyKey(candidate.family)===fontFamilyKey(target.font_family))):null;name.textContent=font?.name||target?.font_family||uiText("自動 / システム既定","Auto / System Default");badge.textContent=fontLanguageBadge(font);applyFontPreviewStyle(name,font);button.setAttribute("aria-label",uiText(`フォントを選択。現在：${name.textContent}`,`Choose font. Current: ${name.textContent}`));button.title=button.getAttribute("aria-label");}
    function fontFamilyByKey(key){return fontFamilies.find(family=>family.key===key);}
    function markRecentFont(family){const next=[family.key,...storedStringList(FONT_RECENT_KEY).filter(key=>key!==family.key)].slice(0,12);saveStringList(FONT_RECENT_KEY,next);}
    function toggleFavoriteFont(family){const current=storedStringList(FONT_FAVORITES_KEY),exists=current.includes(family.key),next=exists?current.filter(key=>key!==family.key):[family.key,...current];saveStringList(FONT_FAVORITES_KEY,next);renderFontBrowser();}
    async function selectFontRecord(font,family){const selectedIds=editableSelectedTextItems().map(item=>item.id);if(!selectedIds.length)return;setSaveState(`${font.name||font.family} を読み込んでいます…`,"info");if(!await ensureFontLoaded(font)){setSaveState(`${font.name||font.family} を読み込めませんでした`,"error");return;}const current=selectedIds.map(id=>state.elements.find(item=>item.id===id)).filter(item=>item?.type==="text"&&!item.locked);if(!current.length)return;pushUndo();current.forEach(item=>{applyResolvedFont(item,font);fitTextBox(item,true,false);});markRecentFont(family);syncProperties();render();setSaveState(`${font.name||font.family} を適用しました`,"info");}
    function familiesForFontFilter(filter){if(filter==="favorites")return storedStringList(FONT_FAVORITES_KEY).map(fontFamilyByKey).filter(Boolean);if(filter==="recent")return storedStringList(FONT_RECENT_KEY).map(fontFamilyByKey).filter(Boolean);if(filter==="other")return fontFamilies.filter(family=>!["ja","zh-hans","zh-hant","ko","latin"].includes(family.language));if(filter==="all")return fontFamilies;return fontFamilies.filter(family=>family.language===filter);}
    function createFontRow(family,font=family.primary,isVariant=false){const row=document.createElement("div");row.className=`font-row${isVariant?" font-variant-row":""}`;row.setAttribute("role","option");const current=selectedFont();if(current?.id===font.id)row.classList.add("selected");const favorite=document.createElement(isVariant?"span":"button");if(isVariant){favorite.setAttribute("aria-hidden","true");}else{const active=storedStringList(FONT_FAVORITES_KEY).includes(family.key);favorite.type="button";favorite.className=`font-favorite${active?" active":""}`;favorite.textContent=active?"★":"☆";favorite.title=active?uiText("お気に入りから削除","Remove from favorites"):uiText("お気に入りに追加","Add to favorites");favorite.setAttribute("aria-label",active?`Remove ${family.family} from favorites`:`Add ${family.family} to favorites`);favorite.setAttribute("aria-pressed",String(active));favorite.onclick=event=>{event.stopPropagation();toggleFavoriteFont(family);};}const choose=document.createElement("button");choose.type="button";choose.className="font-family-select";const title=document.createElement("span");title.className="font-family-name";title.textContent=isVariant?(font.style||font.name):family.family;const meta=document.createElement("span"),badge=document.createElement("span");meta.className="font-family-meta";badge.className="font-language-badge";badge.textContent=fontLanguageBadge(font);meta.append(badge);if(!isVariant&&font.style){const style=document.createElement("span");style.textContent=font.style;meta.append(style);}choose.append(title,meta);const sample=document.createElement("button");sample.type="button";sample.className="font-sample";sample.textContent=font.sample||family.sample;applyFontPreviewStyle(sample,font);choose.onclick=sample.onclick=()=>selectFontRecord(font,family);ensureFontLoaded(font).then(loaded=>{if(loaded&&document.body.contains(sample))sample.style.fontFamily=`\"${fontCssFamily(font)}\", sans-serif`;else if(!loaded&&document.body.contains(row)){row.classList.add("font-load-failed");sample.textContent=`${uiText("読込失敗","Load failed")}: ${font.name||font.family||font.id}`;sample.title=failedFontFaces.get(font.id)||sample.textContent;}});const styles=document.createElement("span");if(!isVariant&&family.variants.length>1){const button=document.createElement("button");button.type="button";button.className="font-styles";button.textContent=expandedFontFamilies.has(family.key)?"Hide":`${family.variants.length} styles`;button.onclick=event=>{event.stopPropagation();expandedFontFamilies.has(family.key)?expandedFontFamilies.delete(family.key):expandedFontFamilies.add(family.key);renderFontBrowser();};row.append(favorite,choose,sample,button);}else row.append(favorite,choose,sample,styles);return row;}
    function appendFontSection(host,label,families){if(!families.length)return;const heading=document.createElement("div");heading.className="font-section-title";heading.textContent=`${label} · ${families.length}`;host.append(heading);families.forEach(family=>{host.append(createFontRow(family));if(expandedFontFamilies.has(family.key))family.variants.filter(font=>font.id!==family.primary.id).forEach(font=>host.append(createFontRow(family,font,true)));});}
    function renderFontBrowser(){const host=document.getElementById("fontList");if(!host)return;host.replaceChildren();const query=document.getElementById("fontSearch")?.value.trim().toLocaleLowerCase()||"";if(!fontFamilies.length){const empty=document.createElement("div");empty.className="font-empty";empty.textContent=uiText("システムフォントを読み込み中…","Loading system fonts…");host.append(empty);return;}if(query){appendFontSection(host,uiText("検索結果","Search Results"),fontFamilies.filter(family=>family.searchText.includes(query)));}else if(fontFilter==="all"){FONT_LANGUAGE_ORDER.forEach(language=>appendFontSection(host,fontLanguageLabel(language),fontFamilies.filter(family=>family.language===language)));}else{const label={favorites:uiText("お気に入り","Favorites"),recent:uiText("最近使用","Recent"),other:uiText("その他の文字体系","Other scripts")}[fontFilter]||fontLanguageLabel(fontFilter)||"Fonts";appendFontSection(host,label,familiesForFontFilter(fontFilter));}if(!host.children.length){const empty=document.createElement("div");empty.className="font-empty";empty.textContent=query?uiText("一致するフォントがありません。","No matching font families."):uiText("この分類にはフォントがありません。","No fonts in this section yet.");host.append(empty);}}
    const FONT_BROWSER_GEOMETRY_KEY="speech_bubble:font_browser_geometry:v1";
    function clampFontBrowserPosition(left,top){const browser=document.getElementById("fontBrowser"),margin=12,width=browser?.offsetWidth||500,height=browser?.offsetHeight||620;return{left:Math.max(margin,Math.min(Number(left)||margin,innerWidth-width-margin)),top:Math.max(margin,Math.min(Number(top)||margin,innerHeight-height-margin))};}
    function setFontBrowserPosition(left,top,save=false){const browser=document.getElementById("fontBrowser");if(!browser)return;const next=clampFontBrowserPosition(left,top);browser.style.left=`${Math.round(next.left)}px`;browser.style.top=`${Math.round(next.top)}px`;if(save)try{localStorage.setItem(FONT_BROWSER_GEOMETRY_KEY,JSON.stringify(next));}catch{}}
    function storedFontBrowserPosition(){try{const value=JSON.parse(localStorage.getItem(FONT_BROWSER_GEOMETRY_KEY)||"null");return Number.isFinite(value?.left)&&Number.isFinite(value?.top)?value:null;}catch{return null;}}
    function positionFontBrowser(){const browser=document.getElementById("fontBrowser"),button=document.getElementById("fontPickerButton"),propertiesDock=document.getElementById("propertiesDock");if(!browser?.classList.contains("open")||!button)return;const stored=storedFontBrowserPosition();if(stored){setFontBrowserPosition(stored.left,stored.top);return;}const margin=12,gap=8,rect=button.getBoundingClientRect(),width=browser.offsetWidth,height=browser.offsetHeight;let left=Math.max(margin,Math.min(rect.left,innerWidth-width-margin)),top=Math.max(margin,Math.min(rect.bottom+5,innerHeight-height-margin));if(propertiesDock?.classList.contains("floating-panel")){const panel=propertiesDock.getBoundingClientRect(),leftOfPanel=panel.left-width-gap,rightOfPanel=panel.right+gap;if(leftOfPanel>=margin)left=leftOfPanel;else if(rightOfPanel+width<=innerWidth-margin)left=rightOfPanel;top=Math.max(margin,Math.min(panel.top,innerHeight-height-margin));}setFontBrowserPosition(left,top);}
    function initializeFontBrowserDrag(){const browser=document.getElementById("fontBrowser"),head=browser?.querySelector(".font-browser-head");if(!browser||!head)return;let drag=null;head.addEventListener("pointerdown",event=>{if(event.button!==0||event.target.closest("button"))return;const rect=browser.getBoundingClientRect();drag={id:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top};head.setPointerCapture(event.pointerId);event.preventDefault();});head.addEventListener("pointermove",event=>{if(!drag||event.pointerId!==drag.id)return;setFontBrowserPosition(event.clientX-drag.dx,event.clientY-drag.dy);});const finish=event=>{if(!drag||event.pointerId!==drag.id)return;setFontBrowserPosition(parseFloat(browser.style.left),parseFloat(browser.style.top),true);drag=null;};head.addEventListener("pointerup",finish);head.addEventListener("pointercancel",finish);window.addEventListener("resize",()=>{if(browser.classList.contains("open"))setFontBrowserPosition(parseFloat(browser.style.left),parseFloat(browser.style.top),Boolean(storedFontBrowserPosition()));});}
    function openFontBrowser(){const browser=document.getElementById("fontBrowser");browser.classList.add("open");document.getElementById("fontPickerButton").setAttribute("aria-expanded","true");renderFontBrowser();positionFontBrowser();document.getElementById("fontSearch").focus();}
    function closeFontBrowser(){document.getElementById("fontBrowser").classList.remove("open");document.getElementById("fontPickerButton").setAttribute("aria-expanded","false");}
    function defaultShapeSettings(tuning={}){return{shape_intensity:tuning.intensity??100,shape_asymmetry:tuning.asymmetry??0,shape_seed:1,shape_roundness:tuning.roundness??100,spike_count:tuning.spikeCount??12,valley_style:tuning.valleyStyle||"concave",valley_concavity:tuning.valleyConcavity??0,lobe_count:tuning.lobeCount??9,lobe_depth:tuning.lobeDepth??50,shape_softness:tuning.softness??70};}
    function normalizeShapeSettings(item,tuning={}){const defaults=defaultShapeSettings(tuning);item.shape_intensity=clampPercent(finiteOr(item.shape_intensity,finiteOr(item.jagged_intensity,defaults.shape_intensity)),defaults.shape_intensity);item.shape_asymmetry=clampPercent(item.shape_asymmetry,defaults.shape_asymmetry);item.shape_seed=finiteOr(item.shape_seed,finiteOr(item.jagged_seed,1));item.shape_roundness=clampPercent(item.shape_roundness,defaults.shape_roundness);item.spike_count=Math.max(5,Math.min(32,Math.round(finiteOr(item.spike_count,defaults.spike_count))));item.valley_style=item.valley_style==="straight"?"straight":"concave";item.valley_concavity=clampPercent(item.valley_concavity,defaults.valley_concavity);item.lobe_count=Math.max(5,Math.min(20,Math.round(finiteOr(item.lobe_count,defaults.lobe_count))));item.lobe_depth=clampPercent(item.lobe_depth,defaults.lobe_depth);item.shape_softness=clampPercent(item.shape_softness,defaults.shape_softness);item.jagged_intensity=item.shape_intensity;item.jagged_seed=item.shape_seed;return item;}
    function shapeOptions(item,tuning={}){return{shapeIntensity:item.shape_intensity??tuning.intensity,shapeAsymmetry:item.shape_asymmetry??tuning.asymmetry,shapeSeed:item.shape_seed??1,shapeRoundness:item.shape_roundness??tuning.roundness,spikeCount:item.spike_count??tuning.spikeCount,valleyStyle:item.valley_style??tuning.valleyStyle,valleyConcavity:item.valley_concavity??tuning.valleyConcavity,lobeCount:item.lobe_count??tuning.lobeCount,lobeDepth:item.lobe_depth??tuning.lobeDepth,shapeSoftness:item.shape_softness??tuning.softness};}
    function presetForPath(path){return BUBBLE_PRESETS.find(preset=>preset.path===path)||null;}
    function fixedPathPreset(preset){return Boolean(preset?.fixed_path||preset?.allow_morph===false);}
    function isFixedPathItem(item){return fixedPathPreset(PRESET_BY_ID.get(item?.preset_id));}
    function isDialoguePreset(preset){return Boolean(preset?.shape==="dialogue"||preset?.render_mode||preset?.dialogue_style);}
    function dialogueNumber(values,keys,fallback){for(const key of keys){if(values&&values[key]!==undefined&&Number.isFinite(Number(values[key])))return Number(values[key]);}return fallback;}
    function dialogueString(values,keys,fallback){for(const key of keys){if(values&&values[key]!==undefined&&String(values[key]).trim())return String(values[key]);}return fallback;}
    function dialogueSettings(preset={}){
      const source=preset.dialogue_defaults||preset.defaults||{},style=String(preset.dialogue_style||preset.dialogueStyle||preset.style_id||preset.styleId||"rpg").toLowerCase();
      return {
        style,
        outerColor:dialogueString(source,["outerColor","outer_color"],"#000000"),
        borderColor:dialogueString(source,["borderColor","border_color"],"#ffffff"),
        fillColor:dialogueString(source,["fillColor","fill_color","background"],"#ffffff"),
        textColor:dialogueString(source,["textColor","text_color"],"#ffffff"),
        outerEdge:Math.max(0,dialogueNumber(source,["outerEdge","outer_edge"],5)),
        borderWidth:Math.max(0,dialogueNumber(source,["borderWidth","border_width"],4)),
        cornerRadius:Math.max(0,dialogueNumber(source,["cornerRadius","corner_radius"],20)),
        paddingLeft:Math.max(0,dialogueNumber(source,["paddingLeft","padding_left"],28)),
        paddingRight:Math.max(0,dialogueNumber(source,["paddingRight","padding_right"],28)),
        paddingTop:Math.max(0,dialogueNumber(source,["paddingTop","padding_top"],24)),
        paddingBottom:Math.max(0,dialogueNumber(source,["paddingBottom","padding_bottom"],24))
      };
    }
    function applyDialoguePresetDefaults(item,preset,overwrite=false){
      const settings=dialogueSettings(preset),set=(key,value)=>{if(overwrite||item[key]===undefined||item[key]===null)item[key]=value;};
       item.shape="dialogue";item.dialogue_style=settings.style;
       if(preset.asset)item.dialogue_asset=preset.asset;
      set("dialogue_outer_color",settings.outerColor);set("dialogue_border_color",settings.borderColor);set("dialogue_fill_color",settings.fillColor);set("dialogue_text_color",settings.textColor);
      set("dialogue_outer_edge",settings.outerEdge);set("dialogue_border_width",settings.borderWidth);set("dialogue_corner_radius",settings.cornerRadius);
      set("dialogue_padding_left",settings.paddingLeft);set("dialogue_padding_right",settings.paddingRight);set("dialogue_padding_top",settings.paddingTop);set("dialogue_padding_bottom",settings.paddingBottom);
      if(overwrite||!item.fill)item.fill=settings.fillColor;if(overwrite||!item.stroke)item.stroke=settings.borderColor;if(overwrite||!Number.isFinite(Number(item.stroke_width)))item.stroke_width=settings.borderWidth;
      item.tail="none";item.extra_tails=[];item.tail_style="none";item.stroke_style="solid";item.decoration_style="none";item.shadow_enabled=false;item.lock_aspect_ratio=preset.lock_aspect_ratio===true;item.path_source="dialogue";item.user_modified_path=false;delete item.path_points;
      return item;
    }
    function defaultBubble(presetId="base-oval") {
      const resolvedId=REMOVED_PRESET_ALIAS[presetId]||presetId,
        preset=PRESET_BY_ID.get(resolvedId)||PRESET_BY_ID.get(LEGACY_PRESET[presetId])||BUBBLE_PRESETS[0],
        tuning=SHAPE_TUNING[preset.path],
        settings=defaultShapeSettings(tuning),
        fixed=fixedPathPreset(preset),
        item={id:id(),type:"bubble",preset_id:preset.id,shape:preset.shape,x:560,y:120,w:preset.w,h:preset.h,rotation:0,opacity:1,tail:preset.tail||"none",extra_tails:[...(preset.extra_tails||[])],tail_style:preset.tail_style||"pointed",stroke_style:preset.stroke_style||"solid",decoration_style:preset.decoration_style||"none",...settings,jagged_intensity:settings.shape_intensity,jagged_seed:settings.shape_seed,fill:"#ffffff",stroke:"#111111",stroke_width:preset.stroke_width??5,shadow_enabled:preset.defaults?.shadow_enabled===true,shadow_color:"#000000",shadow_x:6,shadow_y:6,shadow_blur:4,lock_aspect_ratio:fixed||preset.lock_aspect_ratio===true,path_source:"preset",user_modified_path:false,visible:true};
      if(isDialoguePreset(preset)){item.w=finiteOr(preset.w,900);item.h=finiteOr(preset.h,220);applyDialoguePresetDefaults(item,preset,true);return item;}
      item.path_points=presetPath(preset.path,shapeOptions(item,tuning));
      return item;
    }
    function defaultText() { const item={ id:id(), type:"text", x:600, y:150, w:320, h:80, text:uiText("こんにちは","Hello!"), writing:"horizontal", align:"center", font_path:"", font_id:"", font_family:"sans-serif", font_css_family:"sans-serif", font_size:54, tracking:0, font_scale_x:100, font_scale_y:100, rotation:0, auto_fit:true, color:"#111111", stroke_width:0, stroke_color:"#ffffff", bold:false, italic:false, underline:false, strikethrough:false, shadow_enabled:false, shadow_color:"#000000", shadow_x:6, shadow_y:6, shadow_blur:4, visible:true }; fitTextBox(item); return item; }
    function versionedSfxSrc(src){if(!src)return src;return `${src}${String(src).includes("?")?"&":"?"}v=${SFX_ASSET_VERSION}`;}
    function sfxPresetFill(preset){if(!preset?.mask)return preset?.fill||"#111111";if(isComicStamp(preset)){if(String(preset.id||"").startsWith("arrow-"))return"#e53935";return COMIC_STAMP_FILLS.get(preset.id)||"#ffffff";}return preset.fill||(preset.category==="japanese"?COMIC_YELLOW:"#ffffff");}
    const compactSwatchTargets={text:"color",bubble:"fill",frame:"border_color",asset:"fill",emphasis:"color",shadow:"shadow_color",glow:"glow_color"};
    function compactSwatchDefinition(type){if(type==="text")return{host:"textColorSwatches",keys:["color","stroke_color"]};if(type==="frame")return{host:"frameColorSwatches",keys:["border_color","inner_stroke_color"]};if(type==="asset")return{host:"sfxColorSwatches",keys:["fill","stroke"]};if(type==="emphasis")return{host:"emphasisColorSwatches",keys:["color"]};if(type==="shadow")return{host:"shadowColorSwatches",keys:["shadow_color"]};if(type==="glow")return{host:"glowColorSwatches",keys:["glow_color"]};return{host:"bubbleColorSwatches",keys:["fill","stroke"]};}
    function compactSwatchTypeActive(item,type){return type==="asset"?item?.type==="sfx":type==="emphasis"?item?.type==="emphasis_lines":type==="glow"?item?.type==="sfx":type==="shadow"?Boolean(item&&item.type!=="frame"&&item.type!=="emphasis_lines"):item?.type===type;}
    function updateCompactColorSwatches(item){for(const type of ["text","bubble","frame","asset","emphasis","shadow","glow"]){const definition=compactSwatchDefinition(type),host=document.getElementById(definition.host),controls=document.querySelector(`[data-swatch-targets="${type}"]`);if(!host||!controls)continue;const textItems=type==="text"?selectedTextItems():[],activeType=type==="text"?textItems.some(candidate=>!candidate.locked):compactSwatchTypeActive(item,type),target=compactSwatchTargets[type],values=textItems.map(candidate=>String(candidate[target]||"").toLowerCase()),selected=type==="text"&&values.length&&values.every(value=>value===values[0])?values[0]:String(activeType?item?.[target]||"":"").toLowerCase();controls.querySelectorAll("[data-swatch-target]").forEach(button=>{const active=button.dataset.swatchTarget===target;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));button.disabled=!activeType;});host.querySelectorAll("[data-color]").forEach(button=>{button.classList.toggle("active",button.dataset.color===selected);button.disabled=!activeType;});}}
    function initializeCompactColorSwatches(){for(const type of ["text","bubble","frame","asset","emphasis","shadow","glow"]){const definition=compactSwatchDefinition(type),host=document.getElementById(definition.host),controls=document.querySelector(`[data-swatch-targets="${type}"]`);if(!host||!controls)continue;host.replaceChildren(...COMIC_SWATCHES.map(color=>{const button=document.createElement("button");button.type="button";button.className="compact-color-swatch";button.dataset.color=color.toLowerCase();button.style.setProperty("--swatch-color",color);button.title=color;button.setAttribute("aria-label",`Set color to ${color}`);return button;}));controls.addEventListener("click",event=>{const button=event.target.closest("[data-swatch-target]");if(!button)return;compactSwatchTargets[type]=button.dataset.swatchTarget;updateCompactColorSwatches(state.elements.find(element=>element.id===state.selected));});host.addEventListener("click",event=>{const button=event.target.closest("[data-color]"),item=state.elements.find(element=>element.id===state.selected);if(!button||!item)return;if(type==="text"){const items=editableSelectedTextItems();if(!items.length)return;pushUndo();items.forEach(candidate=>candidate[compactSwatchTargets.text]=button.dataset.color);syncProperties();render();return;}if(!compactSwatchTypeActive(item,type)||item.locked||state.selection.length!==1)return;pushUndo();item[compactSwatchTargets[type]]=button.dataset.color;syncProperties();render();});}}
    let activeCanvasBackgroundColor="color";
    function canvasBackgroundLabel(entry){return uiEnglish()?entry.en:entry.ja;}
    function updateCanvasBackgroundSwatches(){const selected=String(state.canvasBackground[activeCanvasBackgroundColor]||"").toLowerCase();document.querySelectorAll("#canvasBackgroundColorSwatches [data-color]").forEach(button=>button.classList.toggle("active",button.dataset.color===selected));document.querySelectorAll("[data-canvas-background-color]").forEach(button=>button.classList.toggle("active",button.dataset.canvasBackgroundColor===activeCanvasBackgroundColor));}
    function rebuildCanvasBackgroundProperties(){if(!canvasBackgroundPatterns)return;state.canvasBackground=normalizedCanvasBackground(state.canvasBackground);const selected=canvasBackgroundPatterns.TYPES.find(item=>item.id===state.canvasBackground.type)||canvasBackgroundPatterns.TYPES[0],typeSelect=document.getElementById("canvasBackgroundType"),presetSelect=document.getElementById("canvasBackgroundPreset");typeSelect.replaceChildren(...canvasBackgroundPatterns.TYPES.map(item=>new Option(canvasBackgroundLabel(item),item.id)));typeSelect.value=selected.id;presetSelect.replaceChildren(...selected.presets.map(item=>new Option(canvasBackgroundLabel(item),item.id)));presetSelect.value=state.canvasBackground.preset;document.getElementById("canvasBackgroundColor").value=state.canvasBackground.color;document.getElementById("canvasBackgroundPatternColor").value=state.canvasBackground.patternColor;document.getElementById("canvasBackgroundColor2").value=state.canvasBackground.color2;document.getElementById("canvasBackgroundTransparent").checked=state.canvasBackground.transparent;
      const gradient=selected.id==="linear-gradient"||selected.id==="radial-gradient",solid=selected.id==="solid";document.getElementById("canvasBackgroundPatternColorLabel").hidden=solid;document.getElementById("canvasBackgroundColor2Label").hidden=!gradient;document.querySelector('[data-canvas-background-color="patternColor"]').hidden=solid;document.querySelector('[data-canvas-background-color="color2"]').hidden=!gradient;if(solid&&activeCanvasBackgroundColor!=="color")activeCanvasBackgroundColor="color";if(!gradient&&activeCanvasBackgroundColor==="color2")activeCanvasBackgroundColor="color";
      const fields=document.getElementById("canvasBackgroundFields");fields.replaceChildren(...selected.fields.map(key=>{const definition=canvasBackgroundPatterns.FIELDS[key],label=document.createElement("label"),row=document.createElement("div"),range=document.createElement("input"),output=document.createElement("output");label.className="canvas-background-field";label.append(canvasBackgroundLabel(definition));row.className="range-output-row";range.type="range";range.min=definition.min;range.max=definition.max;range.step=definition.step;range.value=state.canvasBackground[key];range.dataset.canvasBackgroundField=key;output.textContent=String(state.canvasBackground[key]);row.append(range,output);label.append(row);return label;}));document.getElementById("canvasBackgroundRandomize").hidden=!selected.fields.includes("seed");updateCanvasBackgroundSwatches();
    }
    function initializeCanvasBackgroundSwatches(){const host=document.getElementById("canvasBackgroundColorSwatches");if(!host||!canvasBackgroundPatterns)return;host.replaceChildren(...COMIC_SWATCHES.map(color=>{const button=document.createElement("button");button.type="button";button.className="compact-color-swatch";button.dataset.color=color.toLowerCase();button.style.setProperty("--swatch-color",color);button.title=color;button.setAttribute("aria-label",`Set canvas background color to ${color}`);return button;}));host.addEventListener("click",event=>{const button=event.target.closest("[data-color]");if(!button)return;pushUndo();state.canvasBackground[activeCanvasBackgroundColor]=button.dataset.color;rebuildCanvasBackgroundProperties();render();});document.querySelector("#canvasBackgroundProps .compact-swatch-controls").addEventListener("click",event=>{const button=event.target.closest("[data-canvas-background-color]");if(!button||button.hidden)return;activeCanvasBackgroundColor=button.dataset.canvasBackgroundColor;updateCanvasBackgroundSwatches();});rebuildCanvasBackgroundProperties();}
    function updateSfxSwatches(item){updateCompactColorSwatches(item);}
    function initializeSfxSwatches(){}
    function sfxDefaultOutlineWidth(preset){const presetId=String(preset?.id||"");return presetId.startsWith("arrow-")||presetId.includes("heart")?0:3;}
    function basicSymbolKindFor(item){const kind=SFX_BY_ID.get(item?.asset_id)?.symbolKind;return ["circle","triangle","square","trapezoid"].includes(kind)?kind:"";}
    function normalizeBasicSymbolSettings(item){const kind=basicSymbolKindFor(item);if(kind==="trapezoid")item.symbol_top_width=normalizeNumericValue("symbol_top_width",item.symbol_top_width,100);if(kind==="square")item.symbol_skew=normalizeNumericValue("symbol_skew",item.symbol_skew,0);return kind;}
    function defaultSfx(presetId="don-exclamation-mask") { const preset=SFX_BY_ID.get(presetId)||SFX_PRESETS[0],style=preset.userPreset?(preset.styleDefaults||normalizeUserAssetStyle({},preset.w,preset.h)):null,mask=style?style.mask_mode:!!preset.mask,presetOutline=style?style.stroke_width:(Number.isFinite(Number(preset.outlineWidth))?Number(preset.outlineWidth):(mask?sfxDefaultOutlineWidth(preset):0)),item={id:id(),type:"sfx",asset_id:preset.id,asset_label:preset.label,asset_format:preset.format,asset_src:preset.src,asset_width:preset.w,asset_height:preset.h,user_preset_id:preset.userPresetId||"",user_asset_id:preset.userAssetId||"",mask_mode:mask,user_fill_initialized:!preset.userPreset||mask,fill:style?style.fill:sfxPresetFill(preset),stroke:style?style.stroke:(preset.stroke||"#111111"),stroke_width:presetOutline,x:0,y:0,w:style?style.width:preset.w,h:style?style.height:preset.h,rotation:0,opacity:style?style.opacity:1,shadow_enabled:style?style.shadow_enabled:false,shadow_color:style?style.shadow_color:"#000000",shadow_x:style?style.shadow_x:6,shadow_y:style?style.shadow_y:6,shadow_blur:style?style.shadow_blur:4,glow_enabled:style?style.glow_enabled:false,glow_color:style?style.glow_color:"#ffffff",glow_opacity:style?style.glow_opacity:.75,glow_blur:style?style.glow_blur:16,glow_spread:style?style.glow_spread:0,visible:true};if(preset.symbolKind==="trapezoid")item.symbol_top_width=100;if(preset.symbolKind==="square")item.symbol_skew=0;return item; }
    function builtinAssetDisplayLabel(item){const label=String(item?.asset_label||"SFX Stamp");if(!uiEnglish()||item?.user_asset_id||!/[^\x00-\x7f]/.test(label))return label;return String(item?.asset_id||"SFX Stamp").replace(/-(?:mask|rgba)$/,"").split("-").filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ");}
    function randomEmphasisSeed(){if(globalThis.crypto?.getRandomValues){const value=new Uint32Array(1);globalThis.crypto.getRandomValues(value);return value[0];}return Math.floor(Math.random()*4294967296)>>>0;}
    function syncEmphasisCenterGapMaster(item,force=false){const range=document.getElementById("emphasisCenterGapRange"),number=document.getElementById("emphasisCenterGapValue"),active=item?.type==="emphasis_lines";if(!range||!number)return;range.disabled=!active;number.disabled=!active;if(!active){range.value=.03;number.value="";return;}const value=emphasisCenterGapValue(item);if(force||document.activeElement!==range)range.value=String(value);if(force||document.activeElement!==number)number.value=String(Number(value.toFixed(4)));}
    function regenerateEmphasisRays(item){if(!item||item.type!=="emphasis_lines")return[];item.overshoot=EMPHASIS_EDGE_OVERSHOOT;item.rays=generateNormalizedEmphasisRays(item,item.w,item.h);return item.rays;}
    const pendingEmphasisRegeneration=new Set();
    let emphasisRegenerationFrame=0;
    function flushPendingEmphasisRegeneration(){if(emphasisRegenerationFrame){cancelAnimationFrame(emphasisRegenerationFrame);emphasisRegenerationFrame=0;}for(const item of pendingEmphasisRegeneration)regenerateEmphasisRays(item);pendingEmphasisRegeneration.clear();}
    function scheduleEmphasisRegeneration(item){if(!item||item.type!=="emphasis_lines")return;pendingEmphasisRegeneration.add(item);if(!emphasisRegenerationFrame)emphasisRegenerationFrame=requestAnimationFrame(()=>{emphasisRegenerationFrame=0;for(const queued of pendingEmphasisRegeneration)regenerateEmphasisRays(queued);pendingEmphasisRegeneration.clear();});}
    function normalizeEmphasisLines(item){
      const params=normalizeEmphasisParams(item);Object.assign(item,params);item.type="emphasis_lines";
      item.x=Number.isFinite(Number(item.x))?Number(item.x):0;item.y=Number.isFinite(Number(item.y))?Number(item.y):0;item.w=emphasisClamp(item.w,1,8192,state.width);item.h=emphasisClamp(item.h,1,8192,state.height);item.rotation=emphasisClamp(item.rotation,-180,180,0);item.fit_to_canvas=item.fit_to_canvas!==false;item.color=/^#[0-9a-f]{6}$/i.test(String(item.color||""))?String(item.color):"#000000";item.opacity=emphasisClamp(item.opacity,0,1,1);item.comic_scope=item.comic_scope==="panel"?"panel":"page";item.comic_panel_id=String(item.comic_panel_id||"");item.locked=item.locked===true;item.visible=item.visible!==false;
      if(item.fit_to_canvas){item.x=0;item.y=0;item.w=state.width;item.h=state.height;item.rotation=0;}
      item.rays=validEmphasisRays(item.rays)||generateNormalizedEmphasisRays(item,item.w,item.h);
      return item;
    }
    function defaultEmphasisLines(presetId="center"){const preset=EMPHASIS_BY_ID.get(presetId)||EMPHASIS_PRESETS[0],{id:presetKey,label,...geometry}=preset,item={...geometry,id:id(),type:"emphasis_lines",preset:presetKey,x:0,y:0,w:state.width,h:state.height,rotation:0,fit_to_canvas:true,color:"#000000",opacity:1,seed:randomEmphasisSeed(),rays:[],comic_scope:"page",comic_panel_id:"",locked:false,visible:true};return normalizeEmphasisLines(item);}
    function applyEmphasisPresetToItem(item,presetId){const preset=EMPHASIS_BY_ID.get(presetId)||EMPHASIS_PRESETS[0];item.preset=preset.id;item.overshoot=EMPHASIS_EDGE_OVERSHOOT;for(const key of ["line_count","inner_x","inner_y","line_width","line_length","taper","center_x","center_y","length_random","inner_random","width_random","spacing_random"])item[key]=preset[key];scheduleEmphasisRegeneration(item);}
    function syncEmphasisToCanvas(item){if(!item||item.type!=="emphasis_lines"||!item.fit_to_canvas)return;const target=generalComicEditor?.isActive()?generalComicEditor.emphasisClipRect?.(item):comicEditor?.isActive()?comicEditor.effectTargetRect?.(item):null,x=target?.x??0,y=target?.y??0,w=target?.w??state.width,h=target?.h??state.height,changed=item.x!==x||item.y!==y||item.w!==w||item.h!==h||item.rotation!==0;item.x=x;item.y=y;item.w=w;item.h=h;item.rotation=0;if(changed)regenerateEmphasisRays(item);}
    function syncFrameToCanvas(item){if(!item||item.type!=="frame"||!item.fit_to_canvas)return;const maximum=Math.max(0,Math.min(state.width,state.height)/2-.5),inset=Math.max(-maximum,Math.min(maximum,finiteOr(item.frame_inset,0)));item.frame_inset=inset;item.x=inset;item.y=inset;item.w=Math.max(1,state.width-inset*2);item.h=Math.max(1,state.height-inset*2);item.rotation=0;item.flip_x=false;item.flip_y=false;}
    function defaultFrame(presetId="frame-border") { const preset=FRAME_BY_ID.get(presetId)||FRAME_PRESETS[0],border=Math.max(0,finiteOr(preset.border_width,36)),item={id:id(),type:"frame",frame_preset_id:preset.id,frame_label:preset.label,frame_kind:preset.frame_kind||"border",x:0,y:0,w:state.width,h:state.height,rotation:0,opacity:1,fit_to_canvas:true,pin_to_top:preset.pin_to_top!==false,frame_scale:finiteOr(preset.default_scale,100),frame_inset:finiteOr(preset.default_inset,0),border_color:preset.border_color||"#ffffff",border_width_x:border,border_width_y:border,inner_stroke_color:preset.inner_stroke_color||"#111111",inner_stroke_width:preset.inner_stroke_width||0,asset_src:preset.asset_src||"",asset_src_2x:preset.asset_src_2x||"",frame_mode:preset.frame_mode||"border",frame_slice:preset.frame_slice?{...preset.frame_slice}:null,attached_decorations:(preset.attached_decorations||[]).map(decoration=>decoration.id),fit_mode:preset.fit_mode||"cover",shadow_enabled:false,shadow_color:"#000000",shadow_opacity:.55,shadow_x:8,shadow_y:8,shadow_blur:12,glow_enabled:false,glow_color:"#ffffff",glow_opacity:.75,glow_blur:16,glow_spread:0,locked:false,visible:true};syncFrameToCanvas(item);return item;}
    const LAYOUT_ELEMENT_TYPES=new Set(["text","sfx","sfx_stamp","bubble","shape","frame","emphasis_lines","image"]);
    function normalizedLayoutPathPoints(points){if(!Array.isArray(points))return null;const clean=points.slice(0,256).filter(point=>point&&typeof point==="object"&&!Array.isArray(point)&&Number.isFinite(Number(point.x))&&Number.isFinite(Number(point.y))).map(point=>{const x=finiteOr(point.x,0),y=finiteOr(point.y,0);return{x,y,in_x:finiteOr(point.in_x,x),in_y:finiteOr(point.in_y,y),out_x:finiteOr(point.out_x,x),out_y:finiteOr(point.out_y,y)};});return clean.length>=3?clean:null;}
    function loadState(rawOverride=null,options={}) {
      let hasElementList = false,comicLayout=null,generalComicLayout=null,workspaceLayouts=null,requestedWorkspace="single";
      let data;
      try {
        const raw = rawOverride===null?localStorage.getItem(jsonKey):rawOverride;
        data = projectSchema.normalize(raw||{});
      } catch(error) {
        if(options.strict===true)throw error;
        console.warn("Speech Bubble local layout restore failed",error);
        data=projectSchema.normalize({});
      }
      state.elements=[];state.selected=null;state.selection=[];state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;state.undo=[];state.redo=[];
      {
        comicLayout=data.comic&&typeof data.comic==="object"?data.comic:null;
        generalComicLayout=data.general_comic&&typeof data.general_comic==="object"?data.general_comic:null;
        workspaceLayouts=data.workspaces&&typeof data.workspaces==="object"?data.workspaces:null;
        requestedWorkspace=["single","comic","comic_layout"].includes(data.active_workspace)
          ? data.active_workspace
          : generalComicLayout?.enabled===true?"comic_layout":comicLayout?.enabled===true?"comic":"single";
        const initialLayout=workspaceLayouts?.[requestedWorkspace]&&typeof workspaceLayouts[requestedWorkspace]==="object"
          ? workspaceLayouts[requestedWorkspace]
          : {canvas:data.canvas,background_visible:data.background_visible,canvas_background:data.canvas_background,background_image:data.background_image,elements:data.elements};
        state.canvasFromLayout = Number.isFinite(Number(initialLayout.canvas?.width)) && Number.isFinite(Number(initialLayout.canvas?.height));
        const fallbackCanvas=requestedWorkspace==="comic"?{width:720,height:2200}:requestedWorkspace==="comic_layout"?{width:2480,height:3508}:{width:1024,height:1024};
        state.width = Math.round(Math.max(1,Math.min(65535,finiteOr(initialLayout.canvas?.width,fallbackCanvas.width))));
        state.height = Math.round(Math.max(1,Math.min(65535,finiteOr(initialLayout.canvas?.height,fallbackCanvas.height))));
        state.backgroundVisible = initialLayout.background_visible !== false;
        state.canvasBackground = normalizedCanvasBackground(initialLayout.canvas_background);
        state.backgroundImage = normalizedBackgroundImage(initialLayout.background_image||{attached:imageLoaded});
        hasElementList = Array.isArray(initialLayout.elements);
        state.elements = hasElementList ? initialLayout.elements.filter(item=>item&&typeof item==="object"&&!Array.isArray(item)&&LAYOUT_ELEMENT_TYPES.has(String(item.type||""))) : [];
      }
      const normalizeLoadedElement=(item) => {
        if (!item.id) item.id = id();
        if (item.visible === undefined) item.visible = true;
        item.rotation=Number(item.rotation)||0;if(item.shadow_enabled===undefined)item.shadow_enabled=false;if(!item.shadow_color)item.shadow_color="#000000";if(!Number.isFinite(Number(item.shadow_x)))item.shadow_x=6;if(!Number.isFinite(Number(item.shadow_y)))item.shadow_y=6;if(!Number.isFinite(Number(item.shadow_blur)))item.shadow_blur=4;
        if (item.type === "text") { item.text=String(item.text??"").slice(0,100000);item.font_size=integerFontSize(item.font_size);item.font_id=String(item.font_id||"");item.font_family=item.font_family||"sans-serif";item.font_css_family=item.font_css_family||item.font_family;item.writing=item.writing==="vertical"?"vertical":"horizontal";item.align=["left","right"].includes(item.align)?item.align:"center";const hasTracking=Number.isFinite(Number(item.tracking));item.tracking=hasTracking?trackingValue(item.tracking):trackingValue(finiteOr(item.letter_spacing,0)*1000/item.font_size);delete item.letter_spacing;item.font_scale_x=fontScaleValue(item.font_scale_x);item.font_scale_y=fontScaleValue(item.font_scale_y);if(item.auto_fit===undefined)item.auto_fit=true;const restoredFont=matchingSavedFont(item);if(restoredFont){applyResolvedFont(item,restoredFont);ensureFontLoaded(restoredFont).then(loaded=>{if(!loaded||!state.elements.includes(item))return;verticalGlyphSpriteCache.clear();fitTextBox(item,true,!item.auto_fit);syncProperties();render();});}fitTextBox(item,true,!item.auto_fit); }
        else if(item.type==="sfx"||item.type==="sfx_stamp"){item.type="sfx";const savedUserAssetId=String(item.user_asset_id||"").replace(/^user:/,"")||(String(item.asset_id||"").startsWith("user:")?String(item.asset_id).slice(5):""),catalogPreset=savedUserAssetId?null:SFX_BY_ID.get(item.asset_id),preset=catalogPreset||(!savedUserAssetId?SFX_PRESETS[0]:{id:item.asset_id||`user:${savedUserAssetId}`,label:item.asset_label||"User Preset",format:item.asset_format||"PNG RGBA",src:item.asset_src||`${forgeApiBase}/user-assets/asset/${savedUserAssetId}`,mask:false,w:Math.max(1,finiteOr(item.w,360)),h:Math.max(1,finiteOr(item.h,360)),userPreset:true,userAssetId:savedUserAssetId,userPresetId:item.user_preset_id||""}),mask=!!preset.mask,presetOutline=Number.isFinite(Number(preset.outlineWidth))?Number(preset.outlineWidth):(mask?3:0);item.asset_id=item.asset_id||preset.id;item.asset_label=item.asset_label||preset.label;item.asset_format=item.asset_format||preset.format;item.asset_src=item.asset_src||preset.src;item.asset_width=Math.max(1,finiteOr(item.asset_width,preset.w||item.w||360));item.asset_height=Math.max(1,finiteOr(item.asset_height,preset.h||item.h||360));item.user_preset_id=item.user_preset_id||preset.userPresetId||"";item.user_asset_id=savedUserAssetId||preset.userAssetId||"";item.mask_mode=savedUserAssetId?(item.mask_mode??false):(item.mask_mode??mask);item.user_fill_initialized=savedUserAssetId?(item.user_fill_initialized===true||item.mask_mode===true):true;item.fill=savedUserAssetId&&!item.user_fill_initialized?"#ffffff":(item.fill||sfxPresetFill(preset));item.stroke=item.stroke||preset.stroke||"#111111";item.stroke_width=Math.max(0,finiteOr(item.stroke_width,presetOutline));item.opacity=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));item.glow_enabled=!!item.glow_enabled;item.glow_color=item.glow_color||"#ffffff";item.glow_opacity=Math.max(0,Math.min(1,finiteOr(item.glow_opacity,.75)));item.glow_blur=Math.max(0,finiteOr(item.glow_blur,16));item.glow_spread=Math.max(0,finiteOr(item.glow_spread,0));if(!Number.isFinite(Number(item.w)))item.w=preset.w;if(!Number.isFinite(Number(item.h)))item.h=preset.h;normalizeBasicSymbolSettings(item);}
        else if(item.type==="bubble"||item.type==="shape") {
          item.type="bubble";
          item.path_points=normalizedLayoutPathPoints(item.path_points);
          if(!item.preset_id)item.preset_id=LEGACY_PRESET[item.shape]||"base-oval";
          item.preset_id=REMOVED_PRESET_ALIAS[item.preset_id]||item.preset_id;
          if(!PRESET_BY_ID.has(item.preset_id))item.preset_id=LEGACY_PRESET[item.shape]||"base-oval";
          if(!item.tail_style)item.tail_style="pointed";
          if(!["solid","double"].includes(item.stroke_style))item.stroke_style="solid";
          const preset=PRESET_BY_ID.get(item.preset_id);
          if(isDialoguePreset(preset))applyDialoguePresetDefaults(item,preset,false);
          else {
            const tuning=SHAPE_TUNING[preset?.path]||{},fixed=fixedPathPreset(preset);
            normalizeShapeSettings(item,tuning);
            item.lock_aspect_ratio=fixed||preset?.lock_aspect_ratio===true;
            item.path_source=item.path_source||"preset";
            item.user_modified_path=item.user_modified_path===true;
            const legacySerratedThought=!fixed&&item.preset_id==="base-thought"&&Array.isArray(item.path_points)&&item.path_points.length>32;
            if(legacySerratedThought){item.shape_intensity=66;item.shape_asymmetry=Math.min(24,finiteOr(item.shape_asymmetry,20));item.lobe_count=9;item.lobe_depth=36;item.shape_softness=92;}
            if(fixed&&!item.user_modified_path||!Array.isArray(item.path_points)||item.path_points.length<3||legacySerratedThought)item.path_points=presetPath(preset?.path,shapeOptions(item,tuning))||defaultVectorPath(item.shape);
          }
        }
        else if(item.type==="image"){item.image_asset_id=String(item.image_asset_id||"");item.image_name=String(item.image_name||"Image");item.source_role=String(item.source_role||"image");item.source_image_layer_id=String(item.source_image_layer_id||"");item.opacity=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));item.base_width=Math.max(1,finiteOr(item.base_width,item.w||1));item.base_height=Math.max(1,finiteOr(item.base_height,item.h||1));item.crop=normalizedImageCrop(item.crop);item.lock_aspect_ratio=item.lock_aspect_ratio!==false;if(item.locked===undefined)item.locked=true;}
        else if(item.type==="emphasis_lines"){normalizeEmphasisLines(item);}
        else if(item.type==="frame"){const preset=FRAME_BY_ID.get(item.frame_preset_id)||FRAME_PRESETS[0],legacyBorder=Math.max(0,finiteOr(item.border_width,preset.border_width)),availableDecorations=(preset.attached_decorations||[]).map(decoration=>decoration.id);item.frame_preset_id=preset.id;item.frame_label=item.frame_label||preset.label;item.frame_kind=item.frame_kind||preset.frame_kind||(preset.asset_src?"decorative":"border");item.fit_to_canvas=item.fit_to_canvas!==false;item.pin_to_top=item.pin_to_top!==false&&preset.pin_to_top!==false;item.frame_scale=Math.max(10,Math.min(400,finiteOr(item.frame_scale,preset.default_scale||100)));item.frame_inset=finiteOr(item.frame_inset,preset.default_inset||0);item.border_color=item.border_color||preset.border_color||"#ffffff";item.border_width_x=Math.max(0,finiteOr(item.border_width_x,legacyBorder));item.border_width_y=Math.max(0,finiteOr(item.border_width_y,legacyBorder));if(item.locked===undefined)item.locked=false;delete item.border_width;delete item.corner_radius;item.inner_stroke_color=item.inner_stroke_color||preset.inner_stroke_color||"#111111";item.inner_stroke_width=Math.max(0,finiteOr(item.inner_stroke_width,preset.inner_stroke_width));item.asset_src=item.asset_src||preset.asset_src||"";item.asset_src_2x=item.asset_src_2x||preset.asset_src_2x||"";item.frame_mode=item.frame_mode||preset.frame_mode||"border";item.frame_slice=item.frame_slice||(preset.frame_slice?{...preset.frame_slice}:null);item.attached_decorations=Array.isArray(item.attached_decorations)?item.attached_decorations.map(String).filter(value=>availableDecorations.includes(value)):availableDecorations;item.fit_mode=["cover","contain","stretch","tile"].includes(item.fit_mode)?item.fit_mode:(preset.fit_mode||"cover");item.opacity=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));item.shadow_opacity=Math.max(0,Math.min(1,finiteOr(item.shadow_opacity,.55)));item.glow_enabled=!!item.glow_enabled;item.glow_color=item.glow_color||"#ffffff";item.glow_opacity=Math.max(0,Math.min(1,finiteOr(item.glow_opacity,.75)));item.glow_blur=Math.max(0,finiteOr(item.glow_blur,16));item.glow_spread=Math.max(0,finiteOr(item.glow_spread,0));syncFrameToCanvas(item);}
        if(item.type!=="emphasis_lines"){item.comic_scope=item.comic_scope==="panel"?"panel":"free";item.comic_panel_id=String(item.comic_panel_id||"");}
        item.general_comic_scope=item.general_comic_scope==="panel"?"panel":"page";
        item.general_comic_panel_id=item.general_comic_scope==="panel"?String(item.general_comic_panel_id||""):null;
        normalizeItemNumericValues(item);
      };
      state.elements.forEach(normalizeLoadedElement);
      if(workspaceLayouts){
        for(const name of ["single","comic","comic_layout"]){
          const fallback=name==="comic"?{width:720,height:2200}:name==="comic_layout"?{width:2480,height:3508}:{width:1024,height:1024};
          const rawWorkspace=workspaceLayouts[name]&&typeof workspaceLayouts[name]==="object"?workspaceLayouts[name]:{};
          const elements=Array.isArray(rawWorkspace.elements)
            ? rawWorkspace.elements.filter(item=>item&&typeof item==="object"&&!Array.isArray(item)&&LAYOUT_ELEMENT_TYPES.has(String(item.type||"")))
            : [];
          if(name!==requestedWorkspace)elements.forEach(normalizeLoadedElement);
          workspaces[name]={
            width:Math.round(Math.max(1,Math.min(65535,finiteOr(rawWorkspace.canvas?.width,fallback.width)))),
            height:Math.round(Math.max(1,Math.min(65535,finiteOr(rawWorkspace.canvas?.height,fallback.height)))),
            backgroundVisible:rawWorkspace.background_visible!==false,
            canvasBackground:normalizedCanvasBackground(rawWorkspace.canvas_background),
            backgroundImage:normalizedBackgroundImage(rawWorkspace.background_image||{attached:name==="single"&&imageLoaded}),
            elements,
            view:normalizedWorkspaceView(rawWorkspace.view)||normalizedWorkspaceView(storedViews[name]),
          };
        }
        activeWorkspace=requestedWorkspace;
        const active=workspaces[activeWorkspace];
        state.width=active.width;state.height=active.height;state.backgroundVisible=active.backgroundVisible;state.canvasBackground=normalizedCanvasBackground(active.canvasBackground);state.backgroundImage=normalizedBackgroundImage(active.backgroundImage);state.elements=active.elements;
      }else{
        activeWorkspace=requestedWorkspace;
        workspaces.single={width:1024,height:1024,backgroundVisible:true,canvasBackground:normalizedCanvasBackground(),backgroundImage:normalizedBackgroundImage({attached:imageLoaded}),elements:[],view:normalizedWorkspaceView(storedViews.single)};
        workspaces.comic={width:720,height:2200,backgroundVisible:true,elements:[],view:normalizedWorkspaceView(storedViews.comic)};
        workspaces.comic_layout={width:2480,height:3508,backgroundVisible:true,canvasBackground:normalizedCanvasBackground({color:"#ffffff",transparent:false}),backgroundImage:normalizedBackgroundImage({attached:false}),elements:[],view:normalizedWorkspaceView(storedViews.comic_layout)};
        workspaces[activeWorkspace]={
          width:state.width,
          height:state.height,
          backgroundVisible:state.backgroundVisible,
          canvasBackground:normalizedCanvasBackground(state.canvasBackground),
          backgroundImage:normalizedBackgroundImage(state.backgroundImage),
          elements:state.elements,
          view:normalizedWorkspaceView(storedViews[activeWorkspace]),
        };
      }
      normalizePinnedFrameOrder();
      const initialView=normalizedWorkspaceView(workspaces[activeWorkspace]?.view);
      if(initialView){state.zoom=initialView.zoom;state.panX=initialView.panX;state.panY=initialView.panY;}
      captureActiveWorkspace();
      state.selected = state.elements[state.elements.length - 1]?.id || null;
      state.selection = state.selected ? [state.selected] : [];
      comicEditor?.restore(comicLayout);
      generalComicEditor?.restore(generalComicLayout);
      syncEditorModeFromWorkspace();
    }
    function selectedItems(){const ids=new Set(state.selection);return state.elements.filter(item=>ids.has(item.id));}
    let layerSelectionAnchorId="";
    function selectionIdsFor(item,additive=false,isolate=false){
      const groupIds=!isolate&&item?.group_id?state.elements.filter(layer=>layer.group_id===item.group_id).map(layer=>layer.id):[item?.id].filter(Boolean);
      if(!additive)return groupIds;
      const next=new Set(state.selection);for(const itemId of groupIds){next.has(itemId)?next.delete(itemId):next.add(itemId);}return [...next];
    }
    function isPinnedFrame(item){return Boolean(item)&&item.type==="frame"&&item.pin_to_top!==false;}
    function normalizePinnedFrameOrder(){const normal=[],pinned=[];state.elements.forEach(item=>(isPinnedFrame(item)?pinned:normal).push(item));const ordered=[...normal,...pinned];if(ordered.some((item,index)=>item!==state.elements[index]))state.elements=ordered;}
    function isFrameSelected(item){return Boolean(item)&&item.type==="frame"&&state.selection.length===1&&state.selection[0]===item.id&&!item.locked;}
    function canvasItemEditable(item){return Boolean(item)&&!item.locked&&(item.type!=="frame"||isFrameSelected(item));}
    function canvasHitEnabled(item){return Boolean(item)&&item.type!=="frame"&&item.type!=="emphasis_lines";}
    function setSelection(ids,primary=null){const next=[...new Set(ids)].filter(itemId=>state.elements.some(item=>item.id===itemId));state.selection=next;state.selected=primary&&state.selection.includes(primary)?primary:(state.selection.at(-1)||null);if(next.length){comicEditor?.clearSelection();generalComicEditor?.clearSelection();}if(state.selection.length!==1){state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;}syncInsertTargetStatus();}
    function selectLayerRow(item,event){
      const displayed=[...state.elements].reverse(),displayedIds=displayed.map(layer=>layer.id);
      if(event.shiftKey&&displayedIds.includes(layerSelectionAnchorId)){
        const start=displayedIds.indexOf(layerSelectionAnchorId),end=displayedIds.indexOf(item.id),range=displayed.slice(Math.min(start,end),Math.max(start,end)+1),rangeIds=[...new Set(range.flatMap(layer=>selectionIdsFor(layer)))],next=event.ctrlKey||event.metaKey?[...new Set([...state.selection,...rangeIds])]:rangeIds;
        setSelection(next,item.id);return;
      }
      if(event.ctrlKey||event.metaKey)setSelection(selectionIdsFor(item,true),item.id);
      else setSelection(selectionIdsFor(item),item.id);
      layerSelectionAnchorId=item.id;
    }
    function selectionBounds(items=selectedItems()){
      if(!items.length)return null;const points=items.flatMap(item=>{const h=handlePoints(item);return[h[0],h[2],h[4],h[6]];});
      const xs=points.map(point=>point.x),ys=points.map(point=>point.y),x=Math.min(...xs),y=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);
      return{x,y,w:Math.max(1,right-x),h:Math.max(1,bottom-y),rotation:0,type:"group",locked:items.some(item=>item.locked)};
    }

    function itemVisualBounds(item){const points=handlePoints(item),xs=points.map(point=>point.x),ys=points.map(point=>point.y),x=Math.min(...xs),y=Math.min(...ys),right=Math.max(...xs),bottom=Math.max(...ys);return{x,y,w:Math.max(1,right-x),h:Math.max(1,bottom-y),cx:(x+right)/2,cy:(y+bottom)/2};}
    function selectionVisualBounds(items){if(!items.length)return null;const bounds=items.map(itemVisualBounds),x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y)),right=Math.max(...bounds.map(b=>b.x+b.w)),bottom=Math.max(...bounds.map(b=>b.y+b.h));return{x,y,w:Math.max(1,right-x),h:Math.max(1,bottom-y)};}
    function commonPanelAlignmentReference(items){if(!items.length)return null;const refs=items.map(item=>{if(generalComicEditor?.isActive()&&item.general_comic_scope==="panel"&&item.general_comic_panel_id){const target=generalComicEditor.panelInsertionTarget?.(item.general_comic_panel_id);return target?.rect?{key:`general:${item.general_comic_panel_id}`,rect:target.rect}:null;}if(comicEditor?.isActive()&&item.comic_scope==="panel"&&item.comic_panel_id){const target=comicEditor.panelInsertionTarget?.(item.comic_panel_id);return target?.rect?{key:`comic:${item.comic_panel_id}`,rect:target.rect}:null;}return null;});if(refs.some(ref=>!ref)||new Set(refs.map(ref=>ref.key)).size!==1)return null;return refs[0].rect;}
    function alignmentReferenceRect(mode,items){if(mode==="page")return{x:0,y:0,w:state.width,h:state.height};if(mode==="panel")return commonPanelAlignmentReference(items);return selectionVisualBounds(items);}
    function markAlignedItem(item){if(item.type==="frame")item.fit_to_canvas=false;if(item.type==="emphasis_lines"){item.fit_to_canvas=false;scheduleEmphasisRegeneration(item);}}
    function alignSelectedObjects(action){const items=selectedItems().filter(canvasItemEditable);if(items.length<2)return false;const ref=alignmentReferenceRect(alignmentReference,items);if(!ref)return false;pushUndo();for(const item of items){const b=itemVisualBounds(item);let dx=0,dy=0;if(action==="left")dx=ref.x-b.x;else if(action==="hcenter")dx=ref.x+ref.w/2-b.cx;else if(action==="right")dx=ref.x+ref.w-(b.x+b.w);else if(action==="top")dy=ref.y-b.y;else if(action==="vcenter")dy=ref.y+ref.h/2-b.cy;else if(action==="bottom")dy=ref.y+ref.h-(b.y+b.h);else continue;item.x=Math.round(item.x+dx);item.y=Math.round(item.y+dy);markAlignedItem(item);}syncProperties();render();return true;}
    function distributeSelectedObjects(axis){const items=selectedItems().filter(canvasItemEditable);if(items.length<3)return false;const ref=alignmentReferenceRect(alignmentReference,items);if(!ref)return false;const horizontal=axis==="horizontal",entries=items.map(item=>({item,b:itemVisualBounds(item)})).sort((a,b)=>horizontal?a.b.cx-b.b.cx:a.b.cy-b.b.cy);let first,last;if(alignmentReference==="selection"){first=horizontal?entries[0].b.cx:entries[0].b.cy;last=horizontal?entries.at(-1).b.cx:entries.at(-1).b.cy;}else{first=horizontal?ref.x+entries[0].b.w/2:ref.y+entries[0].b.h/2;last=horizontal?ref.x+ref.w-entries.at(-1).b.w/2:ref.y+ref.h-entries.at(-1).b.h/2;}const step=(last-first)/(entries.length-1);pushUndo();entries.forEach((entry,index)=>{const target=first+step*index,delta=target-(horizontal?entry.b.cx:entry.b.cy);if(horizontal)entry.item.x=Math.round(entry.item.x+delta);else entry.item.y=Math.round(entry.item.y+delta);markAlignedItem(entry.item);});syncProperties();render();return true;}
    function runAlignmentAction(action){if(action==="hdistribute")return distributeSelectedObjects("horizontal");if(action==="vdistribute")return distributeSelectedObjects("vertical");return alignSelectedObjects(action);}
    function syncMultiAlignmentUi(items=selectedItems()){const host=document.getElementById("multiAlignPanel"),select=document.getElementById("alignmentReference");if(!host||!select)return;const editable=items.filter(canvasItemEditable),panelRect=commonPanelAlignmentReference(editable),panelOption=select.querySelector('option[value="panel"]');if(panelOption)panelOption.disabled=!panelRect;if(alignmentReference==="panel"&&!panelRect)alignmentReference="selection";select.value=alignmentReference;const ref=alignmentReferenceRect(alignmentReference,editable),alignEnabled=editable.length>=2&&Boolean(ref),distributionEnabled=editable.length>=3&&Boolean(ref);host.querySelectorAll("[data-align-action]").forEach(button=>{const distribute=button.dataset.alignAction.endsWith("distribute");button.disabled=distribute?!distributionEnabled:!alignEnabled;});}
    function groupSelected(){const items=selectedItems().filter(item=>!item.locked);if(items.length<2)return;pushUndo();const groupId=`group-${id()}`;items.forEach(item=>item.group_id=groupId);setSelection(items.map(item=>item.id),items.at(-1).id);syncProperties();render();}
    function ungroupSelected(){const items=selectedItems(),groups=new Set(items.map(item=>item.group_id).filter(Boolean));if(!groups.size)return;pushUndo();state.elements.forEach(item=>{if(groups.has(item.group_id))delete item.group_id;});setSelection(items.map(item=>item.id),state.selected);syncProperties();render();}
    function applyViewTransform() { stage.style.transform = `translate(${state.panX}px, ${state.panY}px)`; }
    function ensureCanvasBitmapSize(){if(canvas.width!==state.width)canvas.width=state.width;if(canvas.height!==state.height)canvas.height=state.height;}
    function updateCanvasViewportSize(){const width=`${state.width*state.zoom}px`,height=`${state.height*state.zoom}px`,stageWidth=`${state.width*state.zoom+80}px`,stageHeight=`${state.height*state.zoom+80}px`;if(canvas.style.width!==width)canvas.style.width=width;if(canvas.style.height!==height)canvas.style.height=height;if(stage.style.width!==stageWidth)stage.style.width=stageWidth;if(stage.style.height!==stageHeight)stage.style.height=stageHeight;applyViewTransform();const label=`${Math.round(state.zoom*100)}%`,zoom=document.getElementById("zoom");if(zoom.textContent!==label)zoom.textContent=label;}
    function setCanvasSize(){ensureCanvasBitmapSize();updateCanvasViewportSize();}
    function unobscuredViewportSize(){const viewRect=viewport.getBoundingClientRect();let right=viewRect.right;for(const panel of document.querySelectorAll(".floating-panel")){const rect=panel.getBoundingClientRect();if(rect.bottom<=viewRect.top||rect.top>=viewRect.bottom||rect.left<=viewRect.left+viewRect.width*.45)continue;right=Math.min(right,rect.left-8);}return{width:Math.max(160,right-viewRect.left),height:viewport.clientHeight};}
    function centerView() { const available=unobscuredViewportSize(),stageW=state.width*state.zoom+80,stageH=state.height*state.zoom+80;state.panX=Math.max(0,(available.width-stageW)/2);state.panY=Math.max(0,(available.height-stageH)/2);applyViewTransform(); }
    function fitView(renderCanvas=true) { const available=unobscuredViewportSize();state.zoom=Math.max(.1,Math.min((available.width-80)/state.width,(available.height-80)/state.height,1));centerView();if(workspaces?.[activeWorkspace]){workspaces[activeWorkspace].view={zoom:state.zoom,panX:state.panX,panY:state.panY};saveWorkspaceViews();}if(renderCanvas)requestRender({canvas:true}); }
    function imagePoint(event) { const rect = canvas.getBoundingClientRect(); return { x:(event.clientX - rect.left) * state.width / rect.width, y:(event.clientY - rect.top) * state.height / rect.height }; }
    function visibleCanvasDocumentRect(){
      const canvasRect=canvas.getBoundingClientRect(),viewRect=viewport.getBoundingClientRect(),left=Math.max(canvasRect.left,viewRect.left),top=Math.max(canvasRect.top,viewRect.top),right=Math.min(canvasRect.right,viewRect.right),bottom=Math.min(canvasRect.bottom,viewRect.bottom),sx=state.width/Math.max(1,canvasRect.width),sy=state.height/Math.max(1,canvasRect.height);
      if(right<=left||bottom<=top)return{x:0,y:0,w:state.width,h:state.height};
      return{x:(left-canvasRect.left)*sx,y:(top-canvasRect.top)*sy,w:(right-left)*sx,h:(bottom-top)*sy};
    }
    function intersectDocumentRects(a,b){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.w,b.x+b.w),bottom=Math.min(a.y+a.h,b.y+b.h);return right>x&&bottom>y?{x,y,w:right-x,h:bottom-y}:a;}
    function clampItemToRect(item,rect,margin=12){const x1=rect.x+margin,y1=rect.y+margin,x2=Math.max(x1,rect.x+rect.w-margin-item.w),y2=Math.max(y1,rect.y+rect.h-margin-item.h);item.x=Math.round(Math.max(x1,Math.min(x2,item.x)));item.y=Math.round(Math.max(y1,Math.min(y2,item.y)));}
    function rgba(hex, alpha=1) { const value = String(hex || "#000000").replace("#", ""); const r=parseInt(value.slice(0,2),16)||0, g=parseInt(value.slice(2,4),16)||0, b=parseInt(value.slice(4,6),16)||0; return `rgba(${r},${g},${b},${alpha})`; }
    function textPadding(item){return Math.max(4,(Number(item.stroke_width)||0)*2+(item.shadow_enabled?Math.max(Math.abs(Number(item.shadow_x)||0),Math.abs(Number(item.shadow_y)||0),Number(item.shadow_blur)||0):0));}
    function fontScaleFactor(item,key){return fontScaleValue(item?.[key])/100;}
    function trackingPixels(item,size){return trackingValue(item?.tracking)*size/1000;}
    function measureTrackedText(text,spacing){const chars=[...String(text||"")];if(!chars.length)return 0;if(!spacing)return ctx.measureText(chars.join("")).width;return chars.reduce((total,char)=>total+ctx.measureText(char).width,0)+spacing*Math.max(0,chars.length-1);}
    function drawTrackedText(text,x,y,spacing,strokeWidth){const chars=[...String(text||"")];if(!spacing){if(strokeWidth)ctx.strokeText(chars.join(""),x,y);ctx.fillText(chars.join(""),x,y);return measureTrackedText(chars.join(""),0);}let cursor=x;chars.forEach((char,index)=>{if(index)cursor+=spacing;if(strokeWidth)ctx.strokeText(char,cursor,y);ctx.fillText(char,cursor,y);cursor+=ctx.measureText(char).width;});return cursor-x;}
    function textCanvasFamily(item){return String(item.font_css_family||item.font_family||"sans-serif").replaceAll('"',"");}
    const VERTICAL_ROTATE_CLOCKWISE=new Set(["ー","ｰ","―","—","–","‐","‑","−","〜","～","…","‥","⋯","（","）","［","］","｛","｝","〈","〉","《","》","「","」","『","』","【","】","〔","〕","〖","〗","〘","〙","〚","〛","：","；"]);
    const VERTICAL_TOP_RIGHT=new Set(["、","。","，","．",..."ぁぃぅぇぉっゃゅょゎゕゖ",..."ァィゥェォッャュョヮヵヶ"]);
    const VERTICAL_VARIATION_SELECTOR=/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u,VERTICAL_COMBINING_MARK=/\p{Mark}/u;
    let verticalGraphemeSegmenter;
    function fallbackVerticalGraphemes(text){const result=[];let cluster="",joinNext=false;for(const character of String(text||"")){const joins=VERTICAL_COMBINING_MARK.test(character)||VERTICAL_VARIATION_SELECTOR.test(character)||character==="\u200d"||joinNext;if(!cluster||joins)cluster+=character;else{result.push(cluster);cluster=character;}joinNext=character==="\u200d";}if(cluster)result.push(cluster);return result;}
    function segmentVerticalGraphemes(text){if(verticalGraphemeSegmenter===undefined)verticalGraphemeSegmenter=typeof Intl.Segmenter==="function"?new Intl.Segmenter("ja",{granularity:"grapheme"}):null;return verticalGraphemeSegmenter?[...verticalGraphemeSegmenter.segment(String(text||""))].map(entry=>entry.segment):fallbackVerticalGraphemes(text);}
    function verticalBaseCharacter(grapheme){for(const character of String(grapheme||""))if(!VERTICAL_COMBINING_MARK.test(character)&&!VERTICAL_VARIATION_SELECTOR.test(character)&&character!=="\u200d")return character;return String(grapheme||"")[0]||"";}
    function verticalGraphemePolicy(grapheme){const base=verticalBaseCharacter(grapheme);if(VERTICAL_ROTATE_CLOCKWISE.has(base))return{kind:"rotate-clockwise",offsetX:0,offsetY:0};if(VERTICAL_TOP_RIGHT.has(base))return{kind:"upright-top-right",offsetX:.16,offsetY:-.14};return{kind:"upright-center",offsetX:0,offsetY:0};}
    const verticalGlyphSpriteCache=new Map();
    function verticalGlyphSpriteKey(options){return JSON.stringify({grapheme:options.grapheme,policy:options.policy.kind,font:options.font,fill:options.fillStyle,stroke:options.strokeStyle,strokeWidth:options.strokeWidth});}
    function alphaCropCanvas(source){const target=source.getContext("2d",{willReadFrequently:true}),{width,height}=source,pixels=target.getImageData(0,0,width,height).data;let left=width,top=height,right=-1,bottom=-1;for(let y=0;y<height;y+=1)for(let x=0;x<width;x+=1){if(pixels[(y*width+x)*4+3]<=2)continue;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}if(right<left||bottom<top)return null;const cropped=document.createElement("canvas");cropped.width=right-left+1;cropped.height=bottom-top+1;cropped.getContext("2d").drawImage(source,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);return cropped;}
    function rotateCanvasClockwise(source){const rotated=document.createElement("canvas");rotated.width=source.height;rotated.height=source.width;const target=rotated.getContext("2d");target.translate(rotated.width,0);target.rotate(Math.PI/2);target.drawImage(source,0,0);return rotated;}
    function renderVerticalGlyphSprite({grapheme,policy,font,fontSize,fillStyle,strokeStyle,strokeWidth}){if(!grapheme||/^\s+$/u.test(grapheme))return null;const key=verticalGlyphSpriteKey({grapheme,policy,font,fillStyle,strokeStyle,strokeWidth}),cached=verticalGlyphSpriteCache.get(key);if(cached)return cached;const padding=Math.ceil(fontSize+strokeWidth*4+12),probeSize=Math.max(64,Math.ceil(fontSize*4+padding*2)),probe=document.createElement("canvas");probe.width=probeSize;probe.height=probeSize;const target=probe.getContext("2d",{willReadFrequently:true});target.font=font;target.textAlign="left";target.textBaseline="alphabetic";target.fillStyle=fillStyle;target.strokeStyle=strokeStyle;target.lineWidth=strokeWidth*2;target.lineJoin="round";const metrics=target.measureText(grapheme),left=Number.isFinite(metrics.actualBoundingBoxLeft)?metrics.actualBoundingBoxLeft:0,ascent=Number.isFinite(metrics.actualBoundingBoxAscent)?metrics.actualBoundingBoxAscent:fontSize,originX=padding+left,originY=padding+ascent;if(strokeWidth>0)target.strokeText(grapheme,originX,originY);target.fillText(grapheme,originX,originY);let sprite=alphaCropCanvas(probe);if(!sprite)return null;if(policy.kind==="rotate-clockwise")sprite=rotateCanvasClockwise(sprite);verticalGlyphSpriteCache.set(key,sprite);if(verticalGlyphSpriteCache.size>512)verticalGlyphSpriteCache.delete(verticalGlyphSpriteCache.keys().next().value);return sprite;}
    function verticalTextMetrics(text,fontSize,spacing){const columns=String(text||"").split("\n").map(segmentVerticalGraphemes),columnWidth=fontSize*1.2,rowAdvance=Math.max(fontSize*.25,fontSize*1.15+spacing);return{columns,columnWidth,rowAdvance,width:Math.max(1,columns.length)*columnWidth,height:Math.max(1,...columns.map(column=>column.length))*rowAdvance};}
    function drawVerticalTextColumns(context,item,logicalWidth,padX,padY,fontSize,spacing,strokeWidth){const metrics=verticalTextMetrics(item.text,fontSize,spacing),rightToLeft=item.writing!=="vertical-lr";metrics.columns.forEach((graphemes,columnIndex)=>{const columnLeft=rightToLeft?logicalWidth-padX-(columnIndex+1)*metrics.columnWidth:padX+columnIndex*metrics.columnWidth;graphemes.forEach((grapheme,rowIndex)=>{const policy=verticalGraphemePolicy(grapheme),sprite=renderVerticalGlyphSprite({grapheme,policy,font:context.font,fontSize,fillStyle:context.fillStyle,strokeStyle:context.strokeStyle,strokeWidth});if(!sprite)return;const centerX=columnLeft+metrics.columnWidth/2,centerY=padY+rowIndex*metrics.rowAdvance+metrics.rowAdvance/2;context.drawImage(sprite,centerX-sprite.width/2+policy.offsetX*metrics.columnWidth,centerY-sprite.height/2+policy.offsetY*metrics.rowAdvance);});const contentHeight=Math.max(1,graphemes.length)*metrics.rowAdvance,top=padY,bottom=padY+contentHeight,lineWidth=Math.max(1,fontSize/18);if(item.underline){const x=rightToLeft?columnLeft+metrics.columnWidth*.88:columnLeft+metrics.columnWidth*.12;context.fillRect(x,top,lineWidth,bottom-top);}if(item.strikethrough){const x=columnLeft+metrics.columnWidth*.5;context.fillRect(x,top,lineWidth,bottom-top);}});}
    function textContentSize(item){const size=integerFontSize(item.font_size),lines=String(item.text||"").split("\n"),pad=textPadding(item),family=textCanvasFamily(item),scaleX=fontScaleFactor(item,"font_scale_x"),scaleY=fontScaleFactor(item,"font_scale_y"),spacing=trackingPixels(item,size);ctx.save();ctx.font=`${item.italic?"italic ":""}${item.bold?"700 ":""}${size}px "${family}", sans-serif`;let width,height;if(String(item.writing||"").startsWith("vertical")){const metrics=verticalTextMetrics(item.text,size,spacing);width=metrics.width*scaleX;height=metrics.height*scaleY;}else{width=Math.max(size*.5,...lines.map(line=>measureTrackedText(line||" ",spacing)))*scaleX;height=Math.max(1,lines.length)*size*1.2*scaleY;}ctx.restore();return{w:Math.ceil(width+pad*2),h:Math.ceil(height+pad*2)};}
    function fitTextBox(item,preserveCenter=false,expandOnly=false){if(!item||item.type!=="text")return;const center={x:(Number(item.x)||0)+(Number(item.w)||0)/2,y:(Number(item.y)||0)+(Number(item.h)||0)/2},size=textContentSize(item),nextW=expandOnly?Math.max(Number(item.w)||1,size.w):size.w,nextH=expandOnly?Math.max(Number(item.h)||1,size.h):size.h;item.w=Math.ceil(nextW);item.h=Math.ceil(nextH);if(preserveCenter){item.x=Math.round(center.x-item.w/2);item.y=Math.round(center.y-item.h/2);}}
    function tailTip(item){if(Number.isFinite(Number(item.tail_tip_x))&&Number.isFinite(Number(item.tail_tip_y)))return{x:Number(item.tail_tip_x),y:Number(item.tail_tip_y)};if(item.tail==="left")return{x:-.18,y:.5};if(item.tail==="right")return{x:1.18,y:.5};if(item.tail==="bottom-right")return{x:.95,y:1.18};if(item.tail==="top-left")return{x:.05,y:-.18};if(item.tail==="top-right")return{x:.95,y:-.18};return{x:.05,y:1.18};}
    function tailSide(x,y){const distances={left:Math.abs(x),right:Math.abs(1-x),top:Math.abs(y),bottom:Math.abs(1-y)};return Object.entries(distances).sort((a,b)=>a[1]-b[1])[0][0];}
    function visualTailPoint(item){const tip=tailTip(item),nx=item.flip_x?1-tip.x:tip.x,ny=item.flip_y?1-tip.y:tip.y;return itemPoint(item,item.x+item.w*nx,item.y+item.h*ny);}
    function smoothPath(points,tension=1){return points.map((point,index)=>{const previous=points[(index-1+points.length)%points.length],next=points[(index+1)%points.length],dx=(next.x-previous.x)*tension/6,dy=(next.y-previous.y)*tension/6;return{x:point.x,y:point.y,in_x:point.x-dx,in_y:point.y-dy,out_x:point.x+dx,out_y:point.y+dy};});}
    function organicEllipse(radii=[1],rx=.49,ry=.48,cx=.5,cy=.5,tension=1){const count=Math.max(8,radii.length),points=[];for(let index=0;index<count;index++){const angle=-Math.PI/2+index*Math.PI*2/count,r=radii[index%radii.length];points.push({x:cx+Math.cos(angle)*rx*r,y:cy+Math.sin(angle)*ry*r});}return smoothPath(points,tension);}
    function roundedRectPath(radius=.16,offsets={}){const l=offsets.left??0,rgt=offsets.right??1,t=offsets.top??0,b=offsets.bottom??1,r=Math.min(.32,Math.max(.008,radius)),k=.55228475,sw=Math.max(0,rgt-l-2*r),sh=Math.max(0,b-t-2*r);return[
      {x:l+r,y:t,in_x:l+r-k*r,in_y:t,out_x:l+r+sw/3,out_y:t},{x:rgt-r,y:t,in_x:rgt-r-sw/3,in_y:t,out_x:rgt-r+k*r,out_y:t},
      {x:rgt,y:t+r,in_x:rgt,in_y:t+r-k*r,out_x:rgt,out_y:t+r+sh/3},{x:rgt,y:b-r,in_x:rgt,in_y:b-r-sh/3,out_x:rgt,out_y:b-r+k*r},
      {x:rgt-r,y:b,in_x:rgt-r+k*r,in_y:b,out_x:rgt-r-sw/3,out_y:b},{x:l+r,y:b,in_x:l+r+sw/3,in_y:b,out_x:l+r-k*r,out_y:b},
      {x:l,y:b-r,in_x:l,in_y:b-r+k*r,out_x:l,out_y:b-r-sh/3},{x:l,y:t+r,in_x:l,in_y:t+r+sh/3,out_x:l,out_y:t+r-k*r}
    ];}
    function polygonPath(points,tension=0){return smoothPath(points.map(([x,y])=>({x,y})),tension);}
    function burstPath(count=14,inner=.42,outer=.55,pattern=[],tension=0){const points=[];for(let index=0;index<count*2;index++){const angle=-Math.PI/2+index*Math.PI/count,base=index%2===0?outer:inner,modifier=pattern.length?pattern[index%pattern.length]:1;points.push({x:.5+Math.cos(angle)*base*modifier,y:.5+Math.sin(angle)*base*modifier*.82});}return smoothPath(points,tension);}
    function seededRandom(seed=1){let value=(Number(seed)||1)>>>0;return()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};}
    function lobePath(count=13,depth=.08,pattern=[1,.92,1.05],tension=.72){const points=[];for(let index=0;index<count*2;index++){const angle=-Math.PI/2+index*Math.PI/count,outer=index%2===0,r=(outer?.5:.5-depth)*pattern[index%pattern.length];points.push({x:.5+Math.cos(angle)*r,y:.5+Math.sin(angle)*r*.82});}return smoothPath(points,tension);}
    function clampPercent(value,fallback=0){const number=Number(value);return Math.max(0,Math.min(100,Number.isFinite(number)?number:fallback));}
    function clonePath(path){return path.map(point=>({...point}));}
    function ellipseForPath(path){const count=Math.max(4,path.length),points=[];for(let index=0;index<count;index++){const angle=-Math.PI/2+index*Math.PI*2/count;points.push({x:.5+Math.cos(angle)*.49,y:.5+Math.sin(angle)*.47});}return smoothPath(points,1);}
    function pathHasAnchorIntersections(path){const orientation=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),count=path.length;for(let first=0;first<count;first++){const a=path[first],b=path[(first+1)%count];for(let second=first+2;second<count;second++){if(first===0&&second===count-1)continue;const c=path[second],d=path[(second+1)%count],abC=orientation(a,b,c),abD=orientation(a,b,d),cdA=orientation(c,d,a),cdB=orientation(c,d,b);if(abC*abD<0&&cdA*cdB<0)return true;}}return false;}
    function perturbPath(path,asymmetry,seed,config){const requested=Math.pow(clampPercent(asymmetry)/100,.72);if(requested<=0)return clonePath(path);const radialScale=Number(config?.radial)||.2,tangentScale=Math.min(Number(config?.tangent)||.08,Math.PI*.7/Math.max(3,path.length));for(const fallback of [1,.85,.7,.55,.4,.25,0]){const amount=requested*fallback,random=seededRandom(seed),candidate=path.map(point=>{const angle=(random()-.5)*2*tangentScale*amount,scale=1+(random()-.5)*2*radialScale*amount,cos=Math.cos(angle),sin=Math.sin(angle),transform=(x,y)=>{const vx=x-.5,vy=y-.5;return{x:.5+(vx*cos-vy*sin)*scale,y:.5+(vx*sin+vy*cos)*scale};},anchor=transform(point.x,point.y),inside=transform(point.in_x??point.x,point.in_y??point.y),outside=transform(point.out_x??point.x,point.out_y??point.y);return{x:anchor.x,y:anchor.y,in_x:inside.x,in_y:inside.y,out_x:outside.x,out_y:outside.y};});if(!pathHasAnchorIntersections(candidate))return candidate;}return clonePath(path);}
    function blendPaths(from,to,amount){const strength=Math.max(0,Math.min(1,Number(amount)||0));return to.map((point,index)=>{const base=from[index]||point,blend=(key,fallback)=>{const start=Number(base[key]??base[fallback]),end=Number(point[key]??point[fallback]);return start+(end-start)*strength;};return{x:blend("x","x"),y:blend("y","y"),in_x:blend("in_x","x"),in_y:blend("in_y","y"),out_x:blend("out_x","x"),out_y:blend("out_y","y")};});}
    function familyIntensity(value,fallback=100,minimum=.28){return minimum+(1-minimum)*clampPercent(value,fallback)/100;}
    function ovalFamilyPath(base,fullness=60){const points=clonePath(base||defaultVectorPath("oval")),amount=(clampPercent(fullness,60)-50)/250;return points.map(point=>{const move=(x,y)=>({x:.5+(x-.5)*(1+amount),y:.5+(y-.5)*(1-amount*.42)}),anchor=move(point.x,point.y),inside=move(point.in_x??point.x,point.in_y??point.y),outside=move(point.out_x??point.x,point.out_y??point.y);return{x:anchor.x,y:anchor.y,in_x:inside.x,in_y:inside.y,out_x:outside.x,out_y:outside.y};});}
    function roundedBoxFamilyPath(roundness=34){const radius=.025+clampPercent(roundness,34)/100*.235;return roundedRectPath(radius);}
    function concaveJaggedPath(spikeCount=17,valleyConcavity=64,valleyStyle="straight",intensity=72){const count=Math.max(7,Math.min(32,Math.round(Number(spikeCount)||17))),strength=familyIntensity(intensity,72,.42),concavity=clampPercent(valleyConcavity,64)/100,straight=valleyStyle==="straight",outer=.50+.14*strength,inner=.46-(straight?.13:.09+.10*concavity)*strength,points=[],lengthPattern=[1.18,.90,1.08,.84,1.15,.94,1.04,.87,1.12,.91,.98,.85];for(let index=0;index<count;index++){const jitter=(index%3-1)*.017,tipAngle=-Math.PI/2+index*Math.PI*2/count+jitter,valleyAngle=tipAngle+Math.PI/count*(.82+(index%2)*.12),tipRadius=outer*lengthPattern[index%lengthPattern.length],tip={x:.5+Math.cos(tipAngle)*tipRadius,y:.5+Math.sin(tipAngle)*tipRadius*.78},valley={x:.5+Math.cos(valleyAngle)*inner,y:.5+Math.sin(valleyAngle)*inner*.78},handle=straight?0:Math.PI/count*inner*concavity*.8,tangent={x:-Math.sin(valleyAngle),y:Math.cos(valleyAngle)*.78};points.push({x:tip.x,y:tip.y,in_x:tip.x,in_y:tip.y,out_x:tip.x,out_y:tip.y},{x:valley.x,y:valley.y,in_x:valley.x-tangent.x*handle,in_y:valley.y-tangent.y*handle,out_x:valley.x+tangent.x*handle,out_y:valley.y+tangent.y*handle});}return points;}
    function softBurstFamilyPath(spikeCount=13,intensity=62){const count=Math.max(7,Math.min(22,Math.round(Number(spikeCount)||13))),strength=familyIntensity(intensity,62,.32),outer=.48+.10*strength,inner=.455-.055*strength,pattern=[1.08,.91,1.13,.95,.86,1.05,1.12,.89,1.03,.94,1.09,.90,.98],points=[];for(let index=0;index<count*2;index++){const angle=-Math.PI/2+index*Math.PI/count+(index%4===0?.018:index%4===2?-.012:0),radius=(index%2===0?outer*pattern[(index/2)%pattern.length|0]:inner);points.push({x:.5+Math.cos(angle)*radius,y:.5+Math.sin(angle)*radius*.80});}return smoothPath(points,.42+.24*(1-strength));}
    function tunableCloudPath(lobeCount=9,lobeDepth=36,softness=92,intensity=66){
      // MANGA_THOUGHT_CLOUD_V2: broad rounded asymmetric lobes only.
      const count=Math.max(7,Math.min(14,Math.round(Number(lobeCount)||9))),
        strength=familyIntensity(intensity,66,.42),
        depth=.055+clampPercent(lobeDepth,36)/100*.070+strength*.018,
        tension=.90+clampPercent(softness,92)/100*.16,
        crestPattern=[1.02,1.09,.95,1.05,.92,1.08,.96,1.03,.94,1.06,.93,1.00,.96,.91],
        valleyPattern=[.84,.87,.82,.86,.81,.88,.83,.86,.82,.87,.82,.85,.83,.81],
        points=[];
      for(let index=0;index<count;index++){
        const crestAngle=-Math.PI/2+index*Math.PI*2/count+.035*Math.sin(index*1.71),
          valleyAngle=-Math.PI/2+(index+.52)*Math.PI*2/count+.018*Math.cos(index*2.13),
          crest=crestPattern[index%crestPattern.length],
          valley=Math.max(.74,valleyPattern[index%valleyPattern.length]-depth+.105),
          crestRx=.465*crest,
          crestRy=.405*crest,
          valleyRx=.465*valley,
          valleyRy=.405*valley;
        points.push({x:.5+Math.cos(crestAngle)*crestRx,y:.5+Math.sin(crestAngle)*crestRy});
        points.push({x:.5+Math.cos(valleyAngle)*valleyRx,y:.5+Math.sin(valleyAngle)*valleyRy});
      }
      return smoothPath(points,tension);
    }
    function heartFamilyPath(base,intensity=70){const strength=familyIntensity(intensity,70,.45),points=clonePath(base||SVG_SHAPE_PATHS.get("base-heart")||defaultVectorPath("oval"));return points.map(point=>{const transform=(x,y)=>{const nx=.5+(x-.5)*(0.88+.17*strength),ny=.52+(y-.52)*(0.92+.13*strength);return{x:nx,y:ny};},anchor=transform(point.x,point.y),inside=transform(point.in_x??point.x,point.in_y??point.y),outside=transform(point.out_x??point.x,point.out_y??point.y);return{x:anchor.x,y:anchor.y,in_x:inside.x,in_y:inside.y,out_x:outside.x,out_y:outside.y};});}
    function meltingPath(intensity=0){const full=smoothPath([{x:.50,y:.02},{x:.72,y:.03},{x:.88,y:.12},{x:.97,y:.28},{x:.99,y:.47},{x:.95,y:.64},{x:.86,y:.72},{x:.81,y:.75},{x:.80,y:.89},{x:.77,y:.98},{x:.74,y:.89},{x:.72,y:.76},{x:.62,y:.78},{x:.60,y:.91},{x:.56,y:.99},{x:.52,y:.91},{x:.50,y:.78},{x:.42,y:.77},{x:.40,y:.87},{x:.36,y:.95},{x:.32,y:.87},{x:.30,y:.75},{x:.18,y:.71},{x:.07,y:.60},{x:.02,y:.42},{x:.06,y:.22},{x:.20,y:.08}],.78);return blendPaths(ellipseForPath(full),full,clampPercent(intensity,0)/100);}
    function presetTargetPath(kind,options={}){
      const tuning=SHAPE_TUNING[kind]||{},family=tuning.family,base=SVG_SHAPE_PATHS.get(kind),preset=presetForPath(kind);
      if(fixedPathPreset(preset)&&base)return clonePath(base);
      if(family==="oval")return ovalFamilyPath(base,options.shapeRoundness??tuning.roundness??60);
      if(family==="box")return roundedBoxFamilyPath(options.shapeRoundness??tuning.roundness??34);
      if(family==="jagged")return concaveJaggedPath(options.spikeCount??tuning.spikeCount??17,options.valleyConcavity??tuning.valleyConcavity??64,options.valleyStyle??tuning.valleyStyle??"straight",options.shapeIntensity??tuning.intensity??72);
      if(family==="soft")return softBurstFamilyPath(options.spikeCount??tuning.spikeCount??13,options.shapeIntensity??tuning.intensity??62);
      if(family==="cloud")return tunableCloudPath(options.lobeCount??tuning.lobeCount??9,options.lobeDepth??tuning.lobeDepth??36,options.shapeSoftness??tuning.softness??92,options.shapeIntensity??tuning.intensity??66);
      if(family==="heart")return heartFamilyPath(base,options.shapeIntensity??tuning.intensity??70);
      return clonePath(base||defaultVectorPath("oval"));
    }
    function presetPath(kind,options={}){const tuning=SHAPE_TUNING[kind]||{},target=presetTargetPath(kind,options);return perturbPath(target,options.shapeAsymmetry??tuning.asymmetry??0,options.shapeSeed??1,tuning);}
        function cloudEnvelopePath(doubleCloud=false){const lobeCount=doubleCloud?10:9,base=doubleCloud?.35:.34,orbit=doubleCloud?.30:.31,radii=doubleCloud?[.15,.16,.15]:[.16,.17,.15],circles=[[.5,.5,base]],count=doubleCloud?44:40,points=[];for(let index=0;index<lobeCount;index++){const angle=-Math.PI/2+index*Math.PI*2/lobeCount,radius=radii[index%radii.length];circles.push([.5+Math.cos(angle)*orbit,.5+Math.sin(angle)*orbit*.78,radius]);}for(let index=0;index<count;index++){const angle=-Math.PI/2+index*Math.PI*2/count,dx=Math.cos(angle),dy=Math.sin(angle);let far=.01;for(const [cx,cy,radius] of circles){const vx=cx-.5,vy=cy-.5,projection=dx*vx+dy*vy,disc=radius*radius-(vx*vx+vy*vy-projection*projection);if(disc>=0)far=Math.max(far,projection+Math.sqrt(disc));}points.push({x:.5+dx*far,y:.5+dy*far});}return smoothPath(points,.42);}
    function defaultVectorPath(shape){
      if(shape==="rounded_rect")return[
        {x:.18,y:0,in_x:.081,in_y:0,out_x:.393,out_y:0},{x:.82,y:0,in_x:.607,in_y:0,out_x:.919,out_y:0},{x:1,y:.18,in_x:1,in_y:.081,out_x:1,out_y:.393},{x:1,y:.82,in_x:1,in_y:.607,out_x:1,out_y:.919},
        {x:.82,y:1,in_x:.919,in_y:1,out_x:.607,out_y:1},{x:.18,y:1,in_x:.393,in_y:1,out_x:.081,out_y:1},{x:0,y:.82,in_x:0,in_y:.919,out_x:0,out_y:.607},{x:0,y:.18,in_x:0,in_y:.393,out_x:0,out_y:.081}
      ];
      if(shape==="sharp_rect")return smoothPath([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],0);
      if(shape==="spike"){const points=[];for(let index=0;index<24;index++){const angle=-Math.PI/2+index*Math.PI/12,r=index%2===0?.56:.43;points.push({x:.5+Math.cos(angle)*r,y:.5+Math.sin(angle)*r});}return smoothPath(points,0);}
      if(shape==="soft_burst"){const points=[];for(let index=0;index<20;index++){const angle=-Math.PI/2+index*Math.PI/10,r=index%2===0?.55:.45;points.push({x:.5+Math.cos(angle)*r,y:.5+Math.sin(angle)*r*.82});}return smoothPath(points,.18);}
      if(shape==="cloud"||shape==="double_cloud")return cloudEnvelopePath(shape==="double_cloud");
      if(shape==="wavy"){const points=[];for(let index=0;index<16;index++){const angle=-Math.PI/2+index*Math.PI/8,r=index%2===0?.52:.47;points.push({x:.5+Math.cos(angle)*r,y:.5+Math.sin(angle)*r*.8});}return smoothPath(points,.68);}
      if(shape==="hexagon")return smoothPath([{x:.18,y:0},{x:.82,y:0},{x:1,y:.5},{x:.82,y:1},{x:.18,y:1},{x:0,y:.5}],0);
      if(shape==="angular")return smoothPath([{x:.08,y:.08},{x:.78,y:0},{x:1,y:.28},{x:.92,y:.86},{x:.68,y:1},{x:.22,y:.94},{x:0,y:.7},{x:.04,y:.3}],0);
      return[{x:.5,y:0,in_x:.224,in_y:0,out_x:.776,out_y:0},{x:1,y:.5,in_x:1,in_y:.224,out_x:1,out_y:.776},{x:.5,y:1,in_x:.776,in_y:1,out_x:.224,out_y:1},{x:0,y:.5,in_x:0,in_y:.776,out_x:0,out_y:.224}];
    }
    function ensureVectorPath(item){if(Array.isArray(item.path_points)&&item.path_points.length>=3)return false;item.path_points=defaultVectorPath(item.shape);return true;}
    function localToVisual(item,x,y){const nx=item.flip_x?1-x:x,ny=item.flip_y?1-y:y;return itemPoint(item,item.x+item.w*nx,item.y+item.h*ny);}
    function visualToLocal(item,point){const local=itemLocalPoint(item,point);let x=(local.x-item.x)/Math.max(1,item.w),y=(local.y-item.y)/Math.max(1,item.h);if(item.flip_x)x=1-x;if(item.flip_y)y=1-y;return{x,y};}
    function tailGeometry(item,w,h){const tail=item.tail||"none",tip=tailTip(item);if(tail==="none")return null;const center={x:w/2,y:h/2},target={x:w*tip.x,y:h*tip.y},dx=target.x-center.x,dy=target.y-center.y,length=Math.max(1,Math.hypot(dx,dy)),perpendicular={x:-dy/length,y:dx/length},halfWidth=Math.min(w,h)*.14;return[[center.x+perpendicular.x*halfWidth,center.y+perpendicular.y*halfWidth],[center.x-perpendicular.x*halfWidth,center.y-perpendicular.y*halfWidth],[target.x,target.y]];}
    function allTailGeometries(item,w,h){const tails=[];if(item.tail_style==="dots")return tails;const main=tailGeometry(item,w,h);if(main)tails.push(main);for(const tail of item.extra_tails||[]){const extra={...item,tail};delete extra.tail_tip_x;delete extra.tail_tip_y;delete extra.tail_side;const points=tailGeometry(extra,w,h);if(points)tails.push(points);}return tails;}
    function thoughtTailCircles(item,w,h){if((item.tail||"none")==="none")return[];const tip=tailTip(item),side=item.tail_side||tailSide(tip.x,tip.y),base=side==="top"?{x:Math.max(.2,Math.min(.8,tip.x)),y:.08}:side==="left"?{x:.08,y:Math.max(.2,Math.min(.8,tip.y))}:side==="right"?{x:.92,y:Math.max(.2,Math.min(.8,tip.y))}:{x:Math.max(.2,Math.min(.8,tip.x)),y:.92};return[.43,.88].map((t,index)=>({x:w*(base.x+(tip.x-base.x)*t),y:h*(base.y+(tip.y-base.y)*t),r:Math.min(w,h)*[.072,.038][index]}));}
    function traceBubbleBody(target,item,w,h){
      target.beginPath();
      if(Array.isArray(item.path_points)&&item.path_points.length>=3){const first=item.path_points[0];target.moveTo(first.x*w,first.y*h);for(let index=0;index<item.path_points.length;index++){const current=item.path_points[index],next=item.path_points[(index+1)%item.path_points.length];target.bezierCurveTo((current.out_x??current.x)*w,(current.out_y??current.y)*h,(next.in_x??next.x)*w,(next.in_y??next.y)*h,next.x*w,next.y*h);}target.closePath();}
      else if(item.shape==="rounded_rect"){target.roundRect(0,0,w,h,Math.min(w,h)*.18);}
      else if(item.shape==="cloud"){target.roundRect(0,0,w,h,Math.min(w,h)*.3);target.ellipse(w*.2,h*.45,w*.24,h*.3,0,0,Math.PI*2);target.ellipse(w*.43,h*.3,w*.28,h*.35,0,0,Math.PI*2);target.ellipse(w*.7,h*.35,w*.28,h*.36,0,0,Math.PI*2);}
      else if(item.shape==="spike"){const points=[];for(let index=0;index<48;index++){const angle=-Math.PI/2+index*Math.PI/24,radius=index%2===0?1:.82;points.push([(w/2)+Math.cos(angle)*w*.56*radius,(h/2)+Math.sin(angle)*h*.56*radius]);}target.moveTo(points[0][0],points[0][1]);points.slice(1).forEach(point=>target.lineTo(point[0],point[1]));target.closePath();}
      else{target.ellipse(w/2,h/2,w/2,h/2,0,0,Math.PI*2);}
    }
    function dilatedLayer(mask,radius,color){const layer=document.createElement("canvas");layer.width=mask.width;layer.height=mask.height;const target=layer.getContext("2d"),r=Math.max(0,Math.ceil(radius));if(r<=12){for(let dx=-r;dx<=r;dx++){for(let dy=-r;dy<=r;dy++){if(dx*dx+dy*dy<=r*r)target.drawImage(mask,dx,dy);}}}else{target.drawImage(mask,0,0);for(let index=0;index<128;index++){const angle=index*Math.PI*2/128;target.drawImage(mask,Math.cos(angle)*r,Math.sin(angle)*r);}}target.globalCompositeOperation="source-in";target.fillStyle=color;target.fillRect(0,0,layer.width,layer.height);return layer;}
    function sampleBubblePoints(item,w,h,steps=16){const points=item.path_points||[],sampled=[];if(points.length>=3){for(let index=0;index<points.length;index++){const current=points[index],next=points[(index+1)%points.length],a={x:current.x,y:current.y},b={x:current.out_x??current.x,y:current.out_y??current.y},c={x:next.in_x??next.x,y:next.in_y??next.y},d={x:next.x,y:next.y};for(let step=0;step<steps;step++){const point=cubicPoint(a,b,c,d,step/steps);sampled.push({x:point.x*w,y:point.y*h});}}}else{for(let index=0;index<96;index++){const angle=index*Math.PI*2/96;sampled.push({x:w/2+Math.cos(angle)*w/2,y:h/2+Math.sin(angle)*h/2});}}return sampled;}
    function drawBubbleDecoration(target,item,w,h){const style=item.decoration_style||"none",strokeWidth=Math.max(.5,Number(item.stroke_width)||1);if(style==="none")return;target.save();target.strokeStyle=item.stroke||"#111";target.lineCap="round";if(style==="overlap"){target.lineWidth=strokeWidth*1.5;target.beginPath();target.moveTo(w*.6,h*.19);target.bezierCurveTo(w*.47,h*.34,w*.47,h*.68,w*.57,h*.84);target.stroke();}else if(style==="radiant"){const random=seededRandom(Number(item.shape_seed)||2718),count=192,rx=w*.49,ry=h*.49;for(let index=0;index<count;index++){const angle=-Math.PI/2+index*Math.PI*2/count+(random()-.5)*.009,inner=1+random()*.018,outer=1.05+Math.pow(random(),2)*.18;target.globalAlpha=.28+random()*.48;target.lineWidth=Math.max(.35,strokeWidth*(.09+random()*.18));target.beginPath();target.moveTo(w*.5+Math.cos(angle)*rx*inner,h*.5+Math.sin(angle)*ry*inner);target.lineTo(w*.5+Math.cos(angle)*rx*outer,h*.5+Math.sin(angle)*ry*outer);target.stroke();}target.globalAlpha=1;}target.restore();}
    function fillDialogueRoundedRect(target,x,y,w,h,radius,color){target.beginPath();addRoundedRectPath(target,x,y,w,h,radius);target.fillStyle=color;target.fill();}
    function strokeDialogueRoundedRect(target,x,y,w,h,radius,color,width){if(width<=0)return;target.beginPath();addRoundedRectPath(target,x+width/2,y+width/2,Math.max(1,w-width),Math.max(1,h-width),Math.max(0,radius-width/2));target.strokeStyle=color;target.lineWidth=width;target.stroke();}
    function drawDialogueDecoration(target,style,w,h){target.save();target.lineCap="round";target.lineJoin="round";if(style==="pink"){const blossom=(cx,cy,size)=>{target.fillStyle="#f2a5ba";for(let index=0;index<5;index++){const angle=index*Math.PI*2/5-Math.PI/2;target.beginPath();target.ellipse(cx+Math.cos(angle)*size*.72,cy+Math.sin(angle)*size*.72,size*.45,size*.7,angle,0,Math.PI*2);target.fill();}target.fillStyle="#fff3a6";target.beginPath();target.arc(cx,cy,size*.18,0,Math.PI*2);target.fill();};blossom(w*.14,h*.84,Math.min(w,h)*.045);blossom(w*.86,h*.16,Math.min(w,h)*.04);}else if(style==="blue"){target.fillStyle="#8fb9e8";for(const [cx,cy,r] of [[.13,.15,.018],[.18,.12,.012],[.86,.84,.02],[.81,.88,.012]]){target.beginPath();target.arc(w*cx,h*cy,Math.min(w,h)*r,0,Math.PI*2);target.fill();}}else if(style==="ivory"){target.strokeStyle="#9b8268";target.lineWidth=Math.max(1,Math.min(w,h)*.008);target.beginPath();target.moveTo(w*.1,h*.86);target.bezierCurveTo(w*.14,h*.76,w*.17,h*.72,w*.22,h*.68);target.stroke();target.beginPath();target.ellipse(w*.15,h*.77,w*.035,h*.015,-.6,0,Math.PI*2);target.stroke();target.beginPath();target.ellipse(w*.2,h*.69,w*.035,h*.015,.5,0,Math.PI*2);target.stroke();}target.restore();}
    function dialogueAssetImage(preset){const src=String(preset?.asset_src||"");if(!src)return null;if(!bubblePreviewImageCache.has(src)){const image=new Image();image.onload=()=>requestRender({canvas:true,preview:true});image.onerror=()=>console.warn(`Speech Bubble dialogue asset could not be loaded: ${src}`);image.src=new URL(src,location.href).href;bubblePreviewImageCache.set(src,image);}return bubblePreviewImageCache.get(src);}
    function drawDialoguePanel(target,item,preset,w,h){const settings=dialogueSettings(preset),style=String(item.dialogue_style||settings.style||"rpg").toLowerCase(),asset=dialogueAssetImage(preset);if(asset?.complete&&asset.naturalWidth){target.drawImage(asset,0,0,w,h);return;}const outerColor=item.dialogue_outer_color||settings.outerColor,borderColor=item.stroke||item.dialogue_border_color||settings.borderColor,fillColor=item.fill||item.dialogue_fill_color||settings.fillColor,outerEdge=Math.max(0,finiteOr(item.dialogue_outer_edge,settings.outerEdge)),borderWidth=Math.max(0,finiteOr(item.dialogue_border_width,settings.borderWidth)),radius=Math.max(0,finiteOr(item.dialogue_corner_radius,settings.cornerRadius));if(style==="rpg"){fillDialogueRoundedRect(target,0,0,w,h,radius,outerColor);const edge=Math.min(outerEdge,Math.min(w,h)/4);fillDialogueRoundedRect(target,edge,edge,w-edge*2,h-edge*2,Math.max(0,radius-edge),borderColor);const inner=Math.min(edge+borderWidth,Math.min(w,h)/3);fillDialogueRoundedRect(target,inner,inner,w-inner*2,h-inner*2,Math.max(0,radius-inner),fillColor);}else{fillDialogueRoundedRect(target,0,0,w,h,radius,fillColor);strokeDialogueRoundedRect(target,0,0,w,h,radius,borderColor,borderWidth);drawDialogueDecoration(target,style,w,h);}}
    function drawDialogueShape(item,preset){const x=Number(item.x)||0,y=Number(item.y)||0,w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1);ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));ctx.translate(x+w/2,y+h/2);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);ctx.scale(item.flip_x?-1:1,item.flip_y?-1:1);ctx.translate(-w/2,-h/2);drawDialoguePanel(ctx,item,preset,w,h);ctx.restore();}
    function drawShape(item){
      const preset=PRESET_BY_ID.get(item?.preset_id);if(isDialoguePreset(preset)){drawDialogueShape(item,preset);return;}
      const x=Number(item.x)||0,y=Number(item.y)||0,w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),strokeWidth=Math.max(0,Number(item.stroke_width)||0),strokeStyle=item.stroke_style==="double"?"double":"solid",shadowEnabled=!!item.shadow_enabled,shadowX=Number(item.shadow_x)||0,shadowY=Number(item.shadow_y)||0,shadowBlur=Math.max(0,Number(item.shadow_blur)||0),shadowReach=shadowEnabled?shadowBlur*2+Math.max(Math.abs(shadowX),Math.abs(shadowY)):0,tailSets=allTailGeometries(item,w,h),tailPoints=tailSets.flat(),dotCircles=item.tail_style==="dots"?thoughtTailCircles(item,w,h):[],bodyPoints=sampleBubblePoints(item,w,h,28),xs=[0,w,...bodyPoints.map(point=>point.x),...tailPoints.map(point=>point[0]),...dotCircles.flatMap(circle=>[circle.x-circle.r,circle.x+circle.r])],ys=[0,h,...bodyPoints.map(point=>point.y),...tailPoints.map(point=>point[1]),...dotCircles.flatMap(circle=>[circle.y-circle.r,circle.y+circle.r])],minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),outlineReach=strokeStyle==="double"?strokeWidth*2.5:strokeWidth,padding=Math.ceil(outlineReach+shadowReach)+3,localWidth=Math.max(1,Math.ceil(maxX-minX+padding*2)),localHeight=Math.max(1,Math.ceil(maxY-minY+padding*2)),offsetX=-minX+padding,offsetY=-minY+padding;
      const mask=document.createElement("canvas");mask.width=localWidth;mask.height=localHeight;const maskContext=mask.getContext("2d");maskContext.translate(offsetX,offsetY);maskContext.fillStyle="#fff";for(const points of tailSets){maskContext.beginPath();maskContext.moveTo(...points[0]);points.slice(1).forEach(point=>maskContext.lineTo(...point));maskContext.closePath();maskContext.fill();}for(const circle of dotCircles){maskContext.beginPath();maskContext.arc(circle.x,circle.y,circle.r,0,Math.PI*2);maskContext.fill();}traceBubbleBody(maskContext,item,w,h);maskContext.fill();
      const shadowLayer=document.createElement("canvas");shadowLayer.width=localWidth;shadowLayer.height=localHeight;if(shadowEnabled){const shadowContext=shadowLayer.getContext("2d");shadowContext.filter=shadowBlur?`blur(${shadowBlur}px)`:"none";shadowContext.drawImage(mask,shadowX,shadowY);shadowContext.filter="none";shadowContext.globalCompositeOperation="source-in";shadowContext.fillStyle=item.shadow_color||"#000";shadowContext.fillRect(0,0,localWidth,localHeight);}
      const fillLayer=dilatedLayer(mask,0,item.fill||"#fff"),outlineLayers=[];if(strokeWidth>0){if(strokeStyle==="double"){outlineLayers.push(dilatedLayer(mask,strokeWidth*2.35,item.stroke||"#111"),dilatedLayer(mask,strokeWidth*1.45,item.fill||"#fff"),dilatedLayer(mask,strokeWidth*.65,item.stroke||"#111"));}else outlineLayers.push(dilatedLayer(mask,strokeWidth,item.stroke||"#111"));}
      ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));ctx.translate(x+w/2,y+h/2);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);ctx.scale(item.flip_x?-1:1,item.flip_y?-1:1);ctx.translate(-w/2,-h/2);if(shadowEnabled)ctx.drawImage(shadowLayer,minX-padding,minY-padding);outlineLayers.forEach(layer=>ctx.drawImage(layer,minX-padding,minY-padding));ctx.drawImage(fillLayer,minX-padding,minY-padding);drawBubbleDecoration(ctx,item,w,h);ctx.restore();
    }
    function drawText(item) { const w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),size=integerFontSize(item.font_size),family=textCanvasFamily(item),pad=textPadding(item),scaleX=fontScaleFactor(item,"font_scale_x"),scaleY=fontScaleFactor(item,"font_scale_y"),logicalW=w/scaleX,padX=pad/scaleX,padY=pad/scaleY,spacing=trackingPixels(item,size),strokeWidth=Number(item.stroke_width)||0;ctx.save();ctx.translate((Number(item.x)||0)+w/2,(Number(item.y)||0)+h/2);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);ctx.translate(-w/2,-h/2);ctx.scale(scaleX,scaleY);ctx.font=`${item.italic?"italic ":""}${item.bold?"700 ":""}${size}px "${family}", sans-serif`;ctx.fillStyle=item.color||"#111";ctx.strokeStyle=item.stroke_color||"#fff";ctx.lineWidth=strokeWidth*2;ctx.textBaseline="top";if(item.shadow_enabled){ctx.shadowColor=item.shadow_color||"#000";ctx.shadowOffsetX=(Number(item.shadow_x)||0)/scaleX;ctx.shadowOffsetY=(Number(item.shadow_y)||0)/scaleY;ctx.shadowBlur=Math.max(0,Number(item.shadow_blur)||0)/Math.sqrt(scaleX*scaleY);}const lines=String(item.text||"").split("\n");if(String(item.writing||"").startsWith("vertical")){drawVerticalTextColumns(ctx,item,logicalW,padX,padY,size,spacing,strokeWidth);}else{const lineH=size*1.2;lines.forEach((line,i)=>{const tw=measureTrackedText(line,spacing),tx=item.align==="left"?padX:item.align==="right"?logicalW-padX-tw:(logicalW-tw)/2,ty=padY+i*lineH;drawTrackedText(line,tx,ty,spacing,strokeWidth);if(item.underline)ctx.fillRect(tx,ty+size,tw,Math.max(1,size/18));if(item.strikethrough)ctx.fillRect(tx,ty+size*.55,tw,Math.max(1,size/18));});}ctx.restore(); }
    function sfxImageFor(item){const userAssetId=String(item.user_asset_id||"").replace(/^user:/,""),preset=userAssetId?null:SFX_BY_ID.get(item.asset_id),src=item.asset_src||(userAssetId?`${forgeApiBase}/user-assets/asset/${userAssetId}`:preset?.src);if(!src)return null;if(!sfxImageCache.has(src)){const asset=new Image();asset.onload=()=>requestRender({canvas:true,preview:true});asset.onerror=()=>console.warn(`Speech Bubble SFX asset could not be loaded: ${src}`);asset.src=new URL(versionedSfxSrc(src),location.href).href;sfxImageCache.set(src,asset);}return sfxImageCache.get(src);}
    function clearSfxAssetCaches(){sfxImageCache.clear();sfxTintCache.clear();}
    function sfxTintCacheKey(preset,asset,color,mode){const source=String(asset?.currentSrc||asset?.src||"");return`${source}|${preset?.userAssetId||preset?.id||""}|${mode||"fill"}|${color}`;}
    function tintedSfxImage(preset,asset,color,mode="fill"){const key=sfxTintCacheKey(preset,asset,color,mode),cached=lruGet(sfxTintCache,key);if(cached)return cached;const tinted=document.createElement("canvas");tinted.width=asset.naturalWidth;tinted.height=asset.naturalHeight;const target=tinted.getContext("2d");target.drawImage(asset,0,0);target.globalCompositeOperation="source-in";target.fillStyle=color;target.fillRect(0,0,tinted.width,tinted.height);return lruSet(sfxTintCache,key,tinted,MAX_SFX_TINT_CACHE);}
    function tintedSfxSurface(surface,color){const tinted=document.createElement("canvas"),target=tinted.getContext("2d");tinted.width=surface.naturalWidth||surface.width;tinted.height=surface.naturalHeight||surface.height;target.drawImage(surface,0,0);target.globalCompositeOperation="source-in";target.fillStyle=color;target.fillRect(0,0,tinted.width,tinted.height);target.globalCompositeOperation="source-over";return tinted;}
    function drawSfxOuterGlow(surface,item,w,h){if(!item.glow_enabled)return;const glow=tintedSfxSurface(surface,item.glow_color||"#ffffff"),opacity=Math.max(0,Math.min(1,finiteOr(item.opacity,1)))*Math.max(0,Math.min(1,finiteOr(item.glow_opacity,.75))),blur=Math.max(0,finiteOr(item.glow_blur,16)),spread=Math.max(0,finiteOr(item.glow_spread,0)),passes=spread>0?12:1;ctx.save();ctx.globalAlpha=opacity;ctx.filter=blur?`blur(${blur}px)`:"none";for(let index=0;index<passes;index++){const angle=passes===1?0:index*Math.PI*2/passes,dx=passes===1?0:Math.cos(angle)*spread,dy=passes===1?0:Math.sin(angle)*spread;ctx.drawImage(glow,-w/2+dx,-h/2+dy,w,h);}ctx.restore();}
function drawBasicSymbol(item,kind){const x=Number(item.x)||0,y=Number(item.y)||0,w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),outline=Math.max(0,finiteOr(item.stroke_width,3)),opacity=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);ctx.scale(item.flip_x?-1:1,item.flip_y?-1:1);ctx.globalAlpha=opacity;const drawShape=(fillColor=item.fill||"#ffffff",strokeColor=item.stroke||"#111111",strokeWidth=outline)=>{ctx.beginPath();if(kind==="circle"){const radius=Math.min(w,h)*.38;ctx.ellipse(0,0,radius,radius,0,0,Math.PI*2);}else if(kind==="triangle"){ctx.moveTo(0,-h*.43);ctx.lineTo(w*.44,h*.41);ctx.lineTo(-w*.44,h*.41);ctx.closePath();}else if(kind==="square"){const skew=w*.22*Math.max(-1,Math.min(1,finiteOr(item.symbol_skew,0)/50));ctx.moveTo(-w*.42+skew,-h*.42);ctx.lineTo(w*.42+skew,-h*.42);ctx.lineTo(w*.42-skew,h*.42);ctx.lineTo(-w*.42-skew,h*.42);ctx.closePath();}else{const topWidth=Math.max(.2,Math.min(1.8,finiteOr(item.symbol_top_width,100)/100)),topHalf=Math.min(w*.48,w*.42*topWidth),bottomHalf=w*.27;ctx.moveTo(-topHalf,-h*.42);ctx.lineTo(topHalf,-h*.42);ctx.lineTo(bottomHalf,h*.42);ctx.lineTo(-bottomHalf,h*.42);ctx.closePath();}ctx.fillStyle=fillColor;ctx.fill();if(strokeWidth>0){ctx.lineWidth=strokeWidth*2;ctx.strokeStyle=strokeColor;ctx.lineJoin="round";ctx.stroke();}};if(item.glow_enabled){const glowColor=item.glow_color||"#ffffff",glowOpacity=Math.max(0,Math.min(1,finiteOr(item.glow_opacity,.75))),blur=Math.max(0,finiteOr(item.glow_blur,16)),spread=Math.max(0,finiteOr(item.glow_spread,0)),passes=spread>0?12:1;ctx.save();ctx.globalAlpha=opacity*glowOpacity;ctx.filter=blur?`blur(${blur}px)`:"none";for(let index=0;index<passes;index++){const angle=passes===1?0:index*Math.PI*2/passes;ctx.save();if(passes>1)ctx.translate(Math.cos(angle)*spread,Math.sin(angle)*spread);drawShape(glowColor,glowColor,0);ctx.restore();}ctx.restore();}if(item.shadow_enabled){ctx.save();ctx.shadowColor=item.shadow_color||"#000";ctx.shadowOffsetX=Number(item.shadow_x)||0;ctx.shadowOffsetY=Number(item.shadow_y)||0;ctx.shadowBlur=Math.max(0,Number(item.shadow_blur)||0);drawShape();ctx.restore();}drawShape();ctx.restore();}
    function drawSfx(item){const kind=basicSymbolKindFor(item);if(kind){drawBasicSymbol(item,kind);return;}const userAssetId=String(item.user_asset_id||"").replace(/^user:/,""),preset=(userAssetId?null:SFX_BY_ID.get(item.asset_id))||{id:item.asset_id||`user:${userAssetId}`,mask:Boolean(item.mask_mode),fill:item.fill||"#111111"},asset=sfxImageFor(item);if(!asset?.complete||!asset.naturalWidth)return;const x=Number(item.x)||0,y=Number(item.y)||0,w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),maskMode=Boolean(item.mask_mode??preset.mask),fillAsset=maskMode?tintedSfxImage(preset,asset,item.fill||sfxPresetFill(preset),"fill"):asset,outline=Math.max(0,finiteOr(item.stroke_width,maskMode?3:0));ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);ctx.scale(item.flip_x?-1:1,item.flip_y?-1:1);drawSfxOuterGlow(fillAsset,item,w,h);ctx.globalAlpha=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));if(item.shadow_enabled){ctx.save();ctx.shadowColor=item.shadow_color||"#000";ctx.shadowOffsetX=Number(item.shadow_x)||0;ctx.shadowOffsetY=Number(item.shadow_y)||0;ctx.shadowBlur=Math.max(0,Number(item.shadow_blur)||0);ctx.drawImage(fillAsset,-w/2,-h/2,w,h);ctx.restore();}if(outline>0){const outlineAsset=tintedSfxImage(preset,asset,item.stroke||"#111111","outline"),steps=Math.max(16,Math.ceil(outline*5));for(let index=0;index<steps;index++){const angle=index/steps*Math.PI*2;ctx.drawImage(outlineAsset,-w/2+Math.cos(angle)*outline,-h/2+Math.sin(angle)*outline,w,h);}}ctx.drawImage(fillAsset,-w/2,-h/2,w,h);ctx.restore();}
    function addRoundedRectPath(target,x,y,w,h,radius){const r=Math.max(0,Math.min(Number(radius)||0,w/2,h/2));target.moveTo(x+r,y);target.lineTo(x+w-r,y);target.quadraticCurveTo(x+w,y,x+w,y+r);target.lineTo(x+w,y+h-r);target.quadraticCurveTo(x+w,y+h,x+w-r,y+h);target.lineTo(x+r,y+h);target.quadraticCurveTo(x,y+h,x,y+h-r);target.lineTo(x,y+r);target.quadraticCurveTo(x,y,x+r,y);target.closePath();}
    function versionedFrameSrc(src){if(!src)return src;return `${src}${String(src).includes("?")?"&":"?"}v=${FRAME_ASSET_VERSION}`;}
    function frameUses2x(item,preset){const frameScale=finiteOr(item?.frame_scale,100),longSide=Math.max(finiteOr(item?.w,state.width),finiteOr(item?.h,state.height));return Boolean(preset?.asset_src_2x&&(frameScale>100||longSide>1536));}
    function frameAssetSrcFor(item,preset){return frameUses2x(item,preset)?preset.asset_src_2x:preset?.asset_src;}
    function lruGet(cache,key){if(!cache.has(key))return null;const value=cache.get(key);cache.delete(key);cache.set(key,value);return value;}
    function lruSet(cache,key,value,limit){if(cache.has(key))cache.delete(key);cache.set(key,value);while(cache.size>limit)cache.delete(cache.keys().next().value);return value;}
    function clearFrameSurfaceCacheForSource(src){for(const [key,value] of frameSurfaceCache){if(!src||value.source===src)frameSurfaceCache.delete(key);}tintedFrameSurfaceCache.clear();}
    function refreshLoadedFrameCards(src){document.querySelectorAll("[data-frame]").forEach(card=>{const preset=FRAME_BY_ID.get(card.dataset.frame);if(!preset)return;const sources=[preset.preview_src,preset.asset_src,preset.asset_src_2x,...Object.values(preset.frame_parts||{}),...Object.values(preset.decorated_corners||{}),...Object.values(preset.decorated_items||{})].filter(Boolean);if(sources.includes(src)){const preview=card.querySelector("canvas");if(preview)drawFrameThumbnail(preview,preset);}});}
    function cachedFrameImage(src){if(!src)return null;const key=versionedFrameSrc(src);if(!frameImageCache.has(key)){const asset=new Image();asset.onload=()=>{clearFrameSurfaceCacheForSource();requestRender({canvas:true,preview:true});refreshLoadedFrameCards(src);};asset.onerror=()=>console.warn(`Speech Bubble frame asset could not be loaded: ${src}`);asset.src=new URL(key,location.href).href;frameImageCache.set(key,asset);}return frameImageCache.get(key);}
    function frameImageFor(preset,item=null){return cachedFrameImage(frameAssetSrcFor(item,preset));}
    function frameDecorationImageFor(item,preset,decoration){const src=frameUses2x(item,preset)&&decoration.asset_src_2x?decoration.asset_src_2x:decoration.asset_src;return cachedFrameImage(src);}
    function framePartImagesFor(preset){const images={};for(const [key,src] of Object.entries(preset.frame_parts||{}))images[key]=cachedFrameImage(src);return images;}
    function edgeRepeatLayout(w,h,partSizes,partScale,layout={}){const required=["corner_tl","corner_tr","corner_bl","corner_br","edge_top","edge_bottom","edge_left","edge_right"];if(required.some(key=>!partSizes[key]))return[];const minimumTiles=Math.max(0,Math.min(512,Math.round(finiteOr(layout.minimum_tiles,1)))),maximumTiles=Math.max(1,Math.min(512,Math.round(finiteOr(layout.maximum_tiles,64)))),sourceSize=key=>[Math.max(1,partSizes[key][0]),Math.max(1,partSizes[key][1])],tlSource=sourceSize("corner_tl"),trSource=sourceSize("corner_tr"),blSource=sourceSize("corner_bl"),brSource=sourceSize("corner_br"),limits=[w/(tlSource[0]+trSource[0]),w/(blSource[0]+brSource[0]),h/(tlSource[1]+blSource[1]),h/(trSource[1]+brSource[1])];partScale=Math.max(.001,Math.min(partScale,...limits));const scaled=Object.fromEntries(Object.entries(partSizes).map(([key,size])=>[key,[Math.max(1,size[0]*partScale),Math.max(1,size[1]*partScale)]])),placements=[],repeatHorizontal=(key,start,end,y)=>{const [tileW,tileH]=scaled[key],available=end-start;if(available<=0||tileW>available)return;const naturalCount=Math.floor(available/tileW);if(naturalCount<Math.max(1,minimumTiles))return;const count=Math.min(naturalCount,maximumTiles),gap=Math.max(0,(available-count*tileW)/(count+1));for(let index=0;index<count;index++)placements.push([key,start+gap+index*(tileW+gap),y,tileW,tileH]);},repeatVertical=(key,start,end,x)=>{const [tileW,tileH]=scaled[key],available=end-start;if(available<=0||tileH>available)return;const naturalCount=Math.floor(available/tileH);if(naturalCount<Math.max(1,minimumTiles))return;const count=Math.min(naturalCount,maximumTiles),gap=Math.max(0,(available-count*tileH)/(count+1));for(let index=0;index<count;index++)placements.push([key,x,start+gap+index*(tileH+gap),tileW,tileH]);},tl=scaled.corner_tl,tr=scaled.corner_tr,bl=scaled.corner_bl,br=scaled.corner_br;repeatHorizontal("edge_top",tl[0],w-tr[0],0);repeatHorizontal("edge_bottom",bl[0],w-br[0],h-scaled.edge_bottom[1]);repeatVertical("edge_left",tl[1],h-bl[1],0);repeatVertical("edge_right",tr[1],h-br[1],w-scaled.edge_right[0]);placements.push(["corner_tl",0,0,tl[0],tl[1]],["corner_tr",w-tr[0],0,tr[0],tr[1]],["corner_bl",0,h-bl[1],bl[0],bl[1]],["corner_br",w-br[0],h-br[1],br[0],br[1]]);return placements;}
    function drawEdgeRepeatFrameAsset(target,item,preset,w,h){const images=framePartImagesFor(preset),required=["corner_tl","corner_tr","corner_bl","corner_br","edge_top","edge_bottom","edge_left","edge_right"],entries=required.map(key=>[key,images[key]]);if(entries.some(([,asset])=>!asset?.complete||!asset.naturalWidth))return false;const native=preset.source_size||{width:1024,height:1536},nativeShort=Math.max(1,Math.min(finiteOr(native.width,1024),finiteOr(native.height,1536))),frameScale=Math.max(.1,Math.min(4,finiteOr(item.frame_scale,preset.default_scale||100)/100)),partScale=Math.min(w,h)/nativeShort*frameScale,partSizes=Object.fromEntries(entries.map(([key,asset])=>[key,[asset.naturalWidth,asset.naturalHeight]]));for(const [key,x,y,drawW,drawH] of edgeRepeatLayout(w,h,partSizes,partScale,preset.frame_layout))target.drawImage(images[key],x,y,drawW,drawH);return true;}
    function frameDecoratedImagesFor(preset){const images={};for(const [key,src] of Object.entries(preset.decorated_corners||{})){if(src)images[key]=cachedFrameImage(src);}for(const [key,src] of Object.entries(preset.decorated_items||{}))images[key]=cachedFrameImage(src);return images;}
    function decoratedBorderLayout(w,h,partSizes,edgeSequences,partScale,layout={},fillerSequences={}){
      const cornerScale=Math.max(.001,partScale*Math.max(.05,finiteOr(layout.corner_scale,1))),edgeScaleBase=Math.max(.001,partScale*Math.max(.05,finiteOr(layout.edge_scale,.72))),cornerKeys=["corner_tl","corner_tr","corner_bl","corner_br"];
      let corners=Object.fromEntries(cornerKeys.map(key=>[key,partSizes[key]?[Math.max(1,partSizes[key][0]*cornerScale),Math.max(1,partSizes[key][1]*cornerScale)]:[0,0]]));
      const fit=Math.min(1,w/Math.max(1,corners.corner_tl[0]+corners.corner_tr[0]),w/Math.max(1,corners.corner_bl[0]+corners.corner_br[0]),h/Math.max(1,corners.corner_tl[1]+corners.corner_bl[1]),h/Math.max(1,corners.corner_tr[1]+corners.corner_br[1]));
      let edgeScale=edgeScaleBase;if(fit<1){corners=Object.fromEntries(Object.entries(corners).map(([key,size])=>[key,[size[0]*fit,size[1]*fit]]));edgeScale*=fit;}
      const placements=cornerKeys.filter(key=>corners[key][0]>0&&corners[key][1]>0).map(key=>[key,key.endsWith("l")?0:w-corners[key][0],key.startsWith("corner_t")?0:h-corners[key][1],...corners[key]]);
      const placeEdge=(side,sequence,start,end,scale)=>{const ids=(sequence||[]).filter(key=>partSizes[key]);if(!ids.length)return;let sizes=ids.map(key=>[Math.max(1,partSizes[key][0]*scale),Math.max(1,partSizes[key][1]*scale)]),horizontal=side==="top"||side==="bottom",available=Math.max(0,end-start),primary=sizes.reduce((sum,size)=>sum+(horizontal?size[0]:size[1]),0);if(available<=0||primary<=0)return;const shrink=Math.min(1,available/primary);if(shrink<1){sizes=sizes.map(size=>[size[0]*shrink,size[1]*shrink]);primary*=shrink;}const gap=Math.max(0,(available-primary)/(ids.length+1));let cursor=start+gap;ids.forEach((key,index)=>{const [drawW,drawH]=sizes[index];let x,y;if(side==="top"){x=cursor;y=0;cursor+=drawW+gap;}else if(side==="bottom"){x=cursor;y=h-drawH;cursor+=drawW+gap;}else if(side==="left"){x=0;y=cursor;cursor+=drawH+gap;}else{x=w-drawW;y=cursor;cursor+=drawH+gap;}placements.push([key,x,y,drawW,drawH]);});};
      placeEdge("top",edgeSequences?.top,corners.corner_tl[0],w-corners.corner_tr[0],edgeScale);placeEdge("bottom",edgeSequences?.bottom,corners.corner_bl[0],w-corners.corner_br[0],edgeScale);placeEdge("left",edgeSequences?.left,corners.corner_tl[1],h-corners.corner_bl[1],edgeScale);placeEdge("right",edgeSequences?.right,corners.corner_tr[1],h-corners.corner_br[1],edgeScale);const fillerScale=edgeScale*Math.max(.05,finiteOr(layout.filler_scale,.42));placeEdge("top",fillerSequences?.top,corners.corner_tl[0],w-corners.corner_tr[0],fillerScale);placeEdge("bottom",fillerSequences?.bottom,corners.corner_bl[0],w-corners.corner_br[0],fillerScale);placeEdge("left",fillerSequences?.left,corners.corner_tl[1],h-corners.corner_bl[1],fillerScale);placeEdge("right",fillerSequences?.right,corners.corner_tr[1],h-corners.corner_br[1],fillerScale);return placements;
    }
    function drawPatternedRoundedRect(target,x,y,w,h,radius,layer,unitScale){const lineWidth=Math.max(.5,finiteOr(layer.width,1)*unitScale),offset=finiteOr(layer.offset,0)*unitScale,style=layer.style||"solid",dash=(layer.dash||[]).map(value=>Math.max(.1,finiteOr(value,1)*unitScale));target.save();target.strokeStyle=layer.color||"#fff";target.lineWidth=lineWidth;target.lineJoin="round";target.lineCap=style==="dotted"?"round":"butt";target.setLineDash(style==="solid"?[]:(dash.length>=2?dash:(style==="dotted"?[Math.max(.1,lineWidth*.15),Math.max(1,lineWidth*2.2)]:[Math.max(1,lineWidth*2.4),Math.max(1,lineWidth*2.2)])));target.beginPath();addRoundedRectPath(target,x+offset,y+offset,Math.max(1,w-offset*2),Math.max(1,h-offset*2),Math.max(0,radius));target.stroke();target.restore();}
    function drawProceduralBaseBorder(target,preset,w,h,frameScale){const base=preset.base_border||{};if(base.enabled===false)return true;const layers=Array.isArray(base.layers)?base.layers:[];if(!layers.length)return false;const native=preset.source_size||{width:1024,height:1536},nativeShort=Math.max(1,Math.min(finiteOr(native.width,1024),finiteOr(native.height,1536))),unitScale=Math.min(w,h)/nativeShort*frameScale,baseInset=finiteOr(base.inset,0)*unitScale,baseRadius=Math.max(0,finiteOr(base.radius,0)*unitScale);for(const layer of layers){const lineWidth=Math.max(.5,finiteOr(layer.width,1)*unitScale),inset=baseInset+lineWidth/2;drawPatternedRoundedRect(target,inset,inset,Math.max(1,w-inset*2),Math.max(1,h-inset*2),baseRadius,layer,unitScale);}return true;}
    function drawDecoratedBorderFrameAsset(target,item,preset,w,h){const frameScale=Math.max(.1,Math.min(4,finiteOr(item.frame_scale,preset.default_scale||100)/100));if(!drawProceduralBaseBorder(target,preset,w,h,frameScale))return false;const images=frameDecoratedImagesFor(preset),entries=Object.entries(images);if(!entries.length||entries.some(([,asset])=>!asset?.complete||!asset.naturalWidth))return false;const native=preset.source_size||{width:1024,height:1536},nativeShort=Math.max(1,Math.min(finiteOr(native.width,1024),finiteOr(native.height,1536))),partScale=Math.min(w,h)/nativeShort*frameScale,targets=preset.decorated_targets||{},partSizes=Object.fromEntries(entries.map(([key,asset])=>{const targetWidth=finiteOr(targets[key],0);if(targetWidth<=0)return [key,[asset.naturalWidth,asset.naturalHeight]];const factor=targetWidth/Math.max(1,asset.naturalWidth,asset.naturalHeight);return [key,[asset.naturalWidth*factor,asset.naturalHeight*factor]];}));for(const [key,x,y,drawW,drawH] of decoratedBorderLayout(w,h,partSizes,preset.decorated_edges,partScale,preset.decorated_layout,preset.decorated_fillers))target.drawImage(images[key],x,y,drawW,drawH);return true;}
    function frameAssetScaleStatus(item,preset){if(!item||!preset)return null;const mode=item.frame_mode||preset.frame_mode,declared=preset.source_size||{width:1024,height:1536},asset=preset.asset_src?frameImageFor(preset,item):null,sourceW=asset?.naturalWidth||finiteOr(declared?.width,1024),sourceH=asset?.naturalHeight||finiteOr(declared?.height,1536);if(!sourceW||!sourceH)return null;const frameScale=Math.max(.1,Math.min(4,finiteOr(item.frame_scale,preset.default_scale||100)/100)),w=Math.max(1,finiteOr(item.w,state.width)),h=Math.max(1,finiteOr(item.h,state.height));let ratio=0;if(mode==="edge-repeat"||mode==="decorated-border")ratio=Math.min(w,h)/Math.max(1,Math.min(sourceW,sourceH))*frameScale;else if(mode==="nine-slice"||mode==="composite-frame")ratio=Math.min(w/sourceW,h/sourceH)*frameScale;if(ratio>1.5)return{level:"replace",text:`Source scale ${ratio.toFixed(2)}x. Replace or regenerate this frame master at higher resolution.`};if(ratio>1.25)return{level:"warn",text:`Source scale ${ratio.toFixed(2)}x. Check decorative parts for softness.`};return null;}
    function frameSlicePixels(slice,sourceW,sourceH){const data=slice||{},ratio=String(data.units||"px").toLowerCase()==="ratio",read=(key,dimension,fallback)=>{let value=Number(data[key]);if(!Number.isFinite(value))value=fallback;if(ratio)value*=dimension;return Math.max(1,Math.min(dimension/2-1,value));};return{left:read("left",sourceW,150),top:read("top",sourceH,150),right:read("right",sourceW,150),bottom:read("bottom",sourceH,150)};}
    function drawNineSliceFrameAsset(target,item,preset,asset,w,h){const sourceW=asset.naturalWidth,sourceH=asset.naturalHeight,slice=frameSlicePixels(item.frame_slice||preset.frame_slice,sourceW,sourceH),fitScale=Math.min(w/sourceW,h/sourceH),frameScale=Math.max(.1,Math.min(4,finiteOr(item.frame_scale,100)/100));let left=Math.max(1,slice.left*fitScale*frameScale),right=Math.max(1,slice.right*fitScale*frameScale),top=Math.max(1,slice.top*fitScale*frameScale),bottom=Math.max(1,slice.bottom*fitScale*frameScale);if(left+right>w){const factor=w/(left+right);left*=factor;right*=factor;}if(top+bottom>h){const factor=h/(top+bottom);top*=factor;bottom*=factor;}const middleW=Math.max(1,w-left-right),middleH=Math.max(1,h-top-bottom),drawPart=(sx,sy,sw,sh,dx,dy,dw,dh)=>{if(sw<=0||sh<=0||dw<=0||dh<=0)return;target.drawImage(asset,sx,sy,sw,sh,dx,dy,dw,dh);};drawPart(0,0,slice.left,slice.top,0,0,left,top);drawPart(slice.left,0,sourceW-slice.left-slice.right,slice.top,left,0,middleW,top);drawPart(sourceW-slice.right,0,slice.right,slice.top,w-right,0,right,top);drawPart(0,slice.top,slice.left,sourceH-slice.top-slice.bottom,0,top,left,middleH);drawPart(sourceW-slice.right,slice.top,slice.right,sourceH-slice.top-slice.bottom,w-right,top,right,middleH);drawPart(0,sourceH-slice.bottom,slice.left,slice.bottom,0,h-bottom,left,bottom);drawPart(slice.left,sourceH-slice.bottom,sourceW-slice.left-slice.right,slice.bottom,left,h-bottom,middleW,bottom);drawPart(sourceW-slice.right,sourceH-slice.bottom,slice.right,slice.bottom,w-right,h-bottom,right,bottom);}
    function drawFullOverlayFrameAsset(target,item,preset,asset,w,h){const mode=item.fit_mode||preset.fit_mode||"cover",sourceW=asset.naturalWidth,sourceH=asset.naturalHeight,frameScale=Math.max(.1,Math.min(4,finiteOr(item.frame_scale,100)/100));if(mode==="tile"){const tileW=Math.max(1,sourceW*frameScale),tileH=Math.max(1,sourceH*frameScale);for(let y=0;y<h;y+=tileH)for(let x=0;x<w;x+=tileW)target.drawImage(asset,x,y,tileW,tileH);return;}let drawW=w,drawH=h;if(mode!=="stretch"){const baseScale=(mode==="contain"?Math.min:Math.max)(w/sourceW,h/sourceH)*frameScale;drawW=sourceW*baseScale;drawH=sourceH*baseScale;}else{drawW*=frameScale;drawH*=frameScale;}target.drawImage(asset,(w-drawW)/2,(h-drawH)/2,drawW,drawH);}
    function drawAttachedFrameDecorations(target,item,preset,baseAsset,w,h){const decorations=preset.attached_decorations||[];if(!decorations.length)return;const enabled=new Set(Array.isArray(item.attached_decorations)?item.attached_decorations:decorations.map(decoration=>decoration.id)),frameScale=Math.max(.1,Math.min(4,finiteOr(item.frame_scale,100)/100)),baseScale=Math.min(w/Math.max(1,baseAsset.naturalWidth),h/Math.max(1,baseAsset.naturalHeight))*frameScale;for(const decoration of decorations){if(!enabled.has(decoration.id))continue;const asset=frameDecorationImageFor(item,preset,decoration);if(!asset?.complete||!asset.naturalWidth)continue;const scale=baseScale*Math.max(.01,finiteOr(decoration.scale,1)),drawW=asset.naturalWidth*scale,drawH=asset.naturalHeight*scale,anchorX=w*finiteOr(decoration.x_ratio,.5),anchorY=h*(1-finiteOr(decoration.bottom_ratio,0));target.drawImage(asset,anchorX-drawW/2,anchorY-drawH,drawW,drawH);}}
    function frameSurfaceCacheKey(item,preset,asset,w,h){return JSON.stringify({preset:item.frame_preset_id,mode:item.frame_mode||preset.frame_mode,w:Math.round(w),h:Math.round(h),scale:finiteOr(item.frame_scale,preset.default_scale||100),inset:finiteOr(item.frame_inset,preset.default_inset||0),border:item.border_color,borderX:item.border_width_x,borderY:item.border_width_y,inner:item.inner_stroke_color,innerWidth:item.inner_stroke_width,fit:item.fit_mode,asset:frameAssetSrcFor(item,preset)||"",assetWidth:asset?.naturalWidth||0,assetHeight:asset?.naturalHeight||0,parts:preset.frame_parts,base:preset.base_border,corners:preset.decorated_corners,items:preset.decorated_items,edges:preset.decorated_edges,fillers:preset.decorated_fillers,targets:preset.decorated_targets,adaptive:preset.decorated_adaptive_layout,layout:preset.decorated_layout,attached:item.attached_decorations,version:FRAME_ASSET_VERSION});}
        function buildFrameSurface(item,preset,asset,w,h){
      const surface=document.createElement("canvas"),surfaceW=Math.max(1,Math.ceil(w)),surfaceH=Math.max(1,Math.ceil(h)),target=surface.getContext("2d"),mode=item.frame_mode||preset.frame_mode;
      surface.width=surfaceW;surface.height=surfaceH;target.clearRect(0,0,surfaceW,surfaceH);
      if(mode==="edge-repeat"){
        if(drawEdgeRepeatFrameAsset(target,item,preset,surfaceW,surfaceH))return surface;
        if(asset?.complete&&asset.naturalWidth){drawFullOverlayFrameAsset(target,{...item,fit_mode:"contain",frame_scale:100},preset,asset,surfaceW,surfaceH);return surface;}
        return surface;
      }
      if(mode==="decorated-border"){
        drawDecoratedBorderFrameAsset(target,item,preset,surfaceW,surfaceH);
        return surface;
      }
      if(asset?.complete&&asset.naturalWidth){
        if(mode==="full-overlay")drawFullOverlayFrameAsset(target,item,preset,asset,surfaceW,surfaceH);else drawNineSliceFrameAsset(target,item,preset,asset,surfaceW,surfaceH);
        if(mode==="composite-frame")drawAttachedFrameDecorations(target,item,preset,asset,surfaceW,surfaceH);
        return surface;
      }
      const legacyBorder=finiteOr(item.border_width,36),borderX=Math.max(0,Math.min(finiteOr(item.border_width_x,legacyBorder),surfaceW/2)),borderY=Math.max(0,Math.min(finiteOr(item.border_width_y,legacyBorder),surfaceH/2)),innerWidth=Math.max(0,finiteOr(item.inner_stroke_width,0)),innerW=Math.max(0,surfaceW-borderX*2),innerH=Math.max(0,surfaceH-borderY*2);
      target.fillStyle=item.border_color||"#ffffff";target.beginPath();addRoundedRectPath(target,0,0,surfaceW,surfaceH,0);if(innerW>0&&innerH>0)addRoundedRectPath(target,borderX,borderY,innerW,innerH,0);target.fill("evenodd");
      if(innerWidth>0&&innerW>innerWidth&&innerH>innerWidth){const insetX=borderX+innerWidth/2,insetY=borderY+innerWidth/2;target.strokeStyle=item.inner_stroke_color||"#111111";target.lineWidth=innerWidth;target.beginPath();addRoundedRectPath(target,insetX,insetY,surfaceW-insetX*2,surfaceH-insetY*2,0);target.stroke();}
      return surface;
    }
        function frameSurface(item,preset,asset,w,h){const key=frameSurfaceCacheKey(item,preset,asset,w,h),cached=lruGet(frameSurfaceCache,key);if(cached)return cached.surface;const surface=buildFrameSurface(item,preset,asset,w,h),source=frameAssetSrcFor(item,preset)||"";frameSurfaceKeys.set(surface,key);lruSet(frameSurfaceCache,key,{surface,source},MAX_FRAME_SURFACE_CACHE);return surface;}
    function tintedFrameSurface(surface,color,effectType="tint"){const sourceKey=frameSurfaceKeys.get(surface)||`${surface.width}x${surface.height}`,key=`${sourceKey}|${effectType}|${color||"#000000"}`,cached=lruGet(tintedFrameSurfaceCache,key);if(cached)return cached;const tinted=document.createElement("canvas"),target=tinted.getContext("2d");tinted.width=surface.width;tinted.height=surface.height;target.drawImage(surface,0,0);target.globalCompositeOperation="source-in";target.fillStyle=color||"#000000";target.fillRect(0,0,tinted.width,tinted.height);target.globalCompositeOperation="source-over";return lruSet(tintedFrameSurfaceCache,key,tinted,MAX_TINTED_FRAME_CACHE);}
    function drawFrameEffects(surface,item,w,h){const opacity=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));if(item.glow_enabled){const tinted=tintedFrameSurface(surface,item.glow_color||"#ffffff","glow"),blur=Math.max(0,finiteOr(item.glow_blur,16)),spread=Math.max(0,finiteOr(item.glow_spread,0)),alpha=Math.max(0,Math.min(1,finiteOr(item.glow_opacity,.75)))*opacity,passes=spread>0?12:1;ctx.save();ctx.globalAlpha=alpha;ctx.filter=blur?`blur(${blur}px)`:"none";for(let index=0;index<passes;index++){const angle=passes===1?0:index*Math.PI*2/passes,dx=passes===1?0:Math.cos(angle)*spread,dy=passes===1?0:Math.sin(angle)*spread;ctx.drawImage(tinted,-w/2+dx,-h/2+dy,w,h);}ctx.restore();}if(item.shadow_enabled){const tinted=tintedFrameSurface(surface,item.shadow_color||"#000000","shadow"),blur=Math.max(0,finiteOr(item.shadow_blur,12)),dx=finiteOr(item.shadow_x,8),dy=finiteOr(item.shadow_y,8),alpha=Math.max(0,Math.min(1,finiteOr(item.shadow_opacity,.55)))*opacity;ctx.save();ctx.globalAlpha=alpha;ctx.filter=blur?`blur(${blur}px)`:"none";ctx.drawImage(tinted,-w/2+dx,-h/2+dy,w,h);ctx.restore();}}
    function drawFrame(item){syncFrameToCanvas(item);const preset=FRAME_BY_ID.get(item.frame_preset_id)||FRAME_PRESETS[0],assetPreset=item.asset_src?{asset_src:item.asset_src,asset_src_2x:item.asset_src_2x}:preset,asset=frameImageFor(assetPreset,item),x=Number(item.x)||0,y=Number(item.y)||0,w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),surface=frameSurface(item,preset,asset,w,h);ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);ctx.scale(item.flip_x?-1:1,item.flip_y?-1:1);drawFrameEffects(surface,item,w,h);ctx.globalAlpha=Math.max(0,Math.min(1,finiteOr(item.opacity,1)));ctx.filter="none";ctx.drawImage(surface,-w/2,-h/2,w,h);ctx.restore();}
    function drawEmphasisLines(item){syncEmphasisToCanvas(item);const x=Number(item.x)||0,y=Number(item.y)||0,w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),rays=validEmphasisRays(item.rays)||regenerateEmphasisRays(item);ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((Number(item.rotation)||0)*Math.PI/180);ctx.scale(item.flip_x?-1:1,item.flip_y?-1:1);ctx.translate(-w/2,-h/2);ctx.globalAlpha=emphasisClamp(item.opacity,0,1,1);ctx.fillStyle=item.color||"#000000";for(const polygon of rays){ctx.beginPath();ctx.moveTo(polygon[0][0]*w,polygon[0][1]*h);for(let index=1;index<4;index+=1)ctx.lineTo(polygon[index][0]*w,polygon[index][1]*h);ctx.closePath();ctx.fill();}ctx.restore();}
    function drawSingleImageLayer(item){const asset=singleImageAssetFor(item);if(!asset?.image?.complete||!asset.image.naturalWidth)return;const w=Math.max(1,Number(item.w)||1),h=Math.max(1,Number(item.h)||1),crop=imageCropFor(item);imageLayerRotation.drawCroppedImage(ctx,asset.image,{x:Number(item.x)||0,y:Number(item.y)||0,w,h,sourceX:asset.image.naturalWidth*crop.x,sourceY:asset.image.naturalHeight*crop.y,sourceW:Math.max(1,asset.image.naturalWidth*crop.w),sourceH:Math.max(1,asset.image.naturalHeight*crop.h)},item.rotation,{flipX:item.flip_x,flipY:item.flip_y,opacity:finiteOr(item.opacity,1)});}
    function drawElementBody(item){if(item.type==="image")drawSingleImageLayer(item);else if(item.type==="text")drawText(item);else if(item.type==="sfx")drawSfx(item);else if(item.type==="bubble")drawShape(item);else if(item.type==="emphasis_lines")drawEmphasisLines(item);else if(item.type==="frame")drawFrame(item);}
    function elementClipShape(item){
      if(generalComicEditor?.isActive()&&item?.general_comic_scope==="panel")return generalComicEditor.panelShape?.(item.general_comic_panel_id)||null;
      if(!comicEditor?.isActive())return null;
      const rect=item.type==="emphasis_lines"?comicEditor.emphasisClipRect?.(item):comicEditor.assetClipRect?.(item);
      return rect?{kind:"rect",...rect}:null;
    }
    function traceClipShape(target,shape){if(shape.kind==="rect"){target.rect(shape.x,shape.y,shape.w,shape.h);return;}const points=Array.isArray(shape.points)?shape.points:[];if(points.length<3)return;target.moveTo(points[0].x,points[0].y);for(const point of points.slice(1))target.lineTo(point.x,point.y);target.closePath();}
    function pointInClipShape(point,shape){if(!shape)return true;if(shape.kind==="rect")return point.x>=shape.x&&point.x<=shape.x+shape.w&&point.y>=shape.y&&point.y<=shape.y+shape.h;const points=Array.isArray(shape.points)?shape.points:[];if(points.length<3)return false;let inside=false;for(let index=0,previous=points.length-1;index<points.length;previous=index++){const a=points[index],b=points[previous],crosses=(a.y>point.y)!==(b.y>point.y)&&point.x<(b.x-a.x)*(point.y-a.y)/((b.y-a.y)||Number.EPSILON)+a.x;if(crosses)inside=!inside;}return inside;}
    function drawElement(item){
      if(item.visible===false||(comicOverlayExport&&item.type==="image"))return;
      const structuralEditor=activeStructuralEditor();if(structuralEditor?.shouldSkipPanelScopedItem?.(item))return;
      const clip=elementClipShape(item);
      if(clip){ctx.save();ctx.beginPath();traceClipShape(ctx,clip);ctx.clip();drawElementBody(item);ctx.restore();}
      else drawElementBody(item);
    }
    function presetLabel(item){return item?.user_preset_name||PRESET_BY_ID.get(item?.preset_id)?.label||String(item?.shape||"Bubble").replaceAll("_"," ");}
    function shapeTuningForItem(item){return SHAPE_TUNING[PRESET_BY_ID.get(item?.preset_id)?.path]||null;}
    function regenerateTunablePath(item){const preset=PRESET_BY_ID.get(item?.preset_id),tuning=SHAPE_TUNING[preset?.path];if(!preset||!tuning)return false;normalizeShapeSettings(item,tuning);item.path_points=presetPath(preset.path,shapeOptions(item,tuning));state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;return true;}
    function applyPresetToItem(item,presetId){const preset=PRESET_BY_ID.get(REMOVED_PRESET_ALIAS[presetId]||presetId),tuning=SHAPE_TUNING[preset?.path];if(!item||!preset)return;if(isDialoguePreset(preset)){item.preset_id=preset.id;item.w=finiteOr(preset.w,item.w||900);item.h=finiteOr(preset.h,item.h||220);applyDialoguePresetDefaults(item,preset,true);state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;return;}item.preset_id=preset.id;item.shape=preset.shape;item.tail=preset.tail||"none";item.extra_tails=[...(preset.extra_tails||[])];item.tail_style=preset.tail_style||"pointed";item.stroke_style=preset.stroke_style||"solid";item.decoration_style=preset.decoration_style||"none";if(Number.isFinite(Number(preset.stroke_width)))item.stroke_width=Number(preset.stroke_width);Object.assign(item,defaultShapeSettings(tuning));item.jagged_intensity=item.shape_intensity;item.jagged_seed=item.shape_seed;item.path_points=presetPath(preset.path,shapeOptions(item,tuning));delete item.tail_tip_x;delete item.tail_tip_y;delete item.tail_side;state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;}
    function dialoguePreviewImageFor(preset){const src=String(preset?.preview_src||"");if(!src)return null;if(!bubblePreviewImageCache.has(src)){const image=new Image();image.onload=()=>{document.querySelectorAll(".shape-card").forEach(card=>{if(card.dataset.preset!==preset.id)return;const preview=card.querySelector("canvas");if(preview)drawPresetThumbnail(preview,preset);});};image.onerror=()=>console.warn(`Speech Bubble dialogue preview could not be loaded: ${src}`);image.src=new URL(src,location.href).href;bubblePreviewImageCache.set(src,image);}return bubblePreviewImageCache.get(src);}
    function drawPresetThumbnail(canvasElement,preset){if(isDialoguePreset(preset)){const scale=2,w=68*scale,h=40*scale,target=canvasElement.getContext("2d");canvasElement.width=w;canvasElement.height=h;target.clearRect(0,0,w,h);const preview=dialoguePreviewImageFor(preset);if(preview?.complete&&preview.naturalWidth){const ratio=Math.min(w/preview.naturalWidth,h/preview.naturalHeight),drawW=preview.naturalWidth*ratio,drawH=preview.naturalHeight*ratio;target.drawImage(preview,(w-drawW)/2,(h-drawH)/2,drawW,drawH);}else{const item={dialogue_style:preset.dialogue_style,w:finiteOr(preset.w,900),h:finiteOr(preset.h,220),dialogue_outer_color:dialogueSettings(preset).outerColor,dialogue_border_color:dialogueSettings(preset).borderColor,dialogue_fill_color:dialogueSettings(preset).fillColor,dialogue_outer_edge:dialogueSettings(preset).outerEdge,dialogue_border_width:dialogueSettings(preset).borderWidth,dialogue_corner_radius:dialogueSettings(preset).cornerRadius};const ratio=Math.min(w/item.w,h/item.h),drawW=item.w*ratio,drawH=item.h*ratio;target.save();target.translate((w-drawW)/2,(h-drawH)/2);drawDialoguePanel(target,item,preset,drawW,drawH);target.restore();}return;}const target=canvasElement.getContext("2d"),scale=2,maxW=50*scale,maxH=29*scale,ratio=Math.max(.2,Math.min(5,finiteOr(preset.w,50)/finiteOr(preset.h,29))),w=ratio>maxW/maxH?maxW:maxH*ratio,h=ratio>maxW/maxH?maxW/ratio:maxH,x=(68*scale-w)/2,y=(40*scale-h)/2,item={shape:preset.shape,path_points:Array.isArray(preset.path_points)?clonePath(preset.path_points):presetPath(preset.path),tail:preset.tail||"none",extra_tails:[...(preset.extra_tails||[])],tail_style:preset.tail_style||"pointed",stroke_style:preset.stroke_style==="double"?"double":"solid",decoration_style:preset.decoration_style||"none",stroke_width:(preset.stroke_width??1.5)*scale,shape_seed:1,fill:"#fff",stroke:"#111"},tailSets=allTailGeometries(item,w,h),circles=item.tail_style==="dots"?thoughtTailCircles(item,w,h):[];canvasElement.width=68*scale;canvasElement.height=40*scale;target.save();target.translate(x,y);target.fillStyle="#fff";target.strokeStyle="#111";target.lineWidth=1.6*scale;target.lineJoin="round";traceBubbleBody(target,item,w,h);target.fill();if(item.stroke_style==="double"){target.lineWidth=3.4*scale;target.stroke();target.strokeStyle="#fff";target.lineWidth=1.6*scale;target.stroke();target.strokeStyle="#111";target.lineWidth=.7*scale;target.stroke();}else target.stroke();for(const points of tailSets){target.beginPath();target.moveTo(...points[0]);target.lineTo(...points[2]);target.lineTo(...points[1]);target.fill();target.beginPath();target.moveTo(...points[0]);target.lineTo(...points[2]);target.lineTo(...points[1]);target.stroke();}for(const circle of circles){target.beginPath();target.arc(circle.x,circle.y,circle.r,0,Math.PI*2);target.fill();target.stroke();}drawBubbleDecoration(target,item,w,h);target.restore();}
    const PRESET_USAGE_KEY="speech_bubble:preset_usage:v1";
    const SFX_USAGE_KEY="speech_bubble:sfx_usage:v1";
    function presetUsage(){try{return JSON.parse(localStorage.getItem(PRESET_USAGE_KEY)||"{}")||{};}catch{return{};}}
    function sfxUsage(){try{return JSON.parse(localStorage.getItem(SFX_USAGE_KEY)||"{}")||{};}catch{return{};}}
    function assetFavorites(){try{const value=JSON.parse(localStorage.getItem(ASSET_FAVORITES_KEY)||"[]");return Array.isArray(value)?value.filter(item=>typeof item==="string"):[];}catch{return[];}}
    function saveAssetFavorites(values){try{localStorage.setItem(ASSET_FAVORITES_KEY,JSON.stringify([...new Set(values)]));}catch{}}
    function assetFavoriteKey(type,id){return `${type}:${id}`;}
    function isAssetFavorite(type,id){return assetFavorites().includes(assetFavoriteKey(type,id));}
    function favoriteAssets(type,presets,defaults=[]){const byId=new Map(presets.filter(Boolean).map(preset=>[preset.id,preset])),ids=assetFavorites().filter(key=>key.startsWith(`${type}:`)).map(key=>key.slice(type.length+1)),favorites=ids.map(id=>byId.get(id)).filter(Boolean);return favorites.length?favorites.slice(0,2):defaults.map(id=>byId.get(id)).filter(Boolean).slice(0,2);}
    function updateFavoriteMarker(marker){const type=marker.dataset.favoriteType,id=marker.dataset.favoriteId,active=isAssetFavorite(type,id);marker.textContent=active?"★":"☆";marker.classList.toggle("is-favorite",active);marker.title=active?"Remove from favorites":"Add to favorites";marker.setAttribute("aria-label",active?`Remove ${id} from favorites`:`Add ${id} to favorites`);marker.setAttribute("aria-pressed",String(active));}
    function syncFavoriteMarkers(){document.querySelectorAll(".asset-favorite").forEach(updateFavoriteMarker);}
    function makeFavoriteMarker(type,id){const marker=document.createElement("span");marker.className="asset-favorite";marker.dataset.favoriteType=type;marker.dataset.favoriteId=id;marker.setAttribute("role","button");marker.tabIndex=0;marker.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();toggleAssetFavorite(type,id);});marker.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();event.stopPropagation();toggleAssetFavorite(type,id);}});updateFavoriteMarker(marker);return marker;}
    function toggleAssetFavorite(type,id){const key=assetFavoriteKey(type,id),values=assetFavorites(),index=values.indexOf(key);if(index>=0)values.splice(index,1);else values.unshift(key);saveAssetFavorites(values);refreshQuickAssetViews();syncFavoriteMarkers();}
    function refreshQuickAssetViews(){refreshQuickPresets();refreshQuickSfx();refreshQuickFrames();refreshQuickEmphasisLines();}
    function refreshQuickPresets(){const quick=document.getElementById("quickShapes");if(!quick)return;quick.replaceChildren(...favoriteAssets("bubble",BUBBLE_PRESETS,["base-oval","base-box"]).map(makePresetCard));}
    function recordPresetUse(presetId){const usage=presetUsage();usage[presetId]=(usage[presetId]||0)+1;try{localStorage.setItem(PRESET_USAGE_KEY,JSON.stringify(usage));}catch{}}
    const EDITOR_DRAG_TYPE="application/x-speech-bubble-editor-item";
    function placeInsertedItem(item,point=null){const center=point||{x:state.width/2,y:state.height/2};item.x=Math.round(center.x-item.w/2);item.y=Math.round(center.y-item.h/2);}
    function selectedComicLayerTarget(){
      const editor=activeStructuralEditor(),selected=state.elements.find(item=>item.id===state.selected);if(!editor)return null;
      if(generalComicEditor?.isActive()&&selected?.general_comic_scope==="panel"&&selected.general_comic_panel_id)return generalComicEditor.panelInsertionTarget?.(selected.general_comic_panel_id)||{scope:"panel",panelId:selected.general_comic_panel_id};
      if(comicEditor?.isActive()&&selected?.comic_scope==="panel"&&selected.comic_panel_id)return comicEditor.panelInsertionTarget?.(selected.comic_panel_id)||{scope:"panel",panelId:selected.comic_panel_id};
      return editor.selectedInsertionTarget?.()||null;
    }
    function bubbleComicTarget(){const editor=activeStructuralEditor();return selectedComicLayerTarget()||editor?.defaultPanelInsertionTarget?.()||null;}
    function applyComicPanelTarget(item,target,point=null){
      const editor=activeStructuralEditor();if(!editor)return false;
      if(target?.scope!=="panel"){if(generalComicEditor?.isActive())generalComicEditor.assignElementTarget?.(item,{scope:"page"});return false;}
      const resolved=target.rect?target:editor.panelInsertionTarget?.(target.panelId),rect=resolved?.rect||null;
      if(generalComicEditor?.isActive())generalComicEditor.assignElementTarget?.(item,{scope:"panel",panelId:target.panelId});
      else{item.comic_scope="panel";item.comic_panel_id=target.panelId;item.comic_stack="above_image";}
      if(rect){
        const scale=Math.min(1,(rect.w*.78)/Math.max(1,item.w),(rect.h*.72)/Math.max(1,item.h));
        if(scale<1){item.w=Math.max(1,Math.round(item.w*scale));item.h=Math.max(1,Math.round(item.h*scale));}
        const center=point&&point.x>=rect.x&&point.x<=rect.x+rect.w&&point.y>=rect.y&&point.y<=rect.y+rect.h?point:{x:rect.x+rect.w/2,y:rect.y+rect.h/2};
        placeInsertedItem(item,center);
        item.x=Math.round(Math.max(rect.x,Math.min(rect.x+rect.w-item.w,item.x)));
        item.y=Math.round(Math.max(rect.y,Math.min(rect.y+rect.h-item.h,item.y)));
      }else placeInsertedItem(item,point);
      return true;
    }
    function syncInsertTargetStatus(){
      const status=document.getElementById("comicInsertTargetStatus");if(!status)return;
      const editor=activeStructuralEditor();status.hidden=!editor;if(status.hidden)return;
      const target=selectedComicLayerTarget()||editor.defaultPanelInsertionTarget?.();
      status.textContent=target?.scope==="panel"?uiText(`追加先：コマ${Math.max(1,(Number(target.panelIndex)||0)+1)}`,`Insert into: Panel ${Math.max(1,(Number(target.panelIndex)||0)+1)}`):uiText("追加先：ページ全体","Insert into: Page");
    }
    function enablePresetDrag(element,payload){element.draggable=true;element.addEventListener("dragstart",event=>{event.dataTransfer.effectAllowed="copy";event.dataTransfer.setData(EDITOR_DRAG_TYPE,JSON.stringify(payload));});}
    function insertBubbleBelowText(item){const firstTextIndex=state.elements.findIndex(layer=>layer.type==="text");if(firstTextIndex<0)state.elements.push(item);else state.elements.splice(firstTextIndex,0,item);}
    function insertPreset(presetId,point=null){pushUndo();const item=defaultBubble(presetId),target=activeStructuralEditor()?bubbleComicTarget():null;if(!applyComicPanelTarget(item,target,point)){placeInsertedItem(item,point);insertBubbleBelowText(item);}else state.elements.push(item);recordPresetUse(presetId);setSelection([item.id],item.id);syncProperties();render();}
    function makePresetCard(preset){const button=document.createElement("button"),preview=document.createElement("canvas"),name=document.createElement("span"),awaitingShapeAsset=!bubbleShapeAssetsReady&&["base-thought","base-heart"].includes(preset.id);button.type="button";button.className="shape-card";button.dataset.preset=preset.id;button.dataset.category=preset.category;button.dataset.search=`${preset.label} ${preset.keywords||""}`.toLowerCase();button.disabled=awaitingShapeAsset;button.title=awaitingShapeAsset?`${preset.label} — ${uiText("素材を読み込み中","Loading asset")}`:`${preset.label} — ${uiText("クリックで追加／ドラッグで配置","click to add or drag to place")}`;button.setAttribute("aria-label",button.title);name.className="shape-name";name.textContent=awaitingShapeAsset?`${preset.label}…`:preset.label;button.append(preview,name,makeFavoriteMarker("bubble",preset.id));if(!awaitingShapeAsset){button.onclick=()=>insertPreset(preset.id);enablePresetDrag(button,{kind:"bubble",id:preset.id});}drawPresetThumbnail(preview,preset);return button;}
    function drawFrameThumbnail(canvasElement,preset){const scale=2,w=68*scale,h=40*scale,target=canvasElement.getContext("2d");canvasElement.width=w;canvasElement.height=h;target.clearRect(0,0,w,h);if(preset.preview_src){const preview=cachedFrameImage(preset.preview_src);if(preview?.complete&&preview.naturalWidth){const ratio=Math.min(w/preview.naturalWidth,h/preview.naturalHeight),drawW=preview.naturalWidth*ratio,drawH=preview.naturalHeight*ratio;target.drawImage(preview,(w-drawW)/2,(h-drawH)/2,drawW,drawH);}return;}if(preset.asset_src||preset.frame_mode==="edge-repeat"||preset.frame_mode==="decorated-border"){const item={frame_scale:finiteOr(preset.default_scale,100),w,h,frame_mode:preset.frame_mode,frame_slice:preset.frame_slice,attached_decorations:(preset.attached_decorations||[]).map(decoration=>decoration.id)},asset=frameImageFor(preset,item);target.drawImage(frameSurface(item,preset,asset,w,h),0,0,w,h);return;}const border=Math.max(3,(Number(preset.border_width)||24)/10*scale),inner=Math.max(0,(Number(preset.inner_stroke_width)||0)/2*scale);target.fillStyle=preset.border_color||"#fff";target.beginPath();addRoundedRectPath(target,3*scale,3*scale,w-6*scale,h-6*scale,0);addRoundedRectPath(target,3*scale+border,3*scale+border,w-6*scale-border*2,h-6*scale-border*2,0);target.fill("evenodd");if(inner>0){target.strokeStyle=preset.inner_stroke_color||"#111";target.lineWidth=inner;target.beginPath();addRoundedRectPath(target,3*scale+border+inner/2,3*scale+border+inner/2,w-6*scale-border*2-inner,h-6*scale-border*2-inner,0);target.stroke();}}
    function makeFrameCard(preset){const button=document.createElement("button"),preview=document.createElement("canvas"),name=document.createElement("span");button.type="button";button.className="shape-card";button.dataset.frame=preset.id;button.dataset.category=preset.category;button.dataset.search=`${preset.label} ${preset.keywords||""}`.toLowerCase();button.title=`${preset.label} — ${uiText("クリックでキャンバスに合わせる／ドラッグで配置","click to fit the canvas or drag to place")}`;button.setAttribute("aria-label",button.title);name.className="shape-name";name.textContent=preset.label;button.append(preview,name,makeFavoriteMarker("frame",preset.id));button.onclick=()=>insertFrame(preset.id);enablePresetDrag(button,{kind:"frame",id:preset.id});drawFrameThumbnail(preview,preset);return button;}
    function insertFrame(presetId,point=null){pushUndo();const item=defaultFrame(presetId),editor=generalComicEditor?.isActive()?generalComicEditor:null,target=editor?(point?editor.insertionTargetAt?.(point):selectedComicLayerTarget()):null;if(target?.scope==="panel"){item.fit_to_canvas=false;applyComicPanelTarget(item,target,point);}else if(point){item.fit_to_canvas=false;item.w=Math.max(120,Math.round(state.width*.72));item.h=Math.max(120,Math.round(state.height*.72));placeInsertedItem(item,point);}else if(editor)editor.assignElementTarget?.(item,{scope:"page"});state.elements.push(item);normalizePinnedFrameOrder();setSelection([item.id],item.id);syncProperties();render();}
    function refreshQuickFrames(){const quick=document.getElementById("quickFrames");if(!quick)return;quick.replaceChildren(...favoriteAssets("frame",FRAME_PRESETS,["frame-border","black-border"]).map(makeFrameCard));}
    function drawEmphasisThumbnail(canvasElement,preset){const width=136,height=80,target=canvasElement.getContext("2d"),rays=generateNormalizedEmphasisRays({...preset,preset:preset.id,seed:1529756813},width,height);canvasElement.width=width;canvasElement.height=height;target.fillStyle="#f7f7f7";target.fillRect(0,0,width,height);target.fillStyle="#111111";for(const polygon of rays){target.beginPath();target.moveTo(polygon[0][0]*width,polygon[0][1]*height);for(let index=1;index<4;index+=1)target.lineTo(polygon[index][0]*width,polygon[index][1]*height);target.closePath();target.fill();}}
    function makeEmphasisCard(preset){const button=document.createElement("button"),preview=document.createElement("canvas"),name=document.createElement("span");button.type="button";button.className="shape-card emphasis-card";button.dataset.emphasis=preset.id;button.title=`${preset.label} — ${uiText("クリックで追加／中心位置をドラッグして配置","click to add or drag the focus point to place")}`;button.setAttribute("aria-label",button.title);name.className="shape-name";name.textContent=preset.label;button.append(preview,name,makeFavoriteMarker("emphasis",preset.id));button.onclick=()=>insertEmphasisLines(preset.id);enablePresetDrag(button,{kind:"emphasis-lines",id:preset.id});drawEmphasisThumbnail(preview,preset);return button;}
    function refreshQuickEmphasisLines(){const quick=document.getElementById("quickEmphasisLines");if(!quick)return;quick.replaceChildren(...favoriteAssets("emphasis",EMPHASIS_PRESETS,["center","wide"]).map(makeEmphasisCard));}
    function renderEmphasisBrowser(){document.getElementById("allEmphasisLines")?.replaceChildren(...EMPHASIS_PRESETS.map(makeEmphasisCard));}
    function insertEmphasisLines(presetId,point=null){
      pushUndo();
      const editor=activeStructuralEditor(),item=defaultEmphasisLines(presetId),target=editor?selectedComicLayerTarget():null,resolved=target?.scope==="panel"?(target.rect?target:editor?.panelInsertionTarget?.(target.panelId)):null,rect=resolved?.rect;
      if(rect){
        if(generalComicEditor?.isActive())generalComicEditor.assignElementTarget?.(item,{scope:"panel",panelId:resolved.panelId});else{item.comic_scope="panel";item.comic_panel_id=resolved.panelId;item.comic_stack="above_image";}item.fit_to_canvas=false;
        item.x=Math.round(rect.x);item.y=Math.round(rect.y);item.w=Math.max(1,Math.round(rect.w));item.h=Math.max(1,Math.round(rect.h));
        const focus=point&&point.x>=rect.x&&point.x<=rect.x+rect.w&&point.y>=rect.y&&point.y<=rect.y+rect.h?point:{x:rect.x+rect.w/2,y:rect.y+rect.h/2};
        item.center_x=emphasisClamp((focus.x-rect.x)/Math.max(1,rect.w),-.5,1.5,item.center_x);
        item.center_y=emphasisClamp((focus.y-rect.y)/Math.max(1,rect.h),-.5,1.5,item.center_y);
      }else{
        if(generalComicEditor?.isActive())generalComicEditor.assignElementTarget?.(item,{scope:"page"});
        if(point){item.center_x=emphasisClamp(point.x/state.width,-.5,1.5,item.center_x);item.center_y=emphasisClamp(point.y/state.height,-.5,1.5,item.center_y);}
      }
      regenerateEmphasisRays(item);state.elements.push(item);normalizePinnedFrameOrder();setSelection([item.id],item.id);syncProperties();render();
    }
    function filterFrameCards(){const query=document.getElementById("frameSearch").value.trim().toLowerCase(),category=document.getElementById("frameCategory").value;document.querySelectorAll("#allFrames [data-frame]").forEach(card=>{card.hidden=!((category==="all"||card.dataset.category===category)&&(!query||card.dataset.search.includes(query)));});}
    function renderFrameBrowser(){document.getElementById("frameDrawerTitle").textContent=`${uiText("フレーム","Frames")} (${FRAME_PRESETS.length})`;document.getElementById("frameSearch").placeholder=uiText("フレームを検索…","Search frames…");document.getElementById("allFrames").replaceChildren(...FRAME_PRESETS.map(makeFrameCard));filterFrameCards();}
    function isComicStamp(preset){return preset?.userPreset?preset.userCategory==="stamp":["symbols","effects","kawaii","corners"].includes(preset?.category);}
    const SFX_RELATED_GROUPS=[
      [10,["impact","entrance","presence","crash","breaking","crack","strike","glass","reveal","fanfare","scrape","grind"]],
      [20,["heartbeat","tension","twitch","shock","shiver","thrill","rattle","tremble","strain","nervous"]],
      [30,["speed","movement","motion","jump","bounce","vibration","slide","squeeze","soft","fluffy","gentle"]],
      [40,["wet","liquid","splash","flow","stream","spray","pouring","slurp","swallow","gulp","eating","chewing","noodles","kiss","lick","bite","touch"]],
      [50,["voice","reaction","shout","groan","speech","command","secret","agreement","refusal","question"]]
    ];
    const BASIC_SYMBOL_RELATED_ORDER=new Map([["circle",0],["triangle",1],["square",2],["trapezoid",3]]);
    function sfxRelatedKey(preset,index){if(preset.id==="don-exclamation-mask")return[-1,0,index];if(BASIC_SYMBOL_RELATED_ORDER.has(preset.symbolKind))return[5,BASIC_SYMBOL_RELATED_ORDER.get(preset.symbolKind),index];const explicitGroup=Number(preset.sortGroup),explicitRank=Number(preset.sortRank),search=`${preset.label} ${preset.keywords||""}`.toLowerCase(),matched=SFX_RELATED_GROUPS.find(([,terms])=>terms.some(term=>search.includes(term))),group=Number.isFinite(explicitGroup)?explicitGroup:(matched?.[0]??60),rank=Number.isFinite(explicitRank)?explicitRank:index;return[group,rank,index];}
    function compareSfxRelated(a,b){const ak=sfxRelatedKey(a.preset,a.index),bk=sfxRelatedKey(b.preset,b.index);for(let index=0;index<ak.length;index++){const difference=ak[index]-bk[index];if(difference)return difference;}return 0;}
    const GOJUON_ORDER="あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん";
    function sfxDisplayLabel(preset){return String(preset.displayName||preset.ocrLabel||preset.label||preset.id||"").trim();}
    function sfxSortLabel(preset){return String(preset.sortKey||preset.ocrLabel||sfxDisplayLabel(preset)).trim();}
    function sfxNormalizedKey(value){return String(value||"").normalize("NFKC").replace(/[ァ-ヶ]/g,character=>String.fromCharCode(character.charCodeAt(0)-0x60)).normalize("NFD").replace(/[\u3099\u309A]/g,"").toLocaleLowerCase("ja-JP");}
    function sfxKanaSortKey(preset,index){const label=sfxSortLabel(preset),normalized=sfxNormalizedKey(label),first=normalized[0]||"",row=GOJUON_ORDER.indexOf(first),generic=/^sfx[\s_-]*\d+$/i.test(label);return[generic||!label?1:0,row<0?999:row,normalized||"zzzz",index];}
    function compareSfxKana(a,b){const ak=sfxKanaSortKey(a.preset,a.index),bk=sfxKanaSortKey(b.preset,b.index);for(let index=0;index<ak.length;index++){if(ak[index]===bk[index])continue;return typeof ak[index]==="string"?ak[index].localeCompare(bk[index],"ja"):ak[index]-bk[index];}return 0;}
    function sortedSfxPresets(presets){const indexed=presets.map((preset,index)=>({preset,index}));if(sfxSortMode==="usage"){const usage=sfxUsage();indexed.sort((a,b)=>(usage[b.preset.id]||0)-(usage[a.preset.id]||0)||compareSfxKana(a,b));}else if(sfxSortMode==="name")indexed.sort((a,b)=>sfxDisplayLabel(a.preset).localeCompare(sfxDisplayLabel(b.preset),"ja"));else indexed.sort(compareSfxRelated);return indexed.map(entry=>entry.preset);}
    function sfxPresetsForMode(mode){return SFX_PRESETS.filter(preset=>!preset.hidden&&(mode==="stamps"?isComicStamp(preset):!isComicStamp(preset)));}
    function refreshQuickSfx(){for(const [mode,elementId,type,defaults] of [["sfx","quickSfx","sfx",["don-exclamation-mask","ban-mask"]],["stamps","quickStamps","stamp",["arrow-thick-right-mask","sparkle-cluster-mask"]]]){const quick=document.getElementById(elementId);if(!quick)continue;quick.replaceChildren(...favoriteAssets(type,sfxPresetsForMode(mode),defaults).map(makeSfxCard));}}
    function recordSfxUse(presetId){const usage=sfxUsage();usage[presetId]=(usage[presetId]||0)+1;try{localStorage.setItem(SFX_USAGE_KEY,JSON.stringify(usage));}catch{}}
    function insertSfx(presetId,point=null){pushUndo();const editor=activeStructuralEditor(),item=defaultSfx(presetId),target=editor?(point?editor.insertionTargetAt?.(point):selectedComicLayerTarget()):null;if(!applyComicPanelTarget(item,target,point))placeInsertedItem(item,point);state.elements.push(item);recordSfxUse(presetId);setSelection([item.id],item.id);syncProperties();render();}
    function tintedSfxCardSurface(surface,color){const tinted=document.createElement("canvas"),target=tinted.getContext("2d");tinted.width=surface.width;tinted.height=surface.height;target.drawImage(surface,0,0);target.globalCompositeOperation="source-in";target.fillStyle=color;target.fillRect(0,0,tinted.width,tinted.height);target.globalCompositeOperation="source-over";return tinted;}
    function sfxCardPreviewLayout(style,canvasW=152,canvasH=120){
      const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback,
        width=Math.max(1,number(style?.width,360)),height=Math.max(1,number(style?.height,360)),
        outline=Math.max(0,number(style?.stroke_width,0)),
        effectPadding=Math.max(4,outline*2,style?.shadow_enabled?Math.max(Math.abs(number(style.shadow_x)),Math.abs(number(style.shadow_y)))+Math.max(0,number(style.shadow_blur))*2:0,style?.glow_enabled?Math.max(0,number(style.glow_spread))+Math.max(0,number(style.glow_blur))*3:0),
        scale=Math.max(.001,Math.min((canvasW-12)/(width+effectPadding*2),(canvasH-12)/(height+effectPadding*2))),
        drawWidth=width*scale,drawHeight=height*scale;
      return{scale,outline,effectPadding,width:drawWidth,height:drawHeight,x:(canvasW-drawWidth)/2,y:(canvasH-drawHeight)/2};
    }
    function drawSfxCardPreview(canvasElement,preset){
      const target=canvasElement.getContext("2d"),asset=new Image(),canvasW=152,canvasH=120;
      canvasElement.width=canvasW;canvasElement.height=canvasH;
      canvasElement.dataset.thumbnailState="loading";
      asset.onload=()=>{
        canvasElement.dataset.thumbnailState="ready";
        const probe=document.createElement("canvas"),probeSize=128;
        probe.width=probeSize;probe.height=probeSize;
        let left=0,top=0,right=probeSize-1,bottom=probeSize-1,hasContent=false;
        try{
          const probeTarget=probe.getContext("2d",{willReadFrequently:true});
          probeTarget.drawImage(asset,0,0,probeSize,probeSize);
          const pixels=probeTarget.getImageData(0,0,probeSize,probeSize).data;
          left=probeSize;top=probeSize;right=-1;bottom=-1;
          for(let y=0;y<probeSize;y++)for(let x=0;x<probeSize;x++)if(pixels[(y*probeSize+x)*4+3]>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
          hasContent=right>=left&&bottom>=top;
        }catch(error){
          console.debug("Thumbnail alpha crop unavailable; using the complete image",error);
          left=0;top=0;right=probeSize-1;bottom=probeSize-1;
        }
        const pad=2,
          sx=hasContent?Math.max(0,(left-pad)/probeSize*asset.naturalWidth):0,
          sy=hasContent?Math.max(0,(top-pad)/probeSize*asset.naturalHeight):0,
          sr=hasContent?Math.min(probeSize,right+1+pad)/probeSize*asset.naturalWidth:asset.naturalWidth,
          sb=hasContent?Math.min(probeSize,bottom+1+pad)/probeSize*asset.naturalHeight:asset.naturalHeight,
          sw=Math.max(1,sr-sx),sh=Math.max(1,sb-sy),
          style=preset.userPreset?(preset.styleDefaults||normalizeUserAssetStyle({},preset.w,preset.h)):null,
          ratio=sw/sh,basicMaxW=136,basicMaxH=104,
          layout=style?sfxCardPreviewLayout(style,canvasW,canvasH):{scale:1,outline:0,width:ratio>basicMaxW/basicMaxH?basicMaxW:basicMaxH*ratio,height:ratio>basicMaxW/basicMaxH?basicMaxW/ratio:basicMaxH},
          outline=layout.outline,effectScale=layout.scale,
          w=layout.width,h=layout.height,x=layout.x??(canvasW-w)/2,y=layout.y??(canvasH-h)/2,
          surface=document.createElement("canvas"),surfaceTarget=surface.getContext("2d");
        surface.width=canvasW;surface.height=canvasH;
        surfaceTarget.drawImage(asset,sx,sy,sw,sh,x,y,w,h);
        target.clearRect(0,0,canvasW,canvasH);
        if(style){
          const painted=style.mask_mode?tintedSfxCardSurface(surface,style.fill):surface,
            outlined=outline>0?tintedSfxCardSurface(surface,style.stroke):null;
          if(style.glow_enabled){const glow=tintedSfxCardSurface(painted,style.glow_color),glowSpread=style.glow_spread*effectScale,glowBlur=style.glow_blur*effectScale,passes=glowSpread>0?12:1;target.save();target.globalAlpha=style.opacity*style.glow_opacity;target.filter=glowBlur?`blur(${glowBlur}px)`:"none";for(let index=0;index<passes;index++){const angle=passes===1?0:index*Math.PI*2/passes;target.drawImage(glow,passes===1?0:Math.cos(angle)*glowSpread,passes===1?0:Math.sin(angle)*glowSpread);}target.restore();}
          target.save();target.globalAlpha=style.opacity;
          if(style.shadow_enabled){target.save();target.shadowColor=style.shadow_color;target.shadowOffsetX=style.shadow_x*effectScale;target.shadowOffsetY=style.shadow_y*effectScale;target.shadowBlur=style.shadow_blur*effectScale;target.drawImage(painted,0,0);target.restore();}
          if(outlined){const scaledOutline=outline*effectScale,steps=Math.max(16,Math.min(96,Math.ceil(scaledOutline*5)));for(let index=0;index<steps;index++){const angle=index/steps*Math.PI*2;target.drawImage(outlined,Math.cos(angle)*scaledOutline,Math.sin(angle)*scaledOutline);}}
          target.drawImage(painted,0,0);target.restore();
        }else{
          target.drawImage(surface,0,0);
          if(preset.mask){target.globalCompositeOperation="source-in";target.fillStyle=sfxPresetFill(preset);target.fillRect(0,0,canvasW,canvasH);target.globalCompositeOperation="source-over";}
        }
      };
      asset.onerror=()=>{canvasElement.dataset.thumbnailState="failed";target.clearRect(0,0,canvasW,canvasH);target.fillStyle="#8f9aaa";target.font="12px sans-serif";target.textAlign="center";target.textBaseline="middle";target.fillText("サムネイル読込失敗",canvasW/2,canvasH/2);canvasElement.closest(".sfx-card")?.classList.add("thumbnail-failed");};
      asset.decoding="async";
      asset.src=new URL(versionedSfxSrc(preset.thumbnailSrc||preset.src),location.href).href;
    }
    function makeSfxCard(preset){const button=document.createElement("button"),preview=document.createElement("canvas"),name=document.createElement("span"),favoriteType=isComicStamp(preset)?"stamp":"sfx";button.type="button";button.className=`shape-card sfx-card${preset.userPreset?" user-sfx-card":""}`;button.dataset.sfx=preset.id;button.dataset.category=preset.userPreset?"user":preset.category;button.dataset.search=`${sfxDisplayLabel(preset)} ${preset.keywords||""}`.toLowerCase();button.title=`${sfxDisplayLabel(preset)} — ${uiText("クリックで追加／ドラッグで配置","click to add or drag to place")}`;button.setAttribute("aria-label",button.title);name.className="shape-name";name.textContent=sfxDisplayLabel(preset);button.append(preview,name,makeFavoriteMarker(favoriteType,preset.id));button.onclick=()=>insertSfx(preset.id);enablePresetDrag(button,{kind:"sfx",id:preset.id});drawSfxCardPreview(preview,preset);return button;}
    function storedSfxSectionState(){try{const value=JSON.parse(localStorage.getItem(SFX_SECTION_STATE_KEY)||"{}");return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}catch{return{};}}
    function sfxSectionStateKey(user){return `${sfxBrowseMode}:${user?"user":"builtin"}`;}
    function savedSfxSectionOpen(user,fallback=true){const state=storedSfxSectionState(),key=sfxSectionStateKey(user);return key in state?state[key]!==false:fallback;}
    function saveSfxSectionOpen(user,open){try{const state=storedSfxSectionState();state[sfxSectionStateKey(user)]=open===true;localStorage.setItem(SFX_SECTION_STATE_KEY,JSON.stringify(state));}catch{}}
    function makeSfxLibrarySection(label,presets,{open=true,user=false}={}){const section=document.createElement("details"),summary=document.createElement("summary"),count=document.createElement("small"),grid=document.createElement("div");section.className="sfx-library-section";section.dataset.sfxSection=user?"user":"builtin";section.open=savedSfxSectionOpen(user,open);summary.append(document.createTextNode(label),count);count.textContent=`${presets.length}`;grid.className="palette";if(presets.length)grid.append(...presets.map(makeSfxCard));else{const empty=document.createElement("div");empty.className="sfx-library-empty";empty.textContent=user?uiText("Forge設定でPNG / WebPを登録できます。","Register PNG / WebP files in Forge Settings."):uiText("素材がありません。","No assets available.");grid.append(empty);}section.addEventListener("toggle",()=>saveSfxSectionOpen(user,section.open));section.append(summary,grid);return section;}
    function renderSfxDrawer(){const presets=sortedSfxPresets(sfxPresetsForMode(sfxBrowseMode)),userPresets=presets.filter(preset=>preset.userPreset),builtinPresets=presets.filter(preset=>!preset.userPreset),stamps=sfxBrowseMode==="stamps",category=document.getElementById("sfxCategory"),search=document.getElementById("sfxSearch"),sort=document.getElementById("sfxSort"),all=document.getElementById("allSfx"),previousUserOpen=all.querySelector('[data-sfx-section="user"]')?.open!==false,previousBuiltinOpen=all.querySelector('[data-sfx-section="builtin"]')?.open!==false;document.getElementById("sfxDrawerTitle").textContent=`${stamps?uiText("コミックスタンプ / シンボル","Comic Stamps / Symbols"):uiText("オノマトペ / SFX","Onomatopoeia / SFX")} (${presets.length})`;search.placeholder=stamps?uiText("コミックスタンプを検索…","Search comic stamps…"):uiText("オノマトペを検索…","Search onomatopoeia…");category.innerHTML=stamps?`<option value="all">${uiText("すべてのスタンプ分類","All stamp categories")}</option><option value="user">${uiText("マイプリセット","My Presets")}</option><option value="kawaii">${uiText("かわいい装飾","Kawaii Decorations")}</option><option value="corners">${uiText("コーナー装飾","Corner Decorations")}</option><option value="symbols">${uiText("シンボル","Symbols")}</option><option value="effects">${uiText("エフェクト","Effects")}</option>`:`<option value="all">${uiText("すべてのSFX","All SFX")}</option><option value="user">${uiText("マイプリセット","My Presets")}</option><option value="builtin">${uiText("内蔵","Built-in")}</option>`;sort.options[0].textContent=uiText("おすすめ・関連順","Recommended / Related");sort.options[1].textContent=uiText("使用回数順","Most Used");sort.options[2].textContent=uiText("名前順","Name");sort.value=sfxSortMode;all.classList.add("sfx-library");all.replaceChildren(makeSfxLibrarySection(uiText("マイプリセット","My Presets"),userPresets,{open:previousUserOpen,user:true}),makeSfxLibrarySection(uiText("内蔵","Built-in"),builtinPresets,{open:previousBuiltinOpen}));filterSfxCards();}
    function renderSfxBrowser(){refreshQuickSfx();renderSfxDrawer();}
    function closePresetDrawers(){document.getElementById("shapeDrawer").classList.remove("open");document.getElementById("sfxDrawer").classList.remove("open");document.getElementById("frameDrawer").classList.remove("open");document.getElementById("emphasisDrawer").classList.remove("open");}
    function openSfxBrowser(mode){sfxBrowseMode=mode;document.getElementById("shapeDrawer").classList.remove("open");document.getElementById("frameDrawer").classList.remove("open");document.getElementById("emphasisDrawer").classList.remove("open");document.getElementById("sfxSearch").value="";renderSfxDrawer();const drawer=document.getElementById("sfxDrawer");restoreDrawerWidth(drawer);drawer.classList.add("open");document.getElementById("sfxSearch").focus();}
    function openFrameBrowser(){document.getElementById("shapeDrawer").classList.remove("open");document.getElementById("sfxDrawer").classList.remove("open");document.getElementById("emphasisDrawer").classList.remove("open");document.getElementById("frameSearch").value="";renderFrameBrowser();const drawer=document.getElementById("frameDrawer");restoreDrawerWidth(drawer);drawer.classList.add("open");document.getElementById("frameSearch").focus();}
    function filterSfxCards(){const query=document.getElementById("sfxSearch").value.trim().toLowerCase(),category=document.getElementById("sfxCategory").value;document.querySelectorAll("#allSfx [data-sfx]").forEach(button=>{const categoryMatches=category==="all"||button.dataset.category===category||(category==="builtin"&&button.dataset.category!=="user");button.style.display=(!query||button.dataset.search.includes(query))&&categoryMatches?"":"none";});document.querySelectorAll("#allSfx [data-sfx-section]").forEach(section=>{const cards=[...section.querySelectorAll("[data-sfx]")],visible=cards.some(card=>card.style.display!=="none"),isUser=section.dataset.sfxSection==="user";section.hidden=(category==="user"&&!isUser)||(category!=="all"&&category!=="user"&&isUser)||(!visible&&cards.length>0);});}
    const USER_SHAPE_KEYS=["shape_intensity","shape_asymmetry","shape_seed","shape_roundness","spike_count","valley_style","valley_concavity","lobe_count","lobe_depth","shape_softness"];
    function userPresetPayload(item,name){const shapeData={shape:item.shape||"custom",path_points:clonePath(item.path_points||defaultVectorPath(item.shape))};for(const key of USER_SHAPE_KEYS)if(item[key]!==undefined)shapeData[key]=item[key];return{id:item.user_preset_id||undefined,name,base_preset_id:PRESET_BY_ID.has(item.preset_id)?item.preset_id:"base-oval",aspect_ratio:Math.max(.1,Math.min(10,(Number(item.w)||1)/(Number(item.h)||1))),shape_data:shapeData};}
    async function updateUserPresets(payload){const response=await fetch(`${apiBase}/presets`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!response.ok)throw new Error((await response.text())||`Preset request failed (${response.status})`);const result=await response.json();userPresets=Array.isArray(result.presets)?result.presets:[];renderPresetBrowser();window.dispatchEvent(new CustomEvent("speech-bubble:bubble-presets-change"));return result;}
    async function loadUserPresets(){try{const response=await fetch(`${apiBase}/presets`);if(!response.ok)throw new Error(`Preset list failed (${response.status})`);const result=await response.json();userPresets=Array.isArray(result.presets)?result.presets:[];renderPresetBrowser();}catch(error){console.warn("Speech Bubble user presets unavailable",error);}}
    async function saveSelectedUserPreset(saveAs=false){const item=state.elements.find(element=>element.id===state.selected);if(!item||item.type!=="bubble"||item.locked||state.selection.length!==1)return;const updating=Boolean(item.user_preset_id&&!saveAs),name=prompt(updating?uiText("ユーザープリセット名を変更:","Update user preset name:"):uiText("新しいユーザープリセット名:","New user preset name:"),item.user_preset_name||presetLabel(item));if(!name?.trim())return;try{const preset=userPresetPayload(item,name.trim());if(saveAs)delete preset.id;const result=await updateUserPresets({action:"upsert",preset}),saved=(preset.id&&result.presets?.find(entry=>entry.id===preset.id))||result.presets?.at(-1);if(saved){pushUndo();item.user_preset_id=saved.id;item.user_preset_name=saved.name;syncProperties();render();}}catch(error){alert(`${uiText("ユーザープリセットを保存できませんでした。","Could not save the user preset.")}\n${error.message}`);}}
    async function deleteUserPreset(presetId){const preset=userPresets.find(item=>item.id===presetId);if(!preset||!confirm(`Delete user preset “${preset.name}”?`))return;try{await updateUserPresets({action:"delete",id:presetId});}catch(error){alert(`Could not delete the user preset.\n${error.message}`);}}
    function insertUserPreset(presetId,point=null){const preset=userPresets.find(entry=>entry.id===presetId);if(!preset)return;pushUndo();const item=defaultBubble(preset.base_preset_id||"base-oval"),shapeData=preset.shape_data||{},ratio=Math.max(.1,Math.min(10,Number(preset.aspect_ratio)||item.w/item.h)),area=item.w*item.h;item.w=Math.round(Math.sqrt(area*ratio));item.h=Math.round(area/item.w);item.shape=shapeData.shape||item.shape;for(const key of USER_SHAPE_KEYS)if(shapeData[key]!==undefined)item[key]=shapeData[key];if(Array.isArray(shapeData.path_points))item.path_points=clonePath(shapeData.path_points);item.user_preset_id=preset.id;item.user_preset_name=preset.name;const target=activeStructuralEditor()?bubbleComicTarget():null;if(!applyComicPanelTarget(item,target,point))placeInsertedItem(item,point);state.elements.push(item);setSelection([item.id],item.id);document.getElementById("shapeDrawer").classList.remove("open");syncProperties();render();}
    function makeUserPresetCard(preset){const wrapper=document.createElement("div"),button=document.createElement("button"),preview=document.createElement("canvas"),name=document.createElement("span"),remove=document.createElement("button"),shapeData=preset.shape_data||{};wrapper.className="user-preset-card";wrapper.dataset.preset=preset.id;wrapper.dataset.category="user";wrapper.dataset.search=`${preset.name} user custom`.toLowerCase();button.type="button";button.className="shape-card";button.title=`${preset.name} — ${uiText("クリックで追加／ドラッグで配置","click to add or drag to place")}`;button.setAttribute("aria-label",button.title);name.className="shape-name";name.textContent=preset.name;button.append(preview,name);button.onclick=()=>insertUserPreset(preset.id);enablePresetDrag(button,{kind:"user-bubble",id:preset.id});remove.type="button";remove.className="user-preset-delete";remove.title=uiText("ユーザープリセットを削除","Delete user preset");remove.setAttribute("aria-label",remove.title);remove.textContent="×";remove.onclick=event=>{event.stopPropagation();deleteUserPreset(preset.id);};wrapper.append(button,remove);drawPresetThumbnail(preview,{shape:shapeData.shape||"custom",path_points:shapeData.path_points||defaultVectorPath("oval"),tail:"none"});return wrapper;}
    function makeBubblePresetSection(label,presets,{user=false,open=true}={}){const section=document.createElement("details"),summary=document.createElement("summary"),grid=document.createElement("div");section.id=user?"userPresetSection":"builtinPresetSection";section.className="user-preset-section";section.dataset.bubblePresetSection=user?"user":"builtin";section.open=open;summary.textContent=`${label} (${presets.length})`;grid.className="palette";if(presets.length)grid.append(...presets.map(user?makeUserPresetCard:makePresetCard));else{const empty=document.createElement("div");empty.className="sfx-library-empty";empty.textContent=uiText("Built-inを選んで編集し、Propertiesからユーザープリセットとして保存できます。","Choose a Built-in shape, edit it, then save it as a user preset from Properties.");grid.append(empty);}section.append(summary,grid);return section;}
    function renderPresetBrowser(){const all=document.getElementById("allShapes"),total=BUBBLE_PRESETS.length+userPresets.length,previousUser=document.getElementById("userPresetSection"),previousBuiltin=document.getElementById("builtinPresetSection");document.getElementById("shapeDrawerTitle").textContent=`${uiText("吹き出し","Speech Bubbles")} (${total})`;document.getElementById("shapeSearch").placeholder=uiText(`${total}件の吹き出しを検索…`,`Search ${total} speech bubbles…`);all.replaceChildren(makeBubblePresetSection(uiText("マイプリセット","My Presets"),userPresets,{user:true,open:previousUser?.open!==false}),makeBubblePresetSection(uiText("内蔵","Built-in"),BUBBLE_PRESETS,{open:previousBuiltin?.open!==false}));filterPresetCards();}
    function exportUserPresets(){const blob=new Blob([JSON.stringify({version:1,presets:userPresets},null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="speech-bubble-user-presets.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
    async function importUserPresets(file){if(!file)return;try{const data=JSON.parse(await file.text()),presets=Array.isArray(data)?data:data.presets;if(!Array.isArray(presets))throw new Error(uiText("JSONにpresets配列がありません。","The JSON file does not contain a presets array."));await updateUserPresets({action:"import",presets});}catch(error){alert(`${uiText("吹き出しプリセットを読み込めませんでした。","Could not import bubble presets.")}\n${error.message}`);}}
    async function manageBubblePreset(action,presetId,name=""){const source=userPresets.find(preset=>preset.id===presetId);if(!source)return userPresets;if(action==="delete"){await updateUserPresets({action:"delete",id:presetId});return userPresets;}const preset=structuredClone(source);if(action==="duplicate")delete preset.id;if(name.trim())preset.name=name.trim();else if(action==="duplicate")preset.name=`${preset.name} Copy`;await updateUserPresets({action:"upsert",preset});return userPresets;}
    function filterPresetCards(){const query=document.getElementById("shapeSearch").value.trim().toLowerCase(),category=document.getElementById("shapeCategory").value;document.querySelectorAll("#allShapes [data-preset]").forEach(button=>{button.style.display=(!query||button.dataset.search.includes(query))&&(category==="all"||button.dataset.category===category)?"":"none";});}
    function initializePresetUI(){const select=document.getElementById("presetSelect");refreshQuickPresets();renderPresetBrowser();select.replaceChildren(...BUBBLE_PRESETS.map(preset=>{const option=document.createElement("option");option.value=preset.id;option.textContent=preset.label;return option;}));}
    const livePreviewCanvas = document.createElement("canvas");
    const livePreviewContext = livePreviewCanvas.getContext("2d");
    let livePreviewTimer = null;
    let pendingLivePreview = null;
    let lastLivePreviewDataUrl = null;
    let lastSentPreviewRevision = -1;
    let editorCommitted = false;
    let editorClosed = false;
    function rotateAround(point,center,degrees){const angle=degrees*Math.PI/180,dx=point.x-center.x,dy=point.y-center.y;return{x:center.x+dx*Math.cos(angle)-dy*Math.sin(angle),y:center.y+dx*Math.sin(angle)+dy*Math.cos(angle)};}
    function resizedEdges(d,point,preserveAspect=false){let left=d.left,right=d.right,top=d.top,bottom=d.bottom;if(d.handle.includes("w"))left=point.x;if(d.handle.includes("e"))right=point.x;if(d.handle.includes("n"))top=point.y;if(d.handle.includes("s"))bottom=point.y;const isCorner=(d.handle.includes("w")||d.handle.includes("e"))&&(d.handle.includes("n")||d.handle.includes("s"));if(!preserveAspect||!isCorner)return{left,right,top,bottom};const anchorX=d.handle.includes("w")?d.right:d.left,anchorY=d.handle.includes("n")?d.bottom:d.top,movingX=d.handle.includes("w")?left:right,movingY=d.handle.includes("n")?top:bottom,ratio=Math.max(1,Math.abs(Number(d.originalW)||Math.abs(d.right-d.left)))/Math.max(1,Math.abs(Number(d.originalH)||Math.abs(d.bottom-d.top))),signX=movingX>=anchorX?1:-1,signY=movingY>=anchorY?1:-1;let width=Math.abs(movingX-anchorX),height=Math.abs(movingY-anchorY);if(width/Math.max(height,.0001)>ratio)height=width/ratio;else width=height*ratio;const fittedX=anchorX+signX*width,fittedY=anchorY+signY*height;if(d.handle.includes("w"))left=fittedX;else right=fittedX;if(d.handle.includes("n"))top=fittedY;else bottom=fittedY;return{left,right,top,bottom};}
    function itemCenter(item){return{x:item.x+item.w/2,y:item.y+item.h/2};}
    function itemPoint(item,x,y){return rotateAround({x,y},itemCenter(item),Number(item.rotation)||0);}
    function itemLocalPoint(item,point){return rotateAround(point,itemCenter(item),-(Number(item.rotation)||0));}
    function handlePoints(item) {
      const left=item.x, right=item.x+item.w, top=item.y, bottom=item.y+item.h, cx=item.x+item.w/2, cy=item.y+item.h/2;
      return [{name:"nw",x:left,y:top},{name:"n",x:cx,y:top},{name:"ne",x:right,y:top},{name:"e",x:right,y:cy},{name:"se",x:right,y:bottom},{name:"s",x:cx,y:bottom},{name:"sw",x:left,y:bottom},{name:"w",x:left,y:cy}].map(handle=>({name:handle.name,...itemPoint(item,handle.x,handle.y)}));
    }
    function rotationHandleGeometry(item){
      const distance=42/state.zoom,margin=10/state.zoom,candidates=[
        {side:"top",anchor:itemPoint(item,item.x+item.w/2,item.y),handle:itemPoint(item,item.x+item.w/2,item.y-distance)},
        {side:"bottom",anchor:itemPoint(item,item.x+item.w/2,item.y+item.h),handle:itemPoint(item,item.x+item.w/2,item.y+item.h+distance)},
        {side:"right",anchor:itemPoint(item,item.x+item.w,item.y+item.h/2),handle:itemPoint(item,item.x+item.w+distance,item.y+item.h/2)},
        {side:"left",anchor:itemPoint(item,item.x,item.y+item.h/2),handle:itemPoint(item,item.x-distance,item.y+item.h/2)}
      ],inside=point=>point.x>=margin&&point.x<=state.width-margin&&point.y>=margin&&point.y<=state.height-margin;
      return candidates.find(candidate=>inside(candidate.handle))||candidates.sort((a,b)=>Math.min(b.handle.x,b.handle.y,state.width-b.handle.x,state.height-b.handle.y)-Math.min(a.handle.x,a.handle.y,state.width-a.handle.x,state.height-a.handle.y))[0];
    }
    function rotationHandle(item){return rotationHandleGeometry(item).handle;}
    function findHandle(item, point) { const radius=16/state.zoom; return handlePoints(item).find(handle=>Math.abs(point.x-handle.x)<=radius&&Math.abs(point.y-handle.y)<=radius)||null; }
    function findRotationHandle(item,point){const handle=rotationHandle(item),radius=20/state.zoom;return Math.hypot(point.x-handle.x,point.y-handle.y)<=radius?handle:null;}
    function frameMoveHandle(item){return itemPoint(item,item.x+item.w/2,item.y+item.h/2);}
    function findFrameMoveHandle(item,point){if(!isFrameSelected(item))return null;const handle=frameMoveHandle(item),radius=20/state.zoom;return Math.hypot(point.x-handle.x,point.y-handle.y)<=radius?handle:null;}
    function findTailHandle(item,point){if(item.type!=="bubble"||item.tail==="none")return null;const handle=visualTailPoint(item),radius=28/state.zoom;return Math.hypot(point.x-handle.x,point.y-handle.y)<=radius?handle:null;}
    function emphasisCenterPoint(item){return localToVisual(item,emphasisClamp(item.center_x,-.5,1.5,.5),emphasisClamp(item.center_y,-.5,1.5,.5));}
    function findEmphasisCenterHandle(item,point){if(item?.type!=="emphasis_lines")return null;const handle=emphasisCenterPoint(item),radius=16/state.zoom;return Math.hypot(point.x-handle.x,point.y-handle.y)<=radius?handle:null;}
    function drawEmphasisCenterHandle(item){const point=emphasisCenterPoint(item),radius=9/state.zoom;ctx.save();ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);ctx.fillStyle="#ffd34d";ctx.fill();ctx.strokeStyle="#332600";ctx.lineWidth=2/state.zoom;ctx.stroke();ctx.beginPath();ctx.moveTo(point.x-radius*1.5,point.y);ctx.lineTo(point.x+radius*1.5,point.y);ctx.moveTo(point.x,point.y-radius*1.5);ctx.lineTo(point.x,point.y+radius*1.5);ctx.stroke();ctx.restore();}
    function vectorHandles(item){const handles=[];(item.path_points||[]).forEach((point,index)=>{handles.push({kind:"anchor",index,...localToVisual(item,point.x,point.y)});handles.push({kind:"in",index,...localToVisual(item,point.in_x??point.x,point.in_y??point.y)});handles.push({kind:"out",index,...localToVisual(item,point.out_x??point.x,point.out_y??point.y)});});return handles;}
    function findVectorHandle(item,point){const radius=12/state.zoom;return vectorHandles(item).reverse().find(handle=>Math.hypot(point.x-handle.x,point.y-handle.y)<=radius)||null;}
    function cubicPoint(a,b,c,d,t){const u=1-t;return{x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};}
    function closestVectorSegment(item,visualPoint){const local=visualToLocal(item,visualPoint),points=item.path_points||[];let best=null;for(let index=0;index<points.length;index++){const current=points[index],next=points[(index+1)%points.length],a={x:current.x,y:current.y},b={x:current.out_x??current.x,y:current.out_y??current.y},c={x:next.in_x??next.x,y:next.in_y??next.y},d={x:next.x,y:next.y};for(let step=0;step<=24;step++){const t=step/24,p=cubicPoint(a,b,c,d,t),distance=Math.hypot(p.x-local.x,p.y-local.y);if(!best||distance<best.distance)best={index,t,point:p,distance};}}return best;}
    function addVectorPointAt(item,visualPoint){const match=closestVectorSegment(item,visualPoint);if(!match)return;const points=item.path_points,current=points[match.index],next=points[(match.index+1)%points.length],p=match.point,dx=(next.x-current.x)*.08,dy=(next.y-current.y)*.08;points.splice(match.index+1,0,{x:p.x,y:p.y,in_x:p.x-dx,in_y:p.y-dy,out_x:p.x+dx,out_y:p.y+dy});state.vectorAnchorIndex=match.index+1;state.vectorAddMode=false;}
    function deleteVectorPoint(){const item=state.elements.find(element=>element.id===state.vectorEditId);if(!item||state.vectorAnchorIndex===null||item.path_points.length<=3)return;pushUndo();item.path_points.splice(state.vectorAnchorIndex,1);state.vectorAnchorIndex=Math.min(state.vectorAnchorIndex,item.path_points.length-1);syncProperties();render();}
    function updateLivePreviewCanvas(){const maxEdge=480,previewScale=Math.min(1,maxEdge/Math.max(state.width,state.height)),width=Math.max(1,Math.round(state.width*previewScale)),height=Math.max(1,Math.round(state.height*previewScale));if(livePreviewCanvas.width!==width)livePreviewCanvas.width=width;if(livePreviewCanvas.height!==height)livePreviewCanvas.height=height;livePreviewContext.clearRect(0,0,width,height);livePreviewContext.drawImage(cleanSceneCanvas,0,0,width,height);pendingLivePreview=livePreviewCanvas;return livePreviewCanvas;}
    function snapshotCleanSceneCanvas(){const snapshot=document.createElement("canvas");snapshot.width=cleanSceneCanvas.width;snapshot.height=cleanSceneCanvas.height;snapshot.getContext("2d").drawImage(cleanSceneCanvas,0,0);return snapshot;}
    function canvasPngBlob(source){return new Promise((resolve,reject)=>source.toBlob(blob=>blob?resolve(blob):reject(new Error("Editor表示を画像化できませんでした。")),"image/png"));}
    async function captureWysiwygExport(){
      flushPendingRender();
      if(document.fonts?.ready)await document.fonts.ready;
      const layoutJson=currentLayoutJson();
      renderCanvas();
      const composite=snapshotCleanSceneCanvas(),backgroundVisible=state.backgroundVisible;
      let overlay=null;
      if(saveOverlay){
        try{
          comicOverlayExport=true;if(backgroundVisible)state.backgroundVisible=false;renderCanvas();
          overlay=snapshotCleanSceneCanvas();
        }finally{
          comicOverlayExport=false;if(backgroundVisible)state.backgroundVisible=true;renderCanvas();
        }
      }
      const [compositeBlob,overlayBlob]=await Promise.all([canvasPngBlob(composite),overlay?canvasPngBlob(overlay):Promise.resolve(null)]);
      return{compositeBlob,overlayBlob,layoutJson};
    }
    function livePreviewDataUrl(){if(!pendingLivePreview)return null;return state.backgroundVisible?pendingLivePreview.toDataURL("image/jpeg",.84):pendingLivePreview.toDataURL("image/png");}
    function flushLivePreview(){clearTimeout(livePreviewTimer);livePreviewTimer=null;flushPendingRender();clearTimeout(livePreviewTimer);livePreviewTimer=null;renderCanvas();updateLivePreviewCanvas();const dataUrl=livePreviewDataUrl()||lastLivePreviewDataUrl;pendingLivePreview=null;return dataUrl;}
    let autoSaveTimer=null;
    function currentLayoutJson(){
      flushPendingEmphasisRegeneration();
      captureActiveWorkspace();
      const payload=projectSchema.build({activeWorkspace,workspaces,comic:comicEditor?.serialize()||null,generalComic:generalComicEditor?.serialize()||null});
      return JSON.stringify(payload,null,2);
    }
    async function hashImageBlob(blob){
      try{
        if(!globalThis.crypto?.subtle)throw new Error("SubtleCrypto unavailable");
        const digest=await globalThis.crypto.subtle.digest("SHA-256",await blob.arrayBuffer());
        return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("");
      }catch{
        const bytes=new Uint8Array(await blob.arrayBuffer());
        let value=2166136261;
        for(const byte of bytes){value^=byte;value=Math.imul(value,16777619);}
        const token=(value>>>0).toString(16).padStart(8,"0");
        return token.repeat(8).slice(0,64);
      }
    }
    function blobToDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(reader.error||new Error("画像を読み込めませんでした。"));reader.readAsDataURL(blob);});}
    function resolveForgeUrl(value){if(!value)return"";try{return new URL(value,location.href).href;}catch{return String(value);}}
    async function directoryFile(directory,name){try{return await directory.getFileHandle(name);}catch(error){if(error?.name==="NotFoundError")return null;throw error;}}
    async function writeDirectoryFile(directory,name,blob){const handle=await directory.getFileHandle(name,{create:true}),writable=await handle.createWritable();try{await writable.write(blob);await writable.close();}catch(error){await writable.abort().catch(()=>{});throw error;}}
    async function rotateDirectoryBackups(directory,name){
      if(!backupEnabled||!await directoryFile(directory,name))return;
      const dot=name.lastIndexOf("."),stem=dot>0?name.slice(0,dot):name,extension=dot>0?name.slice(dot):"";
      const backupName=index=>`${stem}_backup_${String(index).padStart(2,"0")}${extension}`;
      const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),pattern=new RegExp(`^${escaped(stem)}_backup_(\\d+)${escaped(extension)}$`);
      for await(const [entryName] of directory.entries()){const match=entryName.match(pattern);if(match&&Number(match[1])>backupGenerations)await directory.removeEntry(entryName);}
      for(let index=backupGenerations;index>1;index--){
        const previous=backupName(index-1),handle=await directoryFile(directory,previous);
        if(!handle)continue;
        await writeDirectoryFile(directory,backupName(index),await handle.getFile());
        await directory.removeEntry(previous);
      }
      const original=await directory.getFileHandle(name);
      await writeDirectoryFile(directory,backupName(1),await original.getFile());
    }
    async function datedDirectory(directory){
      const now=new Date();
      if(dateSubfolder==="none")return directory;
      const two=value=>String(value).padStart(2,"0"),month=`${now.getFullYear()}-${two(now.getMonth()+1)}`;
      const name=dateSubfolder==="year_month_day"?`${month}-${two(now.getDate())}`:month;
      return directory.getDirectoryHandle(name,{create:true});
    }
    async function availableClientFilename(directory,candidate){
      if(filenameFormat!=="source_sequence")return candidate;
      const dot=candidate.lastIndexOf("."),extension=dot>0?candidate.slice(dot):"",stem=dot>0?candidate.slice(0,dot):candidate,prefix=stem.replace(/_\d{4}$/,"");
      for(let sequence=1;sequence<1000000;sequence++){
        const name=`${prefix}_${String(sequence).padStart(4,"0")}${extension}`;
        if(!await directoryFile(directory,name))return name;
      }
      throw new Error("保存先の連番を作成できませんでした。");
    }
    async function fetchExportBlob(url){const response=await fetch(resolveForgeUrl(url),{cache:"no-store"});if(!response.ok)throw new Error(`書き出しファイルを取得できませんでした (${response.status})`);return response.blob();}
    async function saveClientExport(directory,payload){
      const started=performance.now(),timings={prepare:0,composite_download:0,composite_backup:0,composite_write:0,overlay_download:0,overlay_backup:0,overlay_write:0,total:0};
      let phase=performance.now();
      const target=await datedDirectory(directory),filename=await availableClientFilename(target,payload.filename),dot=filename.lastIndexOf("."),stem=dot>0?filename.slice(0,dot):filename;
      timings.prepare=performance.now()-phase;phase=performance.now();
      const composite=await fetchExportBlob(payload.download_url||payload.composite_url);
      timings.composite_download=performance.now()-phase;phase=performance.now();
      await rotateDirectoryBackups(target,filename);
      timings.composite_backup=performance.now()-phase;phase=performance.now();
      await writeDirectoryFile(target,filename,composite);
      timings.composite_write=performance.now()-phase;
      let overlayFilename="";
      if(payload.save_overlay&&payload.overlay_download_url){
        overlayFilename=`${stem}_overlay.png`;
        phase=performance.now();
        const overlay=await fetchExportBlob(payload.overlay_download_url);
        timings.overlay_download=performance.now()-phase;phase=performance.now();
        await rotateDirectoryBackups(target,overlayFilename);
        timings.overlay_backup=performance.now()-phase;phase=performance.now();
        await writeDirectoryFile(target,overlayFilename,overlay);
        timings.overlay_write=performance.now()-phase;
      }
      timings.total=performance.now()-started;
      return{filename,overlayFilename,timings};
    }
    function roundedTiming(value){return Math.round(Math.max(0,Number(value)||0)*10)/10;}
    function timingSeconds(value){return`${(Math.max(0,Number(value)||0)/1000).toFixed(Number(value)<1000?2:1)}s`;}
    function exportTimingLabel(timings){if(!timings)return"";const parts=[`合計 ${timingSeconds(timings.total)}`];if(timings.canvas_png)parts.push(`PNG ${timingSeconds(timings.canvas_png)}`);if(timings.api_roundtrip)parts.push(`API ${timingSeconds(timings.api_roundtrip)}`);if(timings.folder_save)parts.push(`保存 ${timingSeconds(timings.folder_save)}`);return parts.join(" / ");}
    async function fetchSavedLayout(id){
      if(!id||!keepLayoutEnabled)return{saved:"{}",hasSaved:false};
      try{
        const response=await fetch(`${forgeApiBase}/layout/${encodeURIComponent(id)}`,{cache:"no-store"});
        const payload=await response.json().catch(()=>({}));
        if(response.ok&&payload.ok&&payload.exists){
          const saved=safeStoredLayout(payload.layout_json||"{}");
          try{localStorage.setItem(savedLayoutKey(id),saved);}catch{}
          return{saved,hasSaved:true};
        }
      }catch(error){console.warn("Speech Bubble saved-layout API unavailable; using local cache.",error);}
      const local=localLayoutCache(id);
      return{saved:local.saved,hasSaved:local.hasSaved};
    }
    async function selectPersistentLayout(id=documentId){
      const savedResult=await fetchSavedLayout(id);
      const local=localLayoutCache(id);
      const draft=keepLayoutEnabled&&local.hasDraft?local.draft:"";
      return{
        saved:savedResult.saved,
        draft,
        hasSaved:savedResult.hasSaved,
        hasDraft:Boolean(draft),
        selected:draft||savedResult.saved||"{}",
      };
    }
    function scaleStateToImageSize(width,height){
      const oldWidth=Math.max(1,Number(state.width)||width),oldHeight=Math.max(1,Number(state.height)||height);
      if(oldWidth===width&&oldHeight===height){state.width=width;state.height=height;state.elements.forEach(item=>{syncFrameToCanvas(item);syncEmphasisToCanvas(item);});return;}
      const sx=width/oldWidth,sy=height/oldHeight;
      state.elements.forEach(item=>{
        item.x*=sx;item.y*=sy;item.w*=sx;item.h*=sy;
        if(item.font_size)item.font_size=integerFontSize(item.font_size*Math.min(sx,sy));
      });
      state.width=width;state.height=height;if(generalComicEditor?.isActive())generalComicEditor.scale(sx,sy);else if(comicEditor?.isActive())comicEditor.scale(sx,sy);
      state.elements.forEach(item=>{if(item.type==="frame"&&item.fit_to_canvas)syncFrameToCanvas(item);else if(item.type==="emphasis_lines"){if(item.fit_to_canvas)syncEmphasisToCanvas(item);else regenerateEmphasisRays(item);}});
    }
    function applyLayoutForCurrentImage(raw,{dirty=false}={}){
      dirtyTrackingEnabled=false;
      loadState(safeStoredLayout(raw));
      if(image.naturalWidth&&image.naturalHeight)scaleStateToImageSize(image.naturalWidth,image.naturalHeight);
      if(activeWorkspace==="single")ensurePrimarySingleImageLayer();
      state.undo=[];state.redo=[];
      layoutDirty=dirty;
      syncProperties();fitView(false);requestRender({canvas:true,layers:true,preview:false});
      dirtyTrackingEnabled=true;
      updateActionState();
      return currentLayoutJson();
    }
    function preserveComicWorkspace() {
      captureActiveWorkspace();

      return {
        workspace: structuredClone(workspaces.comic),
        comic: structuredClone(comicEditor?.serialize()),
      };
    }
    function restorePreservedComicWorkspace(snapshot) {
      if (!snapshot?.workspace) return;

      workspaces.comic = snapshot.workspace;

      if (snapshot.comic) {
        comicEditor?.restore(snapshot.comic, {
          hydrate: true,
          keepMode: true,
        });
      }

      // 一枚画像側を編集中なら、復元した4コマを表示状態にはしない。
      if (activeWorkspace === "single") {
        state.width = workspaces.single.width;
        state.height = workspaces.single.height;
        state.backgroundVisible = workspaces.single.backgroundVisible;
        state.canvasBackground = normalizedCanvasBackground(workspaces.single.canvasBackground);
        state.elements = workspaces.single.elements;
      }
    }
    function restorePreservedSingleWorkspace(snapshot) {
      if (!snapshot || activeWorkspace !== "single") return;

      workspaces.single = snapshot;
      state.width = snapshot.width;
      state.height = snapshot.height;
      state.backgroundVisible = snapshot.backgroundVisible;
      state.canvasBackground = normalizedCanvasBackground(snapshot.canvasBackground);
      state.backgroundImage = normalizedBackgroundImage(snapshot.backgroundImage||{attached:imageLoaded});
      state.elements = snapshot.elements;
      scaleStateToImageSize(image.naturalWidth, image.naturalHeight);
      captureActiveWorkspace();
    }
    function refreshDirtyState(){
      if(!dirtyTrackingEnabled||!hasEditableDocument())return;
      layoutDirty=currentLayoutJson()!==lastSavedLayout;
      updateActionState();
    }
    async function persistDesktopRecovery(checkpoint=false,force=false){
      if(hostMode!=="desktop"||isPaletteWindow||(!autoSaveEnabled&&!force)||!hasEditableDocument())return null;
      const createGeneration=checkpoint||Date.now()-lastRecoveryCheckpoint>=600000;
      const result=await window.SpeechBubbleDesktopShell?.saveRecovery?.(createGeneration);
      if(createGeneration&&result)lastRecoveryCheckpoint=Date.now();
      return result;
    }
    async function markProjectSaved(projectPath, savedLayout){
      const normalized=safeStoredLayout(savedLayout||currentLayoutJson());
      currentProjectPath=String(projectPath||currentProjectPath||"");
      if(normalized!==currentLayoutJson()){
        updateActionState();
        return false;
      }
      try{localStorage.setItem(jsonKey,normalized);localStorage.setItem(savedLayoutKey(),normalized);removeDraftCache();}catch{}
      lastSavedLayout=normalized;hasExplicitSavedLayout=true;layoutDirty=false;updateActionState();
      try{await persistDesktopRecovery(true,true);}catch(error){console.warn("Speech Bubble project recovery sync failed",error);setSaveState(uiText("プロジェクトは保存済みですが、復元キャッシュを同期できませんでした","Project saved, but recovery cache sync failed"),"error");}
      return true;
    }
    function persistDraftNow(){
      if(!autoSaveEnabled||!hasEditableDocument()||!documentId||!layoutDirty)return;
      const layout=currentLayoutJson();
      try{localStorage.setItem(jsonKey,layout);localStorage.setItem(draftLayoutKey(),layout);touchDraftCache();}catch{}
      if(documentMode==="standalone")try{localStorage.setItem(LAST_STANDALONE_ID_KEY,documentId);}catch{}
      postHost("speech_bubble:autosave_layout",{revision:renderRevision,image_hash:imageHash,document_id:documentId});
      setSaveState("下書きを自動保存しました","dirty");
      persistDesktopRecovery(false).catch(error=>{console.warn("Speech Bubble desktop recovery save failed",error);setSaveState(uiText("復元キャッシュを保存できませんでした","Could not save the recovery cache"),"error");});
    }
    function scheduleAutoSave(){
      if(!autoSaveEnabled||!hasEditableDocument()||!documentId)return;
      clearTimeout(autoSaveTimer);
      autoSaveTimer=setTimeout(()=>{autoSaveTimer=null;refreshDirtyState();persistDraftNow();},autoSaveDelay);
    }
    window.SpeechBubbleApplyRuntimeSettings=settings=>{
      autoSaveEnabled=!isForgeProjectHost&&settings?.auto_save!==false;
      showEmptyCanvasGuide=settings?.show_empty_canvas_guide!==false;
      autoSaveDelay=Math.max(5000,Math.min(3600000,(Number(settings?.auto_save_interval_seconds)||30)*1000));
      clearTimeout(autoSaveTimer);autoSaveTimer=null;
      if(autoSaveEnabled&&layoutDirty)scheduleAutoSave();
      updateActionState();
    };
    function scheduleLivePreview(revision=renderRevision){
      if(isForgeProjectHost||!window.opener)return;
      clearTimeout(livePreviewTimer);
      livePreviewTimer=setTimeout(()=>{
        if(revision!==renderRevision)return;
        updateLivePreviewCanvas();
        const previewDataUrl=livePreviewDataUrl();pendingLivePreview=null;
        if(previewDataUrl&&revision>=lastSentPreviewRevision){lastSentPreviewRevision=revision;lastLivePreviewDataUrl=previewDataUrl;postHost("speech_bubble:live_preview",{revision,preview_data_url:previewDataUrl});}
      },280);
    }
    async function sourceImageBlob(){
      if(sourceBlob)return sourceBlob;
      if(!imageUrl)throw new Error("背景画像を読み込んでください。");
      const response=await fetch(imageUrl,{cache:"no-store"});
      if(!response.ok)throw new Error(`背景画像を取得できませんでした (${response.status})`);
      const blob=await response.blob();
      if(!String(blob.type||"").startsWith("image/"))throw new Error("背景画像の形式を確認してください。");
      sourceBlob=blob;
      return blob;
    }
    async function saveLayoutExplicit(){
      if(isForgeProjectHost)return forgeProjectAdapter?.save?.("manual")||false;
      if(!hasEditableDocument()||!documentId){setSaveState("画像または漫画ページを用意してください","error");return false;}
      const button=document.getElementById("saveLayout"),original=button.textContent,layout=currentLayoutJson();
      button.disabled=true;button.textContent="Saving…";setSaveState("レイアウト保存中…","info");
      try{
        const response=await fetch(`${forgeApiBase}/layout/${encodeURIComponent(documentId)}`,{
          method:"PUT",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({layout_json:layout,source_name:sourceName||"speech_bubble"}),
        });
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok)throw new Error(payload.detail||`Layout save failed (${response.status})`);
        try{localStorage.setItem(jsonKey,layout);localStorage.setItem(savedLayoutKey(),layout);removeDraftCache();}catch{}
        if(documentMode==="standalone")try{localStorage.setItem(LAST_STANDALONE_ID_KEY,documentId);}catch{}
        lastSavedLayout=layout;hasExplicitSavedLayout=true;layoutDirty=false;updateActionState();
        await persistDesktopRecovery(true,true);
        postHost("speech_bubble:layout_saved",{image_hash:imageHash,document_id:documentId,layout_json:layout});
        return true;
      }catch(error){
        console.error("Speech Bubble layout save failed",error);setSaveState(error?.message||"レイアウト保存に失敗しました","error");return false;
      }finally{button.disabled=false;button.textContent=original;updateActionState();}
    }
    function discardChanges(confirmUser=true){
      if(!hasEditableDocument()||!layoutDirty)return;
      if(confirmUser&&!confirm("未保存の変更を破棄して、最後に保存したレイアウトへ戻しますか？"))return;
      clearTimeout(autoSaveTimer);autoSaveTimer=null;
      try{removeDraftCache();localStorage.setItem(jsonKey,lastSavedLayout);}catch{}
      applyLayoutForCurrentImage(lastSavedLayout,{dirty:false});
      forgeProjectAdapter?.markClean?.();
      postHost("speech_bubble:layout_discarded",{image_hash:imageHash,document_id:documentId});
    }
    async function exportImage(){
      if(!hasEditableDocument()){setSaveState("画像または漫画ページを用意してください","error");return;}
      if(comicEditor&&!comicEditor.confirmExport())return;
      let directory=null,desktopOutputDir="",fixedLocationFallback=false,clientExportToken="";
      if(hostMode==="desktop"&&window.SpeechBubbleDesktopShell?.prepareExportTarget){
        try{
          const target=await window.SpeechBubbleDesktopShell.prepareExportTarget();
          if(!target)return;
          desktopOutputDir=String(target.path||"");
        }catch(error){setSaveState(error?.message||"保存先を選択できませんでした","error");return;}
      }else if(promptExportLocation){
        if(typeof window.showDirectoryPicker==="function"){
          try{
            const rememberedDirectory=await loadRememberedExportDirectory(),pickerOptions={id:`sbe-${exportDirectoryVersion.slice(-12)}`,mode:"readwrite"};
            if(rememberedDirectory)pickerOptions.startIn=rememberedDirectory;
            else if(useForgeOutputDir&&forgeOutputDir)setSaveState(`Desktop保存先を選択してください: ${forgeOutputDir}`,"info");
            directory=await window.showDirectoryPicker(pickerOptions);
            await storeRememberedExportDirectory(directory);
          }catch(error){if(error?.name==="AbortError"){updateActionState();return;}setSaveState(error?.message||"保存先を選択できませんでした","error");return;}
        }else{
          fixedLocationFallback=true;
          console.warn("Speech Bubble directory picker is unavailable; using the configured server output directory.");
        }
      }
      const button=document.getElementById("exportImage"),original=button.textContent,totalStarted=performance.now();let exportSucceeded=false,exportedFilename="",exportedOutputDir="",exportTimingSummary="";
      button.disabled=true;button.textContent="Exporting…";setSaveState("画像を書き出しています…","info");
      postHost("speech_bubble:export_started",{image_hash:imageHash,document_id:documentId});
      try{
        let response,captureMs=0,requestMs=0,compositeBytes=0,overlayBytes=0,folderTimings=null;
        if(exportTransport==="multipart_canvas_v1"||activeStructuralEditor()){
          const captureStarted=performance.now();
          const rendered=await captureWysiwygExport(),metadata={render_mode:"browser_canvas_v1",layout_json:rendered.layoutJson,name:sourceName||"speech_bubble",image_hash:imageHash,document_id:documentId,source_tab:sourceTab,client_save:Boolean(directory),desktop_output_dir:desktopOutputDir},form=new FormData();
          captureMs=performance.now()-captureStarted;compositeBytes=rendered.compositeBlob.size;overlayBytes=rendered.overlayBlob?.size||0;
          form.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}),"metadata.json");
          form.append("composite",rendered.compositeBlob,"composite.png");
          if(rendered.overlayBlob)form.append("overlay",rendered.overlayBlob,"overlay.png");
          const requestStarted=performance.now();
          response=await fetch(`${forgeApiBase}/export`,{method:"POST",body:form});
          requestMs=performance.now()-requestStarted;
        }else{
          const captureStarted=performance.now();
          const imageDataUrl=await blobToDataUrl(await sourceImageBlob()),layout=currentLayoutJson();
          captureMs=performance.now()-captureStarted;
          const requestStarted=performance.now();
          response=await fetch(`${forgeApiBase}/export`,{
            method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({image_data_url:imageDataUrl,layout_json:layout,name:sourceName||"speech_bubble",image_hash:imageHash,document_id:documentId,source_tab:sourceTab,client_save:Boolean(directory),desktop_output_dir:desktopOutputDir}),
          });
          requestMs=performance.now()-requestStarted;
        }
        let payload=await response.json().catch(()=>({}));
        if(!response.ok||!payload.ok)throw new Error(payload.detail||`Export failed (${response.status})`);
        clientExportToken=payload.client_export_token||"";
        let download="",view="";
        if(directory){
          const saved=await saveClientExport(directory,payload);
          folderTimings=saved.timings;
          payload.filename=saved.filename;
          payload.overlay_filename=saved.overlayFilename||payload.overlay_filename;
        }else{
          download=resolveForgeUrl(payload.download_url||payload.composite_url);
          view=resolveForgeUrl(payload.composite_url||payload.download_url);
        }
        exportedFilename=payload.filename;
        exportedOutputDir=String(payload.output_dir||"");
        exportSucceeded=true;
        const serverTimings=payload.timings_ms||{},timings={canvas_png:roundedTiming(captureMs),api_roundtrip:roundedTiming(requestMs),folder_save:roundedTiming(folderTimings?.total),total:roundedTiming(performance.now()-totalStarted),composite_bytes:compositeBytes,overlay_bytes:overlayBytes,server_request_parse:roundedTiming(serverTimings.request_parse),server_render_decode:roundedTiming(serverTimings.render_decode),server_save:roundedTiming(serverTimings.save),server_total:roundedTiming(serverTimings.server_total),folder_prepare:roundedTiming(folderTimings?.prepare),folder_composite_download:roundedTiming(folderTimings?.composite_download),folder_composite_backup:roundedTiming(folderTimings?.composite_backup),folder_composite_write:roundedTiming(folderTimings?.composite_write),folder_overlay_download:roundedTiming(folderTimings?.overlay_download),folder_overlay_backup:roundedTiming(folderTimings?.overlay_backup),folder_overlay_write:roundedTiming(folderTimings?.overlay_write)};
        exportTimingSummary=exportTimingLabel(timings);console.info("Speech Bubble export timings",timings);
        postHost("speech_bubble:export_complete",{
          filename:payload.filename,composite_url:view,download_url:download,
          overlay_url:resolveForgeUrl(payload.overlay_url),overlay_download_url:resolveForgeUrl(payload.overlay_download_url),
          layout_url:resolveForgeUrl(payload.layout_url),layout_download_url:resolveForgeUrl(payload.layout_download_url),
          width:payload.width,height:payload.height,supersample:payload.supersample,render_mode:payload.render_mode,timings_ms:timings,image_hash:imageHash,document_id:documentId,
        });
        window.opener?.focus();
      }catch(error){
        console.error("Speech Bubble export failed",error);setSaveState(error?.message||"画像の書き出しに失敗しました","error");postHost("speech_bubble:export_failed",{message:error?.message||"画像の書き出しに失敗しました。"});
      }finally{
        if(clientExportToken)fetch(`${forgeApiBase}/client-export/${encodeURIComponent(clientExportToken)}`,{method:"DELETE"}).catch(()=>{});
        button.disabled=false;button.textContent=original;updateActionState();
        if(exportSucceeded){const fullPath=exportedOutputDir?`${exportedOutputDir}${exportedOutputDir.match(/[\\/]$/)?"":"\\"}${exportedFilename}`:"",message=fullPath?`${fullPath} へ書き出しました`:fixedLocationFallback?`フォルダー選択非対応のため${useForgeOutputDir?"Desktop保存先":"固定保存先"}へ書き出しました`:`${exportedFilename} を書き出しました`,summary=`${uiText("書き出し完了","Export complete")}${exportTimingSummary?` / ${exportTimingSummary}`:""}`;setSaveState(summary,layoutDirty?"dirty":"saved",`${message}${exportTimingSummary?` / ${exportTimingSummary}`:""}`);}
      }
    }
    function loadImageElement(url){return new Promise((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("画像を表示できませんでした。"));image.src=url;if(image.complete&&image.naturalWidth)resolve();});}
    function showImageRestoreChoice(){if(isForgeProjectHost)return Promise.resolve("new");return new Promise(resolve=>{const dialog=document.getElementById("imageLayoutRestoreDialog");imageRestoreResolver=resolve;if(typeof dialog.showModal==="function")dialog.showModal();else{imageRestoreResolver=null;resolve(confirm("この画像の保存済みレイアウトを単体編集へコピーしますか？")?"restore":"new");}});}
    function showStandaloneResumeChoice(){
      if(isForgeProjectHost)return Promise.resolve("new");
      if(standaloneResumePromise)return standaloneResumePromise;
      const dialog=document.getElementById("resumeStandaloneDialog");
      standaloneResumePromise=new Promise(resolve=>{
        standaloneResumeResolver=resolve;
        if(typeof dialog.showModal==="function"){
          if(!dialog.open)dialog.showModal();
        }else{
          standaloneResumeResolver=null;
          resolve(confirm("前回の単体編集を再開しますか？")?"resume":"new");
        }
      }).finally(()=>{standaloneResumePromise=null;});
      return standaloneResumePromise;
    }
    function finishDialogChoice(dialogId,resolverName,value){const dialog=document.getElementById(dialogId);if(dialog.open)dialog.close();if(resolverName==="image"){const resolve=imageRestoreResolver;imageRestoreResolver=null;resolve?.(value);}else{const resolve=standaloneResumeResolver;standaloneResumeResolver=null;resolve?.(value);}}
    function setStandaloneContext(id){
      const match=String(id||"").toLowerCase().match(/^standalone:([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/);
      standaloneId=match?.[1]||createUuid();documentMode="standalone";documentId=`standalone:${standaloneId}`;
    }
    function clearDocumentCanvas(){
      clearTimeout(autoSaveTimer);autoSaveTimer=null;dirtyTrackingEnabled=false;
      clearSingleImageAssets();
      if(sourceObjectUrl)URL.revokeObjectURL(sourceObjectUrl);
      sourceObjectUrl=null;sourceBlob=null;imageUrl="";imageHash="";imageLoaded=false;
      image.onload=null;image.onerror=null;image.removeAttribute("src");
      sourceName="speech_bubble";loadState("{}");lastSavedLayout=currentLayoutJson();hasExplicitSavedLayout=false;layoutDirty=false;
      state.undo=[];state.redo=[];syncProperties();fitView(false);requestRender({canvas:true,layers:true,preview:false});dirtyTrackingEnabled=true;updateActionState();
    }
    async function createNewDesktopProject(){
      setStandaloneContext(`standalone:${createUuid()}`);clearDocumentCanvas();currentProjectPath="";sourceName="speech_bubble";
      comicEditor?.setEditMode?.("single");comicConverter?.close?.();backgroundRemoval?.close?.();quickRetouch?.close?.();
      lastSavedLayout=currentLayoutJson();hasExplicitSavedLayout=false;layoutDirty=false;state.undo=[];state.redo=[];
      setSaveState(uiText("新規プロジェクトを作成しました","Created a new project"),"saved");updateActionState();
    }
    async function displayImageBlob(blob,{name="speech_bubble",tab=sourceTab,hash="",assetId=""}={}){
      imageHash=hash||await hashImageBlob(blob);sourceTab=tab||sourceTab;sourceName=String(name||"speech_bubble").replace(/\.[^.]+$/,"").trim()||"speech_bubble";
      sourceBlob=blob;state.backgroundImage=normalizedBackgroundImage({attached:true,locked:true});workspaces.single.backgroundImage=state.backgroundImage;if(sourceObjectUrl)URL.revokeObjectURL(sourceObjectUrl);
      sourceObjectUrl=URL.createObjectURL(blob);imageUrl=sourceObjectUrl;await loadImageElement(sourceObjectUrl);imageLoaded=true;const asset=await registerSingleImageAsset(blob,name,assetId);primarySingleImageAssetId=asset.id;return asset;
    }
    async function restoreStandaloneDocument(id,background){
      setStandaloneContext(id);clearDocumentCanvas();
      await displayImageBlob(background.blob,{name:background.sourceName||"speech_bubble"});
      const layouts=await selectPersistentLayout(documentId);hasExplicitSavedLayout=layouts.hasSaved;
      applyLayoutForCurrentImage(layouts.saved||"{}",{dirty:false});lastSavedLayout=currentLayoutJson();
      if(layouts.hasDraft)applyLayoutForCurrentImage(layouts.draft,{dirty:true});
      try{localStorage.setItem(jsonKey,currentLayoutJson());localStorage.setItem(LAST_STANDALONE_ID_KEY,documentId);}catch{}
      postHost("speech_bubble:source_loaded",{image_hash:imageHash,document_id:documentId,source_name:sourceName,width:image.naturalWidth,height:image.naturalHeight,restored:layouts.hasDraft?"自動保存下書き":layouts.hasSaved?"保存済みレイアウト":"新規レイアウト"});
      startDeferredResources();
      return "resume";
    }
    async function restoreStandaloneLayoutOnly(id){
      setStandaloneContext(id);clearDocumentCanvas();
      const layouts=await selectPersistentLayout(documentId);
      hasExplicitSavedLayout=layouts.hasSaved;
      applyLayoutForCurrentImage(layouts.saved||"{}",{dirty:false});
      lastSavedLayout=currentLayoutJson();
      if(layouts.hasDraft)applyLayoutForCurrentImage(layouts.draft,{dirty:true});
      try{localStorage.setItem(jsonKey,currentLayoutJson());localStorage.setItem(LAST_STANDALONE_ID_KEY,documentId);}catch{}
      postHost("speech_bubble:source_loaded",{image_hash:"",document_id:documentId,source_name:sourceName,restored:layouts.hasDraft?"自動保存下書き":layouts.hasSaved?"保存済みレイアウト":"新規レイアウト"});
      startDeferredResources();
      return "resume";
    }
    async function startStandaloneDocument(id,{offerResume=true,behavior=offerResume?"ask":"new"}={}){
      if(layoutDirty&&autoSaveEnabled)persistDraftNow();
      const requested=`standalone:${String(id||createUuid()).replace(/^standalone:/,"")}`;
      let selected=requested,background=null,previous="",previousLayouts=null;
      try{previous=localStorage.getItem(LAST_STANDALONE_ID_KEY)||"";}catch{}
      if(previous&&previous!==requested){
        background=await documentBackground(previous);
        previousLayouts=await selectPersistentLayout(previous);
        const canResume=Boolean(background||previousLayouts.hasDraft||previousLayouts.hasSaved);
        let choice=behavior;
        if(canResume&&behavior==="ask")choice=await showStandaloneResumeChoice();
        if(canResume&&choice==="resume")selected=previous;
        else background=null;
      }
      setStandaloneContext(selected);
      if(!background)background=await documentBackground(documentId);
      if(background&&selected!==requested)return restoreStandaloneDocument(documentId,background);
      if(selected!==requested&&previousLayouts&&(previousLayouts.hasDraft||previousLayouts.hasSaved))return restoreStandaloneLayoutOnly(documentId);
      clearDocumentCanvas();
      postHost("speech_bubble:document_changed",{document_id:documentId,mode:documentMode});
      return "new";
    }
    async function loadImageBlob(blob,{name="speech_bubble",tab=sourceTab,mode=documentMode,resume=false}={}){
      if(!blob||!String(blob.type||"").startsWith("image/")){
        setSaveState("PNG / JPEG / WebPを選択してください","error");
        return;
      }

      const replacingStandaloneSingleImage =
        mode === "standalone" &&
        !resume &&
        imageLoaded &&
        activeWorkspace === "single";

      const preservedComic = replacingStandaloneSingleImage
        ? preserveComicWorkspace()
        : null;
      const preservedSingle = replacingStandaloneSingleImage
        ? structuredClone(workspaces.single)
        : null;
      if(layoutDirty&&autoSaveEnabled)persistDraftNow();
      clearTimeout(autoSaveTimer);autoSaveTimer=null;dirtyTrackingEnabled=false;setSaveState("画像を読み込んでいます…","info");
      const hash=await hashImageBlob(blob);
      const standalone=mode==="standalone";
      let copiedLayout=null,choice="new";
      if(standalone&&!resume){
        const imageLayout=await fetchSavedLayout(`image:${hash}`);
        if(imageLayout.hasSaved){choice=await showImageRestoreChoice();if(choice==="cancel"){dirtyTrackingEnabled=true;updateActionState();return false;}if(choice==="restore")copiedLayout=imageLayout.saved;}
      }
      if(!standalone){documentMode="image";documentId=`image:${hash}`;}
      await displayImageBlob(blob,{name,tab,hash});
      const layouts=await selectPersistentLayout(documentId);
      hasExplicitSavedLayout=layouts.hasSaved;
      applyLayoutForCurrentImage(layouts.saved||"{}",{dirty:false});
      lastSavedLayout=currentLayoutJson();
      let restored=layouts.hasSaved?"保存済みレイアウト":"新規レイアウト";
      if(standalone&&!resume){
        const next=copiedLayout||"{}";applyLayoutForCurrentImage(next,{dirty:false});
        restored=copiedLayout?"画像側レイアウトをコピー":"新規レイアウト";
        await storeDocumentBackground(documentId,blob,sourceName);
      }else if(layouts.hasDraft){applyLayoutForCurrentImage(layouts.draft,{dirty:true});restored="自動保存下書き";}
      else{layoutDirty=false;updateActionState();}
      if (preservedComic) {
        if (!copiedLayout) {
          restorePreservedSingleWorkspace(preservedSingle);
        }
        restorePreservedComicWorkspace(preservedComic);
      }
      // 正規化済みレイアウトで保存判定とUIを同期する。
      layoutDirty = currentLayoutJson() !== lastSavedLayout;
      syncProperties();
      requestRender({canvas:true,layers:true,preview:false});
      updateActionState();
      try{localStorage.setItem(jsonKey,currentLayoutJson());}catch{}
      postHost("speech_bubble:source_loaded",{image_hash:imageHash,document_id:documentId,source_name:sourceName,width:image.naturalWidth,height:image.naturalHeight,restored});
      startDeferredResources();
      return true;
    }
    async function loadLocalImageFile(file){await loadImageBlob(file,{name:file?.name||"speech_bubble",tab:sourceTab,mode:documentMode});}
    async function loadRemoteImage(url,{name=sourceName,tab=sourceTab}={}){
      if(!url)return;
      setSaveState("生成画像を読み込んでいます…","info");
      const cacheId=await generatedBackgroundId(name,tab,url);
      let blob=null,remoteError=null;
      try{
        const response=await fetch(url,{cache:"force-cache"});
        if(!response.ok)throw new Error(`背景画像を取得できませんでした (${response.status})`);
        blob=await response.blob();
        if(!String(blob.type||"").startsWith("image/"))throw new Error("取得した背景画像の形式を確認できませんでした。");
      }catch(error){remoteError=error;}
      if(blob){
        await loadImageBlob(blob,{name,tab,mode:"image"});
        await storeGeneratedBackground(cacheId,blob,name,tab,url);
        return;
      }
      const cached=await cachedBackground(cacheId);
      if(!cached?.blob)throw remoteError||new Error("背景画像を取得できませんでした。");
      await loadImageBlob(cached.blob,{name:cached.sourceName||name,tab:cached.sourceTab||tab,mode:"image"});
      await storeCachedBackground(cached);
      setSaveState("保持済みの生成画像を再表示しました","info");
    }
    async function performPendingReplacement(){
      const pending=pendingReplacementSource;pendingReplacementSource=null;
      if(!pending)return;
      if(pending.kind==="file")await loadLocalImageFile(pending.file);
      else if(pending.kind==="url")await loadRemoteImage(pending.url,{name:pending.name,tab:pending.tab});
    }
    async function requestBackgroundSource(source){
      if(!source)return;
      if(imageLoaded&&layoutDirty){
        pendingReplacementSource=source;
        const dialog=document.getElementById("replaceImageDialog");
        if(typeof dialog.showModal==="function")dialog.showModal();
        else if(confirm("未保存の変更を破棄して画像を置き換えますか？")){try{localStorage.removeItem(draftLayoutKey());}catch{}await performPendingReplacement();}
        return;
      }
      pendingReplacementSource=source;await performPendingReplacement();
    }
    function primarySingleCanvasImageLayer(){if(activeWorkspace!=="single")return null;return state.elements.find(item=>item.type==="image"&&item.source_role==="original")||state.elements.find(item=>item.type==="image")||null;}
    function shouldResizeSingleCanvasForImage(asset,item){if(activeWorkspace!=="single"||!asset||!item)return false;const sizeChanged=Math.round(state.width)!==Math.round(asset.width)||Math.round(state.height)!==Math.round(asset.height);if(!sizeChanged)return false;const otherEditable=state.elements.some(layer=>layer.id!==item.id&&layer.visible!==false);if(!otherEditable)return true;return confirm(uiText("新しい画像のサイズにキャンバスを合わせますか？\n既存レイヤーは相対位置を保つように拡大・縮小されます。\n\nOK：画像サイズに合わせる\nキャンセル：現在のキャンバスを維持","Resize the canvas to the new image?\nExisting layers will be scaled to preserve relative positions.\n\nOK: Match image size\nCancel: Keep current canvas"));}
    async function replaceSingleImageLayerFromBlob(item,blob,name,{assetId=""}={}){if(!item||item.type!=="image"||!(blob instanceof Blob))return false;const asset=await registerSingleImageAsset(blob,name||"Image",assetId),before=sceneSnapshot(),resizeCanvas=shouldResizeSingleCanvasForImage(asset,item);storeUndo(before);item.image_asset_id=asset.id;item.image_name=asset.name||String(name||"Image").replace(/\.[^.]+$/," ").trim()||"Image";item.crop={x:0,y:0,w:1,h:1};item.rotation=0;if(resizeCanvas){scaleStateToImageSize(Math.max(1,asset.width),Math.max(1,asset.height));Object.assign(item,fitImageLayerGeometry(asset,"contain"));item.crop={x:0,y:0,w:1,h:1};fitView(false);}else{const geometry=fitImageLayerGeometry(asset,"contain");Object.assign(item,geometry);item.crop={x:0,y:0,w:1,h:1};}captureActiveWorkspace();layoutDirty=true;syncProperties();requestRender({canvas:true,layers:true,preview:true});updateActionState();notifyForgeProjectChanged();return true;}
    async function requestBackgroundFile(file){if(!file)return;const primary=primarySingleCanvasImageLayer();if(primary){if(isForgeProjectHost){const asset=await forgeProjectImageStore.put({name:file.name||"project-image",source:"local-file"},file);projectImageTray?.register(asset,{notify:false});await replaceSingleImageLayerFromBlob(primary,file,file.name||asset.name,{assetId:String(asset.id)});markProjectImageTrayChanged();return;}await replaceSingleImageLayerFromBlob(primary,file,file.name||"Image");return;}if(isForgeProjectHost){const asset=await forgeProjectImageStore.put({name:file.name||"project-image",source:"local-file"},file);await placeForgeProjectAsset(asset,file);markProjectImageTrayChanged();return;}await requestBackgroundSource({kind:"file",file});}
    async function requestRemoteImage(url,{name=sourceName,tab=sourceTab}={}){if(!url)return;if(isForgeProjectHost){const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error(`画像を取得できませんでした (${response.status})`);const blob=await response.blob();const asset=await forgeProjectImageStore.put({name:name||"project-image",source:"forge-gallery"},blob),primary=primarySingleCanvasImageLayer();if(primary){projectImageTray?.register(asset,{notify:false});await replaceSingleImageLayerFromBlob(primary,blob,name||asset.name,{assetId:String(asset.id)});}else await placeForgeProjectAsset(asset,blob);markProjectImageTrayChanged();return;}await requestBackgroundSource({kind:"url",url,name,tab});}
    function drawSelection(item){
      const handles=handlePoints(item),corners=[handles[0],handles[2],handles[4],handles[6]];ctx.save();ctx.strokeStyle="#3fa7ff";ctx.lineWidth=2/state.zoom;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(corners[0].x,corners[0].y);corners.slice(1).forEach(point=>ctx.lineTo(point.x,point.y));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
      const size=10/state.zoom;for(const handle of handles){ctx.fillStyle="#fff";ctx.fillRect(handle.x-size/2,handle.y-size/2,size,size);ctx.strokeStyle="#1b1f25";ctx.lineWidth=1/state.zoom;ctx.strokeRect(handle.x-size/2,handle.y-size/2,size,size);}
      const center=itemCenter(item),frameMove=isFrameSelected(item);ctx.beginPath();ctx.arc(center.x,center.y,(frameMove?16:6)/state.zoom,0,Math.PI*2);ctx.fillStyle=frameMove?"rgba(63,167,255,.28)":"#fff";ctx.fill();ctx.strokeStyle=frameMove?"#3fa7ff":"#1b1f25";ctx.lineWidth=(frameMove?2:1)/state.zoom;ctx.stroke();ctx.beginPath();ctx.moveTo(center.x-9/state.zoom,center.y);ctx.lineTo(center.x+9/state.zoom,center.y);ctx.moveTo(center.x,center.y-9/state.zoom);ctx.lineTo(center.x,center.y+9/state.zoom);ctx.stroke();
      const rotationGeometry=rotationHandleGeometry(item),rotation=rotationGeometry.handle;ctx.beginPath();ctx.moveTo(rotationGeometry.anchor.x,rotationGeometry.anchor.y);ctx.lineTo(rotation.x,rotation.y);ctx.strokeStyle="#3fa7ff";ctx.stroke();ctx.beginPath();ctx.arc(rotation.x,rotation.y,7/state.zoom,0,Math.PI*2);ctx.fillStyle="#68c878";ctx.fill();ctx.strokeStyle="#163d1e";ctx.stroke();ctx.restore();
    }
    function activeImageCropItem(){return imageCropEdit?state.elements.find(item=>item.id===imageCropEdit.itemId&&item.type==="image"):null;}
    function syncImageCropToolbar(){const toolbar=document.getElementById("imageCropToolbar"),item=activeImageCropItem();if(toolbar)toolbar.hidden=!item;const edit=document.getElementById("editImageCrop"),reset=document.getElementById("resetImageCrop"),status=document.getElementById("backgroundCropStatus");if(edit)edit.textContent=item?uiText("クロップ編集中","Editing Crop"):uiText("クロップを編集","Edit Crop");if(reset){const selected=selectedSingleImageLayer();reset.disabled=!selected||selected.locked||imageCropIsFull(selected);}if(status){const selected=selectedSingleImageLayer();status.textContent=item?uiText("枠の辺・角をドラッグ。枠内ドラッグで画像位置を調整します。","Drag crop edges/corners. Drag inside to reposition the image within the crop."):selected&&!imageCropIsFull(selected)?uiText("非破壊クロップが適用されています。","A non-destructive crop is applied."):uiText("クロップは非破壊です。元画像は保持されます。","Cropping is non-destructive; the source image is preserved.");}}
    function startImageCropEdit(item=selectedSingleImageLayer()){
      if(!item||item.type!=="image"||item.locked||state.selection.length!==1)return false;
      if(Math.abs(Number(item.rotation)||0)>.001){setSaveState(uiText("クロップ編集は回転0°の画像で使用してください。","Crop editing is available when image rotation is 0°."),"info");return false;}
      imageCropEdit={itemId:item.id,beforeScene:sceneSnapshot(),drag:null};
      syncImageCropToolbar();syncProperties();requestRender({canvas:true,layers:false,preview:false});return true;
    }
    function cancelImageCropEdit(){if(!imageCropEdit)return false;const before=imageCropEdit.beforeScene;imageCropEdit=null;restoreScene(before);syncImageCropToolbar();syncProperties();render();return true;}
    function confirmImageCropEdit(){if(!imageCropEdit)return false;const before=imageCropEdit.beforeScene;imageCropEdit=null;if(before!==sceneSnapshot())storeUndo(before);syncImageCropToolbar();syncProperties();render();return true;}
    function resetImageCrop(item=activeImageCropItem()||selectedSingleImageLayer(),history=true){if(!item||item.type!=="image"||item.locked)return false;if(history&&!imageCropEdit)pushUndo();resetImageCropGeometry(item);if(imageCropEdit)imageCropEdit.drag=null;syncImageCropToolbar();syncProperties();render();return true;}
    function cropHandleAt(item,point){const margin=10/Math.max(.1,state.zoom),left=item.x,top=item.y,right=item.x+item.w,bottom=item.y+item.h,nearX=x=>Math.abs(point.x-x)<=margin,nearY=y=>Math.abs(point.y-y)<=margin,insideX=point.x>=left-margin&&point.x<=right+margin,insideY=point.y>=top-margin&&point.y<=bottom+margin;let h="";if(nearY(top)&&insideX)h+="n";else if(nearY(bottom)&&insideX)h+="s";if(nearX(left)&&insideY)h+="w";else if(nearX(right)&&insideY)h+="e";if(h)return h;if(point.x>=left&&point.x<=right&&point.y>=top&&point.y<=bottom)return"move";return"";}
    function beginImageCropPointer(point,event){const item=activeImageCropItem();if(!item||event.button!==0)return false;const handle=cropHandleAt(item,point);if(!handle)return true;const crop=imageCropFor(item),full=imageFullGeometry(item);imageCropEdit.drag={handle,startX:point.x,startY:point.y,crop:{...crop},full:{...full},itemRect:{x:item.x,y:item.y,w:item.w,h:item.h}};return true;}
    function moveImageCropPointer(point){const item=activeImageCropItem(),drag=imageCropEdit?.drag;if(!item||!drag)return false;const full=drag.full,minW=Math.max(8,full.w*.01),minH=Math.max(8,full.h*.01);if(drag.handle==="move"){
        const crop=drag.crop,dx=(point.x-drag.startX)/Math.max(1,full.w),dy=(point.y-drag.startY)/Math.max(1,full.h),x=Math.max(0,Math.min(1-crop.w,crop.x+dx)),y=Math.max(0,Math.min(1-crop.h,crop.y+dy));item.crop={x,y,w:crop.w,h:crop.h};item.x=drag.itemRect.x;item.y=drag.itemRect.y;item.w=drag.itemRect.w;item.h=drag.itemRect.h;
      }else{
        let left=drag.itemRect.x,top=drag.itemRect.y,right=drag.itemRect.x+drag.itemRect.w,bottom=drag.itemRect.y+drag.itemRect.h;
        if(drag.handle.includes("w"))left=Math.max(full.x,Math.min(right-minW,point.x));if(drag.handle.includes("e"))right=Math.min(full.x+full.w,Math.max(left+minW,point.x));if(drag.handle.includes("n"))top=Math.max(full.y,Math.min(bottom-minH,point.y));if(drag.handle.includes("s"))bottom=Math.min(full.y+full.h,Math.max(top+minH,point.y));
        item.crop=normalizedImageCrop({x:(left-full.x)/full.w,y:(top-full.y)/full.h,w:(right-left)/full.w,h:(bottom-top)/full.h});item.x=left;item.y=top;item.w=right-left;item.h=bottom-top;
      }
      syncImageCropToolbar();requestRender({canvas:true,preview:false});return true;
    }
    function endImageCropPointer(){if(!imageCropEdit?.drag)return false;imageCropEdit.drag=null;syncProperties();requestRender({canvas:true,layers:true,preview:false});return true;}
    function drawImageCropOverlay(){const item=activeImageCropItem(),asset=singleImageAssetFor(item);if(!item||!asset?.image?.complete)return;const full=imageFullGeometry(item),cropRect={x:item.x,y:item.y,w:item.w,h:item.h},z=Math.max(.1,state.zoom);ctx.save();ctx.beginPath();ctx.rect(0,0,state.width,state.height);ctx.rect(cropRect.x,cropRect.y,cropRect.w,cropRect.h);try{ctx.clip("evenodd");}catch{ctx.clip();}ctx.fillStyle="rgba(0,0,0,.34)";ctx.fillRect(0,0,state.width,state.height);ctx.globalAlpha=.28;ctx.drawImage(asset.image,full.x,full.y,full.w,full.h);ctx.restore();ctx.save();ctx.strokeStyle="#f3f6f8";ctx.lineWidth=2/z;ctx.setLineDash([8/z,5/z]);ctx.strokeRect(cropRect.x,cropRect.y,cropRect.w,cropRect.h);ctx.setLineDash([]);const size=9/z,handles=[[cropRect.x,cropRect.y],[cropRect.x+cropRect.w/2,cropRect.y],[cropRect.x+cropRect.w,cropRect.y],[cropRect.x,cropRect.y+cropRect.h/2],[cropRect.x+cropRect.w,cropRect.y+cropRect.h/2],[cropRect.x,cropRect.y+cropRect.h],[cropRect.x+cropRect.w/2,cropRect.y+cropRect.h],[cropRect.x+cropRect.w,cropRect.y+cropRect.h]];for(const [x,y] of handles){ctx.fillStyle="#fff";ctx.fillRect(x-size/2,y-size/2,size,size);ctx.strokeStyle="#111";ctx.lineWidth=1/z;ctx.strokeRect(x-size/2,y-size/2,size,size);}ctx.restore();}

    function renderCanvas(){
      const started=DEBUG_RENDER?performance.now():0;
      normalizePinnedFrameOrder();
      setCanvasSize(); ctx.clearRect(0,0,state.width,state.height);
      if(generalComicEditor?.isActive()){
        generalComicEditor.drawUnderlay(ctx,{overlay:comicOverlayExport,phase:"base"});
        generalComicEditor.drawUnderlay(ctx,{overlay:comicOverlayExport,phase:"images"});
        state.elements.forEach(drawElement);
        generalComicEditor.drawUnderlay(ctx,{overlay:comicOverlayExport,phase:"borders"});
      }else if(comicEditor?.isActive()){
        comicEditor.drawUnderlay(ctx,{overlay:comicOverlayExport,phase:"base"});
        state.elements.filter(item=>item.comic_scope==="panel"&&item.comic_stack==="below_image").forEach(drawElement);
        comicEditor.drawUnderlay(ctx,{overlay:comicOverlayExport,phase:"images"});
        state.elements.filter(item=>item.comic_scope==="panel"&&item.comic_stack!=="below_image").forEach(drawElement);
        comicEditor.drawUnderlay(ctx,{overlay:comicOverlayExport,phase:"borders"});
        state.elements.filter(item=>item.comic_scope!=="panel").forEach(drawElement);
      }else{
        if(state.backgroundVisible)canvasBackgroundPatterns?.draw(ctx,state.canvasBackground,state.width,state.height);
        state.elements.forEach(drawElement);
      }
      if(cleanSceneCanvas.width!==canvas.width)cleanSceneCanvas.width=canvas.width;if(cleanSceneCanvas.height!==canvas.height)cleanSceneCanvas.height=canvas.height;cleanSceneContext.clearRect(0,0,cleanSceneCanvas.width,cleanSceneCanvas.height);cleanSceneContext.drawImage(canvas,0,0);
      comicEditor?.drawOverlay(ctx);
      generalComicEditor?.drawOverlay(ctx);
      drawImageCropOverlay();
      const items=selectedItems(),selected=state.elements.find(e=>e.id===state.selected),editableItems=items.filter(canvasItemEditable),editableSelected=editableItems.find(item=>item.id===state.selected)||editableItems.at(-1),selectionItem=editableItems.length>1?selectionBounds(editableItems):editableSelected,canvasSelectionEditable=editableItems.length>0;
      const altOverride=state.drag?.altOverride&&items.length===1&&selected?.id===state.drag.items?.[0]?.item?.id;
       if(!imageCropEdit&&selectionItem&&!(items.length===1&&selected?.type==="emphasis_lines")&&(canvasSelectionEditable||altOverride)&&(!selectionItem.locked||altOverride)&&(!selected||state.vectorEditId!==selected.id))drawSelection(selectionItem);
      if(items.length===1&&selected?.type==="emphasis_lines"&&!selected.locked)drawEmphasisCenterHandle(selected);
      if(items.length===1&&selected&&!selected.locked&&state.vectorEditId===selected.id&&Array.isArray(selected.path_points)){ctx.save();ctx.lineWidth=1/state.zoom;selected.path_points.forEach((point,index)=>{const anchor=localToVisual(selected,point.x,point.y),inside=localToVisual(selected,point.in_x??point.x,point.in_y??point.y),outside=localToVisual(selected,point.out_x??point.x,point.out_y??point.y);ctx.strokeStyle="#7b8794";ctx.beginPath();ctx.moveTo(inside.x,inside.y);ctx.lineTo(anchor.x,anchor.y);ctx.lineTo(outside.x,outside.y);ctx.stroke();for(const control of [inside,outside]){const size=7/state.zoom;ctx.fillStyle="#f3f6fa";ctx.fillRect(control.x-size/2,control.y-size/2,size,size);ctx.strokeStyle="#20252b";ctx.lineWidth=1/state.zoom;ctx.strokeRect(control.x-size/2,control.y-size/2,size,size);}ctx.beginPath();ctx.arc(anchor.x,anchor.y,6/state.zoom,0,Math.PI*2);ctx.fillStyle=index===state.vectorAnchorIndex?"#ffd34d":"#4fa3ff";ctx.fill();ctx.strokeStyle="#102a43";ctx.stroke();});ctx.restore();}
      if(items.length===1&&selected&&!selected.locked&&selected.type==="bubble"&&selected.tail!=="none"&&!state.vectorEditId){const tip=visualTailPoint(selected);ctx.save();ctx.beginPath();ctx.arc(tip.x,tip.y,10/state.zoom,0,Math.PI*2);ctx.fillStyle="#ffd34d";ctx.fill();ctx.strokeStyle="#332600";ctx.lineWidth=2/state.zoom;ctx.stroke();ctx.restore();}
      const elapsed=DEBUG_RENDER?performance.now()-started:0;if(DEBUG_RENDER&&elapsed>16)console.debug(`Speech Bubble render: ${elapsed.toFixed(1)}ms`);
    }
    function takePendingRenderOptions(){const options=pendingRenderOptions;pendingRenderOptions={canvas:false,layers:false,preview:false};return options;}
    function performRequestedRender(){const options=takePendingRenderOptions(),revision=renderRevision;if(options.canvas)renderCanvas();if(options.layers)refreshLayers();if(options.preview)scheduleLivePreview(revision);}
    function requestRender(options={canvas:true,layers:false,preview:false}){renderRevision+=1;pendingRenderOptions.canvas||=options.canvas===true;pendingRenderOptions.layers||=options.layers===true;pendingRenderOptions.preview||=options.preview===true;if(options.preview===true){markLayoutDirty();scheduleAutoSave();}schedulePaletteSync();if(!renderFrameId)renderFrameId=requestAnimationFrame(()=>{renderFrameId=0;performRequestedRender();});}
    function flushPendingRender(){if(!renderFrameId&&!pendingRenderOptions.canvas&&!pendingRenderOptions.layers&&!pendingRenderOptions.preview)return;if(renderFrameId){cancelAnimationFrame(renderFrameId);renderFrameId=0;}performRequestedRender();}
    function render(){requestRender({canvas:true,layers:true,preview:true});}
    function refreshLayers(){
      const host=document.getElementById("layers");host.innerHTML="";
      [...state.elements].reverse().forEach(item=>{
        const row=document.createElement("div");row.className=`layer ${state.selection.includes(item.id)?"selected":""} ${item.group_id?"grouped":""}`;row.draggable=!item.locked&&!isPinnedFrame(item);row.dataset.layerId=item.id;if(comicEditor?.isActive()&&item.comic_scope==="panel"){row.classList.add("comic-layer-nested");row.dataset.comicPanelTarget=item.comic_panel_id||"";row.dataset.comicStack=item.comic_stack==="below_image"?"below_image":"above_image";}else if(generalComicEditor?.isActive()&&item.general_comic_scope==="panel"){row.classList.add("general-comic-layer-nested");row.dataset.generalComicPanelTarget=item.general_comic_panel_id||"";}
        row.onclick=event=>{if(event.altKey){setSelection(selectionIdsFor(item,false,true),item.id);layerSelectionAnchorId=item.id;}else selectLayerRow(item,event);syncProperties();render();};
        row.addEventListener("dragstart",event=>{row.classList.add("dragging");event.dataTransfer.setData("text/plain",item.id);event.dataTransfer.effectAllowed="move";});
        row.addEventListener("dragend",()=>row.classList.remove("dragging"));
        row.addEventListener("dragover",event=>event.preventDefault());
        row.addEventListener("drop",event=>{event.preventDefault();const draggedId=event.dataTransfer.getData("text/plain");if(!draggedId||draggedId===item.id)return;pushUndo();const from=state.elements.findIndex(layer=>layer.id===draggedId);if(from<0)return;const dragged=state.elements.splice(from,1)[0];const target=state.elements.findIndex(layer=>layer.id===item.id);state.elements.splice(target+1,0,dragged);if(comicEditor?.isActive()&&dragged.type!=="frame"){if(item.comic_scope==="panel"){dragged.comic_scope="panel";dragged.comic_panel_id=item.comic_panel_id||"";dragged.comic_stack=item.comic_stack==="below_image"?"below_image":"above_image";}else{dragged.comic_scope=dragged.type==="emphasis_lines"?"page":"free";dragged.comic_panel_id="";dragged.comic_stack="above_image";}}else if(generalComicEditor?.isActive()&&dragged.type!=="frame")generalComicEditor.assignElementTarget?.(dragged,item.general_comic_scope==="panel"?{scope:"panel",panelId:item.general_comic_panel_id}:{scope:"page"});normalizePinnedFrameOrder();render();});
        const eye=document.createElement("button");eye.className="eye";eye.textContent=item.visible===false?"○":"◉";eye.title=uiText("表示 / 非表示","Show / Hide");eye.setAttribute("aria-label",eye.title);eye.onclick=event=>{event.stopPropagation();const targets=state.selection.length>1&&state.selection.includes(item.id)?selectedItems():[item],visible=item.visible===false;pushUndo();targets.forEach(layer=>layer.visible=visible);render();};
        const kind=document.createElement("span"),assetPreset=item.type==="sfx"?SFX_BY_ID.get(item.asset_id):null,kindName=item.type==="image"?"image":item.type==="text"?"text":item.type==="sfx"?(isComicStamp(assetPreset)?"stamp":"sfx"):item.type==="frame"?"frame":item.type==="emphasis_lines"?"emphasis":"bubble";row.dataset.layerKind=kindName;kind.className=`kind ${kindName}`;kind.textContent=item.type==="image"?"▧":item.type==="text"?"T":item.type==="sfx"?(kindName==="stamp"?"ST":"FX"):item.type==="frame"?"▣":item.type==="emphasis_lines"?"✺":"";
        const name=document.createElement("span"),emphasisPreset=EMPHASIS_BY_ID.get(item.preset);name.className="name";name.textContent=item.type==="image"?`${uiText("画像","Image")}: ${item.image_name||"Image"}`:item.type==="text"?(item.text||"Text"):item.type==="sfx"?builtinAssetDisplayLabel(item):item.type==="frame"?`${item.frame_label||"Frame Border"}${isPinnedFrame(item)?" · TOP":""}`:item.type==="emphasis_lines"?`Emphasis — ${emphasisPreset?.label||"Center"}`:presetLabel(item);if(comicEditor?.isActive()&&item.comic_scope==="panel"){const target=comicEditor.elementTargetValue?.(item),option=comicEditor.elementTargetOptions?.(item).find(candidate=>candidate.value===target);name.textContent+=` · ${option?.label||uiText("コマ内","Inside Panel")}`;}else if(generalComicEditor?.isActive()&&item.general_comic_scope==="panel"){const target=generalComicEditor.elementTargetValue?.(item),option=generalComicEditor.elementTargetOptions?.(item).find(candidate=>candidate.value===target);name.textContent+=` · ${option?.label||uiText("コマ内","Inside Panel")}`;}
        const lock=document.createElement("button");lock.className="lock";lock.textContent=item.locked?"🔒":"🔓";lock.title=uiText("ロック / ロック解除","Lock / Unlock");lock.setAttribute("aria-label",lock.title);lock.onclick=event=>{event.stopPropagation();const targets=state.selection.length>1&&state.selection.includes(item.id)?selectedItems():[item],locked=!item.locked;pushUndo();targets.forEach(layer=>layer.locked=locked);syncProperties();render();};
        const more=document.createElement("button");more.className="more";more.textContent="⋮";more.title=uiText("レイヤー操作","Layer options");more.setAttribute("aria-label",more.title);more.onclick=event=>{event.stopPropagation();if(state.selection.length>1&&state.selection.includes(item.id))state.selected=item.id;else setSelection(selectionIdsFor(item),item.id);syncProperties();render();updateLayerMenuState();const menu=document.getElementById("layerMenu");menu.style.left=`${Math.min(event.clientX,window.innerWidth-165)}px`;menu.style.top=`${Math.min(event.clientY,window.innerHeight-155)}px`;menu.classList.add("open");};
        row.append(eye,kind,name,lock,more);host.append(row);
      });
      if(generalComicEditor?.isActive()){
        generalComicEditor.renderLayers(host);
        const panelRows=[...host.querySelectorAll('[data-general-comic-layer="panel"]')],nestedRows=[...host.querySelectorAll("[data-general-comic-panel-target]")];
        for(const row of nestedRows.reverse()){
          const imageRow=host.querySelector(`[data-general-comic-layer="image"][data-general-comic-panel-id="${CSS.escape(row.dataset.generalComicPanelTarget)}"]`);
          const panelRow=panelRows.find(candidate=>candidate.dataset.generalComicPanelId===row.dataset.generalComicPanelTarget);
          (imageRow||panelRow)?.insertAdjacentElement("afterend",row);
        }
        const pageRow=host.querySelector('[data-general-comic-layer="page"]'),pageLayerRows=[...host.querySelectorAll('[data-layer-id]:not([data-general-comic-panel-target])')];
        if(pageRow){host.prepend(pageRow);for(const row of pageLayerRows.reverse())pageRow.insertAdjacentElement("afterend",row);}
      }
      else if(comicEditor?.isActive()){
        comicEditor.renderLayers(host);
        const panelRows=[...host.querySelectorAll('[data-comic-layer="panel"]')],nestedRows=[...host.querySelectorAll("[data-comic-panel-target]")];
        for(const row of nestedRows.filter(candidate=>candidate.dataset.comicStack!=="below_image").reverse()){
          const panelRow=panelRows.find(candidate=>candidate.dataset.comicPanelId===row.dataset.comicPanelTarget);
          if(panelRow)panelRow.insertAdjacentElement("afterend",row);
        }
        for(const row of nestedRows.filter(candidate=>candidate.dataset.comicStack==="below_image").reverse()){
          const imageRow=host.querySelector(`[data-comic-layer="image"][data-comic-panel-id="${CSS.escape(row.dataset.comicPanelTarget)}"]`);
          const panelRow=panelRows.find(candidate=>candidate.dataset.comicPanelId===row.dataset.comicPanelTarget);
          (imageRow||panelRow)?.insertAdjacentElement("afterend",row);
        }
      }
      else{const background=document.createElement("div"),backgroundEye=document.createElement("button"),backgroundMore=document.createElement("button");background.className=`layer ${state.selected===BACKGROUND_LAYER_ID?"selected":""}`;background.onclick=()=>{state.selected=BACKGROUND_LAYER_ID;state.selection=[];layerSelectionAnchorId="";syncProperties();render();};backgroundEye.className="eye";backgroundEye.textContent=state.backgroundVisible?"◉":"○";backgroundEye.title="Show / Hide Canvas Background";backgroundEye.onclick=event=>{event.stopPropagation();pushUndo();state.backgroundVisible=!state.backgroundVisible;syncProperties();render();};background.innerHTML=`<span class="kind image">▧</span><span class="name">${uiText("キャンバス背景","Canvas Background")}</span>`;backgroundMore.className="more";backgroundMore.textContent="⋮";backgroundMore.title="Canvas background options";backgroundMore.onclick=event=>{event.stopPropagation();state.selected=BACKGROUND_LAYER_ID;state.selection=[];layerSelectionAnchorId="";syncProperties();};background.prepend(backgroundEye);background.append(document.createElement("span"),backgroundMore);host.append(background);}
    }
    function selectedImageLayer(){const item=state.elements.find(element=>element.id===state.selected);return item?.type==="image"?item:null;}
    function resetBackgroundPosition(){const item=selectedImageLayer();if(!item||item.locked)return;pushUndo();item.x=(state.width-item.w)/2;item.y=(state.height-item.h)/2;syncProperties();render();}
    function fitSelectedImage(mode){const item=selectedImageLayer(),asset=singleImageAssetFor(item);if(!item||!asset||item.locked)return;pushUndo();Object.assign(item,fitImageLayerGeometry(asset,mode));item.crop={x:0,y:0,w:1,h:1};syncProperties();render();}
    function removeBackgroundImage(){const item=selectedImageLayer();if(!item)return;pushUndo();const index=state.elements.indexOf(item);state.elements.splice(index,1);const next=state.elements[Math.min(index,state.elements.length-1)]?.id||null;setSelection(next?[next]:[],next);syncProperties();render();updateActionState();}
    function showBackgroundLayerMenu(x,y){let menu=document.getElementById("backgroundLayerMenu");if(!menu){menu=document.createElement("div");menu.id="backgroundLayerMenu";menu.className="context-menu open";menu.innerHTML='<button type="button" data-background-action="replace">Replace Image</button><button type="button" data-background-action="reset">Reset Position</button><button type="button" data-background-action="remove">Remove Image</button>';menu.onclick=event=>{const action=event.target.dataset.backgroundAction;if(action==="replace")backgroundInput.click();else if(action==="reset")resetBackgroundPosition();else if(action==="remove")removeBackgroundImage();menu.classList.remove("open");};document.body.append(menu);}menu.style.left=`${Math.min(x,innerWidth-170)}px`;menu.style.top=`${Math.min(y,innerHeight-120)}px`;menu.classList.add("open");}
    function syncFrameAttachedDecorationControls(item,preset){const host=document.getElementById("frameAttachedDecorations"),list=document.getElementById("frameAttachedDecorationList"),decorations=preset?.attached_decorations||[];if(!host||!list)return;host.hidden=!item||item.type!=="frame"||!decorations.length;if(host.hidden){list.replaceChildren();return;}const enabled=new Set(Array.isArray(item.attached_decorations)?item.attached_decorations:decorations.map(decoration=>decoration.id));list.replaceChildren(...decorations.map(decoration=>{const label=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span");input.type="checkbox";input.dataset.frameDecoration=decoration.id;input.checked=enabled.has(decoration.id);input.disabled=!!item.locked;text.textContent=decoration.label;label.append(text,input);return label;}));}
    function syncComicTargetControls(item){
      const generalMode=generalComicEditor?.isActive()===true,assetLabel=document.getElementById("comicLayerScopeLabel"),emphasisLabel=document.getElementById("emphasisComicScopeLabel");
      if(assetLabel)assetLabel.textContent=generalMode?uiText("コミック内の配置","Comic Placement"):uiText("4コマ内の配置","4-Panel Placement");
      if(emphasisLabel)emphasisLabel.textContent=generalMode?uiText("コミック内の適用先","Comic Target"):uiText("4コマ内の適用先","4-Panel Target");
      document.querySelectorAll("[data-comic-target]").forEach(select=>{
        const editor=activeStructuralEditor(),kind=select.dataset.comicTarget,relevant=Boolean(editor)&&item&&(kind==="emphasis"?item.type==="emphasis_lines":item.type!=="emphasis_lines"&&(generalMode||item.type!=="frame"));
        select.disabled=!relevant;
        if(!relevant)return;
        const options=editor.elementTargetOptions?.(item)||[],signature=options.map(option=>`${option.value}:${option.label}`).join("|");
        if(select.dataset.optionSignature!==signature){
          select.replaceChildren(...options.map(option=>{const node=document.createElement("option");node.value=option.value;node.textContent=option.label;return node;}));
          select.dataset.optionSignature=signature;
        }
        select.value=editor.elementTargetValue?.(item)||options[0]?.value||"";
      });
    }
    function syncProperties(){
      if(activeWorkspace==="single"&&state.selected===BACKGROUND_LAYER_ID){const panel=document.getElementById("properties"),empty=document.getElementById("empty");panel.querySelectorAll('[id$="Props"]').forEach(node=>node.hidden=true);document.getElementById("transformDetails").hidden=true;document.getElementById("shadowEffects").hidden=true;document.getElementById("comicLayerScopeRow").hidden=true;document.getElementById("canvasBackgroundProps").hidden=false;panel.classList.remove("disabled");empty.hidden=true;rebuildCanvasBackgroundProperties();return;}
      if(generalComicEditor?.isActive()&&!state.selection.length){generalComicEditor.syncProperties();return;}
      if(comicEditor?.syncProperties())return;
      document.getElementById("backgroundProps").hidden=true;
      document.getElementById("canvasBackgroundProps").hidden=true;
      syncImageCropToolbar();
      const items=selectedItems();if(state.selected&&!items.some(item=>item.id===state.selected))state.selected=items.at(-1)?.id||null;const item=state.elements.find(e=>e.id===state.selected),multiple=items.length>1,allText=multiple&&items.every(layer=>layer.type==="text"),panel=document.getElementById("properties"),empty=document.getElementById("empty"),lockedCount=items.filter(layer=>layer.locked).length,locked=multiple?lockedCount===items.length:Boolean(item?.locked),frameBorderProps=document.getElementById("frameBorderProps"),frameDecorativeProps=document.getElementById("frameDecorativeProps"),deleteFrameBtn=document.getElementById("deleteFrameBtn");
      if(!multiple&&item?.type==="image"){const scale=imageLayerScale(item),rotation=imageLayerRotation.normalize(item.rotation),opacity=Math.round(Math.max(0,Math.min(1,finiteOr(item.opacity,1)))*100);document.getElementById("backgroundProps").hidden=false;panel.classList.remove("disabled");empty.hidden=true;document.getElementById("backgroundImageName").textContent=item.image_name||"Image";document.getElementById("backgroundScaleRange").value=String(scale);document.getElementById("backgroundScaleOutput").textContent=`${scale}%`;document.getElementById("backgroundOffsetX").value=String(Math.round(item.x));document.getElementById("backgroundOffsetY").value=String(Math.round(item.y));document.getElementById("backgroundRotationRange").value=String(rotation);document.getElementById("backgroundRotation").value=String(rotation);document.getElementById("backgroundOpacity").value=String(opacity);document.getElementById("backgroundOpacityOutput").textContent=`${opacity}%`;for(const control of document.querySelectorAll("#backgroundProps input,#backgroundProps button"))control.disabled=locked&&!control.matches("#replaceBackgroundImage,#removeBackgroundImage,#processImageBackgroundRemoval,#processImageComicConversion");syncImageCropToolbar();return;}
      empty.textContent=locked?"Unlock the selected layer to edit it.":"Select a layer to edit it.";empty.hidden=Boolean(item)&&!locked;panel.classList.toggle("disabled",!item||locked);
      document.getElementById("groupProps").hidden=!multiple;document.getElementById("selectionCount").textContent=uiText(`${items.length}レイヤーを選択中`,`${items.length} layers selected`);document.getElementById("selectionStatusHint").textContent=lockedCount?uiText(`${lockedCount}個のロック済みレイヤーを除外して変形します。`,`${lockedCount} locked layer${lockedCount===1?"":"s"} excluded from transforms.`):uiText("キャンバスのハンドルでまとめて移動・拡大縮小・回転できます。","Drag the canvas handles to move, resize, or rotate them together.");syncMultiAlignmentUi(items);
      document.getElementById("bubbleProps").hidden=multiple||item?.type!=="bubble";document.getElementById("shapeTuningProps").hidden=multiple||isFixedPathItem(item)||!shapeTuningForItem(item);const textProps=document.getElementById("textProps");textProps.hidden=!allText&&(multiple||item?.type!=="text");textProps.classList.toggle("multi-text-edit",allText);document.getElementById("sfxProps").hidden=multiple||item?.type!=="sfx";document.getElementById("frameProps").hidden=multiple||item?.type!=="frame";document.getElementById("emphasisProps").hidden=multiple||item?.type!=="emphasis_lines";const sfxPreset=item?.type==="sfx"?SFX_BY_ID.get(item.asset_id):null,isSfx=item?.type==="sfx"&&!multiple,userSfx=isSfx&&Boolean(String(item.user_asset_id||"").replace(/^user:/,"")),maskSfx=isSfx?Boolean(item.mask_mode??sfxPreset?.mask):false;if(isSfx&&!maskSfx&&compactSwatchTargets.asset==="fill")compactSwatchTargets.asset="stroke";document.getElementById("sfxUserColorMode").hidden=!userSfx;document.querySelectorAll("[data-sfx-color-mode]").forEach(button=>{const active=userSfx&&button.dataset.sfxColorMode===(maskSfx?"fill":"original");button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});document.getElementById("sfxMaskProps").hidden=!isSfx;document.getElementById("sfxFillColorRow").hidden=!maskSfx;document.getElementById("sfxFillSwatchTarget").hidden=!maskSfx;document.getElementById("sfxStrokeSwatchTarget").textContent=maskSfx?"Outline":"Border";document.getElementById("sfxOutlineColorLabel").textContent=maskSfx?"Outline Color":"Border Color";document.getElementById("sfxOutlineWidthLabel").textContent=maskSfx?"Outline Width":"Border Width";document.getElementById("sfxFormatHint").textContent=userSfx?(maskSfx?"User asset Fill: fill / outline editable":"User asset Original: original colors / border editable"):(maskSfx?"Mask: fill / outline editable":"Raster asset: border editable");document.getElementById("shadowEffects").hidden=multiple||!item||item.type==="frame"||item.type==="emphasis_lines";
      const emphasisScopeRow=document.getElementById("emphasisComicScopeRow");if(emphasisScopeRow)emphasisScopeRow.hidden=!["desktop","desktop-file","forge-project"].includes(hostMode)||!activeStructuralEditor()||multiple||item?.type!=="emphasis_lines";
      const comicLayerScopeRow=document.getElementById("comicLayerScopeRow");if(comicLayerScopeRow)comicLayerScopeRow.hidden=!activeStructuralEditor()||multiple||!item||item.type==="emphasis_lines"||(item.type==="frame"&&!generalComicEditor?.isActive());
       const basicSymbolKind=basicSymbolKindFor(item),basicSymbolProps=document.getElementById("basicSymbolProps"),symbolTopWidthRow=document.getElementById("symbolTopWidthRow"),symbolSkewRow=document.getElementById("symbolSkewRow");if(basicSymbolProps)basicSymbolProps.hidden=!(["square","trapezoid"].includes(basicSymbolKind));if(symbolTopWidthRow)symbolTopWidthRow.hidden=basicSymbolKind!=="trapezoid";if(symbolSkewRow)symbolSkewRow.hidden=basicSymbolKind!=="square";
       const fixedPath=isFixedPathItem(item),tuning=shapeTuningForItem(item),family=tuning?.family,roundnessLabel=document.querySelector("#roundnessProps label");document.getElementById("roundnessProps").hidden=!["oval","box"].includes(family);if(roundnessLabel)roundnessLabel.childNodes[0].nodeValue=family==="oval"?"Oval Fullness":"Corner Roundness";document.getElementById("jaggedShapeProps").hidden=!["jagged","soft"].includes(family);document.getElementById("cloudShapeProps").hidden=family!=="cloud"||fixedPath;document.getElementById("valleyConcavityRow").hidden=family!=="jagged"||item?.valley_style==="straight";document.getElementById("shapeIntensityRow").hidden=["oval","box"].includes(family);document.getElementById("shapeIntensityLabel").textContent=family==="cloud"?"Cloudiness":family==="heart"?"Heart Fullness":"Shape Intensity";document.getElementById("shapeTuningHint").textContent=family==="oval"?"Adjust oval fullness; it remains an oval.":family==="box"?"Adjust corner radius; it remains a box.":family==="jagged"?(item?.valley_style==="straight"?"Sharp asymmetric manga spikes":"Curved inward manga spikes"):family==="soft"?"Rounded asymmetric burst; never collapses to an oval.":family==="cloud"?"Asymmetric manga thinking-cloud lobes.":family==="heart"?"Adjust within the heart family.":"Edit Path: direct Bézier editing";
      document.getElementById("transformDetails").hidden=!item||locked||multiple;document.getElementById("groupSelection").disabled=items.filter(layer=>!layer.locked).length<2;document.getElementById("ungroupSelection").disabled=!items.some(layer=>layer.group_id);const selectedFrame=item?.type==="frame",decorativeFrame=selectedFrame&&(item.frame_kind==="decorative"||item.frame_mode!=="border"||!!item.asset_src),framePreset=selectedFrame?(FRAME_BY_ID.get(item.frame_preset_id)||FRAME_PRESETS[0]):null,frameFitModeProps=document.getElementById("frameFitModeProps"),frameAssetWarning=document.getElementById("frameAssetWarning");if(frameBorderProps)frameBorderProps.hidden=!selectedFrame||decorativeFrame;if(frameDecorativeProps)frameDecorativeProps.hidden=!selectedFrame||!decorativeFrame;if(frameFitModeProps)frameFitModeProps.hidden=!selectedFrame||(item.frame_mode||framePreset?.frame_mode)!=="full-overlay";syncFrameAttachedDecorationControls(selectedFrame?item:null,framePreset);if(frameAssetWarning){const status=selectedFrame?frameAssetScaleStatus(item,framePreset):null;frameAssetWarning.hidden=!status;frameAssetWarning.textContent=status?.text||"";frameAssetWarning.dataset.level=status?.level||"";}if(deleteFrameBtn)deleteFrameBtn.disabled=!isFrameSelected(item);
      const edit=document.getElementById("editVector"),addPoint=document.getElementById("addVectorPoint"),deletePoint=document.getElementById("deleteVectorPoint"),vectorTools=document.querySelector(".vector-tools"),vectorHint=document.querySelector(".vector-tools + .hint"),vectorEditing=state.vectorEditId===item?.id;if(fixedPath&&vectorEditing){state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;}const editingPath=!fixedPath&&state.vectorEditId===item?.id;if(vectorTools)vectorTools.hidden=fixedPath;if(vectorHint)vectorHint.hidden=fixedPath;edit.disabled=fixedPath;edit.textContent=editingPath?"Finish Path":"Edit Path";edit.classList.toggle("active",editingPath);addPoint.classList.toggle("active",state.vectorAddMode);addPoint.disabled=!editingPath;deletePoint.disabled=!editingPath||state.vectorAnchorIndex===null||(item?.path_points?.length||0)<=3;
      if(!item){syncComicTargetControls(null);syncEmphasisCenterGapMaster(null);updateSfxSwatches(null);updateCompactColorSwatches(null);updateFontPicker(null);return;}if(item.type==="text"){item.writing=item.writing==="vertical"?"vertical":"horizontal";item.align=["left","right"].includes(item.align)?item.align:"center";}if(item.type!=="emphasis_lines"&&item.type!=="frame")item.comic_scope=item.comic_scope==="panel"?"panel":"free";item.general_comic_scope=item.general_comic_scope==="panel"?"panel":"page";item.general_comic_panel_id=item.general_comic_scope==="panel"?String(item.general_comic_panel_id||""):null;const values=multiple&&!allText?selectionBounds(items):item,bulkTextKeys=new Set(["font_size","color","stroke_color","stroke_width","tracking"]);panel.querySelectorAll("[data-key]").forEach(input=>{const key=input.dataset.key,bulkValues=allText&&bulkTextKeys.has(key)?items.map(layer=>layer[key]):null,mixed=Boolean(bulkValues&&!bulkValues.every(value=>value===bulkValues[0])),value=bulkValues?bulkValues[0]:(key==="sfx_scale"&&item.type==="sfx"?sfxScalePercent(item):values?.[key]);input.classList.toggle("mixed-value",mixed);if(input.type==="checkbox"){input.checked=!!value;input.indeterminate=mixed;}else if(input.type==="number"){input.value=mixed?"":numericDisplayValue(key,value,rangeSpecs[key]?.[0]??0);input.placeholder=mixed?"—":"";}else if(input.type==="color")input.value=value||"#000000";else input.value=value??"";});panel.querySelectorAll("[data-range-key]").forEach(input=>{const key=input.dataset.rangeKey,value=key==="sfx_scale"&&item.type==="sfx"?sfxScalePercent(item):values?.[key];input.value=numericDisplayValue(key,value,rangeSpecs[key]?.[0]??0);});syncComicTargetControls(item);syncEmphasisCenterGapMaster(item);updateSfxSwatches(item);updateCompactColorSwatches(item);
      document.querySelectorAll("[data-writing]").forEach(button=>{const active=button.dataset.writing===item.writing;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});document.querySelectorAll("[data-text-align]").forEach(button=>{const active=button.dataset.textAlign===(item.align||"center");button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});document.querySelectorAll("[data-toggle-key]").forEach(button=>{const key=button.dataset.toggleKey,values=allText?items.map(layer=>!!layer[key]):[!!item[key]],active=values.every(Boolean),mixed=values.some(Boolean)&&!active;button.classList.toggle("active",active);button.classList.toggle("mixed-value",mixed);button.setAttribute("aria-pressed",mixed?"mixed":String(active));});const savePreset=document.getElementById("saveUserPreset"),savePresetAs=document.getElementById("saveUserPresetAs");savePreset.textContent=item.user_preset_id?uiText("変更を保存…","Save Changes…"):uiText("ユーザープリセットとして保存…","Save as User Preset…");savePresetAs.hidden=!item.user_preset_id;savePresetAs.textContent=uiText("別名で保存…","Save As…");
      updateFontPicker(item);if(document.getElementById("fontBrowser").classList.contains("open"))renderFontBrowser();
    }
    function showFontLoadError(message){const list=document.getElementById("fontList");if(!list)return;const retry=document.createElement("button");retry.type="button";retry.className="font-family-select";retry.textContent=`${message} — ${uiText("再試行","Retry")}`;retry.onclick=()=>{retry.disabled=true;retry.textContent=uiText("システムフォントを再読込中…","Reloading system fonts…");loadSystemFonts();};list.replaceChildren(retry);}
    async function loadSystemFonts(){
      if(location.protocol==="file:"){
        showFontLoadError(uiText("システムフォントは start.cmd から起動すると利用できます","System fonts are available when launched with start.cmd."));
        return;
      }
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(`${apiBase}/fonts?v=${encodeURIComponent(assetCacheVersion)}`,{signal:controller.signal});if(!response.ok)throw new Error(`Font catalog failed (${response.status})`);const catalog=(await response.json()).fonts||[];if(!catalog.length)throw new Error("System font catalog is empty");
        fontCatalog=catalog;fontFamilies=buildFontFamilies(catalog);const select=document.getElementById("fontSelect");select.innerHTML='<option value="">Auto / System Default</option>';catalog.forEach(font=>{const option=document.createElement("option");option.value=font.id;option.textContent=font.name;option.dataset.family=font.family;option.dataset.language=font.language;select.append(option);});
        const fallback=catalog.find(font=>font.recommended)||catalog[0],loaders=[];state.elements.filter(item=>item.type==="text").forEach(item=>{const font=matchingSavedFont(item,catalog)||(hasSavedFontIdentity(item)?null:fallback);if(font){applyResolvedFont(item,font);loaders.push(ensureFontLoaded(font).then(loaded=>({item,font,loaded})));}else item.font_css_family=item.font_css_family||item.font_family||"sans-serif";});syncProperties();render();const resolved=await Promise.all(loaders);verticalGlyphSpriteCache.clear();for(const result of resolved){if(!result.loaded||!state.elements.includes(result.item))continue;applyResolvedFont(result.item,result.font);fitTextBox(result.item,true,!result.item.auto_fit);}syncProperties();render();
      }catch(error){console.warn("Speech Bubble font list unavailable",error);showFontLoadError(error?.name==="AbortError"?uiText("システムフォントの読込がタイムアウトしました","System font loading timed out."):uiText("システムフォントを読み込めませんでした","System fonts could not be loaded."));}
      finally{clearTimeout(timeout);}
    }
    const rangeSpecs={x:[-8192,8192,1],y:[-8192,8192,1],w:[1,8192,1],h:[1,8192,1],sfx_scale:[10,400,1],symbol_top_width:[20,180,1],symbol_skew:[-50,50,1],opacity:[0,1,.05],font_size:[1,500,1],tracking:[-200,500,5],font_scale_x:[10,500,1],font_scale_y:[10,500,1],rotation:[-180,180,1],stroke_width:[0,100,.5],border_width:[0,1000,1],border_width_x:[0,1000,1],border_width_y:[0,1000,1],inner_stroke_width:[0,200,1],frame_scale:[10,400,1],frame_inset:[-2048,2048,1],shadow_opacity:[0,1,.05],shadow_x:[-500,500,1],shadow_y:[-500,500,1],shadow_blur:[0,200,1],glow_opacity:[0,1,.05],glow_blur:[0,200,1],glow_spread:[0,100,1],shape_intensity:[0,100,1],shape_asymmetry:[0,100,1],shape_roundness:[0,100,1],spike_count:[5,32,1],valley_concavity:[0,100,1],lobe_count:[5,20,1],lobe_depth:[0,100,1],shape_softness:[0,100,1],line_count:[20,500,1],inner_x:[.03,.65,.005],inner_y:[.03,.65,.005],line_width:[.0005,.035,.0005],line_length:[.15,1,.01],taper:[0,1,.01],center_x:[-.5,1.5,.005],center_y:[-.5,1.5,.005],length_random:[0,1,.01],inner_random:[0,1,.01],width_random:[0,1,.01],spacing_random:[0,1,.01],seed:[0,4294967295,1]};
    function numericStepDecimals(step){const text=String(step),decimal=text.indexOf(".");return decimal<0?0:Math.min(4,text.length-decimal-1);}
    function normalizeNumericValue(key,value,fallback=0){const spec=rangeSpecs[key];let number=Number(value);if(!Number.isFinite(number)){number=Number(fallback);if(!Number.isFinite(number))number=0;}if(key==="tracking")return trackingValue(number,fallback);if(!spec)return Object.is(number,-0)?0:number;const [minimum,maximum,step]=spec;number=Math.max(minimum,Math.min(maximum,number));if(step>0)number=Math.round(number/step)*step;number=Number(number.toFixed(numericStepDecimals(step)));return Object.is(number,-0)?0:number;}
    function numericDisplayValue(key,value,fallback=0){return String(normalizeNumericValue(key,value,fallback));}
    function numericPropertyValue(key,value,current,commit=false){if(String(value).trim()===""||!Number.isFinite(Number(value)))return null;return commit?normalizeNumericValue(key,value,current):Number(value);}
    function normalizeItemNumericValues(item){const fallbacks={w:1,h:1,opacity:1,font_size:48,font_scale_x:100,font_scale_y:100};for(const key of Object.keys(rangeSpecs)){if(key in item||key==="opacity")item[key]=normalizeNumericValue(key,item[key],fallbacks[key]??0);}return item;}
    function enhanceNumericInputs(){document.querySelectorAll('#properties input[type="number"][data-key]').forEach(input=>{const key=input.dataset.key,spec=rangeSpecs[key];if(!spec)return;input.min=String(spec[0]);input.max=String(spec[1]);input.step=String(spec[2]);if(!input.hasAttribute("data-no-range")){const range=document.createElement("input");range.type="range";range.min=String(spec[0]);range.max=String(spec[1]);range.step=String(spec[2]);range.value=numericDisplayValue(key,input.value,spec[0]);range.dataset.rangeKey=key;range.setAttribute("aria-label",`${input.getAttribute("aria-label")||key} slider`);input.insertAdjacentElement(input.closest(".emphasis-control-row")?"beforebegin":"afterend",range);range.addEventListener("input",()=>{input.value=numericDisplayValue(key,range.value,input.value);input.dispatchEvent(new Event("input",{bubbles:true}));});input.addEventListener("input",()=>{const value=Number(input.value);if(Number.isFinite(value))range.value=String(value);});}input.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();input.blur();}});input.addEventListener("wheel",event=>{event.preventDefault();beginPropertyEdit();const step=Number(input.step||1)*(event.shiftKey?10:1),current=normalizeNumericValue(key,input.value,0),next=current+(event.deltaY<0?step:-step);input.value=numericDisplayValue(key,next,current);input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));},{passive:false});});}
    const PANEL_STATE_KEY="speech_bubble:panel_state:v1";
    function initializeAccordionState(){let saved={};try{saved=JSON.parse(localStorage.getItem(PANEL_STATE_KEY)||"{}")||{};}catch{}for(const details of [document.getElementById("textLayoutDetails"),document.getElementById("transformDetails"),document.getElementById("shadowEffects"),document.getElementById("frameEffects")]){details.open=saved[details.id]===true;details.addEventListener("toggle",()=>{let current={};try{current=JSON.parse(localStorage.getItem(PANEL_STATE_KEY)||"{}")||{};}catch{}current[details.id]=details.open;try{localStorage.setItem(PANEL_STATE_KEY,JSON.stringify(current));}catch{}});}}
    const LEFT_SECTION_STATE_KEY="speech_bubble:left_sections:v1";
    function initializeLeftSectionState(){let saved={};try{saved=JSON.parse(localStorage.getItem(LEFT_SECTION_STATE_KEY)||"{}")||{};}catch{}for(const details of document.querySelectorAll(".left-section[data-left-section]")){const key=details.dataset.leftSection;details.open=saved[key]!==false;details.addEventListener("toggle",()=>{let current={};try{current=JSON.parse(localStorage.getItem(LEFT_SECTION_STATE_KEY)||"{}")||{};}catch{}current[key]=details.open;try{localStorage.setItem(LEFT_SECTION_STATE_KEY,JSON.stringify(current));}catch{}});}}
    const RIGHT_DOCK_FLOAT_KEY="speech_bubble:floating_panels:v4";
    const LEGACY_RIGHT_DOCK_FLOAT_KEY="speech_bubble:floating_panels:v3";
    const EXTERNAL_PALETTE_GEOMETRY_KEY="speech_bubble:external_palette_geometry:v1";
    function initializeRightDockFloating(){
      const definitions=[
        {key:"properties",panel:document.getElementById("propertiesDock"),dragSurface:document.querySelector("#propertiesDock > .dock-heading"),minHeight:260},
        {key:"layers",panel:document.getElementById("layersDock"),dragSurface:document.querySelector("#layersDock > .layers-title-row"),minHeight:220},
      ];
      if(definitions.some(entry=>!entry.panel||!entry.dragSurface))return;
      const externalButton=document.getElementById("openExternalPalette");
      if(externalButton){
        externalButton.hidden=hostMode!=="desktop"||isPaletteWindow;
        externalButton.onclick=async event=>{
          event.stopPropagation();
          let geometry={width:680,height:720};
          try{geometry={...geometry,...JSON.parse(localStorage.getItem(EXTERNAL_PALETTE_GEOMETRY_KEY)||"{}")};}catch{}
          const opened=await window.pywebview?.api?.open_palette?.(geometry);
          if(!opened)setSaveState(uiText("外部パレットを開けませんでした","Could not open the external palette"),"error");
        };
      }
      if(isPaletteWindow){
        definitions.forEach(entry=>entry.panel.classList.add("floating-panel"));
        const saveGeometry=()=>{try{localStorage.setItem(EXTERNAL_PALETTE_GEOMETRY_KEY,JSON.stringify({x:screenX,y:screenY,width:outerWidth,height:outerHeight}));}catch{}};
        window.addEventListener("resize",saveGeometry);
        window.addEventListener("pagehide",saveGeometry);
        saveGeometry();
        return;
      }
      let store={version:4,modes:{}},zCounter=80,activeMode="";
      try{
        const current=JSON.parse(localStorage.getItem(RIGHT_DOCK_FLOAT_KEY)||"null");
        if(current?.version===4&&current.modes)store=current;
      }catch{}
      const modeKey=()=>{
        const availableWidth=Number(screen?.availWidth)||innerWidth,availableHeight=Number(screen?.availHeight)||innerHeight;
        return Math.abs(outerWidth-availableWidth)<28&&Math.abs(outerHeight-availableHeight)<48?"maximized":"windowed";
      };
      const defaultFloatingLayout=()=>{
        const margin=8,top=48,gap=8,maximumPairWidth=Math.max(560,innerWidth-margin*2-gap),width=Math.max(280,Math.min(320,Math.round(innerWidth*.15),Math.floor(maximumPairWidth/2))),availableHeight=Math.max(260,innerHeight-top-margin),height=Math.max(260,Math.min(760,availableHeight)),layersLeft=innerWidth-margin-width,propertiesLeft=layersLeft-gap-width;
        return{properties:{left:Math.max(margin,propertiesLeft),top,width,height,z:81},layers:{left:Math.max(margin,layersLeft),top,width,height,z:82}};
      };
      const legacyDefaultAtLeft=legacy=>{const properties=legacy?.properties,layers=legacy?.layers;if(!properties||!layers)return false;return Number(properties.left)<=16&&Math.abs(Number(layers.left)-(Number(properties.left)+Number(properties.width)+8))<=20;};
      activeMode=modeKey();
      if(!store.modes[activeMode]){
        try{
          const legacy=JSON.parse(localStorage.getItem(LEGACY_RIGHT_DOCK_FLOAT_KEY)||"null");
          if(legacy&&!legacyDefaultAtLeft(legacy))store.modes[activeMode]=legacy;
        }catch{}
      }
      let saved=store.modes[activeMode]||defaultFloatingLayout();
      const normalizedGeometry=geometry=>{const width=Math.max(240,Number(geometry.width)||280),height=Math.max(180,Number(geometry.height)||260),horizontalRange=Math.max(1,innerWidth-width-16),verticalRange=Math.max(1,innerHeight-height-16);return{...geometry,leftRatio:(Number(geometry.left)-8)/horizontalRange,topRatio:(Number(geometry.top)-8)/verticalRange,viewportWidth:innerWidth,viewportHeight:innerHeight};};
      const geometryForViewport=(entry,geometry={})=>{
        let width=Number(geometry.width),height=Number(geometry.height);
        if(Number.isFinite(Number(geometry.viewportWidth))&&Number(geometry.viewportWidth)>0)width*=innerWidth/Number(geometry.viewportWidth);
        width=Math.max(240,Math.min(360,innerWidth-16,Math.round(width||Math.max(280,innerWidth*.15))));
        if(Number.isFinite(Number(geometry.viewportHeight))&&Number(geometry.viewportHeight)>0)height*=innerHeight/Number(geometry.viewportHeight);
        height=Math.max(entry.minHeight,Math.min(innerHeight-16,Math.round(height||Math.min(760,innerHeight-64))));
        const horizontalRange=Math.max(0,innerWidth-width-16),verticalRange=Math.max(0,innerHeight-height-16);
        const left=Number.isFinite(Number(geometry.leftRatio))?8+horizontalRange*Math.max(0,Math.min(1,Number(geometry.leftRatio))):Number(geometry.left);
        const top=Number.isFinite(Number(geometry.topRatio))?8+verticalRange*Math.max(0,Math.min(1,Number(geometry.topRatio))):Number(geometry.top);
        return{left:Math.max(8,Math.min(innerWidth-width-8,Math.round(Number.isFinite(left)?left:8))),top:Math.max(8,Math.min(innerHeight-height-8,Math.round(Number.isFinite(top)?top:48))),width,height};
      };
      for(const entry of definitions)zCounter=Math.max(zCounter,Number(saved[entry.key]?.z)||0);
      const save=()=>{store.version=4;store.modes[activeMode]=saved;try{localStorage.setItem(RIGHT_DOCK_FLOAT_KEY,JSON.stringify(store));}catch{}};
      const currentGeometry=entry=>{const rect=entry.panel.getBoundingClientRect();return geometryForViewport(entry,{left:rect.left,top:rect.top,width:rect.width,height:rect.height});};
      const applyGeometry=(entry,geometry)=>{const next=geometryForViewport(entry,geometry);entry.applying=true;entry.panel.style.left=`${next.left}px`;entry.panel.style.top=`${next.top}px`;entry.panel.style.width=`${next.width}px`;entry.panel.style.height=`${next.height}px`;entry.panel.style.zIndex=String(Number(geometry?.z)||Number(saved[entry.key]?.z)||70);entry.applying=false;saved[entry.key]=normalizedGeometry({...saved[entry.key],...next});};
      const bringToFront=(entry,persist=true)=>{zCounter+=1;entry.panel.style.zIndex=String(zCounter);saved[entry.key]={...(saved[entry.key]||{}),z:zCounter};if(persist)save();};
      for(const entry of definitions){
        entry.panel.classList.add("floating-panel");
        entry.panel.addEventListener("pointerdown",()=>bringToFront(entry),true);
        const startDrag=event=>{if(event.button!==0||event.target.closest("button,input,select,textarea,a"))return;event.preventDefault();event.stopPropagation();bringToFront(entry);const geometry=currentGeometry(entry),capture=event.currentTarget;entry.drag={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:geometry.left,top:geometry.top,capture};capture.setPointerCapture(event.pointerId);};
        const moveDrag=event=>{if(!entry.drag||entry.drag.pointerId!==event.pointerId)return;const next={...(saved[entry.key]||{}),left:entry.drag.left+event.clientX-entry.drag.startX,top:entry.drag.top+event.clientY-entry.drag.startY};delete next.leftRatio;delete next.topRatio;applyGeometry(entry,next);if(document.getElementById("fontBrowser")?.classList.contains("open"))positionFontBrowser();};
        const endDrag=event=>{if(!entry.drag||entry.drag.pointerId!==event.pointerId)return;const capture=entry.drag.capture;entry.drag=null;if(capture?.hasPointerCapture(event.pointerId))capture.releasePointerCapture(event.pointerId);save();};
        entry.dragSurface.addEventListener("pointerdown",startDrag);entry.dragSurface.addEventListener("pointermove",moveDrag);entry.dragSurface.addEventListener("pointerup",endDrag);entry.dragSurface.addEventListener("pointercancel",endDrag);
        if("ResizeObserver" in window)new ResizeObserver(()=>{if(entry.applying)return;saved[entry.key]={...(saved[entry.key]||{}),...currentGeometry(entry)};save();if(document.getElementById("fontBrowser")?.classList.contains("open"))positionFontBrowser();}).observe(entry.panel);
      }
      window.addEventListener("resize",()=>{
        const nextMode=modeKey();
        if(nextMode!==activeMode){for(const entry of definitions)saved[entry.key]=normalizedGeometry({...saved[entry.key],...currentGeometry(entry)});store.modes[activeMode]=saved;activeMode=nextMode;saved=store.modes[activeMode]||defaultFloatingLayout();}
        for(const entry of definitions)applyGeometry(entry,saved[entry.key]);save();if(document.getElementById("fontBrowser")?.classList.contains("open"))positionFontBrowser();
      });
      for(const entry of definitions)applyGeometry(entry,saved[entry.key]);
      save();
      window.SpeechBubbleWorkspaceLayout={
        reset(){
          saved=defaultFloatingLayout();
          store.modes={maximized:saved,windowed:defaultFloatingLayout()};
          try{localStorage.removeItem("speech_bubble:right_dock_split:v5");localStorage.removeItem("speech_bubble:right_floating_panels:v2");localStorage.removeItem(WORKSPACE_VIEW_KEY);}catch{}
          for(const entry of definitions)applyGeometry(entry,saved[entry.key]);
          save();
          fitView(false);captureActiveWorkspace();requestRender({canvas:true,layers:true,preview:false});
        },
      };
    }
    function sceneSnapshot(){
      captureActiveWorkspace();
      return JSON.stringify({
        activeWorkspace,
        workspaces,
        selected:state.selected,
        selection:state.selection,
        comic:comicEditor?.serialize(),
        generalComic:generalComicEditor?.serialize(),
        imageTrays:projectImageTray?.serialize?.(),
      });
    }
    let paletteSyncApplying=false,paletteSyncTimer=null,lastPaletteSyncSnapshot="";
    function schedulePaletteSync(){
      if(paletteSyncApplying||hostMode!=="desktop"||!window.pywebview?.api)return;
      clearTimeout(paletteSyncTimer);
      paletteSyncTimer=setTimeout(()=>{
        paletteSyncTimer=null;
        const snapshot=sceneSnapshot();
        if(snapshot===lastPaletteSyncSnapshot)return;
        lastPaletteSyncSnapshot=snapshot;
        const method=isPaletteWindow?"palette_update":"main_update";
        window.pywebview.api[method]?.(snapshot);
      },45);
    }
    window.SpeechBubblePaletteSync={
      snapshot:()=>sceneSnapshot(),
      apply(snapshot){
        if(!snapshot||snapshot===sceneSnapshot())return true;
        paletteSyncApplying=true;
        try{
          restoreScene(snapshot);
          lastPaletteSyncSnapshot=snapshot;
          syncProperties();
          requestRender({canvas:!isPaletteWindow,layers:true,preview:false});
          updateActionState();
          return true;
        }finally{paletteSyncApplying=false;}
      },
    };
    function restoreScene(snapshot){
      const data=JSON.parse(snapshot);
      if(data.workspaces&&typeof data.workspaces==="object"){
        for(const name of ["single","comic","comic_layout"]){
          const fallback=name==="comic"?{width:720,height:2200}:name==="comic_layout"?{width:2480,height:3508}:{width:1024,height:1024};
          const saved=data.workspaces[name]||{};
          workspaces[name]={
            width:Math.max(1,Math.round(Number(saved.width)||fallback.width)),
            height:Math.max(1,Math.round(Number(saved.height)||fallback.height)),
            backgroundVisible:saved.backgroundVisible!==false,
            canvasBackground:normalizedCanvasBackground(saved.canvasBackground),
            backgroundImage:normalizedBackgroundImage(saved.backgroundImage||{attached:name==="single"&&imageLoaded}),
            elements:Array.isArray(saved.elements)?saved.elements:[],
            view:normalizedWorkspaceView(saved.view)||normalizedWorkspaceView(storedWorkspaceViews()[name]),
          };
        }
        activeWorkspace=["single","comic","comic_layout"].includes(data.activeWorkspace)?data.activeWorkspace:"single";
        const active=workspaces[activeWorkspace];
        state.width=active.width;state.height=active.height;state.backgroundVisible=active.backgroundVisible;state.canvasBackground=normalizedCanvasBackground(active.canvasBackground);state.backgroundImage=normalizedBackgroundImage(active.backgroundImage);state.elements=active.elements;
      }else{
        state.backgroundVisible=data.backgroundVisible!==false;
        state.canvasBackground=normalizedCanvasBackground(data.canvasBackground);
        state.elements=Array.isArray(data)?data:(data.elements||[]);
        captureActiveWorkspace();
      }
      state.selected=Array.isArray(data)?(data[0]?.id||null):(data.selected||state.elements?.[0]?.id||null);
      state.selection=Array.isArray(data.selection)?data.selection.filter(itemId=>state.elements.some(item=>item.id===itemId)):(state.selected&&state.selected!==BACKGROUND_LAYER_ID?[state.selected]:[]);
      state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;
      comicEditor?.restore(data.comic,{hydrate:false,keepMode:true});
      generalComicEditor?.restore(data.generalComic,{hydrate:false,keepMode:true});
      projectImageTray?.restoreState?.(data.imageTrays);
      syncEditorModeFromWorkspace();
      restoreWorkspaceView(workspaces[activeWorkspace],false);
    }
    function storeUndo(snapshot){if(!snapshot||state.undo[state.undo.length-1]===snapshot)return;state.undo.push(snapshot);if(state.undo.length>50)state.undo.shift();state.redo=[];}
    function pushUndo(){storeUndo(sceneSnapshot());}
    function beginPropertyEdit(){if(!state.propertyEditSnapshot)state.propertyEditSnapshot=sceneSnapshot();}
    function commitPropertyEdit(){const before=state.propertyEditSnapshot;state.propertyEditSnapshot=null;if(before&&before!==sceneSnapshot())storeUndo(before);}
    let groupRotationEdit=null;
    function beginGroupRotationEdit(){if(groupRotationEdit)return true;const items=selectedItems().filter(canvasItemEditable);if(items.length<2)return false;const bounds=selectionBounds(items),center={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2};beginPropertyEdit();groupRotationEdit={center,items:items.map(item=>({item,center:itemCenter(item),rotation:Number(item.rotation)||0}))};return true;}
    function updateGroupRotationEdit(raw){if(!beginGroupRotationEdit())return;const delta=Math.max(-180,Math.min(180,Number(raw)||0));groupRotationEdit.items.forEach(original=>{const center=rotateAround(original.center,groupRotationEdit.center,delta);original.item.x=Math.round(center.x-original.item.w/2);original.item.y=Math.round(center.y-original.item.h/2);original.item.rotation=Math.round((((original.rotation+delta)+180)%360+360)%360-180);markAlignedItem(original.item);});document.getElementById("groupRotationRange").value=String(delta);document.getElementById("groupRotation").value=String(delta);render();}
    function commitGroupRotationEdit(){if(!groupRotationEdit)return;groupRotationEdit=null;commitPropertyEdit();document.getElementById("groupRotationRange").value="0";document.getElementById("groupRotation").value="0";syncProperties();render();}
    let realtimeSelectWheelCommitTimer=0;
    function enableRealtimeSelectWheel(control){let nextWheelAt=0;control.addEventListener("wheel",event=>{if(!event.deltaY||control.disabled||control.options.length<2)return;event.preventDefault();event.stopPropagation();const now=performance.now();if(now<nextWheelAt)return;nextWheelAt=now+80;const next=Math.max(0,Math.min(control.options.length-1,control.selectedIndex+(event.deltaY>0?1:-1)));if(next===control.selectedIndex)return;beginPropertyEdit();control.selectedIndex=next;control.dispatchEvent(new Event("change",{bubbles:true}));clearTimeout(realtimeSelectWheelCommitTimer);realtimeSelectWheelCommitTimer=setTimeout(commitPropertyEdit,300);},{passive:false});control.addEventListener("blur",()=>{clearTimeout(realtimeSelectWheelCommitTimer);commitPropertyEdit();});}
    function undoAction(){if(imageCropEdit){cancelImageCropEdit();return;}commitPropertyEdit();if(!state.undo.length)return;state.redo.push(sceneSnapshot());restoreScene(state.undo.pop());syncProperties();render();}
    function redoAction(){if(imageCropEdit){cancelImageCropEdit();return;}commitPropertyEdit();if(!state.redo.length)return;state.undo.push(sceneSnapshot());restoreScene(state.redo.pop());syncProperties();render();}
    function duplicateSelected(){const items=selectedItems().filter(item=>!item.locked);if(!items.length)return;pushUndo();const copiedGroups=new Map(),copies=items.map(item=>{const copy=JSON.parse(JSON.stringify(item));copy.id=id();copy.x+=20;copy.y+=20;copy.locked=false;if(copy.group_id){if(!copiedGroups.has(copy.group_id))copiedGroups.set(copy.group_id,`group-${id()}`);copy.group_id=copiedGroups.get(copy.group_id);}return copy;});state.elements.push(...copies);setSelection(copies.map(item=>item.id),copies.at(-1).id);state.vectorEditId=null;syncProperties();render();}
    function sourceImageLayerFor(item){if(!item||item.type!=="image")return null;return state.elements.find(candidate=>candidate.type==="image"&&candidate.id===item.source_image_layer_id)||state.elements.find(candidate=>candidate.type==="image"&&candidate.source_role==="original")||null;}
    function updateLayerMenuState(){const imageSelected=selectedImageLayer();document.getElementById("copyLayer").disabled=!selectedItems().length;document.getElementById("pasteLayer").disabled=!layerClipboard?.length;document.getElementById("processLayerQuickRetouch").hidden=!imageSelected;document.getElementById("processLayerBackgroundRemoval").hidden=!imageSelected;document.getElementById("processLayerComicConversion").hidden=!imageSelected;document.getElementById("showOriginalImageLayer").hidden=!sourceImageLayerFor(imageSelected);}
    function copySelected(){const items=selectedItems();if(!items.length)return false;layerClipboard=JSON.parse(JSON.stringify(items));layerPasteCount=0;updateLayerMenuState();return true;}
    function pasteLayers(){if(!layerClipboard?.length)return;pushUndo();layerPasteCount+=1;const offset=20*layerPasteCount,copiedGroups=new Map(),copies=layerClipboard.map(source=>{const copy=JSON.parse(JSON.stringify(source));copy.id=id();copy.x=(Number(copy.x)||0)+offset;copy.y=(Number(copy.y)||0)+offset;copy.locked=false;if(copy.group_id){if(!copiedGroups.has(copy.group_id))copiedGroups.set(copy.group_id,`group-${id()}`);copy.group_id=copiedGroups.get(copy.group_id);}return copy;});state.elements.push(...copies);setSelection(copies.map(item=>item.id),copies.at(-1).id);state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;syncProperties();render();}
     function deleteSelected(){const ids=new Set(selectedItems().filter(item=>!item.locked).map(item=>item.id));if(!ids.size)return;pushUndo();const first=state.elements.findIndex(item=>ids.has(item.id));state.elements=state.elements.filter(item=>!ids.has(item.id));const next=state.elements[Math.min(first,state.elements.length-1)]?.id||null;setSelection(next?[next]:[],next);state.vectorEditId=null;syncProperties();render();}
    function deleteSelectedFrame(){const item=state.elements.find(element=>element.id===state.selected);if(!isFrameSelected(item))return false;deleteSelected();return true;}
    function nudgeSelected(dx,dy){const items=selectedItems().filter(canvasItemEditable);if(!items.length)return;pushUndo();items.forEach(item=>{item.x+=dx;item.y+=dy;if(item.type==="frame")item.fit_to_canvas=false;});syncProperties();render();}
     function findHit(point,allowLocked=false){const structuralEditor=activeStructuralEditor(),candidates=[...state.elements].reverse().filter(e=>e.visible!==false&&!structuralEditor?.shouldSkipPanelScopedItem?.(e)&&canvasHitEnabled(e)&&(allowLocked||canvasItemEditable(e)));for(const group of [candidates.filter(e=>e.type!=="image"),candidates.filter(e=>e.type==="image")])for(const e of group){const clip=generalComicEditor?.isActive()?elementClipShape(e):null;if(clip&&!pointInClipShape(point,clip))continue;const local=itemLocalPoint(e,point);if(local.x>=e.x&&local.x<=e.x+e.w&&local.y>=e.y&&local.y<=e.y+e.h)return e;}return null;}
    viewport.addEventListener("pointerdown",(event)=>{if(event.button!==1&&!(event.button===0&&state.spaceDown))return;event.preventDefault();event.stopPropagation();state.drag={mode:"pan",sx:event.clientX,sy:event.clientY,px:state.panX,py:state.panY};canvas.style.cursor="grabbing";viewport.style.cursor="grabbing";viewport.setPointerCapture(event.pointerId);},true);
    viewport.addEventListener("pointermove",(event)=>{const d=state.drag;if(!d||d.mode!=="pan")return;state.panX=d.px+(event.clientX-d.sx);state.panY=d.py+(event.clientY-d.sy);applyViewTransform();});
    canvas.addEventListener("pointerdown",(event)=>{
      if(event.button!==0)return;document.getElementById("shapeDrawer").classList.remove("open");closeFontBrowser();const p=imagePoint(event);
      if(imageCropEdit){event.preventDefault();beginImageCropPointer(p,event);canvas.setPointerCapture(event.pointerId);return;}
      if(activeWorkspace==="single"&&state.selected===BACKGROUND_LAYER_ID&&state.backgroundImage.attached&&!state.backgroundImage.locked&&!findHit(p,true)){pushUndo();state.drag={mode:"background-move",sx:p.x,sy:p.y,x:state.backgroundImage.offsetX,y:state.backgroundImage.offsetY};canvas.setPointerCapture(event.pointerId);event.preventDefault();return;}
      const items=selectedItems(),item=state.elements.find(e=>e.id===state.selected),editableItems=items.filter(canvasItemEditable),editableItem=editableItems.find(layer=>layer.id===state.selected)||editableItems.at(-1),selectionItem=editableItems.length>1?selectionBounds(editableItems):editableItem,canvasSelectionEditable=editableItems.length>0,standardHandles=!(items.length===1&&item?.type==="emphasis_lines"),emphasisCenterHandle=canvasSelectionEditable&&items.length===1?findEmphasisCenterHandle(item,p):null,vectorHandle=canvasSelectionEditable&&items.length===1&&item&&state.vectorEditId===item.id?findVectorHandle(item,p):null,frameMoveHandleHit=canvasSelectionEditable&&items.length===1&&item?.type==="frame"?findFrameMoveHandle(item,p):null,tailHandle=canvasSelectionEditable&&items.length===1&&item&&!state.vectorEditId?findTailHandle(item,p):null,rotateHandle=standardHandles&&canvasSelectionEditable&&selectionItem&&state.vectorEditId!==item?.id?findRotationHandle(selectionItem,p):null,handle=standardHandles&&canvasSelectionEditable&&selectionItem&&state.vectorEditId!==item?.id?findHandle(selectionItem,p):null,selectedInteractionHit=emphasisCenterHandle||vectorHandle||frameMoveHandleHit||tailHandle||rotateHandle||handle;
      if(!selectedInteractionHit&&generalComicEditor?.isActive()&&generalComicEditor.handlePointerDown(p,event)){canvas.setPointerCapture(event.pointerId);return;}
      if(!selectedInteractionHit&&comicEditor?.handlePointerDown(event,p)){canvas.setPointerCapture(event.pointerId);return;}
       if(event.altKey){const isolated=findHit(p,true);if(isolated){const current=selectedItems(),sources=(current.length>1&&current.some(item=>item.id===isolated.id)?current:[isolated]).filter(canvasItemEditable);if(sources.length){setSelection(sources.map(item=>item.id),isolated.id);state.drag={mode:"alt-duplicate-pending",items:sources,sx:p.x,sy:p.y,clientX:event.clientX,clientY:event.clientY};syncProperties();render();canvas.setPointerCapture(event.pointerId);event.preventDefault();return;}}}
      if(state.vectorAddMode&&item&&state.vectorEditId===item.id){pushUndo();addVectorPointAt(item,p);syncProperties();render();canvas.setPointerCapture(event.pointerId);return;}
      if(emphasisCenterHandle){pushUndo();state.drag={mode:"emphasis-center",item};}
      else if(vectorHandle){state.vectorAnchorIndex=vectorHandle.index;pushUndo();state.drag={mode:"vector",item,handle:vectorHandle};}
      else if(frameMoveHandleHit){pushUndo();state.drag={mode:"move",items:[{item,x:item.x,y:item.y}],sx:p.x,sy:p.y};}
      else if(tailHandle){pushUndo();state.drag={mode:"tail",item};}
      else if(rotateHandle){pushUndo();const originals=editableItems.map(layer=>({item:layer,center:itemCenter(layer),rotation:Number(layer.rotation)||0})),center=itemCenter(selectionItem);state.drag={mode:editableItems.length>1?"group-rotate":"rotate",item:editableItem,items:originals,center,start:Math.atan2(p.y-center.y,p.x-center.x)*180/Math.PI,startRotation:Number(editableItem?.rotation)||0};}
      else if(handle){pushUndo();if(editableItems.length>1){state.drag={mode:"group-resize",handle:handle.name,bounds:selectionItem,items:editableItems.map(layer=>({item:layer,x:layer.x,y:layer.y,w:layer.w,h:layer.h,font_size:Number(layer.font_size)||0,center:itemCenter(layer)}))};}else{state.drag={mode:"resize",handle:handle.name,item:editableItem,left:editableItem.x,right:editableItem.x+editableItem.w,top:editableItem.y,bottom:editableItem.y+editableItem.h,center:itemCenter(editableItem),rotation:Number(editableItem.rotation)||0,originalW:editableItem.w,originalH:editableItem.h,fontScaleX:fontScaleValue(editableItem.font_scale_x),fontScaleY:fontScaleValue(editableItem.font_scale_y),flipX:!!editableItem.flip_x,flipY:!!editableItem.flip_y};}}
       else{const hit=findHit(p);if(hit){layerSelectionAnchorId=hit.id;if(event.shiftKey||event.ctrlKey||event.metaKey){setSelection(selectionIdsFor(hit,true),hit.id);state.drag=null;}else{const preserveMultiple=state.selection.length>1&&state.selection.includes(hit.id);if(preserveMultiple)state.selected=hit.id;else setSelection(selectionIdsFor(hit),hit.id);const moving=selectedItems().filter(canvasItemEditable);if(moving.length){pushUndo();state.drag={mode:"move",items:moving.map(layer=>({item:layer,x:layer.x,y:layer.y})),sx:p.x,sy:p.y};}else state.drag=null;}}else{setSelection([],null);layerSelectionAnchorId="";state.drag=null;state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;}}
      syncProperties();render();canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("dblclick",event=>{if(event.button!==0||imageCropEdit||document.querySelector(".sb-image-crop-dialog"))return;const point=imagePoint(event),structuralEditor=activeStructuralEditor();if(structuralEditor?.startImageCropAt?.(point)){event.preventDefault();event.stopPropagation();return;}const hit=findHit(point,true);if(!hit||hit.type!=="image"||hit.locked)return;event.preventDefault();event.stopPropagation();setSelection([hit.id],hit.id);syncProperties();startImageCropEdit(hit);});
    canvas.addEventListener("contextmenu",event=>{if(!comicEditor?.isActive()){const hit=findHit(imagePoint(event),true);if(hit){event.preventDefault();setSelection([hit.id],hit.id);syncProperties();updateLayerMenuState();const menu=document.getElementById("layerMenu");menu.style.left=`${Math.min(event.clientX,window.innerWidth-190)}px`;menu.style.top=`${Math.min(event.clientY,window.innerHeight-220)}px`;menu.classList.add("open");return;}}if(comicEditor?.handleContextMenu(event,imagePoint(event))){event.preventDefault();event.stopPropagation();}});
    canvas.addEventListener("pointermove",(event)=>{
      const p=imagePoint(event);if(imageCropEdit){const item=activeImageCropItem(),handle=item?cropHandleAt(item,p):"";const cursor=imageCropEdit.drag?.handle==="move"||handle==="move"?"move":handle.includes("n")&&handle.includes("w")||handle.includes("s")&&handle.includes("e")?"nwse-resize":handle.includes("n")&&handle.includes("e")||handle.includes("s")&&handle.includes("w")?"nesw-resize":handle.includes("w")||handle.includes("e")?"ew-resize":handle.includes("n")||handle.includes("s")?"ns-resize":"crosshair";canvas.style.cursor=cursor;viewport.style.cursor=cursor;if(imageCropEdit.drag)moveImageCropPointer(p);return;}const structuralEditor=activeStructuralEditor(),structuralCursor=structuralEditor?.pointerCursorAt?.(p)||"";if(!state.drag){const cursor=structuralCursor||(state.spaceDown?"grab":"default");canvas.style.cursor=cursor;viewport.style.cursor=cursor;}if(generalComicEditor?.isActive()&&generalComicEditor.handlePointerMove(p,event))return;if(comicEditor?.handlePointerMove(event,p))return;let d=state.drag;if(!d||d.mode==="pan")return;if(d.mode==="alt-duplicate-pending"){if(Math.hypot(event.clientX-d.clientX,event.clientY-d.clientY)<4)return;pushUndo();const copiedGroups=new Map(),copies=d.items.map(item=>{const copy=JSON.parse(JSON.stringify(item));copy.id=id();copy.locked=false;if(copy.group_id){if(!copiedGroups.has(copy.group_id))copiedGroups.set(copy.group_id,`group-${id()}`);copy.group_id=copiedGroups.get(copy.group_id);}return copy;});state.elements.push(...copies);setSelection(copies.map(item=>item.id),copies.at(-1)?.id||null);state.drag={mode:"move",items:copies.map(item=>({item,x:item.x,y:item.y})),sx:d.sx,sy:d.sy,altDuplicate:true};d=state.drag;}
      if(d.mode==="background-move"){state.backgroundImage.offsetX=Math.round(d.x+p.x-d.sx);state.backgroundImage.offsetY=Math.round(d.y+p.y-d.sy);}
      else if(d.mode==="move"){const dx=p.x-d.sx,dy=p.y-d.sy;d.items.forEach(original=>{original.item.x=Math.round(original.x+dx);original.item.y=Math.round(original.y+dy);if(original.item.type==="frame")original.item.fit_to_canvas=false;});}
      else if(d.mode==="rotate"){let delta=Math.atan2(p.y-d.center.y,p.x-d.center.x)*180/Math.PI-d.start,angle=d.startRotation+delta;if(event.shiftKey)angle=Math.round(angle/15)*15;d.item.rotation=Math.round(((angle+180)%360+360)%360-180);if(d.item.type==="frame")d.item.fit_to_canvas=false;}
      else if(d.mode==="group-rotate"){let delta=Math.atan2(p.y-d.center.y,p.x-d.center.x)*180/Math.PI-d.start;if(event.shiftKey)delta=Math.round(delta/15)*15;d.items.forEach(original=>{const center=rotateAround(original.center,d.center,delta);original.item.x=Math.round(center.x-original.item.w/2);original.item.y=Math.round(center.y-original.item.h/2);original.item.rotation=Math.round((((original.rotation+delta)+180)%360+360)%360-180);if(original.item.type==="frame")original.item.fit_to_canvas=false;});}
      else if(d.mode==="vector"){const local=visualToLocal(d.item,p),point=d.item.path_points[d.handle.index];if(d.handle.kind==="anchor"){const dx=local.x-point.x,dy=local.y-point.y;point.x=local.x;point.y=local.y;point.in_x=(point.in_x??point.x)+dx;point.in_y=(point.in_y??point.y)+dy;point.out_x=(point.out_x??point.x)+dx;point.out_y=(point.out_y??point.y)+dy;}else{point[`${d.handle.kind}_x`]=local.x;point[`${d.handle.kind}_y`]=local.y;}}
      else if(d.mode==="emphasis-center"){const local=visualToLocal(d.item,p);d.item.center_x=emphasisClamp(local.x,-.5,1.5,.5);d.item.center_y=emphasisClamp(local.y,-.5,1.5,.5);scheduleEmphasisRegeneration(d.item);}
      else if(d.mode==="tail"){const local=visualToLocal(d.item,p);d.item.tail_tip_x=Math.max(-2,Math.min(3,Math.round(local.x*1000)/1000));d.item.tail_tip_y=Math.max(-2,Math.min(3,Math.round(local.y*1000)/1000));d.item.tail_side=tailSide(d.item.tail_tip_x,d.item.tail_tip_y);}
      else if(d.mode==="group-resize"){const edges=resizedEdges({handle:d.handle,left:d.bounds.x,right:d.bounds.x+d.bounds.w,top:d.bounds.y,bottom:d.bounds.y+d.bounds.h,originalW:d.bounds.w,originalH:d.bounds.h},p,!event.shiftKey),{left,right,top,bottom}=edges,newLeft=Math.min(left,right),newTop=Math.min(top,bottom),newW=Math.max(1,Math.abs(right-left)),newH=Math.max(1,Math.abs(bottom-top)),sx=newW/d.bounds.w,sy=newH/d.bounds.h;d.items.forEach(original=>{const cx=newLeft+(original.center.x-d.bounds.x)*sx,cy=newTop+(original.center.y-d.bounds.y)*sy;original.item.w=Math.max(1,Math.round(original.w*sx));original.item.h=Math.max(1,Math.round(original.h*sy));original.item.x=Math.round(cx-original.item.w/2);original.item.y=Math.round(cy-original.item.h/2);if(original.item.type==="text"){original.item.font_size=integerFontSize(original.font_size*Math.sqrt(sx*sy));original.item.auto_fit=false;}if(original.item.type==="frame")original.item.fit_to_canvas=false;});}
      else{const local=rotateAround(p,d.center,-d.rotation),{left,right,top,bottom}=resizedEdges(d,local,isFixedPathItem(d.item)||!event.shiftKey),crossedX=right<left,crossedY=bottom<top,localCenter={x:(left+right)/2,y:(top+bottom)/2},worldCenter=rotateAround(localCenter,d.center,d.rotation);d.item.x=Math.round(worldCenter.x-Math.abs(right-left)/2);d.item.y=Math.round(worldCenter.y-Math.abs(bottom-top)/2);d.item.w=Math.max(1,Math.round(Math.abs(right-left)));d.item.h=Math.max(1,Math.round(Math.abs(bottom-top)));if(d.item.type==="text"){d.item.auto_fit=false;if(event.ctrlKey||event.metaKey){if(d.handle.includes("w")||d.handle.includes("e"))d.item.font_scale_x=fontScaleValue(d.fontScaleX*d.item.w/Math.max(1,d.originalW));if(d.handle.includes("n")||d.handle.includes("s"))d.item.font_scale_y=fontScaleValue(d.fontScaleY*d.item.h/Math.max(1,d.originalH));}}if(d.item.type==="frame")d.item.fit_to_canvas=false;if(d.item.type!=="text"&&(d.handle.includes("w")||d.handle.includes("e")))d.item.flip_x=d.flipX!==crossedX;if(d.item.type!=="text"&&(d.handle.includes("n")||d.handle.includes("s")))d.item.flip_y=d.flipY!==crossedY;}
      if(d.mode==="group-resize")d.items.forEach(original=>{if(original.item.type==="emphasis_lines"){original.item.fit_to_canvas=false;scheduleEmphasisRegeneration(original.item);}});
      if(d.mode==="move")d.items.forEach(original=>{if(original.item.type==="emphasis_lines")original.item.fit_to_canvas=false;});
      if(d.mode==="rotate"&&d.item.type==="emphasis_lines")d.item.fit_to_canvas=false;
      if(d.mode==="group-rotate")d.items.forEach(original=>{if(original.item.type==="emphasis_lines")original.item.fit_to_canvas=false;});
      syncProperties();requestRender({canvas:true});
    });
    function endPointer(event){if(imageCropEdit){endImageCropPointer();canvas.style.cursor="crosshair";viewport.style.cursor="crosshair";return;}if(generalComicEditor?.isActive()&&generalComicEditor.handlePointerEnd(event)||comicEditor?.handlePointerEnd(event)){canvas.style.cursor=state.spaceDown?"grab":"default";viewport.style.cursor=state.spaceDown?"grab":"default";return;}const panned=state.drag?.mode==="pan",changed=Boolean(state.drag&&!panned);state.drag=null;if(panned)captureActiveWorkspace();canvas.style.cursor=state.spaceDown?"grab":"default";viewport.style.cursor=state.spaceDown?"grab":"default";if(changed)requestRender({canvas:true,layers:true,preview:true});}
    canvas.addEventListener("pointerup",endPointer); canvas.addEventListener("pointercancel",endPointer);
    viewport.addEventListener("pointerup",endPointer); viewport.addEventListener("pointercancel",endPointer);
    viewport.addEventListener("auxclick",event=>{if(event.button===1)event.preventDefault();});
    viewport.addEventListener("wheel",(event)=>{
      event.preventDefault();
      if(event.target===canvas&&generalComicEditor?.isActive()&&generalComicEditor.handleWheel(event,imagePoint(event)))return;
      if(event.target===canvas&&comicEditor?.handleWheel(event,imagePoint(event)))return;
      if(event.target===canvas&&event.ctrlKey&&!comicEditor?.isActive()&&!imageCropEdit){const item=selectedImageLayer();if(item&&!item.locked){pushUndo();const crop=imageCropFor(item),full=imageFullGeometry(item),center={x:full.x+full.w/2,y:full.y+full.h/2},scale=Math.max(.1,Math.min(8,imageLayerScale(item)/100*(event.deltaY<0?1.05:.95))),fullW=item.base_width*scale,fullH=item.base_height*scale;applyCropGeometry(item,crop,{x:center.x-fullW/2,y:center.y-fullH/2,w:fullW,h:fullH});syncProperties();requestRender({canvas:true,layers:true,preview:true});return;}}
      state.zoom=Math.max(.25,Math.min(4,state.zoom*(event.deltaY<0?1.1:.9)));
      captureActiveWorkspace();
      requestRender({canvas:true});
    },{passive:false});
    function isSupportedImageFile(file){return Boolean(file)&&(String(file.type||"").startsWith("image/")||/\.(?:png|jpe?g|webp)$/i.test(String(file.name||"")));}
    function imageFileFromTransfer(transfer){return Array.from(transfer?.files||[]).find(isSupportedImageFile)||Array.from(transfer?.items||[]).filter(item=>item.kind==="file").map(item=>item.getAsFile?.()).find(isSupportedImageFile)||null;}
    function transferHasFiles(transfer){return Array.from(transfer?.types||[]).includes("Files")||Array.from(transfer?.items||[]).some(item=>item.kind==="file")||Boolean(transfer?.files?.length);}
    function setBackgroundDropHighlight(active){document.getElementById("emptyCanvasCard")?.classList.toggle("drag-active",active);canvas.classList.toggle("drop-target",active&&imageLoaded);}
    const backgroundDropSurface=document.querySelector(".canvas-workspace");
    backgroundDropSurface.addEventListener("dragenter",event=>{if(!transferHasFiles(event.dataTransfer))return;event.preventDefault();setBackgroundDropHighlight(true);},true);
    backgroundDropSurface.addEventListener("dragover",event=>{if(!transferHasFiles(event.dataTransfer))return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="copy";setBackgroundDropHighlight(true);},true);
    backgroundDropSurface.addEventListener("dragleave",event=>{if(!backgroundDropSurface.contains(event.relatedTarget))setBackgroundDropHighlight(false);},true);
    backgroundDropSurface.addEventListener("drop",event=>{if(!transferHasFiles(event.dataTransfer))return;event.preventDefault();event.stopPropagation();setBackgroundDropHighlight(false);const files=Array.from(event.dataTransfer?.files||[]).filter(isSupportedImageFile),point=event.target===canvas||canvas.contains(event.target)?imagePoint(event):null;if(generalComicEditor?.isActive()){generalComicEditor.handleImageDrop(event.dataTransfer,point||{x:-1,y:-1});return;}if(comicEditor?.isActive()){comicEditor.importFiles(files,{point});return;}const file=files[0]||imageFileFromTransfer(event.dataTransfer);if(file)requestBackgroundFile(file);else setSaveState("PNG / JPEG / WebP画像をドロップしてください","error");},true);
    canvas.addEventListener("dragover",event=>{if(imageFileFromTransfer(event.dataTransfer))return;const comicImage=event.dataTransfer.types.includes(window.SpeechBubbleComicEditor?.IMAGE_DRAG_TYPE||"application/x-speech-bubble-comic-image"),generalImage=event.dataTransfer.types.includes(window.SpeechBubbleGeneralComicEditor?.IMAGE_DRAG_TYPE||"application/x-speech-bubble-general-comic-image"),projectImage=event.dataTransfer.types.includes(window.SpeechBubbleProjectImageTray?.DRAG_TYPE||"application/x-speech-bubble-project-image");if(!comicImage&&!generalImage&&!projectImage&&!event.dataTransfer.types.includes(EDITOR_DRAG_TYPE))return;event.preventDefault();event.dataTransfer.dropEffect="copy";canvas.classList.add("drop-target");});
    canvas.addEventListener("dragleave",event=>{if(!canvas.contains(event.relatedTarget))canvas.classList.remove("drop-target");});
    canvas.addEventListener("drop",event=>{if(imageFileFromTransfer(event.dataTransfer))return;canvas.classList.remove("drop-target");const point=imagePoint(event),projectImageId=event.dataTransfer.getData(window.SpeechBubbleProjectImageTray?.DRAG_TYPE||"application/x-speech-bubble-project-image");if(projectImageId&&projectImageTray){event.preventDefault();projectImageTray.place(projectImageId,{point});return;}if(generalComicEditor?.isActive()&&generalComicEditor.handleImageDrop(event.dataTransfer,point)){event.preventDefault();return;}if(comicEditor?.handleImageDrop(event.dataTransfer,point)){event.preventDefault();return;}const raw=event.dataTransfer.getData(EDITOR_DRAG_TYPE);if(!raw)return;event.preventDefault();let payload;try{payload=JSON.parse(raw);}catch{return;}if(payload.kind==="bubble")insertPreset(payload.id,point);else if(payload.kind==="user-bubble")insertUserPreset(payload.id,point);else if(payload.kind==="sfx")insertSfx(payload.id,point);else if(payload.kind==="frame")insertFrame(payload.id,point);else if(payload.kind==="emphasis-lines")insertEmphasisLines(payload.id,point);});
    window.addEventListener("dragend",()=>setBackgroundDropHighlight(false));
    document.addEventListener("paste",event=>{const editing=["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName);if(editing)return;if(layerClipboard?.length){event.preventDefault();pasteLayers();return;}const item=Array.from(event.clipboardData?.items||[]).find(entry=>entry.kind==="file"&&String(entry.type||"").startsWith("image/"));const file=item?.getAsFile?.();if(file){event.preventDefault();if(generalComicEditor?.isActive())generalComicEditor.importFiles([file]);else if(comicEditor?.isActive())comicEditor.importFiles([file]);else requestBackgroundFile(file);}});
     function addTextLayer(){
       pushUndo();
       const editor=activeStructuralEditor(),item=defaultText(),selected=state.elements.find(element=>element.id===state.selected),selectedBubble=selected?.type==="bubble"?selected:null,selectedPanelId=generalComicEditor?.isActive()?selectedBubble?.general_comic_scope==="panel"&&selectedBubble.general_comic_panel_id:comicEditor?.isActive()?selectedBubble?.comic_scope==="panel"&&selectedBubble.comic_panel_id:null,explicitTarget=selectedPanelId?editor?.panelInsertionTarget?.(selectedPanelId):(editor?.selectedInsertionTarget?.()||null),target=selectedPanelId?explicitTarget:(explicitTarget?.scope==="panel"?explicitTarget:null);
       if(target?.scope==="panel"){if(generalComicEditor?.isActive())generalComicEditor.assignElementTarget?.(item,target);else{item.comic_scope="panel";item.comic_panel_id=target.panelId;item.comic_stack="above_image";}}else if(generalComicEditor?.isActive())generalComicEditor.assignElementTarget?.(item,{scope:"page"});
       const visible=visibleCanvasDocumentRect(),placementRect=target?.rect?intersectDocumentRects(visible,target.rect):visible;
       if(selectedBubble){
         const bubbleRect={x:selectedBubble.x,y:selectedBubble.y,w:selectedBubble.w,h:selectedBubble.h},visibleBubble=intersectDocumentRects(placementRect,bubbleRect);
         item.x=visibleBubble.x+Math.min(48,visibleBubble.w*.16);
         item.y=visibleBubble.y+Math.min(38,visibleBubble.h*.18);
       }else{
         item.x=placementRect.x+(placementRect.w-item.w)/2;
         item.y=placementRect.y+(placementRect.h-item.h)/2;
       }
       clampItemToRect(item,placementRect,12);
       const bubbleIndex=selectedBubble?state.elements.indexOf(selectedBubble):-1;
       if(bubbleIndex>=0)state.elements.splice(bubbleIndex+1,0,item);else state.elements.push(item);
       setSelection([item.id],item.id);syncProperties();render();
     }
     document.getElementById("addText").onclick=addTextLayer;
    const emphasisCenterGapRange=document.getElementById("emphasisCenterGapRange"),emphasisCenterGapNumber=document.getElementById("emphasisCenterGapValue");
    let emphasisCenterGapEdit=null;
    function beginEmphasisCenterGapEdit(){const item=state.elements.find(element=>element.id===state.selected);if(!item||item.type!=="emphasis_lines"||item.locked||state.selection.length!==1)return null;if(!emphasisCenterGapEdit||emphasisCenterGapEdit.item!==item)emphasisCenterGapEdit={item,startX:item.inner_x,startY:item.inner_y};beginPropertyEdit();return emphasisCenterGapEdit;}
    function updateEmphasisCenterGap(control){const edit=beginEmphasisCenterGapEdit(),requested=Number(control.value);if(!edit||!Number.isFinite(requested))return;const pair=scaleCenterGapPair(edit.startX,edit.startY,requested);edit.item.inner_x=pair.inner_x;edit.item.inner_y=pair.inner_y;regenerateEmphasisRays(edit.item);syncProperties();requestRender({canvas:true});}
    function finishEmphasisCenterGapEdit(){const edit=emphasisCenterGapEdit;if(!edit)return;emphasisCenterGapEdit=null;commitPropertyEdit();syncEmphasisCenterGapMaster(edit.item,true);requestRender({canvas:true,layers:true,preview:true});}
    for(const control of [emphasisCenterGapRange,emphasisCenterGapNumber]){control.addEventListener("pointerdown",beginEmphasisCenterGapEdit);control.addEventListener("focus",beginEmphasisCenterGapEdit);control.addEventListener("input",()=>updateEmphasisCenterGap(control));control.addEventListener("change",finishEmphasisCenterGapEdit);control.addEventListener("pointerup",finishEmphasisCenterGapEdit);control.addEventListener("pointercancel",finishEmphasisCenterGapEdit);control.addEventListener("blur",finishEmphasisCenterGapEdit);}
    emphasisCenterGapNumber.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();emphasisCenterGapNumber.blur();}});
    document.getElementById("newEmphasisSeed").onclick=()=>{const item=state.elements.find(element=>element.id===state.selected);if(!item||item.type!=="emphasis_lines"||item.locked)return;pushUndo();item.seed=randomEmphasisSeed();regenerateEmphasisRays(item);syncProperties();render();};
    document.getElementById("resetEmphasisCenter").onclick=()=>{const item=state.elements.find(element=>element.id===state.selected);if(!item||item.type!=="emphasis_lines"||item.locked||(item.center_x===.5&&item.center_y===.5))return;pushUndo();item.center_x=.5;item.center_y=.5;regenerateEmphasisRays(item);syncProperties();render();};
    document.getElementById("fontPickerButton").onclick=openFontBrowser;document.getElementById("closeFontBrowser").onclick=closeFontBrowser;
    document.getElementById("fontSearch").addEventListener("input",renderFontBrowser);
    document.querySelectorAll("[data-font-filter]").forEach(button=>button.onclick=()=>{fontFilter=button.dataset.fontFilter;document.querySelectorAll("[data-font-filter]").forEach(candidate=>candidate.classList.toggle("active",candidate===button));document.getElementById("fontSearch").value="";renderFontBrowser();});
    window.addEventListener("resize",positionFontBrowser);
    function closeAssetDrawers(except=""){for(const id of ["shapeDrawer","sfxDrawer","frameDrawer","emphasisDrawer"]){if(id!==except)document.getElementById(id)?.classList.remove("open");}}
    document.getElementById("openShapeDrawer").onclick=()=>{closeAssetDrawers("shapeDrawer");const drawer=document.getElementById("shapeDrawer");restoreDrawerWidth(drawer);drawer.classList.add("open");document.getElementById("shapeSearch").focus();};
    document.getElementById("closeShapeDrawer").onclick=()=>document.getElementById("shapeDrawer").classList.remove("open");
    document.getElementById("openSfxDrawer").onclick=()=>openSfxBrowser("sfx");
    document.getElementById("openStampDrawer").onclick=()=>openSfxBrowser("stamps");
    document.getElementById("closeSfxDrawer").onclick=()=>document.getElementById("sfxDrawer").classList.remove("open");
    document.getElementById("openFrameDrawer").onclick=openFrameBrowser;
    document.getElementById("closeFrameDrawer").onclick=()=>document.getElementById("frameDrawer").classList.remove("open");
    document.getElementById("openEmphasisDrawer").onclick=()=>{closeAssetDrawers("emphasisDrawer");renderEmphasisBrowser();const drawer=document.getElementById("emphasisDrawer");restoreDrawerWidth(drawer);drawer.classList.add("open");};
    document.getElementById("closeEmphasisDrawer").onclick=()=>document.getElementById("emphasisDrawer").classList.remove("open");
    document.getElementById("frameSearch").addEventListener("input",filterFrameCards);document.getElementById("frameCategory").addEventListener("change",filterFrameCards);
    document.getElementById("sfxSearch").addEventListener("input",filterSfxCards);document.getElementById("sfxCategory").addEventListener("change",filterSfxCards);
    document.getElementById("sfxSort").addEventListener("change",event=>{sfxSortMode=event.target.value;try{localStorage.setItem(SFX_SORT_KEY,sfxSortMode);}catch{}renderSfxDrawer();});
    document.getElementById("shapeSearch").addEventListener("input",filterPresetCards);document.getElementById("shapeCategory").addEventListener("change",filterPresetCards);
    document.getElementById("saveUserPreset").onclick=()=>saveSelectedUserPreset(false);document.getElementById("saveUserPresetAs").onclick=()=>saveSelectedUserPreset(true);document.getElementById("importUserPresets").onclick=()=>document.getElementById("userPresetImportFile").click();document.getElementById("exportUserPresets").onclick=exportUserPresets;document.getElementById("userPresetImportFile").addEventListener("change",event=>{importUserPresets(event.target.files?.[0]);event.target.value="";});
    document.querySelectorAll("[data-shadow-dir]").forEach(button=>button.onclick=()=>{const item=state.elements.find(e=>e.id===state.selected);if(!item||item.locked)return;pushUndo();const [dx,dy]=button.dataset.shadowDir.split(",").map(Number);const distance=Math.max(6,Math.abs(Number(item.shadow_x)||0),Math.abs(Number(item.shadow_y)||0));item.shadow_enabled=dx!==0||dy!==0;item.shadow_x=dx*distance;item.shadow_y=dy*distance;syncProperties();render();});
    document.querySelectorAll("[data-writing]").forEach(button=>button.onclick=()=>{const item=state.elements.find(e=>e.id===state.selected);if(!item||item.type!=="text"||item.locked)return;pushUndo();item.writing=button.dataset.writing;fitTextBox(item,true,false);syncProperties();render();});
    document.getElementById("fitTextBoxNow").onclick=()=>{const item=state.elements.find(element=>element.id===state.selected);if(!item||item.type!=="text"||item.locked)return;pushUndo();fitTextBox(item,true,false);syncProperties();render();};
    document.querySelectorAll("[data-text-align]").forEach(button=>button.onclick=()=>{const item=state.elements.find(e=>e.id===state.selected);if(!item||item.type!=="text"||item.locked)return;pushUndo();item.align=button.dataset.textAlign;syncProperties();render();});
    document.querySelectorAll("[data-toggle-key]").forEach(button=>button.onclick=()=>{const items=editableSelectedTextItems();if(!items.length)return;pushUndo();const key=button.dataset.toggleKey,next=!items.every(item=>!!item[key]);items.forEach(item=>{item[key]=next;fitTextBox(item,true,!item.auto_fit);});syncProperties();render();});
    document.querySelectorAll("[data-sfx-color-mode]").forEach(button=>button.onclick=()=>{const item=state.elements.find(e=>e.id===state.selected),userAssetId=String(item?.user_asset_id||"").replace(/^user:/,"");if(!item||item.type!=="sfx"||!userAssetId||item.locked||state.selection.length!==1)return;const next=button.dataset.sfxColorMode==="fill";if(Boolean(item.mask_mode)===next)return;pushUndo();if(next&&!item.user_fill_initialized){item.fill="#ffffff";item.user_fill_initialized=true;}item.mask_mode=next;syncProperties();render();});
     document.getElementById("resetFrame").onclick=()=>{const item=state.elements.find(e=>e.id===state.selected);if(!item||item.type!=="frame"||item.locked)return;pushUndo();const preset=FRAME_BY_ID.get(item.frame_preset_id)||FRAME_PRESETS[0],fresh=defaultFrame(preset.id);for(const key of ["fit_to_canvas","pin_to_top","frame_scale","frame_inset","fit_mode","border_color","border_width_x","border_width_y","inner_stroke_color","inner_stroke_width","attached_decorations","shadow_enabled","shadow_color","shadow_opacity","shadow_x","shadow_y","shadow_blur","glow_enabled","glow_color","glow_opacity","glow_blur","glow_spread","opacity"]){item[key]=Array.isArray(fresh[key])?[...fresh[key]]:fresh[key];}syncFrameToCanvas(item);normalizePinnedFrameOrder();syncProperties();render();};
     document.getElementById("frameAttachedDecorationList").addEventListener("change",event=>{const input=event.target.closest("[data-frame-decoration]"),item=state.elements.find(element=>element.id===state.selected);if(!input||!item||item.type!=="frame"||item.locked||state.selection.length!==1)return;pushUndo();const enabled=new Set(Array.isArray(item.attached_decorations)?item.attached_decorations:[]);if(input.checked)enabled.add(input.dataset.frameDecoration);else enabled.delete(input.dataset.frameDecoration);item.attached_decorations=[...enabled];syncProperties();render();});
     document.getElementById("deleteFrameBtn").onclick=deleteSelectedFrame;
     document.getElementById("editVector").onclick=()=>{const item=state.elements.find(e=>e.id===state.selected);if(!item||item.type!=="bubble"||item.locked||isFixedPathItem(item)||state.selection.length!==1)return;if(state.vectorEditId===item.id){state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;}else{if(!Array.isArray(item.path_points)){pushUndo();ensureVectorPath(item);}state.vectorEditId=item.id;state.vectorAnchorIndex=null;}syncProperties();render();};
    document.getElementById("addVectorPoint").onclick=()=>{const item=state.elements.find(e=>e.id===state.vectorEditId);if(!item)return;state.vectorAddMode=!state.vectorAddMode;syncProperties();render();};
    document.getElementById("deleteVectorPoint").onclick=deleteVectorPoint;
    document.getElementById("randomizeShape").onclick=()=>{const item=state.elements.find(e=>e.id===state.selected);if(!item||!shapeTuningForItem(item)||item.locked)return;pushUndo();item.shape_seed=Math.floor(Math.random()*2147483647)+1;regenerateTunablePath(item);syncProperties();render();};
    document.getElementById("groupSelection").onclick=groupSelected;document.getElementById("ungroupSelection").onclick=ungroupSelected;
    document.getElementById("plus").onclick=()=>{state.zoom=Math.min(4,state.zoom*1.2);captureActiveWorkspace();requestRender({canvas:true});}; document.getElementById("minus").onclick=()=>{state.zoom=Math.max(.25,state.zoom/1.2);captureActiveWorkspace();requestRender({canvas:true});}; document.getElementById("fit").onclick=fitView;
    document.getElementById("undo").onclick=undoAction; document.getElementById("redo").onclick=redoAction;
     function saveEditorWindowState(){const availableWidth=Number(screen.availWidth)||window.outerWidth||window.innerWidth,availableHeight=Number(screen.availHeight)||window.outerHeight||window.innerHeight,availableLeft=Number(screen.availLeft)||0,availableTop=Number(screen.availTop)||0,width=Math.round(window.outerWidth||window.innerWidth),height=Math.round(window.outerHeight||window.innerHeight),left=Math.round(Number.isFinite(window.screenX)?window.screenX:window.screenLeft||availableLeft),top=Math.round(Number.isFinite(window.screenY)?window.screenY:window.screenTop||availableTop),tolerance=32,maximized=Math.abs(width-availableWidth)<=tolerance&&Math.abs(height-availableHeight)<=tolerance&&Math.abs(left-availableLeft)<=tolerance&&Math.abs(top-availableTop)<=tolerance,stateSnapshot={mode:maximized?"maximized":"windowed",width,height,left,top,updatedAt:Date.now()};try{localStorage.setItem(EDITOR_WINDOW_STATE_KEY,JSON.stringify(stateSnapshot));window.pywebview?.api?.save_window_state?.({window_width:width,window_height:height,window_left:left,window_top:top,window_maximized:maximized});}catch{}}
     function cleanupTransientState(){clearTimeout(livePreviewTimer);livePreviewTimer=null;clearTimeout(autoSaveTimer);autoSaveTimer=null;try{localStorage.removeItem(jsonKey);}catch{}comicEditor?.dispose();generalComicEditor?.dispose();clearSingleImageAssets();if(sourceObjectUrl){URL.revokeObjectURL(sourceObjectUrl);sourceObjectUrl=null;}}
    async function prepareNativeClose(options={}){if(nativeClosePrepared){return{ok:true};}if(nativeCloseInFlight){return{ok:false,error:uiText("終了処理中です","Close is already in progress")};}nativeCloseInFlight=true;let result={ok:false,error:""};try{if(layoutDirty){const action=await window.SpeechBubbleDesktopShell?.confirmUnsavedChanges?.("close")||"cancel";if(action==="cancel"){result={ok:false,cancelled:true};return result;}if(action==="save"&&!(await window.SpeechBubbleDesktopShell?.saveProject?.())){result={ok:false,cancelled:true};return result;}if(action==="discard"){discardChanges(false);await persistDesktopRecovery(true,true);}}saveEditorWindowState();nativeClosePrepared=true;result={ok:true};return result;}catch(error){result={ok:false,error:error?.message||uiText("終了前の保存に失敗しました","Could not save before closing")};setSaveState(result.error,"error");return result;}finally{nativeCloseInFlight=false;if(options?.fromNative){try{await window.pywebview?.api?.native_close_ready?.(result.ok,result.error||"",Boolean(result.cancelled));}catch(error){console.warn("Speech Bubble native close acknowledgement failed",error);}}}}
    async function closeEditor(){if(editorClosed)return;const result=await prepareNativeClose({fromNative:false});if(!result.ok)return;postHost("speech_bubble:editor_closing",{...editorConnectionState(),image_hash:imageHash,document_id:documentId});editorClosed=true;cleanupTransientState();postHost("speech_bubble:editor_closed",{image_hash:imageHash,document_id:documentId});if(window.pywebview?.api?.native_close_ready)await window.pywebview.api.native_close_ready(true,"",false);else window.close();}
    document.getElementById("discardChanges").onclick=discardChanges;
    document.getElementById("saveLayout").onclick=saveLayoutExplicit;
    document.getElementById("exportImage").onclick=exportImage;
    const backgroundInput=document.getElementById("backgroundFileInput");
    const chooseBackground=()=>backgroundInput.click();
    const chooseImageLayer=()=>{pendingImageLayerReplacementId="__add__";backgroundInput.click();};
    document.getElementById("openBackgroundImage")?.addEventListener("click",chooseBackground);
    document.getElementById("chooseBackgroundImage").onclick=chooseBackground;
    document.getElementById("addSingleImageLayerFromLayers").onclick=chooseImageLayer;
    document.getElementById("replaceBackgroundImage").onclick=()=>{const item=selectedImageLayer();if(!item)return;pendingImageLayerReplacementId=item.id;backgroundInput.click();};
    document.getElementById("removeBackgroundImage").onclick=removeBackgroundImage;
    document.getElementById("resetBackgroundPosition").onclick=resetBackgroundPosition;
    document.getElementById("coverBackgroundImage").onclick=()=>fitSelectedImage("cover");
    document.getElementById("containBackgroundImage").onclick=()=>fitSelectedImage("contain");
    document.getElementById("editImageCrop").onclick=()=>startImageCropEdit();
    document.getElementById("resetImageCrop").onclick=()=>resetImageCrop();
    document.getElementById("imageCropToolbar").addEventListener("click",event=>{const action=event.target.closest("[data-crop-action]")?.dataset.cropAction;if(action==="confirm")confirmImageCropEdit();else if(action==="cancel")cancelImageCropEdit();else if(action==="reset")resetImageCrop(undefined,false);});
    document.getElementById("groupProps").addEventListener("click",event=>{const action=event.target.closest("[data-align-action]")?.dataset.alignAction;if(action)runAlignmentAction(action);});
    document.getElementById("alignmentReference").addEventListener("change",event=>{alignmentReference=event.target.value||"selection";syncMultiAlignmentUi();});
    for(const control of [document.getElementById("groupRotationRange"),document.getElementById("groupRotation")]){control.addEventListener("pointerdown",beginGroupRotationEdit);control.addEventListener("focus",beginGroupRotationEdit);control.addEventListener("input",event=>updateGroupRotationEdit(event.target.value));control.addEventListener("change",commitGroupRotationEdit);control.addEventListener("pointerup",commitGroupRotationEdit);control.addEventListener("pointercancel",commitGroupRotationEdit);control.addEventListener("blur",commitGroupRotationEdit);}
    const openSelectedBackgroundRemoval=()=>{if(!selectedImageLayer())return;backgroundRemoval?.open?.();};
    const openSelectedComicConversion=()=>{if(!selectedImageLayer())return;comicConverter?.open?.();};
    const openSelectedQuickRetouch=()=>{if(!selectedImageLayer())return;quickRetouch?.open?.();};
    document.getElementById("processImageBackgroundRemoval").onclick=openSelectedBackgroundRemoval;
    document.getElementById("processImageComicConversion").onclick=openSelectedComicConversion;
    for(const [controlId,key] of [["backgroundOffsetX","x"],["backgroundOffsetY","y"]]){const control=document.getElementById(controlId);control.addEventListener("focus",beginPropertyEdit);control.addEventListener("input",()=>{const item=selectedImageLayer(),value=Number(control.value);if(!item||item.locked||!Number.isFinite(value))return;item[key]=Math.max(-8192,Math.min(8192,value));requestRender({canvas:true,preview:true});});control.addEventListener("change",()=>{commitPropertyEdit();syncProperties();requestRender({canvas:true,layers:true,preview:true});});control.addEventListener("blur",commitPropertyEdit);}
    {const range=document.getElementById("backgroundRotationRange"),number=document.getElementById("backgroundRotation"),apply=control=>{const item=selectedImageLayer(),value=Number(control.value);if(!item||item.locked||!Number.isFinite(value))return;item.rotation=imageLayerRotation.normalize(value);range.value=number.value=String(item.rotation);requestRender({canvas:true,preview:true});},commit=()=>{commitPropertyEdit();syncProperties();requestRender({canvas:true,layers:true,preview:true});};range.addEventListener("pointerdown",beginPropertyEdit);range.addEventListener("input",()=>apply(range));range.addEventListener("change",commit);range.addEventListener("pointercancel",commit);number.addEventListener("focus",beginPropertyEdit);number.addEventListener("input",()=>apply(number));number.addEventListener("change",commit);number.addEventListener("blur",commit);}
    const imageScaleControl=document.getElementById("backgroundScaleRange");imageScaleControl.addEventListener("pointerdown",beginPropertyEdit);imageScaleControl.addEventListener("input",()=>{const item=selectedImageLayer(),value=Number(imageScaleControl.value);if(!item||item.locked||!Number.isFinite(value))return;const crop=imageCropFor(item),full=imageFullGeometry(item),center={x:full.x+full.w/2,y:full.y+full.h/2},factor=Math.max(.1,Math.min(8,value/100)),fullW=Math.max(1,item.base_width*factor),fullH=Math.max(1,item.base_height*factor),nextFull={x:center.x-fullW/2,y:center.y-fullH/2,w:fullW,h:fullH};applyCropGeometry(item,crop,nextFull);document.getElementById("backgroundScaleOutput").textContent=`${Math.round(value)}%`;requestRender({canvas:true,preview:true});});imageScaleControl.addEventListener("change",()=>{commitPropertyEdit();syncProperties();requestRender({canvas:true,layers:true,preview:true});});
    const imageOpacityControl=document.getElementById("backgroundOpacity");imageOpacityControl.addEventListener("pointerdown",beginPropertyEdit);imageOpacityControl.addEventListener("input",()=>{const item=selectedImageLayer(),value=Number(imageOpacityControl.value);if(!item||item.locked||!Number.isFinite(value))return;item.opacity=Math.max(0,Math.min(1,value/100));document.getElementById("backgroundOpacityOutput").textContent=`${Math.round(value)}%`;requestRender({canvas:true,preview:true});});imageOpacityControl.addEventListener("change",()=>{commitPropertyEdit();syncProperties();requestRender({canvas:true,layers:true,preview:true});});
    {const type=document.getElementById("canvasBackgroundType"),preset=document.getElementById("canvasBackgroundPreset"),transparent=document.getElementById("canvasBackgroundTransparent"),fields=document.getElementById("canvasBackgroundFields"),recordSelectUndo=()=>{if(!state.propertyEditSnapshot)pushUndo();};type.addEventListener("change",()=>{recordSelectUndo();state.canvasBackground=normalizedCanvasBackground({type:type.value,color:state.canvasBackground.color,patternColor:state.canvasBackground.patternColor,color2:state.canvasBackground.color2,transparent:state.canvasBackground.transparent});rebuildCanvasBackgroundProperties();render();});preset.addEventListener("change",()=>{const selected=canvasBackgroundPatterns.TYPES.find(item=>item.id===state.canvasBackground.type),choice=selected?.presets.find(item=>item.id===preset.value);if(!choice)return;recordSelectUndo();state.canvasBackground=normalizedCanvasBackground({...state.canvasBackground,...choice.values,preset:choice.id});rebuildCanvasBackgroundProperties();render();});enableRealtimeSelectWheel(type);enableRealtimeSelectWheel(preset);for(const [id,key] of [["canvasBackgroundColor","color"],["canvasBackgroundPatternColor","patternColor"],["canvasBackgroundColor2","color2"]]){const control=document.getElementById(id);control.addEventListener("pointerdown",beginPropertyEdit);control.addEventListener("focus",beginPropertyEdit);control.addEventListener("input",()=>{state.canvasBackground[key]=control.value;activeCanvasBackgroundColor=key;updateCanvasBackgroundSwatches();requestRender({canvas:true,preview:true});});control.addEventListener("change",commitPropertyEdit);control.addEventListener("blur",commitPropertyEdit);}fields.addEventListener("pointerdown",event=>{if(event.target.matches("input[type=range]"))beginPropertyEdit();});fields.addEventListener("input",event=>{const control=event.target.closest("[data-canvas-background-field]");if(!control)return;const key=control.dataset.canvasBackgroundField;state.canvasBackground[key]=Number(control.value);control.nextElementSibling.textContent=control.value;requestRender({canvas:true,preview:true});});fields.addEventListener("change",()=>{commitPropertyEdit();rebuildCanvasBackgroundProperties();requestRender({canvas:true,layers:true,preview:true});});document.getElementById("canvasBackgroundRandomize").addEventListener("click",()=>{pushUndo();state.canvasBackground.seed=canvasBackgroundPatterns.randomSeed();rebuildCanvasBackgroundProperties();render();});transparent.addEventListener("change",()=>{pushUndo();state.canvasBackground.transparent=transparent.checked;render();});}
    backgroundInput.addEventListener("change",async()=>{const file=backgroundInput.files?.[0],target=pendingImageLayerReplacementId;pendingImageLayerReplacementId="";backgroundInput.value="";if(!file)return;if(target==="__add__"){await addSingleImageLayerFromBlob(file,file.name,{role:"image",locked:false});return;}const item=state.elements.find(layer=>layer.id===target&&layer.type==="image");if(item){await replaceSingleImageLayerFromBlob(item,file,file.name);return;}requestBackgroundFile(file);});
    document.getElementById("replaceCancel").onclick=()=>{pendingReplacementSource=null;document.getElementById("replaceImageDialog").close();};
    document.getElementById("replaceDiscard").onclick=async()=>{try{if(documentId)removeDraftCache();}catch{}applyLayoutForCurrentImage(lastSavedLayout,{dirty:false});document.getElementById("replaceImageDialog").close();await performPendingReplacement();};
    document.getElementById("replaceSave").onclick=async()=>{if(!(await saveLayoutExplicit()))return;document.getElementById("replaceImageDialog").close();await performPendingReplacement();};
    document.getElementById("imageRestoreCancel").onclick=()=>finishDialogChoice("imageLayoutRestoreDialog","image","cancel");
    document.getElementById("imageRestoreNew").onclick=()=>finishDialogChoice("imageLayoutRestoreDialog","image","new");
    document.getElementById("imageRestoreCopy").onclick=()=>finishDialogChoice("imageLayoutRestoreDialog","image","restore");
    document.getElementById("standaloneStartNew").onclick=()=>finishDialogChoice("resumeStandaloneDialog","standalone","new");
    document.getElementById("standaloneResumePrevious").onclick=()=>finishDialogChoice("resumeStandaloneDialog","standalone","resume");
    document.getElementById("imageLayoutRestoreDialog").addEventListener("cancel",event=>{event.preventDefault();finishDialogChoice("imageLayoutRestoreDialog","image","cancel");});
    document.getElementById("resumeStandaloneDialog").addEventListener("cancel",event=>{event.preventDefault();finishDialogChoice("resumeStandaloneDialog","standalone","new");});
    window.addEventListener("message",event=>{
      if(event.origin!==location.origin||event.source!==window.opener)return;
      const data=event.data;
      if(data?.type==="speech_bubble:host_ping"){
        event.source.postMessage({type:"speech_bubble:editor_pong",requestId:data.requestId,...editorConnectionState()},location.origin);
      }else if(data?.type==="speech_bubble:request_focus"){
        window.focus();
      }else if(data?.type==="speech_bubble:set_theme"){
        document.documentElement.dataset.theme=data.theme==="light"?"light":"dark";
      }else if(data?.type==="speech_bubble:switch_context"&&data.mode==="standalone"){
        sourceTab=data.source_tab||sourceTab;sourceName=data.source_name||"speech_bubble";
        startStandaloneDocument(data.documentId,{offerResume:true}).then(()=>{
          postHost("speech_bubble:context_applied",{requestId:data.requestId,...editorConnectionState()});
        }).catch(error=>{console.error(error);setSaveState(error?.message||"単体編集を開始できませんでした","error");});
      }else if(data?.type==="speech_bubble:load_source"&&data.image_url){
        requestRemoteImage(data.image_url,{name:data.source_name||"speech_bubble",tab:data.source_tab||sourceTab}).then(()=>{
          postHost("speech_bubble:source_applied",{requestId:data.requestId,...editorConnectionState()});
        }).catch(error=>{console.error(error);setSaveState(error?.message||"画像を読み込めませんでした","error");});
      }
    });
    window.addEventListener("beforeunload",event=>{if(editorClosed||nativeClosePrepared||autoSaveEnabled||!layoutDirty)return;event.preventDefault();event.returnValue="";});
    window.addEventListener("pagehide",()=>{if(isPaletteWindow||editorClosed)return;if(layoutDirty&&autoSaveEnabled)persistDraftNow();saveEditorWindowState();postHost("speech_bubble:editor_closing",{...editorConnectionState(),image_hash:imageHash,document_id:documentId});editorClosed=true;cleanupTransientState();postHost("speech_bubble:editor_closed",{image_hash:imageHash,document_id:documentId});});
    const properties=document.getElementById("properties");
    const shapePropertyKeys=new Set(["shape_intensity","shape_asymmetry","shape_roundness","spike_count","valley_style","valley_concavity","lobe_count","lobe_depth","shape_softness"]);
    const textFitPropertyKeys=new Set(["text","writing","font_id","font_path","font_size","tracking","font_scale_x","font_scale_y","bold","italic","stroke_width","stroke_color","shadow_enabled","shadow_x","shadow_y","shadow_blur","auto_fit"]);
    const bulkTextPropertyKeys=new Set(["font_size","color","stroke_color","stroke_width","tracking"]);
    function sfxScalePercent(item){const preset=SFX_BY_ID.get(item?.asset_id),baseWidth=Math.max(1,finiteOr(item?.asset_width,preset?.w||item?.w||1)),baseHeight=Math.max(1,finiteOr(item?.asset_height,preset?.h||item?.h||1)),widthRatio=finiteOr(item?.w,0)/baseWidth,heightRatio=finiteOr(item?.h,0)/baseHeight;return normalizeNumericValue("sfx_scale",((widthRatio+heightRatio)/2)*100,100);}
    function applyPropertyControl(input,normalizeNumber=false){const multiText=editableSelectedTextItems(),key=input.dataset.key;if(state.selection.length>1&&multiText.length&&bulkTextPropertyKeys.has(key)){let value=input.value;if(input.type==="number"){value=numericPropertyValue(key,input.value,multiText[0][key]??0,normalizeNumber);if(value===null)return false;if(normalizeNumber&&key==="font_size")value=integerFontSize(value);else if(normalizeNumber&&key==="tracking")value=trackingValue(value);}multiText.forEach(item=>{item[key]=value;if(textFitPropertyKeys.has(key))fitTextBox(item,true,!item.auto_fit);});return true;}const item=state.elements.find(e=>e.id===state.selected);if(!item||state.selection.length!==1||!key)return false;if(key==="preset_id")applyPresetToItem(item,input.value);else if(key==="preset"&&item.type==="emphasis_lines")applyEmphasisPresetToItem(item,input.value);else if(key==="sfx_scale"&&item.type==="sfx"){const current=sfxScalePercent(item),value=numericPropertyValue(key,input.value,current,normalizeNumber);if(value===null)return false;const factor=value/Math.max(1,current);item.w=normalizeNumericValue("w",item.w*factor,item.w);item.h=normalizeNumericValue("h",item.h*factor,item.h);}else if(input.type==="number"){const value=numericPropertyValue(key,input.value,item[key]??0,normalizeNumber);if(value===null)return false;if(normalizeNumber&&key==="font_size")item[key]=integerFontSize(value);else if(normalizeNumber&&key==="tracking")item[key]=trackingValue(value);else if(normalizeNumber&&(key==="font_scale_x"||key==="font_scale_y"))item[key]=fontScaleValue(value);else item[key]=value;}else item[key]=input.type==="checkbox"?input.checked:input.value;if(key==="comic_scope"&&item.comic_scope==="panel")item.comic_panel_id=comicEditor?.selectedPanelForEffects()||item.comic_panel_id||"";if(item.type==="frame"){if(["x","y","w","h","rotation"].includes(key))item.fit_to_canvas=false;if((key==="fit_to_canvas"||key==="frame_inset")&&item.fit_to_canvas)syncFrameToCanvas(item);if(key==="pin_to_top")normalizePinnedFrameOrder();}if(item.type==="emphasis_lines"){if(["x","y","w","h","rotation"].includes(key))item.fit_to_canvas=false;if(EMPHASIS_GEOMETRY_KEYS.has(key))scheduleEmphasisRegeneration(item);}if(shapePropertyKeys.has(key))regenerateTunablePath(item);if(input.id==="fontSelect"){const font=fontCatalog.find(candidate=>candidate.id===input.value);item.font_family=font?.family||"sans-serif";item.font_css_family=font?fontCssFamily(font):"sans-serif";item.font_path="";if(font)ensureFontLoaded(font).then(()=>{fitTextBox(item,true,false);render();});}if(item.type==="text"&&textFitPropertyKeys.has(key)){const preserveManualBox=!item.auto_fit&&!["text","writing","font_id","font_path","font_size","tracking","font_scale_x","font_scale_y","bold","italic","stroke_width","shadow_enabled","shadow_x","shadow_y","shadow_blur"].includes(key);fitTextBox(item,true,preserveManualBox);}return true;}
    properties.addEventListener("pointerdown",event=>{if(event.target.dataset.key||event.target.dataset.rangeKey)beginPropertyEdit();});
    properties.addEventListener("focusin",event=>{if(event.target.dataset.key||event.target.dataset.rangeKey)beginPropertyEdit();});
    properties.addEventListener("change",event=>{
      const input=event.target,comicTarget=input.dataset.comicTarget;
      if(comicTarget){
        const editor=activeStructuralEditor(),item=state.elements.find(element=>element.id===state.selected);
        if(!item||item.locked||state.selection.length!==1||!editor)return;
        pushUndo();
        if(item.type==="frame"&&generalComicEditor?.isActive()&&input.value.startsWith("panel:")){item.fit_to_canvas=false;applyComicPanelTarget(item,{scope:"panel",panelId:input.value.slice(6)});}else editor.assignElementTarget?.(item,input.value);
        if(item.type==="emphasis_lines"){
          item.fit_to_canvas=true;
          item.center_x=.5;
          item.center_y=.5;
          syncEmphasisToCanvas(item);
          regenerateEmphasisRays(item);
        }
        syncProperties();
        requestRender({canvas:true,layers:true,preview:true});
        return;
      }
      const propertyControl=input.dataset.key||input.dataset.rangeKey;if(input.type==="number"&&input.dataset.key){applyPropertyControl(input,true);syncProperties();}if(propertyControl){requestRender({canvas:true,layers:true,preview:true});commitPropertyEdit();}
    });
    properties.addEventListener("input",event=>{const input=event.target;if(!applyPropertyControl(input,false))return;if(input.type!=="number")syncProperties();requestRender({canvas:true});});
    document.getElementById("copyLayer").onclick=()=>{copySelected();document.getElementById("layerMenu").classList.remove("open");};
    document.getElementById("pasteLayer").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");pasteLayers();};
    document.getElementById("duplicateLayer").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");duplicateSelected();};
    document.getElementById("processLayerQuickRetouch").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");openSelectedQuickRetouch();};
    document.getElementById("processLayerBackgroundRemoval").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");openSelectedBackgroundRemoval();};
    document.getElementById("processLayerComicConversion").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");openSelectedComicConversion();};
    document.getElementById("showOriginalImageLayer").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");const processed=selectedImageLayer(),original=sourceImageLayerFor(processed);if(!original)return;pushUndo();if(processed&&processed!==original)processed.visible=false;original.visible=true;setSelection([original.id],original.id);syncProperties();render();};
    document.getElementById("deleteLayer").onclick=()=>{document.getElementById("layerMenu").classList.remove("open");deleteSelected();};
    document.addEventListener("pointerdown",event=>{if(!event.target.closest("#layerMenu")&&!event.target.closest(".more"))document.getElementById("layerMenu").classList.remove("open");if(!event.target.closest("#backgroundLayerMenu")&&!event.target.closest(".more"))document.getElementById("backgroundLayerMenu")?.classList.remove("open");if(!event.target.closest("#fontBrowser")&&!event.target.closest("#fontPickerButton"))closeFontBrowser();});
    canvas.addEventListener("pointerdown",event=>{if(event.button!==0)return;const shapeDrawer=document.getElementById("shapeDrawer"),sfxDrawer=document.getElementById("sfxDrawer"),frameDrawer=document.getElementById("frameDrawer"),wasShape=shapeDrawer.classList.contains("open"),wasSfx=sfxDrawer.classList.contains("open"),wasFrame=frameDrawer.classList.contains("open"),hit=findHit(imagePoint(event),true);if(hit){if(wasShape||wasSfx||wasFrame)setTimeout(()=>{if(wasShape)shapeDrawer.classList.add("open");if(wasSfx)sfxDrawer.classList.add("open");if(wasFrame)frameDrawer.classList.add("open");},0);}else closePresetDrawers();},true);
    viewport.addEventListener("pointerdown",event=>{if(event.button!==0||event.target===canvas)return;closePresetDrawers();},true);
    window.addEventListener("keydown",(event)=>{
      const modifier=event.ctrlKey||event.metaKey,key=event.key.toLowerCase(),active=document.activeElement,editing=["INPUT","TEXTAREA","SELECT"].includes(active?.tagName)||active?.isContentEditable||Boolean(active?.closest?.('[contenteditable="true"]'));
      if(imageCropEdit&&!editing&&event.key==="Enter"){event.preventDefault();confirmImageCropEdit();return;}
      if(imageCropEdit&&!editing&&event.key==="Escape"){event.preventDefault();cancelImageCropEdit();return;}
      if(imageCropEdit&&!editing&&!modifier&&key==="c"){event.preventDefault();confirmImageCropEdit();return;}
      if(imageCropEdit&&!editing&&modifier&&(key==="z"||key==="y")){event.preventDefault();return;}
      if(!imageCropEdit&&!editing&&!modifier&&key==="c"&&!document.querySelector(".sb-image-crop-dialog")){const structuralEditor=activeStructuralEditor();if(structuralEditor?.startImageCrop?.()){event.preventDefault();return;}const selectedImage=state.elements.find(item=>item.id===state.selected&&item.type==="image");if(selectedImage&&state.selection.length===1){event.preventDefault();startImageCropEdit(selectedImage);return;}}
      if(!editing&&(event.key==="Delete"||event.key==="Backspace")&&state.selection.length){event.preventDefault();if(state.vectorEditId&&state.vectorAnchorIndex!==null)deleteVectorPoint();else deleteSelected();return;}
      if(!editing&&comicEditor?.handleKeyDown(event))return;
      if(!editing&&!modifier&&key==="t"){event.preventDefault();addTextLayer();return;}
      if(modifier&&key==="c"&&!editing){event.preventDefault();copySelected();return;}
      if(modifier&&key==="z"){event.preventDefault();event.shiftKey?redoAction():undoAction();return;}
      if(modifier&&key==="y"){event.preventDefault();redoAction();return;}
      if(modifier&&key==="j"){event.preventDefault();duplicateSelected();return;}
      if(modifier&&key==="g"){event.preventDefault();event.shiftKey?ungroupSelected():groupSelected();return;}
      if(modifier&&key==="0"){event.preventDefault();fitView();return;}
      if(modifier&&key==="s"){
        event.preventDefault();
        if(event.shiftKey)document.getElementById("exportImage").click();
        else if(isForgeProjectHost)forgeProjectAdapter?.save?.("manual");
        else document.getElementById("saveLayout").click();
        return;
      }
      if(event.key==="Escape"&&document.getElementById("fontBrowser").classList.contains("open")){event.preventDefault();closeFontBrowser();document.getElementById("fontPickerButton").focus();return;}
      if(event.key==="Escape"&&isFrameSelected(state.elements.find(item=>item.id===state.selected))){event.preventDefault();setSelection([],null);syncProperties();render();return;}
      if(event.key==="Escape"&&state.vectorEditId){event.preventDefault();state.vectorEditId=null;state.vectorAnchorIndex=null;state.vectorAddMode=false;syncProperties();render();return;}
      if(!editing&&(event.key==="Delete"||event.key==="Backspace")){event.preventDefault();if(state.vectorEditId&&state.vectorAnchorIndex!==null)deleteVectorPoint();else deleteSelected();return;}
      if(!editing&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(event.key)){event.preventDefault();const amount=event.shiftKey?10:1;nudgeSelected(event.key==="ArrowLeft"?-amount:event.key==="ArrowRight"?amount:0,event.key==="ArrowUp"?-amount:event.key==="ArrowDown"?amount:0);return;}
      if(event.code!=="Space"||editing)return;event.preventDefault();state.spaceDown=true;canvas.style.cursor="grab";viewport.style.cursor="grab";
    });
    window.addEventListener("keyup",(event)=>{if(event.code!=="Space")return;state.spaceDown=false;if(!state.drag)canvas.style.cursor="default";});
    window.addEventListener("blur",()=>{state.spaceDown=false;if(!state.drag)canvas.style.cursor="default";});
    const USER_ASSET_CHANNEL="speech-bubble-editor:user-assets:v1";
    let userAssetBroadcast=null;
    function initializeUserAssetBroadcast(){if(userAssetBroadcast||!("BroadcastChannel" in window))return;try{userAssetBroadcast=new BroadcastChannel(USER_ASSET_CHANNEL);userAssetBroadcast.addEventListener("message",event=>{const data=event.data||{};if(data.type==="catalog_changed"){loadUserAssetCatalog().then(()=>{refreshQuickSfx();if(document.getElementById("sfxDrawer").classList.contains("open"))renderSfxDrawer();});}else if(data.type==="diagnostic_ping"&&data.nonce){userAssetBroadcast.postMessage({type:"diagnostic_pong",nonce:data.nonce,mode:documentMode,documentId,version:"1.0.0"});}});}catch(error){console.warn("Speech Bubble user preset live updates unavailable",error);userAssetBroadcast=null;}}
    function deferEditorTask(task){if("requestIdleCallback" in window)requestIdleCallback(()=>task(),{timeout:1000});else setTimeout(task,0);}
    let firstPaintDone=false,deferredResourcesStarted=false;
    function startDeferredResources(){if(deferredResourcesStarted)return;deferredResourcesStarted=true;deferEditorTask(loadDeferredEditorResources);}
    function firstPaint(){if(firstPaintDone)return;firstPaintDone=true;if(firstApplicationView)fitView(false);else restoreWorkspaceView(workspaces[activeWorkspace],false);syncProperties();requestRender({canvas:true,layers:true,preview:false});dirtyTrackingEnabled=true;updateActionState();postHost("speech_bubble:editor_ready",{has_image:imageLoaded,document_id:documentId,mode:documentMode});requestAnimationFrame(()=>{if(imageLoaded)deferEditorTask(()=>scheduleLivePreview(renderRevision));startDeferredResources();});}
    async function loadDeferredEditorResources(){const fontTask=loadSystemFonts(),assetTask=Promise.all([loadFrameManifest(),loadBubbleShapeManifest(),loadSfxAssetCatalog(),loadUserAssetCatalog()]);await assetTask;initializePresetUI();refreshQuickSfx();refreshQuickFrames();await fontTask;requestRender({canvas:true,layers:true,preview:false});}
    async function desktopBrowserCacheStatus(){
      let draftFiles=0,draftBytes=0,temporaryFiles=0,temporaryBytes=0;
      try{
        for(let index=0;index<localStorage.length;index++){
          const key=localStorage.key(index);
          if(!key?.startsWith(DRAFT_LAYOUT_PREFIX))continue;
          const value=localStorage.getItem(key)||"";
          draftFiles+=1;draftBytes+=(key.length+value.length)*2;
        }
      }catch{}
      try{
        const db=await openDocumentDb();
        const records=await new Promise((resolve,reject)=>{const transaction=db.transaction(DOCUMENT_DB_STORE,"readonly"),request=transaction.objectStore(DOCUMENT_DB_STORE).getAll();request.onsuccess=()=>resolve(Array.isArray(request.result)?request.result:[]);request.onerror=()=>reject(request.error);});
        db.close();
        temporaryFiles=records.length;
        temporaryBytes=records.reduce((total,record)=>total+(Number(record?.blob?.size)||0),0);
      }catch(error){console.warn("Speech Bubble browser cache status unavailable",error);}
      return{draft_files:draftFiles,temporary_files:temporaryFiles,total_size:draftBytes+temporaryBytes};
    }
    async function clearDesktopBrowserCache(){
      let removed=0;
      try{
        const keys=[];
        for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key?.startsWith(DRAFT_LAYOUT_PREFIX))keys.push(key);}
        keys.forEach(key=>localStorage.removeItem(key));removed+=keys.length;localStorage.removeItem(DRAFT_META_KEY);localStorage.removeItem(LAST_STANDALONE_ID_KEY);
      }catch{}
      try{
        const db=await openDocumentDb();
        const count=await new Promise((resolve,reject)=>{const transaction=db.transaction(DOCUMENT_DB_STORE,"readwrite"),store=transaction.objectStore(DOCUMENT_DB_STORE),countRequest=store.count();countRequest.onsuccess=()=>{const value=Number(countRequest.result)||0;store.clear();resolve(value);};countRequest.onerror=()=>reject(countRequest.error);});
        db.close();removed+=count;
      }catch(error){console.warn("Speech Bubble browser cache clear failed",error);}
      return{removed};
    }
    const DESKTOP_SINGLE_BACKGROUND_ID="__single_background__";
    async function desktopSnapshot(){
      const images=[...(await comicEditor?.exportProjectImages?.()||[]),...(await generalComicEditor?.exportProjectImages?.()||[])];
      const usedSingleAssets=new Set(workspaces.single.elements.filter(item=>item.type==="image").map(item=>item.image_asset_id));for(const asset of singleImageAssets.values())if(usedSingleAssets.has(asset.id))images.push({id:asset.id,name:asset.name||"single-image",mime:asset.mime||asset.blob.type||"image/png",data_url:await blobToDataUrl(asset.blob)});
      if(!singleImageAssets.size&&imageLoaded&&(sourceBlob||imageUrl)){const blob=await sourceImageBlob();images.push({id:DESKTOP_SINGLE_BACKGROUND_ID,name:sourceName||"single-image",mime:blob.type||"image/png",data_url:await blobToDataUrl(blob)});}
      return{title:sourceName||"speech-bubble-project",project_path:currentProjectPath,layout:JSON.parse(currentLayoutJson()),images};
    }
    async function loadDesktopPayload(payload,{recovery=false}={}){
      const prepared=projectSchema.preflightPayload(payload),records=await Promise.all(prepared.images.map(async record=>{const response=await fetch(record.data_url);if(!response.ok)throw new Error(`Image load failed: ${record.id}`);const blob=await response.blob();if(!String(blob.type||"").startsWith("image/"))throw new Error(`Image data is invalid: ${record.id}`);const url=URL.createObjectURL(blob);try{await loadSingleImageElement(url);}finally{URL.revokeObjectURL(url);}return{...record,blob};})),singleRecords=records.filter(record=>record.id===DESKTOP_SINGLE_BACKGROUND_ID||record.id.startsWith(SINGLE_IMAGE_ASSET_PREFIX)),generalRecords=records.filter(record=>record.id.startsWith(generalComicEditor?.IMAGE_PREFIX||"general-comic-image:")),comicRecords=records.filter(record=>!singleRecords.includes(record)&&!generalRecords.includes(record)),savedSingleElements=prepared.layout.workspaces.single.elements||prepared.layout.elements||[],preferredId=savedSingleElements.find(item=>item?.type==="image"&&item.source_role==="original")?.image_asset_id||savedSingleElements.find(item=>item?.type==="image")?.image_asset_id||singleRecords[0]?.id;
      const nextId=`standalone:${createUuid()}`;setStandaloneContext(nextId);clearDocumentCanvas();sourceName=String(prepared.manifest?.title||"speech-bubble-project");currentProjectPath=String(prepared.path||prepared.manifest?.project_path||"");dirtyTrackingEnabled=false;
      for(const record of singleRecords){const assetId=record.id===DESKTOP_SINGLE_BACKGROUND_ID?`${SINGLE_IMAGE_ASSET_PREFIX}legacy-original`:record.id;if(record.id===preferredId||(!imageLoaded&&record===singleRecords[0]))await displayImageBlob(record.blob,{name:record.name||sourceName,assetId});else await registerSingleImageAsset(record.blob,record.name||"Image",assetId);}
      loadState(JSON.stringify(prepared.layout),{strict:true});if(activeWorkspace==="single")ensurePrimarySingleImageLayer();await comicEditor?.importProjectImages?.(comicRecords.map(({blob,...record})=>record));await generalComicEditor?.importProjectImages?.(generalRecords.map(({blob,...record})=>record));
      lastSavedLayout=currentLayoutJson();hasExplicitSavedLayout=!recovery;layoutDirty=recovery;state.undo=[];state.redo=[];dirtyTrackingEnabled=true;
      restoreWorkspaceView(workspaces[activeWorkspace],false);syncProperties();requestRender({canvas:true,layers:true,preview:false});updateActionState();
    }
    window.SpeechBubbleDesktopEditor={
      snapshot:desktopSnapshot,
      markProjectSaved,
      hasUnsavedChanges:()=>layoutDirty,
      newProject:createNewDesktopProject,
      prepareNativeClose,
      loadProject:async payload=>loadDesktopPayload(payload,{recovery:false}),
      loadRecovery:async payload=>loadDesktopPayload(payload,{recovery:true}),
      setStatus:setSaveState,
      cacheStatus:desktopBrowserCacheStatus,
      clearCache:clearDesktopBrowserCache,
      converterStatus:()=>comicConverter?.storageStatus?.()||{},
      clearConversionHistory:()=>comicConverter?.clearHistory?.()||{removed:0},
      comicStorageStatus:()=>comicEditor?.storageStatus?.()||{},
      cleanupUnusedComicImages:()=>comicEditor?.cleanupUnusedImages?.()||{removed:0},
      refreshUserAssets:async()=>{await loadUserAssetCatalog();refreshQuickSfx();renderSfxDrawer();},
      bubblePresets:()=>structuredClone(userPresets),
      manageBubblePreset,
      importBubblePresets:()=>document.getElementById("userPresetImportFile").click(),
      exportBubblePresets:exportUserPresets,
    };
    let forgeProjectAdapter=null,projectImageTray=null,forgeProjectSettingsController=null;
    const FORGE_UI_TRANSLATIONS=[
      ["元に戻す","Undo"],["やり直す","Redo"],["全体表示","Fit"],["変更を破棄","Discard Changes"],["レイアウト保存","Save Layout"],["画像を書き出す","Export Image"],
      ["白黒変換","Black & White Conversion"],["背景削除","Background Removal"],["吹き出し","Speech Bubbles"],["オノマトペ / SFX","Onomatopoeia / SFX"],["コミックスタンプ / シンボル","Comic Stamps / Symbols"],["集中線","Emphasis Lines"],["フレーム","Frames"],
      ["画像を読み込んでください","Load an image"],["追加先：コマ1","Target: Panel 1"],["または","or"],["Ctrl+Vでクリップボード画像を貼り付け","Paste a clipboard image with Ctrl+V"],
      ["白黒変換を開く","Open Black & White Conversion"],["背景削除を開く","Open Background Removal"],["吹き出しを開く…","Browse Bubbles…"],["＋ 文字を追加","＋ Add Text"],["SFXを開く…","Browse SFX…"],["スタンプを開く…","Browse Stamps…"],["集中線を開く…","Browse Focus Lines…"],["フレームを開く…","Browse Frames…"],
      ["閉じる","Close"],["すべての分類","All categories"],["ユーザープリセット","User Presets"],["会話","Dialogue"],["思考 / 静かな声","Thought / Quiet"],["感情 / 叫び","Emotion / Shout"],["電子音 / 特殊","Electronic / Special"],["ナレーション","Narration"],["JSONを読み込む","Import JSON"],["JSONを書き出す","Export JSON"],
      ["すべてのフレーム","All frame styles"],["枠","Borders"],["角丸","Rounded"],["かわいい / 花 / パステル","Cute / Floral / Pastel"],
      ["プロパティ","Properties"],["レイヤーを選択してください。","Select a layer to edit it."],["複数レイヤーを選択中","Multiple layers selected"],["キャンバス上のハンドルでまとめて移動・拡大縮小・回転できます。","Drag the canvas handles to move, resize, or rotate them together."],
      ["画像レイヤー","Image Layer"],["画像なし","No image"],["画像を変更","Replace Image"],["画像を削除","Remove Image"],["画像倍率","Image Scale"],["位置 X","Position X"],["位置 Y","Position Y"],["回転角度","Rotation"],["不透明度","Opacity"],["中央へ戻す","Reset to Center"],["背景に合わせる","Cover Canvas"],["キャンバスに収める","Contain in Canvas"],["この画像を背景削除","Remove This Image Background"],["この画像を白黒変換","Convert This Image to Black & White"],
      ["キャンバス背景","Canvas Background"],["背景の種類","Background Type"],["内蔵プリセット","Built-in Preset"],["背景色","Background Color"],["パターン色","Pattern Color"],["終了色","End Color"],["背景","Background"],["パターン","Pattern"],["透明背景を使用する","Use Transparent Background"],
      ["テキスト","Text"],["フォント","Font"],["サイズ","Size"],["文字色","Text Color"],["スウォッチ","Swatches"],["文字","Text"],["アウトライン","Outline"],["アウトライン色","Outline Color"],["アウトライン幅","Outline Width"],["文字方向","Writing direction"],["自動調整","Auto Fit"],["文字スタイル","Character style"],["太字","Bold"],["斜体","Italic"],["下線","Underline"],["取り消し線","Strike"],["文字レイアウト","Text Layout"],
      ["横倍率 (%)","Horizontal Scale (%)"],["縦倍率 (%)","Vertical Scale (%)"],["サイズ (%)","Size (%)"],["幅","Width"],["高さ","Height"],["カラーモード","Color Mode"],["元の色","Original"],["塗り","Fill"],["塗り色","Fill Color"],["キャンバスハンドル：移動 / サイズ変更 / 回転","Canvas handles: move / resize / rotate"],
      ["プリセット","Preset"],["しっぽ","Tail"],["なし","None"],["左上","Top Left"],["右上","Top Right"],["左下","Bottom Left"],["右下","Bottom Right"],["左","Left"],["右","Right"],["線","Stroke"],["線幅","Stroke Width"],["線のスタイル","Outline Style"],["実線","Solid"],["二重線","Double"],["形状の強さ","Shape Intensity"],["丸み","Roundness"],["突起数","Spike Count"],["谷の形","Valley Style"],["鋭角 / 直線","Sharp / Straight"],["内側へ湾曲","Curved Inward"],["谷の深さ","Valley Concavity"],["丸い山の数","Lobe Count"],["丸い山の深さ","Lobe Depth"],["柔らかさ","Softness"],["非対称","Asymmetry"],
      ["ランダム化","Randomize Shape"],["パス編集","Edit Path"],["＋ 点","＋ Point"],["− 点","− Point"],["キャンバスに合わせる","Fit"],["最前面","Top"],["枠色","Border Color"],["内側線の色","Inner Outline Color"],["枠","Border"],["左 / 右の幅","Left / Right Width"],["上 / 下の幅","Top / Bottom Width"],["内側線の幅","Inner Outline Width"],["フレーム倍率 (%)","Frame Scale (%)"],["内側余白 (px)","Inset (px)"],["付属装飾","Attached"],["重ね方","Overlay Fit"],["覆う","Cover"],["収める","Contain"],["引き伸ばす","Stretch"],["タイル","Tile"],["リセット","Reset"],["削除","Delete"],["エフェクト","Effects"],
      ["プリセット","Preset"],["線の色","Line Color"],["線色スウォッチ","Line Color Swatches"],["線の本数","Line Count"],["中央の空き","Center Gap"],["中央の空き X","Center Gap X"],["中央の空き Y","Center Gap Y"],["基本線幅","Base Line Width"],["線の長さ","Line Length"],["先細り","Taper"],["ランダム","Random"],["長さのランダム","Length Random"],["中心のランダム","Center Random"],["幅のランダム","Width Random"],["間隔のランダム","Spacing Random"],["シード","Seed"],["新しいシード","New Seed"],["中心位置の詳細","Precise Center Position"],["中心 X","Center X"],["中心 Y","Center Y"],["中心をリセット","Reset Center"],
      ["中央","Center"],["広い","Wide"],["縦長","Tall"],["片側","One Side"],["変形","Transform"],["正確な値・ホイール：調整・Shift：10倍","Precise values · Wheel: adjust · Shift: 10×"],["回転 (度)","Rotation (degrees)"],["ドロップシャドウを有効化","Enable Drop Shadow"],["影の色","Shadow Color"],["影色スウォッチ","Shadow Color Swatches"],["方向","Direction"],["影 X","Shadow X"],["影 Y","Shadow Y"],["影のぼかし","Shadow Blur"],["外側光彩を有効化","Enable Outer Glow"],["光彩色","Glow Color"],["光彩色スウォッチ","Glow Color Swatches"],["光彩の不透明度","Glow Opacity"],["光彩のぼかし","Glow Blur"],["光彩の広がり","Glow Spread"],["アンカーと制御点をドラッグします。点の追加・削除もできます。","Drag anchors/controls. Add or remove points."],["クリーニング済みフレームのアルファを使用します。","Uses cleaned frame alpha."],["通常の位置調整は黄色の中心ハンドルをドラッグします。","Drag the yellow center handle for normal positioning."],
      ["レイヤー","Layers"],["＋ 画像","＋ Image"],["外部表示","External"],["グループ化","Group"],["グループ解除","Ungroup"],["Ctrl：個別選択／Shift：範囲選択","Ctrl: individual selection / Shift: range selection"],["フォント一覧","Fonts"],["★ お気に入り","★ Favorites"],["最近使用","Recent"],["その他","Other"],["すべて","All"],["☆をクリックしてお気に入り登録／★で解除","Click ☆ to add a favorite / ★ to remove it"],
      ["コピー","Copy"],["貼り付け","Paste"],["複製","Duplicate"],["元画像を表示","Show Original Image"],["背景画像を置き換えますか？","Replace the background image?"],["現在の画像には未保存の変更があります。","The current image has unsaved changes."],["キャンセル","Cancel"],["保存せず差し替え","Discard & Replace"],["レイアウト保存して差し替え","Save Layout & Replace"],["この画像の保存済みレイアウトがあります","A saved layout exists for this image"],["画像側のレイアウトを、この単体編集へコピーして復元しますか？","Copy the image layout into this Single Image workspace?"],["新規レイアウト","New Layout"],["復元する","Restore"],["前回の単体編集があります","A previous Single Image edit exists"],["前回の背景画像と編集状態を再開しますか？","Resume the previous background image and edit state?"],["新規で開く","Start New"],["前回の単体編集を再開","Resume Previous Edit"]
    ];
    const FORGE_TITLE_TRANSLATIONS=[
      ["最後の編集を元に戻します (Ctrl+Z)","Undo the last edit (Ctrl+Z)"],["元に戻した編集をやり直します (Ctrl+Y / Ctrl+Shift+Z)","Redo the last undone edit (Ctrl+Y / Ctrl+Shift+Z)"],["画像全体を編集画面に表示します (Ctrl+0)","Fit the image to the editor window (Ctrl+0)"],["縮小","Zoom out"],["拡大","Zoom in"],
      ["未保存の変更を破棄して、最後に保存したプロジェクト状態へ戻します。","Discard unsaved changes and restore the last saved Project state."],["元画像を上書きせず、新しい合成画像として保存します。","Render and save a new composite image without overwriting the source image."],
      ["吹き出し一覧を開きます","Open the full speech bubble and shape library"],["文字を追加します (T)","Add Text (T)"],["オノマトペ・SFX一覧を開きます","Open the onomatopoeia and SFX library"],["コミックスタンプ・シンボル一覧を開きます","Open the comic stamp and symbol library"],["集中線一覧を開きます","Open the emphasis lines library"],["フレーム一覧を開きます","Open the frame library"],
      ["ドラッグで幅を変更。ダブルクリックで標準幅に戻します。","Drag to resize. Double-click to reset."],["吹き出し一覧を閉じます","Close the shape library"],["SFX・スタンプ一覧を閉じます","Close the SFX or stamp library"],["フレーム一覧を閉じます","Close the frame library"],["集中線一覧を閉じます","Close the emphasis lines library"],
      ["ユーザー吹き出しプリセットをJSONから読み込みます","Import user shape presets from JSON"],["ユーザー吹き出しプリセットをJSONへ書き出します","Export user shape presets as JSON"],["ローカル画像を背景として読み込みます","Load a local image as the background"],["フォント一覧を開きます","Open the font browser"],
      ["スウォッチを文字色へ適用します","Apply swatches to the text color"],["スウォッチを文字のアウトライン色へ適用します","Apply swatches to the text outline color"],["横書きにします","Write text horizontally"],["縦書きにします","Write text vertically"],["文字枠を現在の文字に合わせます","Fit the text box to the current text"],["太字を切り替えます","Toggle bold text"],["斜体を切り替えます","Toggle italic text"],["下線を切り替えます","Toggle underline"],["取り消し線を切り替えます","Toggle strikethrough"],
      ["スウォッチを素材の塗り色へ適用します","Apply swatches to the asset fill color"],["スウォッチを素材のアウトライン色へ適用します","Apply swatches to the asset outline or border color"],["スウォッチを吹き出しの塗り色へ適用します","Apply swatches to the bubble fill color"],["スウォッチを吹き出しのアウトライン色へ適用します","Apply swatches to the bubble outline color"],["選択形状の別バリエーションを生成します","Generate a new variation of the selected shape"],
      ["パス直接編集を開始または終了します","Start or finish direct path editing"],["選択パスへ点を追加します","Add a point to the selected path"],["選択中のパス点を削除します","Delete the selected path point"],["フレームをキャンバスに合わせます","Fit frame to canvas"],["フレームを他のレイヤーより前面に保ちます","Keep frame above other layers"],["スウォッチをフレーム枠色へ適用します","Apply swatches to the frame border color"],["スウォッチをフレーム内側線へ適用します","Apply swatches to the frame inner outline color"],["選択フレームの設定をリセットします","Reset the selected frame settings"],["選択フレームを削除します","Delete the selected frame"],
      ["中央の空きX・Yを比率維持でまとめて変更します","Scale Center Gap X and Y together while preserving their ratio"],["中央の空き全体の大きさ","Overall center gap size"],["新しいランダム線パターンを生成します","Generate a new random line pattern"],["集中位置をキャンバス中央へ戻します","Reset the focus position to the canvas center"],
      ["影の方向：左上","Set shadow direction: upper left"],["影の方向：上","Set shadow direction: up"],["影の方向：右上","Set shadow direction: upper right"],["影の方向：左","Set shadow direction: left"],["影の方向オフセットを無効化","Disable directional shadow offset"],["影の方向：右","Set shadow direction: right"],["影の方向：左下","Set shadow direction: lower left"],["影の方向：下","Set shadow direction: down"],["影の方向：右下","Set shadow direction: lower right"],
      ["画像レイヤーを追加します","Add an image layer"],["プロパティとレイヤーを外部ツールウィンドウで開きます","Open Properties and Layers in a native tool window"],["選択レイヤーをグループ化します (Ctrl+G)","Group selected layers (Ctrl+G)"],["選択グループを解除します (Ctrl+Shift+G)","Ungroup selected layers (Ctrl+Shift+G)"],["Altクリックでグループ内を選択、Altドラッグで個別移動します。","Alt-click selects inside a group. Alt-drag moves independently."],["表示 / 非表示","Show / Hide"],["ロック / ロック解除","Lock / Unlock"],["レイヤー操作","Layer options"]
    ];
    function localizedPairValue(value,pairs){const text=String(value||"").trim(),pair=pairs.find(entry=>entry.includes(text));return pair?uiText(pair[0],pair[1]):value;}
    function localizeStaticText(root=document){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){const parent=node.parentElement;if(!parent||parent.closest(".palette,.layers,.font-list"))continue;const raw=node.nodeValue,trimmed=raw.trim();if(!trimmed)continue;const translated=localizedPairValue(trimmed,FORGE_UI_TRANSLATIONS);if(translated!==trimmed)node.nodeValue=raw.replace(trimmed,translated);}}
    function applyAccessibleTooltips(){document.querySelectorAll("[title]").forEach(node=>{const translated=localizedPairValue(node.title,FORGE_TITLE_TRANSLATIONS);if(translated!==node.title)node.title=translated;});document.querySelectorAll("button,[role='button']").forEach(node=>{const label=String(node.getAttribute("aria-label")||node.textContent||"").replace(/\s+/g," ").trim();if(!node.title&&label)node.title=label;if(!node.getAttribute("aria-label")&&label)node.setAttribute("aria-label",label);});document.querySelectorAll("input:not([type='hidden']),select,textarea").forEach(node=>{const label=node.closest("label"),labelText=label?[...label.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent.trim()).filter(Boolean).join(" "):"";const hint=labelText||node.placeholder||node.name||node.id;if(!node.title&&hint)node.title=hint;if(!node.getAttribute("aria-label")&&hint)node.setAttribute("aria-label",hint);});}
    function applyForgeProjectLanguage(){
      document.querySelector("header > strong").textContent="Comic Panel Editor";
      const labels={
        undo:uiText("元に戻す","Undo"),redo:uiText("やり直す","Redo"),fit:uiText("全体表示","Fit"),
        discardChanges:uiText("変更を破棄","Discard Changes"),saveLayout:uiText("レイアウト保存","Save Layout"),
        exportImage:uiText("画像を書き出す","Export Image"),
      };
      for(const [id,label] of Object.entries(labels)){const node=document.getElementById(id);if(node)node.textContent=label;}
      const staticLabels={
        "[data-left-section='quick-retouch'] > summary":["簡易レタッチ","Quick Retouch"],
        "[data-left-section='comic-converter'] > summary":["白黒変換","Black & White Conversion"],
        "[data-left-section='background-removal'] > summary":["背景削除","Background Removal"],
        "[data-left-section='bubbles'] > summary":["吹き出し","Speech Bubbles"],
        "[data-left-section='sfx'] > summary":["オノマトペ / SFX","Onomatopoeia / SFX"],
        "[data-left-section='stamps'] > summary":["コミックスタンプ / シンボル","Comic Stamps / Symbols"],
        "[data-left-section='frames'] > summary":["フレーム","Frames"],
        "[data-left-section='emphasis'] > summary":["集中線","Emphasis Lines"],
      };
      for(const [selector,pair] of Object.entries(staticLabels)){const node=document.querySelector(selector);if(node)node.textContent=uiText(...pair);}
      const actionLabels={
        "[data-quick-retouch-open]":["簡易レタッチを開く","Open Quick Retouch"],
        "[data-comic-converter-open]":["白黒変換を開く","Open Black & White Conversion"],
        "[data-background-removal-open]":["背景削除を開く","Open Background Removal"],
        "#openShapeDrawer":["吹き出しを開く…","Browse Bubbles…"],
        "#addText":["＋ 文字を追加","＋ Add Text"],
        "#openSfxDrawer":["SFXを開く…","Browse SFX…"],
        "#openStampDrawer":["スタンプを開く…","Browse Stamps…"],
        "#openFrameDrawer":["フレームを開く…","Browse Frames…"],
        "#openEmphasisDrawer":["集中線を開く…","Browse Focus Lines…"],
      };
      for(const [selector,pair] of Object.entries(actionLabels)){const node=document.querySelector(selector);if(node)node.textContent=uiText(...pair);}
      const empty=document.getElementById("emptyCanvasCard");
      if(empty){
        empty.querySelector("strong").textContent=uiText("画像をここにドロップ","Drop an image here");
        document.getElementById("chooseBackgroundImage").textContent=uiText("画像ファイルを選択","Choose Image File");
      }
      document.querySelector(".footer").textContent=uiText("ホイール：拡大縮小　中ボタンまたはSpace＋ドラッグ：パン　ドラッグ：移動　8ハンドル：サイズ変更　通常：縦横比固定　Shift＋角：自由変形　緑ハンドル：回転","Wheel: zoom　Middle mouse or Space + drag: pan　Drag: move　8 handles: resize　Standard: lock ratio　Shift + corner: free transform　Green handle: rotate");
      document.querySelectorAll(".drawer-resizer").forEach(node=>node.title=uiText("ドラッグで幅を変更。ダブルクリックで標準幅に戻します。","Drag to resize. Double-click to reset."));
      const settingsButton=document.getElementById("openEditorSettings");
      if(settingsButton)settingsButton.title=uiText("Forge Neo本体のComic Panel Editor設定を開きます","Open Comic Panel Editor settings in Forge Neo");
      const writingButtons=document.querySelectorAll("#writingModes button");
      if(writingButtons[0])writingButtons[0].textContent=uiText("横書き","Horizontal");
      if(writingButtons[1])writingButtons[1].textContent=uiText("縦書き","Vertical");
      const emphasisTitle=document.querySelector("#emphasisDrawer .drawer-head strong");
      if(emphasisTitle)emphasisTitle.textContent=`${uiText("集中線","Emphasis Lines")} (${EMPHASIS_PRESETS.length})`;
      const fontSearch=document.getElementById("fontSearch");
      if(fontSearch)fontSearch.placeholder=uiText("フォント名・スタイルを検索…","Search font family or style…");
      const textArea=document.querySelector('#textProps textarea[data-key="text"]');
      if(textArea)textArea.placeholder=uiText("セリフを入力…","Enter dialogue…");
      const layerMenuLabels={copyLayer:uiText("コピー　Ctrl+C","Copy　Ctrl+C"),pasteLayer:uiText("貼り付け　Ctrl+V","Paste　Ctrl+V"),duplicateLayer:uiText("複製","Duplicate"),processLayerQuickRetouch:uiText("この画像を簡易レタッチ","Quick Retouch this image"),processLayerBackgroundRemoval:uiText("この画像を背景削除","Remove background from this image"),processLayerComicConversion:uiText("この画像を白黒変換","Convert this image to Black & White"),deleteLayer:uiText("削除","Delete")};
      for(const [id,label] of Object.entries(layerMenuLabels)){const node=document.getElementById(id);if(node)node.textContent=label;}
      localizeStaticText();
      initializePresetUI();
      renderSfxDrawer();
      refreshQuickSfx();refreshQuickFrames();refreshQuickEmphasisLines();
      applyAccessibleTooltips();
      projectImageTray?.refreshLanguage?.();
    }
    function applyForgeProjectSettings(settings=window.SpeechBubbleForgeProjectSettings?.get?.()||{}){
      showEmptyCanvasGuide=settings.show_empty_guide===true;
      projectImageTray?.applySettings?.({
        mode:settings.shared_project_images===false?"separate":"shared",
        forge_import:settings.forge_import_behavior==="tray_only"?"tray_only":"place",
      },false);
      applyForgeProjectLanguage();
      updateActionState();
    }
    function initializeForgeProjectSettings(){
      if(!isForgeProjectHost||forgeProjectSettingsController||!window.SpeechBubbleForgeProjectSettings)return forgeProjectSettingsController;
      forgeProjectSettingsController=window.SpeechBubbleForgeProjectSettings.create({
        openHostSettings:()=>postHost("speech_bubble_project:open_settings"),
        onChange:applyForgeProjectSettings,
      });
      applyForgeProjectSettings();
      return forgeProjectSettingsController;
    }
    async function importForgeProjectSingleImage(file,asset,control={}){
      if(!(file instanceof Blob)||!asset?.id)return false;
      const existing=state.elements.find(item=>item.type==="image"&&item.image_asset_id===asset.id);
      if(existing){setSelection([existing.id],existing.id);syncProperties();requestRender({canvas:true,layers:true});return asset.id;}
      if(!state.elements.some(item=>item.type==="image")){
        scaleStateToImageSize(Math.max(1,Number(asset.width)||1024),Math.max(1,Number(asset.height)||1024));
      }
      const layer=await addSingleImageLayerFromBlob(file,asset.name||"Forge image",{role:"forge-gallery",assetId:String(asset.id),locked:false});
      if(control.point&&Number.isFinite(control.point.x)&&Number.isFinite(control.point.y)){
        layer.x=control.point.x-layer.w/2;
        layer.y=control.point.y-layer.h/2;
        captureActiveWorkspace();
      }
      layoutDirty=true;
      notifyForgeProjectChanged();
      fitView(false);
      requestRender({canvas:true,layers:true});
      return String(asset.id);
    }
    function projectTreeImageCount(tree,assetId){
      if(!tree||typeof tree!=="object")return 0;
      if(tree.kind!=="split")return tree.image_id===assetId?1:0;
      return projectTreeImageCount(tree.first,assetId)+projectTreeImageCount(tree.second,assetId);
    }
    function projectImageUsage(assetId){
      const id=String(assetId||"");
      return{
        single:(workspaces.single.elements||[]).filter(item=>item?.type==="image"&&String(item.image_asset_id||"")===id).length,
        comic:projectTreeImageCount(comicEditor?.serialize?.()?.tree,id),
        comic_layout:projectTreeImageCount(generalComicEditor?.serialize?.()?.tree,id),
      };
    }
    async function removeForgeProjectImageUsage(assetId){
      const usage=projectImageUsage(assetId);
      if(!usage.single&&!usage.comic&&!usage.comic_layout)return false;
      pushUndo();
      const singleElements=(workspaces.single.elements||[]).filter(item=>!(item?.type==="image"&&String(item.image_asset_id||"")===String(assetId)));
      workspaces.single.elements=singleElements;
      if(activeWorkspace==="single"){
        state.elements=singleElements;
        setSelection([],null);
      }
      comicEditor?.removeAssetUsage?.(assetId,{recordUndo:false});
      generalComicEditor?.removeAssetUsage?.(assetId,{recordUndo:false});
      captureActiveWorkspace();
      layoutDirty=true;
      syncProperties();
      requestRender({canvas:true,layers:true,preview:true});
      updateActionState();
      notifyForgeProjectChanged();
      return true;
    }
    async function placeForgeProjectAsset(asset,blob,control={}){
      if(!(blob instanceof Blob)||!asset?.id)return false;
      projectImageTray?.register(asset,{notify:false});
      const file=new File([blob],asset.name||"forge-image",{type:asset.mime||blob.type||"image/png",lastModified:Date.now()});
      if(generalComicEditor?.isActive()){
        if(!control.point&&!generalComicEditor.selectedPanel?.()){
          const fallback=generalComicEditor.defaultPanelInsertionTarget?.();
          if(fallback?.panelId)generalComicEditor.selectPanel?.(fallback.panelId);
        }
        return generalComicEditor.importExternalImage(file,asset,{assignToSelectedPanel:true,point:control.point});
      }
      if(comicEditor?.isActive()){
        if(!control.point&&!comicEditor.selectedPanel?.()){
          const fallback=comicEditor.defaultPanelInsertionTarget?.();
          if(fallback?.panelId)comicEditor.selectPanel?.(fallback.panelId);
        }
        return comicEditor.importExternalImage(file,asset,{assignToSelectedPanel:true,point:control.point});
      }
      return importForgeProjectSingleImage(file,asset,control);
    }
    function collectForgeProjectImageIds(){
      const ids=new Set();
      for(const item of workspaces.single.elements||[])if(item?.type==="image"&&item.image_asset_id)ids.add(String(item.image_asset_id));
      const collectTree=node=>{if(!node||typeof node!=="object")return;if(node.kind!=="split"){if(node.image_id)ids.add(String(node.image_id));return;}collectTree(node.first);collectTree(node.second);};
      collectTree(comicEditor?.serialize?.()?.tree);
      collectTree(generalComicEditor?.serialize?.()?.tree);
      return [...ids];
    }
    function markProjectImageTrayChanged(){
      layoutDirty=true;
      updateActionState();
      notifyForgeProjectChanged();
    }
    function initializeProjectImageTray(){
      if(!isForgeProjectHost||projectImageTray||!window.SpeechBubbleProjectImageTray)return projectImageTray;
      projectImageTray=window.SpeechBubbleProjectImageTray.create({
        document,
        host:document.querySelector(".canvas-panel"),
        workspace:()=>activeWorkspace,
        english:uiEnglish,
        usage:projectImageUsage,
        removeUsage:removeForgeProjectImageUsage,
        addFile:file=>forgeProjectImageStore.put({name:file.name||"project-image",source:"local-file"},file),
        getBlob:imageId=>forgeProjectImageStore.get(imageId),
        imageUrl:imageId=>forgeProjectApiClient.imageUrl(forgeProjectId,imageId),
        place:placeForgeProjectAsset,
        changed:markProjectImageTrayChanged,
        setStatus:setSaveState,
      });
      return projectImageTray;
    }
    async function restoreForgeProjectLayout(layout,projectAssets={}){
      dirtyTrackingEnabled=false;
      clearSingleImageAssets();
      sourceBlob=null;imageUrl="";imageHash="";imageLoaded=false;
      const normalized=projectSchema.normalize(layout||{});
      const assetById=new Map((projectAssets.images||[]).map(asset=>[String(asset.id),asset]));
      projectImageTray?.restore(projectAssets.images||[],projectAssets.imageTrays);
      const singleIds=new Set((normalized.workspaces?.single?.elements||[]).filter(item=>item?.type==="image").map(item=>String(item.image_asset_id||"")).filter(Boolean));
      for(const assetId of singleIds){
        const asset=assetById.get(assetId);
        if(!asset)continue;
        const blob=await projectAssets.imageBlob(assetId);
        await registerSingleImageAsset(blob,asset.name||"Project image",assetId);
      }
      loadState(JSON.stringify(normalized),{strict:true});
      projectImageTray?.setWorkspace(activeWorkspace);
      state.undo=[];state.redo=[];
      lastSavedLayout=currentLayoutJson();
      hasExplicitSavedLayout=true;layoutDirty=false;dirtyTrackingEnabled=true;
      restoreWorkspaceView(workspaces[activeWorkspace],false);
      syncProperties();requestRender({canvas:true,layers:true,preview:false});updateActionState();
    }
    function markForgeProjectSaved(){
      lastSavedLayout=currentLayoutJson();
      hasExplicitSavedLayout=true;layoutDirty=false;
      updateActionState();
    }
    async function initializeForgeProjectAdapter(){
      forgeProjectAdapter=window.SpeechBubbleForgeProjectAdapter.create({
        projectId:forgeProjectId,
        apiBase:forgeApiBase,
        runtime:{
          serializeLayout:async()=>JSON.parse(currentLayoutJson()),
          restoreLayout:restoreForgeProjectLayout,
          importProjectImage:async({asset,blob,assignToSelectedPanel})=>{
            projectImageTray?.register(asset,{notify:false});
            if(!assignToSelectedPanel)return String(asset.id);
            return placeForgeProjectAsset(asset,blob);
          },
          referencedImageIds:collectForgeProjectImageIds,
          imageTrayIds:()=>projectImageTray?.imageIds?.()||[],
          getImageTrayState:()=>projectImageTray?.serialize?.()||null,
          forgeImportBehavior:()=>projectImageTray?.importBehavior?.()||"place",
          getEditorSettings:()=>window.SpeechBubbleForgeProjectSettings?.get?.()||{},
          applyHostSettings:applyForgeProjectSettings,
          setStatus:setSaveState,
          getProjectTitle:()=>forgeProjectTitle,
          setProjectTitle:title=>{forgeProjectTitle=String(title||"Untitled Comic Project");document.title=`${forgeProjectTitle} — Comic Panel Editor`;},
          markSaved:markForgeProjectSaved,
          onChanged:callback=>window.addEventListener("speech-bubble:document-changed",callback),
        },
      });
      await forgeProjectAdapter.initialize();
    }
    async function initializeEditor(){
      const initialTheme=params.get("theme");
      document.documentElement.dataset.theme=initialTheme==="light"?"light":initialTheme==="dark"?"dark":(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");
      initializeModeController();
      initializeComicEditor();
      initializeGeneralComicEditor();
      registerEditorModes();
      initializeProjectImageTray();
      initializeForgeProjectSettings();
      initializeComicConverter();
      initializeBackgroundRemoval();
      initializeQuickRetouch();
      initializePresetUI();initializeSfxSwatches();initializeCompactColorSwatches();initializeCanvasBackgroundSwatches();refreshQuickSfx();refreshQuickFrames();refreshQuickEmphasisLines();initializeDrawerResize();initializeAccordionState();initializeLeftSectionState();initializeRightDockFloating();initializeFontBrowserDrag();enhanceNumericInputs();initializeUserAssetBroadcast();loadUserPresets();
      applyForgeProjectLanguage();
      window.addEventListener("speech-bubble:language-change",applyForgeProjectLanguage);
      loadState("{}");lastSavedLayout=currentLayoutJson();hasExplicitSavedLayout=false;layoutDirty=false;imageLoaded=false;updateActionState();firstPaint();
      if(isForgeProjectHost){
        try{await initializeForgeProjectAdapter();}
        catch(error){console.error("Speech Bubble Forge Project initialization failed",error);setSaveState(error?.message||"Projectを読み込めませんでした。","error");}
        return;
      }
      if(isPaletteWindow&&hostMode==="desktop"){await window.pywebview?.api?.palette_ready?.();return;}
      deferEditorTask(()=>{pruneDraftCache();pruneDocumentBackgrounds();});
      let startupResult="new";
      const isDesktop=["desktop","desktop-file"].includes(hostMode);
      if(hostMode==="desktop"&&!imageUrl){
        try{
          const recovery=await window.SpeechBubbleDesktopShell?.loadRecovery?.();
          if(recovery?.layout){
            let choice=startupBehavior;
            if(choice==="ask")choice=await showStandaloneResumeChoice();
            if(choice==="resume"){
              await window.SpeechBubbleDesktopEditor.loadRecovery(recovery);startupResult="resume";
              const fallback=Number(recovery.fallback_generation)||0;
              setSaveState(fallback?uiText(`${fallback}世代前の下書きを復元しました`, `Restored a draft from ${fallback} generation(s) earlier`):uiText("前回の編集を復元しました","Restored the previous edit"),fallback?"error":"saved");
            }
          }
        }catch(error){console.error("Speech Bubble desktop recovery load failed",error);setSaveState(uiText("復元キャッシュを読み込めませんでした。新規で開始します","Could not load recovery data. Starting a new edit"),"error");}
      }
      if(startupResult==="resume"){
        startDeferredResources();
      }else if(imageUrl){
        try{await loadRemoteImage(imageUrl,{name:sourceName,tab:sourceTab});}
        catch(error){console.error("Speech Bubble initial image load failed",error);imageLoaded=false;updateActionState();setSaveState(error?.message||"背景画像を読み込めませんでした","error");}
      }else if(documentMode==="standalone"){
        // Desktop recovery is authoritative. Do not immediately reopen the
        // legacy browser/localStorage resume prompt after the user chose New.
        startupResult=await startStandaloneDocument(standaloneId,{offerResume:!isDesktop,behavior:isDesktop?"new":"ask"});
      }
      if(["desktop","desktop-file"].includes(hostMode)&&startupResult!=="resume"&&(params.get("comic")==="1"||directFileMode)&&!comicEditor?.isActive())await modeController?.setMode("comic");
    }
    window.addEventListener("speech-bubble:language-change",()=>{refreshLayers();syncProperties();renderFontBrowser();comicEditor?.refreshLanguage?.();generalComicEditor?.refreshLanguage?.();modeController?.sync?.();updateActionState();applyAccessibleTooltips();});
    initializeEditor();
