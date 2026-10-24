# Third-Party Notices

## Related author-maintained project

The editor and renderer originated in [Speech-Bubble-Layer](https://github.com/ukr8b3g-cmyk/Speech-Bubble-Layer), a related project maintained by the same author.

This repository is an independent port and integration for WebUI ReForge / Forge Neo. It does not redistribute or require ComfyUI.

## Repository content

Unless otherwise stated, the source code, built-in speech bubbles, SFX assets, comic stamps, frames, icons, and related artwork in this repository are original works maintained by the repository owner. The repository audit found no bundled third-party library, font, icon set, or separately licensed image package.

## Optional AI background-removal model

The `isnet-anime` ONNX model is not bundled with this repository. The editor asks for confirmation when background removal is first used without the model, and downloads it only if the user explicitly approves the in-app download. The downloaded file is verified by expected size and SHA-256 before use. No rembg Python code is included or executed by this extension.

- Model project: [anime-segmentation](https://github.com/SkyTNT/anime-segmentation)
- Distribution source: [rembg releases](https://github.com/danielgatis/rembg/releases)
- Model license: Apache License 2.0
- Expected SHA-256: `f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99`

The downloaded model remains subject to its own license and terms.

## Runtime and platform components

WebUI ReForge / Forge Neo, Python, FastAPI, Gradio, NumPy, Pillow, browser APIs, system fonts, and other host-provided runtime components remain subject to their respective licenses and terms. They are not redistributed by this repository as separately bundled dependencies.

## Manga Finish

Derived from [MangaScreen](https://github.com/ashukae/ComfyUI-MangaScreen) and [Mangazin](https://github.com/arthur-cma/Mangazin), mangazin_core.py. Changes include tiled screen rendering, validated image input, preserved alpha and Forge integration. Ported from Speech-Bubble-Comic-Editor-App at commit `83109b21beb7af0926db8a9f02a7bb27eae3c87d`.

Manga Finish uses the host-provided OpenCV, NumPy and Pillow. No binary libraries are bundled or installed by this extension.

The license for the derived MangaScreen code follows.

MIT License

Copyright (c) 2026 ashukae

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
