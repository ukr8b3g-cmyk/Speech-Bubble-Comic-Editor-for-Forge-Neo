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

## Local persistence review fixes (2026-10-24, v1.0.1 working tree)

Base HEAD: `a6d63817e23737852960c1bdeb9eef358ebf04f2`. Existing uncommitted
Manga Finish changes were preserved. Before editing, 515 source files were
copied and SHA-256 verified under
`D:\Codex\_snapshots\Speech-Bubble-Comic-Editor-for-Forge-Neo\review-five-20261024-182159`.

The five reviewed conditions were present in the local code. Fixes:

- Save/import/cleanup are blocked until project restoration completes. Failed
  initialization disables editing and provides Retry Loading. Required single
  image assets are fetched and decoded before replacing the current scene.
- Folder export fetches both outputs before changing files. It materializes old
  file bytes and stores recovery copies before rotating backups or writing.
  Ordinary write failures restore both outputs and backup history. If rollback
  fails, the error names incomplete files and the retained recovery directory.
- Export URLs contain a server-derived ID for the allowed output root. Reads
  stay within that root after resolution. Ambiguous old URLs return 409 instead
  of silently selecting another root; unambiguous old URLs remain supported.
- Discard restores the last saved manifest, including images and tray state,
  before marking clean. It is blocked during an in-flight save. Tray changes
  participate in dirty comparisons even when the layout is unchanged.
- Missing registry entries/files are retained as image records with optional
  `missing` and `missing_reason` fields. Layout and tray references remain intact,
  load does not rewrite disk, and saves can preserve known missing IDs. Arbitrary
  unknown IDs are still rejected. Re-uploading the original image restores its
  registry/file without changing its content ID. Tray placeholders are labeled.

Regression coverage:

- `tests/project_load_failure_test.cjs`: initial save blocking, image 503,
  decode/schema failures, import/cleanup blocking, and successful retry.
- `tests/client_export_integrity_test.cjs`: 17 download, create/write/close,
  backup rotation and rollback cases, with backups on/off and new/existing files.
- `tests/test_review_persistence.py`: eight missing-registry/file cases across
  single/comic/comic-layout/tray-only references, plus actual export URL bytes
  from three roots with identical filenames and path-boundary rejection.
- `tests/project_persistence_browser_smoke.cjs`: real isolated API, shared and
  separate tray add/remove/discard, subsequent save payload, pending-save
  conflict, initial 503/decode/schema failures and retry, missing placeholders,
  and real browser File System Access writes/rollback in origin-private storage.

Evidence is in `artifacts/review-five-*.log`, `artifacts/review-five-changes.diff`
and `artifacts/review-five-browser.png`. Core validation: Python **148 passed**,
Node **29 suites passed**, browser **5 suites passed / 0 skipped**, JavaScript
syntax **32 files** and inline scripts **3 blocks passed**. The full gate
(`python tools/validate_repo.py --browser`) passed, including `git diff --check`;
see `artifacts/review-five-full-validation.log`.

Initial verification scope: repository changes only; installed-extension results
are recorded below. No commit/push/release was performed. Browser tests
use temporary project stores. They do not verify the native directory picker,
the real Forge/Gradio host, GPU generation, or crash/power-loss atomicity across
multiple files. This is ordinary-error rollback, not a multi-file atomic commit.

### Recheck and installation into both Forge hosts (2026-10-24)

A second complete review found that `exportImage()` cleared its error status in
`finally`, hiding the new rollback/recovery-directory message. This was fixed
and covered by a browser assertion that the message and recovery path remain
visible after the export action finishes. Failed removal of a new output now
names incomplete files without advertising a nonexistent recovery directory.
The extra VM case raises the export integrity suite from 16 to 17 cases.

Final full gate: Python **148 tests**, Node **29 suites**, browser **5 suites**,
JavaScript **32 files** and **3 inline blocks**, all passed. Evidence:
`artifacts/review-five-final-predeploy.log`.

Before this follow-up edit, 519 source files were snapshotted and verified under
`D:\Codex\_snapshots\Speech-Bubble-Comic-Editor-for-Forge-Neo\review-recheck-20261024-184710`.
Before installation, each host's 515 existing source files were snapshotted and
SHA-256 verified under
`D:\Codex\_snapshots\Speech-Bubble-Comic-Editor-for-Forge-Neo\review-five-deploy-20261024-185230`.

Both installed extensions received only the 13 reviewed code/test/documentation
files (9 updates and 4 new regression files). The other 506 source paths per host
were verified unchanged. Three pre-existing line-ending-only differences in
Forge Neo (`style.css`, `web/project/comic-editor.css`, and
`web/project/common-asset-drawer.js`) were preserved byte for byte. Existing
Manga Finish work, user data/settings/assets, and Git metadata were preserved.

Installed paths:

- `D:\StabilityMatrix\Data\Packages\Forge-Neo\extensions\Speech-Bubble-Comic-Editor-for-Forge-Neo`
- `D:\StabilityMatrix\Data\Packages\Forge-Neo2\extensions\Speech-Bubble-Comic-Editor-for-Forge-Neo`

Each installed extension passed **13 Python checks** using its own Forge Python
3.13.12, with module paths verified against the installed extension. These cover
existing schema/store tests, missing registry/file save/reload/recovery, and
export URL bytes across three same-name output roots. No packages were added.
Each also passed the persistence browser smoke using its own installed Python
and backend/static source files, with temporary project data and origin-private
file storage. These isolated services were stopped and their HTTP ports closed.

Deployment hashes and paths: `artifacts/review-five-runtime-deployment.json`.
Post-installation logs: `artifacts/review-five-Forge-Neo-installed-python.log`,
`artifacts/review-five-Forge-Neo2-installed-python.log`, and the corresponding
`-installed-browser.log` files. Test helpers are
`artifacts/deploy_review_fixes.py` and `artifacts/verify_review_runtime.py`.

The running Forge Neo process was left running. Neither host was restarted.
These results confirm files on disk and isolated execution of installed code;
the running Gradio integration, GPU, and native directory picker remain untested.
After saving work, restart each Forge host and reopen the editor to load the
updated backend and frontend together. No commit, push, or release was made.

## v1.1.0 publication candidate (2026-10-24)

Manga Finish and all five persistence fixes are included with explicit user authorization. The original working tree and both existing Release tags are preserved. Publication uses an isolated source copy based on `a6d63817e23737852960c1bdeb9eef358ebf04f2`; the 519 original source files were SHA-256 checked against the publication snapshot before copying.

The local combined-code gate passed 148 Python tests, 29 Node suites and five real browser suites before release version changes. The versioned candidate is checked again with `python tools/validate_repo.py --browser`. The release workflow additionally waits for all exact-commit Ubuntu, Windows and Chromium jobs to pass before creating a new tag and Release. ZIP construction uses 7-Zip, verifies every packaged source hash and emits SHA256SUMS.txt plus RELEASE_BUILD.json. Existing project data and running Forge instances are not used by these tests.

Historical local-only statements above record the earlier implementation/deployment stage; v1.1.0 is the publication stage. No Forge restart, live host screen or GPU inference acceptance is asserted here.
