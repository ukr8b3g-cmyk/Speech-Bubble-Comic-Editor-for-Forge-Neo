# Validation

## Reproduce

Use a clean checkout of this extension, not its parent Forge repository.
The test packages below are development-only; `requirements.txt` still installs
no additional mandatory runtime packages.
On Linux, install a Japanese CJK font before the renderer tests (Ubuntu: `sudo apt-get install fonts-noto-cjk`).
CI installs this test font; it does not replace the tests with missing-glyph assertions.

```sh
python -m pip install -r requirements-ci.txt
python tools/validate_repo.py
```

The gate compiles Python/JavaScript, checks local HTML asset references, runs pytest,
each `*_test.cjs`, exact upstream SHA-256 contracts, and `git diff --check`.
The default command explicitly reports browser tests as skipped.

To include the pre-existing optional Playwright harness, install Playwright in a
temporary test environment, install its Chromium browser, expose that environment's
`node_modules` through `NODE_PATH`, and run:

```sh
python tools/validate_repo.py --browser
```

With `--browser`, any `SKIP` is a failure. CI performs this setup automatically.
The current-project browser smoke uses a temporary project store and the real
FastAPI routes through a test-only HTTP adapter. It covers current shell startup,
three-mode switching, image import, crop entry/cancel, save and reload. Existing
legacy-editor and Quick Retouch smokes also run. The test server never targets an
installed Forge data directory and does not download an AI model.

## Baseline and audit coverage

Audited base: `364b8426d316c6282dde620404ef24249a4db409` (0.7.10).
Before edits: 46 pytest tests and 22 Node core scripts passed in the working
container. Existing browser tests had previously been recorded as skipped.

New regressions cover declared/chunked body limits, malformed JSON roots,
API HTTP statuses, CR/LF Base64, failed project creation/retry, protection of
existing project data, live catalog cache references, lazy renderer import,
historical static aliases and the previously unreachable bubble decorations.
Test source readers follow the extracted shell; the existing behavioral assertions
are retained, except assertions for the intentionally removed unreachable UI rows.

CI artifacts contain `validation.json` and the project-browser screenshot.
Check the workflow run for the exact commit under review; a prior report is not
proof that the current revision passed.

## Windows Forge Neo host checks (not replaced by CI)

1. Launch from txt2img and img2img; ensure one current Editor window and Settings link.
2. Open an existing project and test Single Image, Four-Panel Manga and Comic Layout.
3. Exercise image crop, cancel/reset, Undo/Redo, portrait/landscape replacement,
   image trays, Japanese fonts and user SFX/stamps.
4. Save/reopen and export PNG/JPEG/WebP; compare displayed and exported geometry.
5. Test Quick Retouch and optional background-removal inference on the real host.
6. Open an old standalone-editor URL and an old saved image/standalone layout.

These are real-host/manual gates. CI does not verify the user's Windows instance,
Forge UI version, installed fonts, GPU or model runtime.
