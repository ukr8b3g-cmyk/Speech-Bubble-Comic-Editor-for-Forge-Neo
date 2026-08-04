(function (root) {
  "use strict";

  const PANELS = ["shapeDrawer", "sfxDrawer", "frameDrawer", "emphasisDrawer"];
  const TABS = [
    ["bubbles", "吹き出し", "Bubbles"],
    ["text", "文字", "Text"],
    ["sfx", "SFX", "SFX"],
    ["stamps", "スタンプ", "Stamps"],
    ["frames", "フレーム", "Frames"],
    ["emphasis", "集中線", "Focus Lines"],
    ["presets", "マイプリセット", "My Presets"],
  ];

  function initialize(options = {}) {
    const document = options.document || root.document;
    if (document.documentElement.dataset.commonAssetDrawer === "ready") return;
    document.documentElement.dataset.commonAssetDrawer = "ready";
    const english = () => options.english?.() ?? document.documentElement.lang === "en";
    const panelNodes = PANELS.map((id) => document.getElementById(id)).filter(Boolean);
    const left = document.querySelector(".left");
    let launcher = document.querySelector("[data-common-asset-launcher]");
    if (left && !launcher) {
      launcher = document.createElement("section");
      launcher.className = "common-asset-launcher";
      launcher.dataset.commonAssetLauncher = "";
      launcher.innerHTML = '<div class="section-title" data-common-asset-title></div><nav class="common-asset-tabs"></nav>';
      const processing = left.querySelector('[data-left-section="background-removal"]');
      processing?.after(launcher);
      if (!processing) left.prepend(launcher);
      left.classList.add("common-assets-ready");
    }

    function currentTab(panel) {
      if (panel.id === "shapeDrawer") return "bubbles";
      if (panel.id === "frameDrawer") return "frames";
      if (panel.id === "emphasisDrawer") return "emphasis";
      return /stamp|スタンプ/i.test(document.getElementById("sfxDrawerTitle")?.textContent || "")
        ? "stamps"
        : "sfx";
    }

    function activate(tab) {
      if (tab === "text") {
        document.getElementById("addText")?.click();
        panelNodes.forEach((panel) => panel.classList.remove("open"));
        return;
      }
      if (tab === "bubbles" || tab === "presets") {
        document.getElementById("openShapeDrawer")?.click();
        if (tab === "presets") {
          const category = document.getElementById("shapeCategory");
          if (category) {
            category.value = "user";
            category.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      } else if (tab === "sfx") document.getElementById("openSfxDrawer")?.click();
      else if (tab === "stamps") document.getElementById("openStampDrawer")?.click();
      else if (tab === "frames") document.getElementById("openFrameDrawer")?.click();
      else if (tab === "emphasis") document.getElementById("openEmphasisDrawer")?.click();
      sync();
    }

    function renderTabs(panel) {
      let navigation = panel.querySelector("[data-common-asset-tabs]");
      if (!navigation) {
        navigation = document.createElement("nav");
        navigation.className = "common-asset-tabs";
        navigation.dataset.commonAssetTabs = "";
        navigation.addEventListener("click", (event) => {
          const tab = event.target.closest("[data-common-asset-tab]")?.dataset.commonAssetTab;
          if (tab) activate(tab);
        });
        panel.querySelector(".drawer-head")?.after(navigation);
      }
      const active = currentTab(panel);
      navigation.replaceChildren(...TABS.map(([id, ja, en]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.commonAssetTab = id;
        button.textContent = english() ? en : ja;
        button.classList.toggle("active", panel.classList.contains("open") && id === active);
        return button;
      }));
    }

    function renderLauncher() {
      if (!launcher) return;
      launcher.querySelector("[data-common-asset-title]").textContent = english() ? "Assets" : "素材";
      const navigation = launcher.querySelector("nav");
      navigation.replaceChildren(...TABS.map(([id, ja, en]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.commonAssetTab = id;
        button.textContent = english() ? en : ja;
        button.addEventListener("click", () => activate(id));
        return button;
      }));
    }

    function sync() {
      renderLauncher();
      panelNodes.forEach(renderTabs);
    }

    const observer = new MutationObserver(sync);
    panelNodes.forEach((panel) => observer.observe(panel, { attributes: true, attributeFilter: ["class"] }));
    const sfxTitle = document.getElementById("sfxDrawerTitle");
    if (sfxTitle) observer.observe(sfxTitle, { childList: true, characterData: true, subtree: true });
    root.addEventListener("speech-bubble:language-change", sync);
    sync();
    return Object.freeze({ sync, dispose: () => observer.disconnect() });
  }

  root.SpeechBubbleCommonAssetDrawer = Object.freeze({ initialize });
})(typeof globalThis !== "undefined" ? globalThis : this);
