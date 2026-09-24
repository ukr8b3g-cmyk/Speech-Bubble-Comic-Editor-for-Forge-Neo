"""Portable repository gate. Use --browser to require all Playwright smokes."""
from pathlib import Path
import argparse
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180, **kwargs)
    if result.stdout:
        print(result.stdout, end="")
    if result.returncode and result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    if result.returncode:
        raise RuntimeError(f"Failed: {args} (exit {result.returncode})")
    return result.stdout


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser", action="store_true", help="Require Playwright; missing browser tests must not silently pass")
    args = parser.parse_args()
    js_files = sorted([*(ROOT / "javascript").rglob("*.js"), *(ROOT / "web").rglob("*.js")])
    for path in js_files:
        run(["node", "--check", str(path)])
    inline_count = 0
    for html in sorted((ROOT / "web").glob("*.html")):
        source = html.read_text(encoding="utf-8")
        for match in re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>', source, flags=re.I):
            run(["node", "--check"], input=match.group(1))
            inline_count += 1
        for ref in re.findall(r'<(?:script|link)\b[^>]*(?:src|href)="(\./[^"?#]+)', source, flags=re.I):
            if not (html.parent / ref).is_file():
                raise RuntimeError(f"Missing asset in {html.name}: {ref}")
    for folder in ("speech_bubble_forge", "scripts", "tests", "tools"):
        for path in (ROOT / folder).rglob("*.py"):
            compile(path.read_text(encoding="utf-8"), str(path), "exec")
    run([sys.executable, "-m", "pytest", "-q"])
    core = sorted((ROOT / "tests").glob("*_test.cjs"))
    for path in core:
        run(["node", str(path)])
    smokes = sorted((ROOT / "tests").glob("*browser_smoke.cjs"))
    if args.browser:
        for path in smokes:
            output = run(["node", str(path)])
            if "SKIP" in output:
                raise RuntimeError(f"Required browser test skipped: {path.name}")
    run(["git", "diff", "--check", "HEAD"])
    summary = {"javascript_syntax": len(js_files), "inline_scripts": inline_count, "node_core": len(core), "browser_passed": len(smokes) if args.browser else 0, "browser_skipped": 0 if args.browser else len(smokes)}
    (ROOT / "artifacts").mkdir(exist_ok=True)
    (ROOT / "artifacts" / "validation.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
