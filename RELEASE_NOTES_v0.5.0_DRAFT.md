# Speech Bubble Editor v0.5.0

## Stable release

This is the stable public release of Speech Bubble Editor for WebUI ReForge / Forge Neo.

Verification status: Pending. Add the exact host version or commit only after actual testing on Windows 11 x64.

## Highlights

- Speech bubbles, text, SFX, comic stamps, frames, and emphasis lines
- Move, resize, rotate, group, lock, hide, Undo, and Redo
- Standalone local-image editor and per-image layouts
- Autosave drafts and User Presets
- PNG, JPEG, WebP, and transparent Overlay PNG export
- Local diagnostics
- No mandatory additional pip packages

## Install or update

Clone into the supported host's `extensions` directory, or update the existing clone, then restart the host and refresh the browser with `Ctrl+F5`.

```powershell
git clone https://github.com/ukr8b3g-cmyk/sd-webui-speech-bubble-forge-neo.git
```

## Uninstall

Close the host and delete the extension folder. To remove user data too, separately delete `config/speech-bubble-forge/` and clear this extension's site data in the browser.

## Known limitations

- A1111, ComfyUI, and other WebUIs are not supported unless explicitly listed.
- Exact ReForge / Forge Neo verification versions are pending.

## Privacy and network behavior

The extension runs locally and does not intentionally upload images, prompts, layouts, presets, diagnostics, or usage data to a developer-operated server.

## License and related project

MIT License. The editor and renderer originated in the author's related [Speech-Bubble-Layer](https://github.com/ukr8b3g-cmyk/Speech-Bubble-Layer) project. This repository is a standalone WebUI port and does not require ComfyUI.

Download from GitHub Releases after `v0.5.0` is published. Add artifact names and SHA-256 values at publication time.
