"""Build an installable ZIP with 7-Zip; include committed source only."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "Speech-Bubble-Comic-Editor-for-Forge-Neo"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    version = {}
    exec((ROOT / "speech_bubble_forge/__init__.py").read_text("utf-8"), version)
    version = version["__version__"]
    source_sha = git("rev-parse", "HEAD").decode().strip()
    if os.environ.get("SOURCE_SHA") and source_sha != os.environ["SOURCE_SHA"]:
        raise RuntimeError("Packaging checkout is not the release source")
    files = [p for p in git("ls-files", "-z").decode("utf-8").split("\0") if p]
    protected = {".git", "artifacts", "node_modules", "__pycache__"}
    if not files or any(protected.intersection(Path(p).parts) for p in files):
        raise RuntimeError("Unsafe or empty package source list")
    executable = shutil.which("7z") or str(Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "7-Zip/7z.exe")
    if not Path(executable).is_file():
        raise RuntimeError("7-Zip is required for release packaging")
    archive = output / f"{PACKAGE}-v{version}.zip"
    if archive.exists():
        raise RuntimeError("Refusing to overwrite an existing package")
    hashes = {}
    with tempfile.TemporaryDirectory(prefix="sbe-release-") as temporary:
        staging = Path(temporary)
        package = staging / PACKAGE
        for name in files:
            data = (ROOT / name).read_bytes()
            target = package / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        manifest = {"version": version, "source_sha": source_sha, "files": hashes}
        (package / "RELEASE_BUILD.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        subprocess.run([executable, "a", "-tzip", "-mx=7", str(archive), PACKAGE], cwd=staging, check=True)
    subprocess.run([executable, "t", str(archive)], check=True)
    with zipfile.ZipFile(archive) as zipped:
        expected = {f"{PACKAGE}/{name}" for name in hashes} | {f"{PACKAGE}/RELEASE_BUILD.json"}
        actual = [item.filename for item in zipped.infolist() if not item.is_dir()]
        if len(actual) != len(expected) or set(actual) != expected:
            raise RuntimeError("Package file list mismatch")
        for name, digest in hashes.items():
            if hashlib.sha256(zipped.read(f"{PACKAGE}/{name}")).hexdigest() != digest:
                raise RuntimeError(f"Package content mismatch: {name}")
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    print(json.dumps({"archive": str(archive), "sha256": digest, "source_sha": source_sha, "files": len(hashes)}, indent=2))


if __name__ == "__main__":
    main()
