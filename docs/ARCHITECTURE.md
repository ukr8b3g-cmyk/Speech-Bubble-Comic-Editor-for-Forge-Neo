# Editor architecture and compatibility boundaries

## Current entry point

`javascript/speech_bubble_project_bridge.js` owns the Forge Neo launcher. It opens
`web/project-editor.html` with `host=forge-project`. That page loads the shared
project modules, the initial theme script, `project/editor-shell.css` at the
original inline-style position, and `project/editor-shell.js` at the original
inline-script position. The extracted script stays a classic script: globals,
lexical bindings, relative document URLs and execution order are preserved.
There is no new build system, bundler or mandatory dependency.

Project persistence uses `project_api.py`, `project_store.py` and
`project_schema.py`. `project:<uuid>` storage remains separate from legacy
`image:<hash>` / `standalone:<uuid>` layouts. Neither schema nor user-data location
changes in this cleanup. Shared source files listed as exact in `UPSTREAM_SYNC.json`
keep their recorded hashes; the extracted shell is explicitly Forge-adapted.

## Legacy compatibility (retained, not silently deleted)

- `web/speech-bubble-editor.html` keeps its historical URL.
- Its standalone comic assets are under `web/legacy/`; exact old asset URLs are
  served by fixed API aliases registered before the static mount. Query parameters
  cannot select an arbitrary server file.
- `javascript/speech_bubble_forge.js` retains the Settings/session/theme bridge,
  origin/source validation and legacy focus/reconnect protocol. The unreachable
  duplicate gallery/panel UI factories and their private layout helpers are removed.
- `renderer.py` remains the explicit Pillow-layout compatibility exporter, including
  old saved layouts and user asset IDs. It is not a replacement for the current
  browser Canvas export path.
- Shared frame/SFX discovery and decoded-asset caching are in `asset_catalog.py`.
  Catalog refresh updates shared dictionaries in place. The current API does not
  import the drawing implementation until Pillow export is requested.

Old HTML/API support and saved images/presets are intentional compatibility, not
code to delete merely because the current launcher does not open that page.

## Input and storage safety

`request_limits.py` reads bodies incrementally and checks both declared length and
actual chunks before growing its buffer. JSON roots must be objects. Invalid JSON,
negative lengths and non-finite JSON constants return 400; size excess returns 413.
The existing multipart MIME parser remains dependency-free.

Per-route byte budgets remain separate: diagnostics is 64 KiB, project JSON is
32 MiB, legacy layout/preset transport permits JSON-escaping overhead on the 8 MiB
layout-character budget, and image transport keeps its previous per-image limits.
User assets retain their 4 MiB image limit. Base64 decoding removes only CR/LF
explicitly permitted by the data-URL grammar, then validates the alphabet strictly.

Project creation writes `assets.json`, `images/` and `project.json` inside an owned
`.creating-*` sibling directory, then renames it into place. Ordinary write/publish
failures clean up that temporary directory and can be retried with the same ID.
Existing project directories are never deleted by this failure path. A process/OS
crash can leave a staging directory; the project list ignores these directories.
This does not claim cross-process transactions or power-loss/fsync durability.

## Scope deliberately unchanged

Three editor modes, crop geometry, image trays, Quick Retouch layer semantics,
model-download consent, export formats, user preset formats and existing stored
data remain unchanged. Splitting files reduces maintenance coupling; it is not a
claim of measured rendering acceleration. Forge Neo host/GPU behavior requires
separate real-host checks.
