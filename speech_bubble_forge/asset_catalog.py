"""Shared SFX/frame catalogs and decoded assets for both editors."""
import hashlib
import json
import math
import os
import re
import unicodedata
from functools import lru_cache
from pathlib import Path, PurePosixPath

from PIL import Image
from speech_bubble_forge.user_assets import resolve_user_asset_path

_PREVIEW_SUBFOLDER = "speech_bubble_preview"
_NODE_DIRECTORY = str(Path(__file__).resolve().parents[1])
_SFX_ASSET_ROOT = Path(_NODE_DIRECTORY) / "web" / "assets" / "sfx"
_SHAPE_ASSET_ROOT = Path(_NODE_DIRECTORY) / "web" / "assets" / "shapes"
_SFX_ASSETS = {
    "don-exclamation-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "don-exclamation-mask.webp"),
    "ban-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ban-mask.webp"),
    "doka-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "doka-mask.webp"),
    "baki-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "baki-mask.webp"),
    "gashaan-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gashaan-mask.webp"),
    "jaan-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "jaan-mask.webp"),
    "parin-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "parin-mask.webp"),
    "shu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "shu-mask.webp"),
    "exclamation-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "exclamation-mask.webp"),
    "question-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "question-mask.webp"),
    "dakuten-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dakuten-mask.webp"),
    "small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "small-tsu-mask.webp"),
    "punpun-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "punpun-mask.webp"),
    "jii-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "jii-mask.webp"),
    "wakuwaku-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "wakuwaku-mask.webp"),
    "mochimochi-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "mochimochi-mask.webp"),
    "mushamusha-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "mushamusha-mask.webp"),
    "mogumogu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "mogumogu-mask.webp"),
    "zuruzuru-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "zuruzuru-mask.webp"),
    "gyuu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gyuu-mask.webp"),
    "nadenade-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nadenade-mask.webp"),
    "dokidoki-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dokidoki-mask.webp"),
    "kirakira-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "kirakira-mask.webp"),
    "fuwafuwa-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "fuwafuwa-mask.webp"),
    "pyonpyon-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pyonpyon-mask.webp"),
    "anger-mark-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "anger-mark-mask.webp"),
    "brush-exclamation-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "brush-exclamation-mask.webp"),
    "brush-question-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "brush-question-mask.webp"),
    "brush-heart-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "brush-heart-mask.webp"),
    "biku-katakana-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "biku-katakana-mask.webp"),
    "biku-katakana-mask-original-01": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "biku-katakana-mask-original-01.webp"),
    "biku-hiragana-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "biku-hiragana-mask.webp"),
    "biku-hiragana-mask-original-01": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "biku-hiragana-mask-original-01.webp"),
    "bikun-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "bikun-mask.webp"),
    "bikun-mask-original-01": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "bikun-mask-original-01.webp"),
    "zokuzoku-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "zokuzoku-mask.webp"),
    "gyu-katakana-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gyu-katakana-mask.webp"),
    "katakata-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "katakata-mask.webp"),
    "dokidoki-katakana-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dokidoki-katakana-mask.webp"),
    "gugu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gugu-mask.webp"),
    "piku-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "piku-mask.webp"),
    "hiku-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "hiku-mask.webp"),
    "rerorero-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "rerorero-mask.webp"),
    "kunekune-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "kunekune-mask.webp"),
    "sawasawa-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "sawasawa-mask.webp"),
    "taputapu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "taputapu-mask.webp"),
    "jupu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "jupu-mask.webp"),
    "nyuru-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nyuru-mask.webp"),
    "buchu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "buchu-mask.webp"),
    "buchu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "buchu-small-tsu-mask.webp"),
    "buchupon-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "buchupon-mask.webp"),
    "chu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chu-small-tsu-mask.webp"),
    "chupu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chupu-mask.webp"),
    "chupu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chupu-small-tsu-mask.webp"),
    "chupun-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chupun-mask.webp"),
    "chupo-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chupo-mask.webp"),
    "chupon-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chupon-mask.webp"),
    "chupa-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chupa-mask.webp"),
    "chupachupa-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chupachupa-mask.webp"),
    "puchu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "puchu-mask.webp"),
    "puchu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "puchu-small-tsu-mask.webp"),
    "puchun-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "puchun-mask.webp"),
    "nuchu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nuchu-mask.webp"),
    "nupu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nupu-mask.webp"),
    "nupu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nupu-small-tsu-mask.webp"),
    "picha-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "picha-mask.webp"),
    "pichapicha-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pichapicha-mask.webp"),
    "kapu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "kapu-mask.webp"),
    "kapu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "kapu-small-tsu-mask.webp"),
    "pan-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pan-small-tsu-mask.webp"),
    "topo-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "topo-small-tsu-mask.webp"),
    "an-katakana-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "an-katakana-small-tsu-mask.webp"),
    "haa-long-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "haa-long-small-tsu-mask.webp"),
    "faaa-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "faaa-small-tsu-mask.webp"),
    "tapun-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "tapun-small-tsu-mask.webp"),
    "a-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "a-small-tsu-mask.webp"),
    "an-hiragana-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "an-hiragana-mask.webp"),
    "gyupu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gyupu-mask.webp"),
    "buchupo-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "buchupo-small-tsu-mask.webp"),
    "haa-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "haa-mask.webp"),
    "haa-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "haa-small-tsu-mask.webp"),
    "ipu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ipu-small-tsu-mask.webp"),
    "dobyuu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dobyuu-small-tsu-mask.webp"),
    "aha-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "aha-small-tsu-mask.webp"),
    "aha-katakana-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "aha-katakana-small-tsu-mask.webp"),
    "hachun-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "hachun-small-tsu-mask.webp"),
    "n-small-tsu-ellipsis-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "n-small-tsu-ellipsis-mask.webp"),
    "u-small-tsu-ellipsis-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "u-small-tsu-ellipsis-mask.webp"),
    "iccha-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "iccha-mask.webp"),
    "ii-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ii-small-tsu-mask.webp"),
    "uwaaa-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "uwaaa-small-tsu-mask.webp"),
    "oo-dakuten-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "oo-dakuten-small-tsu-mask.webp"),
    "iguuu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "iguuu-mask.webp"),
    "viin-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "viin-mask.webp"),
    "nichaa-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nichaa-mask.webp"),
    "gori-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gori-small-tsu-mask.webp"),
    "deru-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "deru-small-tsu-mask.webp"),
    "dokun-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dokun-small-tsu-mask.webp"),
    "uguuu-ellipsis-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "uguuu-ellipsis-mask.webp"),
    "au-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "au-small-tsu-mask.webp"),
    "kaha-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "kaha-small-tsu-mask.webp"),
    "igu-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "igu-small-tsu-mask.webp"),
    "tehepero-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "tehepero-mask.webp"),
    "iee-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "iee-small-tsu-mask.webp"),
    "oke-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "oke-mask.webp"),
    "dokkunn-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dokkunn-vertical-gpt-v1.webp"),
    "bubyuu-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "bubyuu-vertical-gpt-v1.webp"),
    "giri-small-tsu-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "giri-small-tsu-vertical-mask.webp"),
    "nuron-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nuron-angular-vertical-mask.webp"),
    "dochu-exclamation-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dochu-exclamation-angular-vertical-mask.webp"),
    "chiro-vertical-uniform-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chiro-vertical-uniform-mask.webp"),
    "upu-vertical-uniform-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "upu-vertical-uniform-mask.webp"),
    "chuu-vertical-uniform-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chuu-vertical-uniform-mask.webp"),
    "boto-small-tsu-vertical-uniform-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "boto-small-tsu-vertical-uniform-mask.webp"),
    "dochu-vertical-uniform-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dochu-vertical-uniform-mask.webp"),
    "giu-long-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "giu-long-angular-vertical-mask.webp"),
    "hiku-small-tsu-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "hiku-small-tsu-angular-vertical-mask.webp"),
    "giu-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "giu-angular-vertical-mask.webp"),
    "zuru-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "zuru-angular-vertical-mask.webp"),
    "dokun-hiragana-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dokun-hiragana-angular-vertical-mask.webp"),
    "dokun-hiragana-angular-horizontal-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dokun-hiragana-angular-horizontal-mask.webp"),
    "zubu-small-tsu-angular-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "zubu-small-tsu-angular-vertical-mask.webp"),
    "sore-dame-horizontal-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "sore-dame-horizontal-gpt-v1.webp"),
    "nani-kore-horizontal-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nani-kore-horizontal-gpt-v1.webp"),
    "shii-horizontal-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "shii-horizontal-gpt-v1.webp"),
    "naisho-horizontal-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "naisho-horizontal-gpt-v1.webp"),
    "ikisou-horizontal-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ikisou-horizontal-gpt-v1.webp"),
    "joo-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "joo-vertical-gpt-v1.webp"),
    "gokkun-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gokkun-vertical-gpt-v1.webp"),
    "pushaa-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pushaa-vertical-gpt-v1.webp"),
    "chira-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "chira-vertical-gpt-v1.webp"),
    "woo-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "woo-vertical-gpt-v1.webp"),
    "rerorero-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "rerorero-vertical-gpt-v1.webp"),
    "haa-katakana-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "haa-katakana-vertical-gpt-v1.webp"),
    "dokkunn-hiragana-vertical-gpt-v1": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "dokkunn-hiragana-vertical-gpt-v1.webp"),
    "damee-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "damee-mask.webp"),
    "u-dakuten-long-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "u-dakuten-long-small-tsu-mask.webp"),
    "moo-long-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "moo-long-small-tsu-mask.webp"),
    "e-small-tsu-question-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "e-small-tsu-question-mask.webp"),
    "yadaa-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "yadaa-mask.webp"),
    "filled-heart-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "filled-heart-mask.webp"),
    "handdrawn-filled-heart-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "handdrawn-filled-heart-mask.webp"),
    "burun-katakana-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "burun-katakana-small-tsu-mask.webp"),
    "burun-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "burun-small-tsu-mask.webp"),
    "purun-small-tsu-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "purun-small-tsu-mask.webp"),
    "gyuu-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "gyuu-reference-vertical-mask.webp"),
    "pito-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pito-reference-vertical-mask.webp"),
    "norun-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "norun-reference-vertical-mask.webp"),
    "kuu-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "kuu-reference-vertical-mask.webp"),
    "ki-katakana-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ki-katakana-reference-vertical-mask.webp"),
    "munyu-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "munyu-reference-vertical-mask.webp"),
    "piyo-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "piyo-reference-vertical-mask.webp"),
    "nuri-small-tsu-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nuri-small-tsu-reference-vertical-mask.webp"),
    "oga-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "oga-reference-vertical-mask.webp"),
    "oa-exclamation-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "oa-exclamation-reference-vertical-mask.webp"),
    "nuru-small-tsu-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "nuru-small-tsu-reference-vertical-mask.webp"),
    "boyon-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "boyon-reference-vertical-mask.webp"),
    "byon-katakana-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "byon-katakana-reference-vertical-mask.webp"),
    "zucha-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "zucha-reference-vertical-mask.webp"),
    "sucha-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "sucha-reference-vertical-mask.webp"),
    "byuu-long-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "byuu-long-reference-vertical-mask.webp"),
    "goku-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "goku-reference-vertical-mask.webp"),
    "doku-small-tsu-katakana-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "doku-small-tsu-katakana-reference-vertical-mask.webp"),
    "haga-small-tsu-reference-vertical-mask": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "haga-small-tsu-reference-vertical-mask.webp"),
    "pink-stamp-dyurururu": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pink-stamp-dyurururu.webp"),
    "pink-stamp-dyu-heart": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pink-stamp-dyu-heart.webp"),
    "pink-stamp-double-heart": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pink-stamp-double-heart.webp"),
    "pink-stamp-biku-heart": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "pink-stamp-biku-heart.webp"),
}


def _safe_sfx_asset_path(pack_dir, value):
    if not isinstance(value, str) or not value or value.startswith(("/", "\\")):
        return None
    relative = PurePosixPath(value.replace("\\", "/"))
    if ".." in relative.parts:
        return None
    candidate = (pack_dir / Path(*relative.parts)).resolve()
    try:
        candidate.relative_to(pack_dir.resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None


@lru_cache(maxsize=1)
def get_sfx_asset_catalog():
    packs, assets, warnings, seen = [], {}, [], set()
    if not _SFX_ASSET_ROOT.is_dir():
        return {"schemaVersion": 1, "packs": packs, "items": [], "warnings": warnings, "assetVersion": "builtin"}
    for manifest_path in sorted(_SFX_ASSET_ROOT.glob("*/manifest.json")):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            warnings.append(f"{manifest_path.parent.name}: invalid manifest ({error})")
            continue
        pack_id = str(manifest.get("id") or manifest_path.parent.name).strip()
        if not pack_id or pack_id in seen:
            warnings.append(f"{manifest_path.parent.name}: duplicate or missing pack id")
            continue
        seen.add(pack_id)
        defaults = manifest.get("defaults") if isinstance(manifest.get("defaults"), dict) else {}
        items = []
        for entry in manifest.get("items", []):
            if not isinstance(entry, dict):
                continue
            asset_id, label = str(entry.get("id") or "").strip(), str(entry.get("label") or "").strip()
            ocr_label = str(entry.get("ocrLabel") or entry.get("ocr_label") or "").strip()
            display_label = str(entry.get("displayName") or entry.get("display_name") or ocr_label or label or asset_id).strip()
            sort_key = str(entry.get("sortKey") or entry.get("sort_key") or ocr_label or display_label or "").strip()
            asset_path = _safe_sfx_asset_path(manifest_path.parent, entry.get("asset"))
            if not asset_id or not display_label or not asset_path:
                warnings.append(f"{pack_id}: skipped invalid item")
                continue
            # Pillow requires a raster source; prefer a sibling WebP/PNG for SVG masters.
            if asset_path.suffix.lower() == ".svg":
                raster = next((asset_path.with_suffix(ext) for ext in (".webp", ".png") if asset_path.with_suffix(ext).is_file()), None)
                if raster is None:
                    warnings.append(f"{pack_id}/{asset_id}: SVG needs a WebP or PNG runtime copy")
                    continue
                asset_path = raster
            item_defaults = entry.get("defaults") if isinstance(entry.get("defaults"), dict) else {}
            merged = {**defaults, **item_defaults}
            public_path = asset_path.relative_to(_SFX_ASSET_ROOT.parent).as_posix()
            aliases = entry.get("aliases") if isinstance(entry.get("aliases"), list) else []
            tags = entry.get("tags") if isinstance(entry.get("tags"), list) else []
            item = {
                "id": asset_id, "label": display_label, "displayName": display_label, "ocrLabel": ocr_label or None, "sortKey": sort_key or None, "packId": pack_id,
                "src": f"./assets/{public_path}", "format": "WebP Mask" if asset_path.suffix.lower() in {".webp", ".png"} else "Raster",
                "mask": bool(entry.get("mask", True)), "category": str(entry.get("category") or manifest.get("category") or "japanese").lower(),
                "fill": merged.get("fillColor"), "stroke": merged.get("outlineColor"), "outlineWidth": merged.get("outlineWidth"),
                "w": merged.get("w"), "h": merged.get("h"),
                "opacity": merged.get("opacity", 1), "keywords": " ".join([display_label, *map(str, aliases), *map(str, tags)]),
            }
            items.append(item)
            assets[asset_id] = str(asset_path)
        packs.append({"id": pack_id, "label": str(manifest.get("label") or pack_id), "category": manifest.get("category") or "User", "preview": manifest.get("preview"), "items": items})
    return {"schemaVersion": 1, "packs": packs, "items": [item for pack in packs for item in pack["items"]], "warnings": warnings, "assetVersion": str(int(max((Path(path).stat().st_mtime_ns for path in assets.values()), default=0)))}


def reload_sfx_asset_catalog():
    get_sfx_asset_catalog.cache_clear()


def _sfx_asset_path(asset_id):
    if str(asset_id or "").startswith("user:"):
        path = resolve_user_asset_path(str(asset_id).removeprefix("user:"))
        return str(path) if path else None
    for pack in get_sfx_asset_catalog().get("packs", []):
        pack_dir = _SFX_ASSET_ROOT / str(pack.get("id") or "")
        for item in pack.get("items", []):
            if item.get("id") != asset_id:
                continue
            src = str(item.get("src") or "")
            relative = src.removeprefix("./assets/sfx/")
            candidate = _safe_sfx_asset_path(_SFX_ASSET_ROOT, relative)
            if candidate:
                return str(candidate)
    path = _SFX_ASSETS.get(asset_id)
    if path:
        return path
    return None

_MASK_SFX_ASSETS = {
    "don-exclamation-mask",
    "ban-mask",
    "doka-mask",
    "baki-mask",
    "gashaan-mask",
    "jaan-mask",
    "parin-mask",
    "shu-mask",
    "exclamation-mask",
    "question-mask",
    "dakuten-mask",
    "small-tsu-mask",
    "punpun-mask",
    "jii-mask",
    "wakuwaku-mask",
    "mochimochi-mask",
    "mushamusha-mask",
    "mogumogu-mask",
    "zuruzuru-mask",
    "gyuu-mask",
    "nadenade-mask",
    "dokidoki-mask",
    "kirakira-mask",
    "fuwafuwa-mask",
    "pyonpyon-mask",
    "anger-mark-mask",
    "brush-exclamation-mask",
    "brush-question-mask",
    "brush-heart-mask",
    "biku-katakana-mask",
    "biku-katakana-mask-original-01",
    "biku-hiragana-mask",
    "biku-hiragana-mask-original-01",
    "bikun-mask",
    "bikun-mask-original-01",
    "zokuzoku-mask",
    "gyu-katakana-mask",
    "katakata-mask",
    "dokidoki-katakana-mask",
    "gugu-mask",
    "piku-mask",
    "hiku-mask",
    "rerorero-mask",
    "kunekune-mask",
    "sawasawa-mask",
    "taputapu-mask",
    "jupu-mask",
    "nyuru-mask",
    "buchu-mask",
    "buchu-small-tsu-mask",
    "buchupon-mask",
    "chu-small-tsu-mask",
    "chupu-mask",
    "chupu-small-tsu-mask",
    "chupun-mask",
    "chupo-mask",
    "chupon-mask",
    "chupa-mask",
    "chupachupa-mask",
    "puchu-mask",
    "puchu-small-tsu-mask",
    "puchun-mask",
    "nuchu-mask",
    "nupu-mask",
    "nupu-small-tsu-mask",
    "picha-mask",
    "pichapicha-mask",
    "kapu-mask",
    "kapu-small-tsu-mask",
    "pan-small-tsu-mask",
    "topo-small-tsu-mask",
    "an-katakana-small-tsu-mask",
    "haa-long-small-tsu-mask",
    "faaa-small-tsu-mask",
    "tapun-small-tsu-mask",
    "a-small-tsu-mask",
    "an-hiragana-mask",
    "gyupu-mask",
    "buchupo-small-tsu-mask",
    "haa-mask",
    "haa-small-tsu-mask",
    "ipu-small-tsu-mask",
    "dobyuu-small-tsu-mask",
    "aha-small-tsu-mask",
    "aha-katakana-small-tsu-mask",
    "hachun-small-tsu-mask",
    "n-small-tsu-ellipsis-mask",
    "u-small-tsu-ellipsis-mask",
    "iccha-mask",
    "ii-small-tsu-mask",
    "uwaaa-small-tsu-mask",
    "oo-dakuten-small-tsu-mask",
    "iguuu-mask",
    "viin-mask",
    "nichaa-mask",
    "gori-small-tsu-mask",
    "deru-small-tsu-mask",
    "dokun-small-tsu-mask",
    "uguuu-ellipsis-mask",
    "au-small-tsu-mask",
    "kaha-small-tsu-mask",
    "igu-small-tsu-mask",
    "tehepero-mask",
    "iee-small-tsu-mask",
    "oke-mask",
    "damee-mask",
    "u-dakuten-long-small-tsu-mask",
    "moo-long-small-tsu-mask",
    "e-small-tsu-question-mask",
    "yadaa-mask",
    "filled-heart-mask",
    "burun-katakana-small-tsu-mask",
    "burun-small-tsu-mask",
    "purun-small-tsu-mask",
    "gyuu-reference-vertical-mask",
    "pito-reference-vertical-mask",
    "norun-reference-vertical-mask",
    "kuu-reference-vertical-mask",
    "ki-katakana-reference-vertical-mask",
    "munyu-reference-vertical-mask",
    "piyo-reference-vertical-mask",
    "nuri-small-tsu-reference-vertical-mask",
    "oga-reference-vertical-mask",
    "oa-exclamation-reference-vertical-mask",
    "nuru-small-tsu-reference-vertical-mask",
    "boyon-reference-vertical-mask",
    "byon-katakana-reference-vertical-mask",
    "zucha-reference-vertical-mask",
    "sucha-reference-vertical-mask",
    "byuu-long-reference-vertical-mask",
    "goku-reference-vertical-mask",
    "doku-small-tsu-katakana-reference-vertical-mask",
    "haga-small-tsu-reference-vertical-mask",
    "pink-stamp-dyurururu",
    "pink-stamp-dyu-heart",
    "pink-stamp-double-heart",
    "pink-stamp-biku-heart",
}

_FRAME_ROOT = Path(_NODE_DIRECTORY) / "web" / "assets" / "frames"
_FRAME_MANIFEST_PATH = _FRAME_ROOT / "manifest.json"
_FRAME_SCALE_WARNED = set()
_FRAME_SUPPORTED_RENDER_MODES = {
    "full-overlay",
    "nine-slice",
    "edge-repeat",
    "decorated-border",
    "template-fixed",
    "template-adaptive",
}
_FRAME_SUPPORTED_TEMPLATES = {"fixed-square-v1", "adaptive-cute-v1"}
_FRAME_FIT_MODES = {"cover", "contain", "stretch", "tile"}
_FRAME_PART_KEYS = {
    "cornerTL": "corner_tl",
    "cornerTR": "corner_tr",
    "cornerBL": "corner_bl",
    "cornerBR": "corner_br",
    "edgeTop": "edge_top",
    "edgeBottom": "edge_bottom",
    "edgeLeft": "edge_left",
    "edgeRight": "edge_right",
}
_FRAME_DISCOVERY_WARNINGS = []
_FRAME_FALLBACK_PRESETS = {
    "frame-border": {
        "id": "frame-border",
        "label": "Frame Border",
        "kind": "border",
        "render_mode": "border",
        "pin_to_top": True,
    },
    "black-border": {
        "id": "black-border",
        "label": "Black Border",
        "kind": "border",
        "render_mode": "border",
        "pin_to_top": True,
    },
}


def _frame_manifest_value(data, camel_key, snake_key=None, default=None):
    if camel_key in data:
        return data[camel_key]
    if snake_key and snake_key in data:
        return data[snake_key]
    return default


def _frame_number(value, minimum, maximum, default):
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = float(default)
    if not math.isfinite(number):
        number = float(default)
    return max(minimum, min(maximum, number))


def _safe_frame_asset(frame_dir, relative_path, required=True):
    raw = str(relative_path or "").strip().replace("\\", "/")
    pure = PurePosixPath(raw)
    if not raw:
        if required:
            raise ValueError("missing asset path")
        return ""
    if pure.is_absolute() or ".." in pure.parts or ":" in raw or raw.startswith(("file:", "http:", "https:")):
        raise ValueError(f"unsafe asset path: {raw}")
    candidate = (frame_dir / Path(*pure.parts)).resolve()
    base = frame_dir.resolve()
    if candidate != base and base not in candidate.parents:
        raise ValueError(f"asset escapes frame directory: {raw}")
    if not candidate.is_file():
        raise ValueError(f"missing asset: {raw}")
    relative = candidate.relative_to(_FRAME_ROOT.resolve()).as_posix()
    return f"./assets/frames/{relative}"


def _normalize_discovered_frame_manifest(payload, frame_dir):
    if not isinstance(payload, dict):
        raise ValueError("manifest root must be an object")
    schema_version = int(payload.get("schemaVersion", 0) or 0)
    if schema_version not in {1, 2, 3}:
        raise ValueError("schemaVersion must be 1, 2, or 3")
    preset_id = str(payload.get("id") or "").strip()
    label = str(payload.get("label") or "").strip()
    render_mode = str(_frame_manifest_value(payload, "renderMode", "render_mode", "")).strip().lower()
    if not preset_id or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", preset_id):
        raise ValueError("invalid id")
    if not label:
        raise ValueError("label is required")
    if render_mode not in _FRAME_SUPPORTED_RENDER_MODES:
        raise ValueError(f"unsupported renderMode: {render_mode or '(empty)'}")

    runtime_required = render_mode in {"full-overlay", "nine-slice"}
    asset_src = _safe_frame_asset(
        frame_dir,
        _frame_manifest_value(payload, "runtimeAsset", "asset_src"),
        required=runtime_required,
    )
    asset_src_2x = _safe_frame_asset(
        frame_dir,
        _frame_manifest_value(payload, "runtimeAsset2x", "asset_src_2x"),
        required=False,
    )
    preview_src = _safe_frame_asset(
        frame_dir,
        payload.get("previewAsset", payload.get("preview", payload.get("preview_src"))),
        required=render_mode == "decorated-border",
    )
    native = _frame_manifest_value(payload, "nativeSize", "source_size", {})
    if not native and schema_version >= 3:
        quality = payload.get("quality") if isinstance(payload.get("quality"), dict) else {}
        reference_canvas = quality.get("referenceCanvas")
        if isinstance(reference_canvas, (list, tuple)) and len(reference_canvas) >= 2:
            native = {"width": reference_canvas[0], "height": reference_canvas[1]}
    if not isinstance(native, dict):
        raise ValueError("nativeSize must be an object")
    native_width = int(round(_frame_number(native.get("width"), 1, 32768, 1024)))
    native_height = int(round(_frame_number(native.get("height"), 1, 32768, 1024 if schema_version >= 3 else 1536)))
    normalized = {
        "id": preset_id,
        "label": label,
        "category": str(payload.get("category") or "frame"),
        "kind": str(payload.get("kind") or "decorative"),
        "render_mode": render_mode,
        "asset_src": asset_src,
        "asset_src_2x": asset_src_2x,
        "preview_src": preview_src,
        "source_size": {"width": native_width, "height": native_height},
        "pin_to_top": bool(_frame_manifest_value(payload, "pinToTop", "pin_to_top", True)),
        "mouse_transparent": bool(_frame_manifest_value(payload, "mouseTransparent", "mouse_transparent", True)),
        "default_scale": _frame_number(_frame_manifest_value(payload, "defaultScale", "default_scale", 100), 10, 400, 100),
        "default_inset": _frame_number(_frame_manifest_value(payload, "defaultInset", "default_inset", 0), -2048, 2048, 0),
        "keywords": str(payload.get("keywords") or ""),
        "manifest_path": str((frame_dir / "manifest.json").resolve()),
    }
    if asset_src_2x:
        native_2x = _frame_manifest_value(payload, "nativeSize2x", "source_size_2x", {})
        if isinstance(native_2x, dict) and native_2x:
            normalized["source_size_2x"] = {
                "width": int(round(_frame_number(native_2x.get("width"), 1, 65536, native_width * 2))),
                "height": int(round(_frame_number(native_2x.get("height"), 1, 65536, native_height * 2))),
            }

    if render_mode == "edge-repeat":
        raw_parts = payload.get("parts")
        if not isinstance(raw_parts, dict):
            raise ValueError("edge-repeat requires parts")
        parts = {}
        for camel_key, snake_key in _FRAME_PART_KEYS.items():
            source = raw_parts.get(camel_key, raw_parts.get(snake_key))
            parts[snake_key] = _safe_frame_asset(frame_dir, source)
        layout = _frame_manifest_value(payload, "edgeLayout", "layout", {})
        if not isinstance(layout, dict):
            raise ValueError("edgeLayout must be an object")
        minimum_tiles = int(round(_frame_number(_frame_manifest_value(layout, "minimumTiles", "minimum_tiles", 1), 0, 512, 1)))
        maximum_tiles = int(round(_frame_number(_frame_manifest_value(layout, "maximumTiles", "maximum_tiles", 64), 1, 512, 64)))
        if maximum_tiles < minimum_tiles:
            raise ValueError("maximumTiles must be greater than or equal to minimumTiles")
        distribution = str(layout.get("distribution") or "space-evenly")
        if distribution != "space-evenly":
            raise ValueError(f"unsupported edge distribution: {distribution}")
        normalized["parts"] = parts
        normalized["layout"] = {
            "distribution": distribution,
            "preserve_aspect_ratio": bool(_frame_manifest_value(layout, "preserveAspectRatio", "preserve_aspect_ratio", True)),
            "minimum_tiles": minimum_tiles,
            "maximum_tiles": maximum_tiles,
            "clip_per_tile": bool(_frame_manifest_value(layout, "clipPerTile", "clip_per_tile", False)),
            "safe_padding_ratio": _frame_number(_frame_manifest_value(layout, "safePaddingRatio", "safe_padding_ratio", 0), 0, 0.49, 0),
        }
    elif render_mode == "decorated-border":
        raw_base = _frame_manifest_value(payload, "baseBorder", "base_border")
        if not isinstance(raw_base, dict):
            raise ValueError("decorated-border requires baseBorder")
        shape = str(raw_base.get("shape") or "rounded-rectangle").lower()
        if shape != "rounded-rectangle":
            raise ValueError(f"unsupported baseBorder shape: {shape}")
        base_enabled = raw_base.get("enabled", True) is not False
        raw_layers = raw_base.get("layers")
        if base_enabled and (not isinstance(raw_layers, list) or not raw_layers):
            raise ValueError("baseBorder.layers must be a non-empty array")
        if not isinstance(raw_layers, list):
            raw_layers = []
        border_layers = []
        for index, layer in enumerate(raw_layers[:16]):
            if not isinstance(layer, dict):
                raise ValueError(f"baseBorder layer {index} must be an object")
            style = str(layer.get("style") or "solid").lower()
            if style not in {"solid", "dotted", "dashed"}:
                raise ValueError(f"unsupported baseBorder style: {style}")
            raw_dash = layer.get("dash")
            dash = []
            if isinstance(raw_dash, list):
                dash = [_frame_number(value, 0.1, 4096, 1) for value in raw_dash[:16]]
            border_layers.append(
                {
                    "color": str(layer.get("color") or "#ffffff"),
                    "width": _frame_number(layer.get("width"), 0.1, 2048, 1),
                    "style": style,
                    "dash": dash,
                    "offset": _frame_number(layer.get("offset"), -2048, 2048, 0),
                }
            )
        raw_decorations = payload.get("decorations")
        if not isinstance(raw_decorations, dict):
            raise ValueError("decorated-border requires decorations")
        raw_items = raw_decorations.get("items")
        if not isinstance(raw_items, dict) or not raw_items:
            raise ValueError("decorations.items must be a non-empty object")
        items = {}
        item_meta = {}
        for item_id, source in raw_items.items():
            item_id = str(item_id or "").strip()
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", item_id):
                raise ValueError(f"invalid decoration id: {item_id or '(empty)'}")
            descriptor = source if isinstance(source, dict) else {}
            asset_path = descriptor.get("path", descriptor.get("asset", source))
            items[item_id] = _safe_frame_asset(frame_dir, asset_path)
            target_width = descriptor.get("targetWidthPx", descriptor.get("target_width_px"))
            if target_width is None:
                target_width = descriptor.get("targetPx", descriptor.get("target_px"))
            meta = {
                "role": str(descriptor.get("role") or "primary"),
                "target_width": _frame_number(target_width, 1, 8192, 0) if target_width is not None else 0,
            }
            if descriptor.get("nativeSize") is not None:
                meta["native_size"] = descriptor.get("nativeSize")
            item_meta[item_id] = meta

        raw_corners = raw_decorations.get("corners") or {}
        if not isinstance(raw_corners, dict):
            raise ValueError("decorations.corners must be an object")
        corner_aliases = {
            "topLeft": "corner_tl", "topRight": "corner_tr",
            "bottomLeft": "corner_bl", "bottomRight": "corner_br",
        }
        corners = {}
        corner_targets = {}
        for camel_key, snake_key in corner_aliases.items():
            source = raw_corners.get(camel_key, raw_corners.get(snake_key))
            if isinstance(source, str) and source in items:
                corners[snake_key] = items[source]
                corner_targets[snake_key] = item_meta.get(source, {}).get("target_width", 0)
            else:
                corners[snake_key] = _safe_frame_asset(frame_dir, source) if source else None
        def normalize_sequences(raw_sequences, name, required):
            if raw_sequences is None and not required:
                return {key: [] for key in ("top", "bottom", "left", "right")}
            if not isinstance(raw_sequences, dict):
                raise ValueError(f"decorations.{name} must be an object")
            result = {}
            for key in ("top", "bottom", "left", "right"):
                sequence = raw_sequences.get(key, [])
                if not isinstance(sequence, list):
                    raise ValueError(f"decorations.{name}.{key} must be an array")
                clean = [str(value) for value in sequence]
                missing = [value for value in clean if value not in items]
                if missing:
                    raise ValueError(f"decorations.{name}.{key} references unknown items: {', '.join(missing)}")
                result[key] = clean
            return result

        edges = normalize_sequences(raw_decorations.get("edges"), "edges", True)
        fillers = normalize_sequences(raw_decorations.get("fillers"), "fillers", False)
        raw_layout = raw_decorations.get("layout")
        if raw_layout is None:
            raw_layout = _frame_manifest_value(payload, "decoratedLayout", "decorated_layout", {})
        if not isinstance(raw_layout, dict):
            raise ValueError("decorations.layout must be an object")
        distribution = str(raw_layout.get("distribution") or "space-evenly")
        if distribution != "space-evenly":
            raise ValueError(f"unsupported decoration distribution: {distribution}")
        raw_adaptive = payload.get("adaptiveLayout")
        if raw_adaptive is None:
            raw_adaptive = raw_decorations.get("adaptiveLayout")
        if raw_adaptive is None:
            raw_adaptive = {}
        if not isinstance(raw_adaptive, dict):
            raise ValueError("adaptiveLayout must be an object")
        adaptive_enabled = bool(raw_adaptive.get("enabled", False))
        default_edge_scale = 1 if adaptive_enabled else raw_layout.get("primaryItemScale", 0.72)
        normalized["base_border"] = {
            "enabled": base_enabled,
            "shape": shape,
            "inset": _frame_number(raw_base.get("inset"), -2048, 2048, 0),
            "radius": _frame_number(raw_base.get("radius"), 0, 4096, 0),
            "layers": border_layers,
        }
        normalized["decorated_corners"] = corners
        normalized["decorated_items"] = items
        normalized["decorated_item_meta"] = item_meta
        normalized["decorated_targets"] = corner_targets | {
            item_id: meta.get("target_width", 0) for item_id, meta in item_meta.items()
        }
        normalized["decorated_edges"] = edges
        normalized["decorated_fillers"] = fillers
        normalized["decorated_layout"] = {
            "distribution": distribution,
            "preserve_aspect_ratio": bool(_frame_manifest_value(raw_layout, "preserveAspectRatio", "preserve_aspect_ratio", True)),
            "clip_per_item": bool(_frame_manifest_value(raw_layout, "clipPerItem", "clip_per_item", False)),
            "safe_padding_ratio": _frame_number(_frame_manifest_value(raw_layout, "safePaddingRatio", "safe_padding_ratio", 0.08), 0, 0.49, 0.08),
            "corner_scale": _frame_number(_frame_manifest_value(raw_layout, "cornerScale", "corner_scale", 1), 0.05, 8, 1),
            "edge_scale": _frame_number(_frame_manifest_value(raw_layout, "edgeScale", "edge_scale", default_edge_scale), 0.05, 8, default_edge_scale),
            "filler_scale": _frame_number(_frame_manifest_value(raw_layout, "fillerScale", "filler_scale", 0.42), 0.05, 8, 0.42),
            "avoid_corner_overlap": bool(_frame_manifest_value(raw_layout, "avoidCornerOverlap", "avoid_corner_overlap", True)),
        }
        normalized["decorated_adaptive_layout"] = {
            "enabled": adaptive_enabled,
            "reference_short_side": _frame_number(raw_adaptive.get("referenceShortSide"), 1, 32768, 1024),
            "minimum_item_scale": _frame_number(raw_adaptive.get("minimumItemScale"), 0.05, 1, 0.88),
            "maximum_item_scale": _frame_number(raw_adaptive.get("maximumItemScale"), 0.05, 8, 1),
            "minimum_gap_px": _frame_number(raw_adaptive.get("minimumGapPx"), 0, 4096, 8),
            "target_gap_px": _frame_number(raw_adaptive.get("targetGapPx"), 0, 4096, 16),
            "maximum_gap_px": _frame_number(raw_adaptive.get("maximumGapPx"), 0, 4096, 24),
            "never_scale_whole_sequence_to_fit": bool(raw_adaptive.get("neverScaleWholeSequenceToFit", True)),
            "overflow_mode": str(raw_adaptive.get("overflowMode") or "reduce-count"),
            "underflow_mode": str(raw_adaptive.get("underflowMode") or "repeat-primary-before-large-gap"),
            "remove_priority": [str(value) for value in (raw_adaptive.get("removePriority") or ["filler", "flower", "primary"])],
            "minimum_primary_items_per_edge": int(round(_frame_number(raw_adaptive.get("minimumPrimaryItemsPerEdge"), 0, 64, 1))),
            "maximum_items_per_edge": int(round(_frame_number(raw_adaptive.get("maximumItemsPerEdge"), 1, 128, 18))),
            "edge_inset_ratio": _frame_number(raw_adaptive.get("edgeInsetRatio"), 0, 0.49, 0),
        }
    elif render_mode == "nine-slice":
        raw_slice = payload.get("slice")
        if not isinstance(raw_slice, dict):
            raise ValueError("nine-slice requires slice")
        units = str(raw_slice.get("units") or "ratio").lower()
        if units not in {"ratio", "px"}:
            raise ValueError("slice units must be ratio or px")
        limit = 0.499 if units == "ratio" else 32768
        normalized["slice"] = {
            "units": units,
            **{key: _frame_number(raw_slice.get(key), 0.001, limit, 0.1 if units == "ratio" else 150) for key in ("left", "top", "right", "bottom")},
        }
    elif render_mode == "full-overlay":
        fit_mode = str(_frame_manifest_value(payload, "fitMode", "fit_mode", "cover")).lower()
        if fit_mode not in _FRAME_FIT_MODES:
            raise ValueError(f"unsupported fitMode: {fit_mode}")
        normalized["fit_mode"] = fit_mode
    return normalized

def _discover_frame_assets():
    discovered = {}
    warnings = []
    if not _FRAME_ROOT.is_dir():
        return discovered, warnings
    for frame_dir in sorted(path for path in _FRAME_ROOT.iterdir() if path.is_dir()):
        manifest_path = frame_dir / "manifest.json"
        if not manifest_path.is_file():
            continue
        try:
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            preset = _normalize_discovered_frame_manifest(payload, frame_dir)
            if preset["id"] in discovered:
                raise ValueError(f"duplicate discovered id: {preset['id']}")
            discovered[preset["id"]] = preset
        except (OSError, TypeError, ValueError, json.JSONDecodeError) as error:
            warnings.append(f"{frame_dir.name}: {error}")
    return discovered, warnings


def _load_frame_presets():
    presets = {key: dict(value) for key, value in _FRAME_FALLBACK_PRESETS.items()}
    try:
        with open(_FRAME_MANIFEST_PATH, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        entries = payload.get("frames", []) if isinstance(payload, dict) else []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            preset_id = str(entry.get("id") or "").strip()
            if not preset_id:
                continue
            presets[preset_id] = dict(entry)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        _FRAME_DISCOVERY_WARNINGS.append(f"legacy manifest: {error}")
    discovered, warnings = _discover_frame_assets()
    _FRAME_DISCOVERY_WARNINGS.extend(warnings)
    for preset_id, preset in discovered.items():
        if preset_id in presets:
            _FRAME_DISCOVERY_WARNINGS.append(f"{preset_id}: folder manifest overrides legacy definition")
        presets[preset_id] = preset
    for warning in _FRAME_DISCOVERY_WARNINGS:
        print(f"[Speech Bubble] Frame asset skipped/warning: {warning}")
    return presets


_FRAME_PRESETS = _load_frame_presets()
_FRAME_ASSETS = {}
_FRAME_ASSETS_2X = {}


def _frame_asset_path(asset_src):
    relative_src = str(asset_src or "").strip().replace("\\", "/").lstrip("./")
    if not relative_src or ".." in PurePosixPath(relative_src).parts or ":" in relative_src:
        return None
    candidate = (Path(_NODE_DIRECTORY) / "web" / Path(*PurePosixPath(relative_src).parts)).resolve()
    web_root = (Path(_NODE_DIRECTORY) / "web").resolve()
    return str(candidate) if candidate == web_root or web_root in candidate.parents else None


def _frame_preset_to_public(preset):
    reverse_parts = {snake: camel for camel, snake in _FRAME_PART_KEYS.items()}
    result = {
        "id": preset.get("id"),
        "label": preset.get("label"),
        "category": preset.get("category", "frame"),
        "kind": preset.get("kind", "decorative"),
        "renderMode": preset.get("render_mode", "border"),
        "defaultScale": preset.get("default_scale", 100),
        "defaultInset": preset.get("default_inset", 0),
        "pinToTop": preset.get("pin_to_top", True),
        "mouseTransparent": preset.get("mouse_transparent", True),
        "runtimeAsset": preset.get("asset_src", ""),
        "runtimeAsset2x": preset.get("asset_src_2x", ""),
        "previewUrl": preset.get("preview_src", ""),
        "nativeSize": preset.get("source_size"),
        "nativeSize2x": preset.get("source_size_2x"),
        "fitMode": preset.get("fit_mode", "cover"),
        "slice": preset.get("slice"),
        "keywords": preset.get("keywords", ""),
    }
    for key in ("border_color", "border_width", "inner_stroke_color", "inner_stroke_width"):
        if key in preset:
            result[key] = preset[key]
    if isinstance(preset.get("parts"), dict):
        result["parts"] = {reverse_parts.get(key, key): value for key, value in preset["parts"].items()}
    if isinstance(preset.get("layout"), dict):
        layout = preset["layout"]
        result["edgeLayout"] = {
            "distribution": layout.get("distribution", "space-evenly"),
            "preserveAspectRatio": layout.get("preserve_aspect_ratio", True),
            "minimumTiles": layout.get("minimum_tiles", 1),
            "maximumTiles": layout.get("maximum_tiles", 64),
            "clipPerTile": layout.get("clip_per_tile", False),
            "safePaddingRatio": layout.get("safe_padding_ratio", 0),
        }
    if preset.get("render_mode") == "decorated-border":
        result["baseBorder"] = preset.get("base_border")
        corner_reverse = {
            "corner_tl": "topLeft", "corner_tr": "topRight",
            "corner_bl": "bottomLeft", "corner_br": "bottomRight",
        }
        decorated_layout = preset.get("decorated_layout") or {}
        result["decorations"] = {
            "corners": {corner_reverse.get(key, key): value for key, value in (preset.get("decorated_corners") or {}).items()},
            "items": dict(preset.get("decorated_items") or {}),
            "edges": dict(preset.get("decorated_edges") or {}),
            "fillers": dict(preset.get("decorated_fillers") or {}),
            "layout": {
                "distribution": decorated_layout.get("distribution", "space-evenly"),
                "preserveAspectRatio": decorated_layout.get("preserve_aspect_ratio", True),
                "clipPerItem": decorated_layout.get("clip_per_item", False),
                "safePaddingRatio": decorated_layout.get("safe_padding_ratio", 0.08),
                "cornerScale": decorated_layout.get("corner_scale", 1),
                "edgeScale": decorated_layout.get("edge_scale", 0.72),
                "avoidCornerOverlap": decorated_layout.get("avoid_corner_overlap", True),
            },
        }
        result["decorationTargets"] = dict(preset.get("decorated_targets") or {})
        result["decorationMeta"] = dict(preset.get("decorated_item_meta") or {})
        adaptive = preset.get("decorated_adaptive_layout") or {}
        result["adaptiveLayout"] = {
            "enabled": adaptive.get("enabled", False),
            "referenceShortSide": adaptive.get("reference_short_side", 1024),
            "minimumItemScale": adaptive.get("minimum_item_scale", 0.88),
            "maximumItemScale": adaptive.get("maximum_item_scale", 1),
            "minimumGapPx": adaptive.get("minimum_gap_px", 8),
            "targetGapPx": adaptive.get("target_gap_px", 16),
            "maximumGapPx": adaptive.get("maximum_gap_px", 24),
            "neverScaleWholeSequenceToFit": adaptive.get("never_scale_whole_sequence_to_fit", True),
            "overflowMode": adaptive.get("overflow_mode", "reduce-count"),
            "underflowMode": adaptive.get("underflow_mode", "repeat-primary-before-large-gap"),
            "removePriority": adaptive.get("remove_priority", ["filler", "flower", "primary"]),
            "minimumPrimaryItemsPerEdge": adaptive.get("minimum_primary_items_per_edge", 1),
            "maximumItemsPerEdge": adaptive.get("maximum_items_per_edge", 18),
            "edgeInsetRatio": adaptive.get("edge_inset_ratio", 0),
        }
    return {key: value for key, value in result.items() if value is not None}

def get_frame_asset_catalog():
    manifest_times = []
    for path in [_FRAME_MANIFEST_PATH, *(_FRAME_ROOT.glob("*/manifest.json") if _FRAME_ROOT.is_dir() else [])]:
        try:
            manifest_times.append(path.stat().st_mtime_ns)
        except OSError:
            continue
    return {
        "schemaVersion": 1,
        "assetVersion": str(max(manifest_times, default=0)),
        "frames": [_frame_preset_to_public(preset) for preset in _FRAME_PRESETS.values()],
        "warnings": list(_FRAME_DISCOVERY_WARNINGS),
    }


for _frame_id, _frame_preset in _FRAME_PRESETS.items():
    for _source_key, _asset_map in (("asset_src", _FRAME_ASSETS), ("asset_src_2x", _FRAME_ASSETS_2X)):
        _asset_src = str(_frame_preset.get(_source_key) or "").strip()
        if not _asset_src:
            continue
        _asset_map[_frame_id] = _frame_asset_path(_asset_src)


@lru_cache(maxsize=32)
def _cached_rgba_image(path, modified_ns):
    del modified_ns
    with Image.open(path) as image:
        return image.convert("RGBA").copy()


def _load_cached_rgba(path):
    try:
        modified_ns = os.stat(path).st_mtime_ns
        return _cached_rgba_image(path, modified_ns).copy()
    except (OSError, ValueError):
        return None

_SYMBOL_SFX_ASSETS = {
    "arrow-thick-right-mask",
    "arrow-thin-right-mask",
    "arrow-handdrawn-right-mask",
    "arrow-curved-right-mask",
    "arrow-wavy-right-mask",
    "arrow-loop-mask",
    "arrow-double-mask",
    "star-outline-mask",
    "star-filled-mask",
    "sparkle-four-mask",
    "sparkle-cluster-mask",
    "sparkle-radiant-mask",
    "rough-circle-mask",
    "rough-double-circle-mask",
    "scribble-ball-mask",
    "scribble-circle-loose-mask",
    "scribble-circle-oval-mask",
    "scribble-circle-heavy-mask",
    "scribble-circle-knot-mask",
    "rough-underline-mask",
    "anger-mark-small-mask",
    "sweat-drop-mask",
    "sweat-drops-mask",
    "emphasis-lines-mask",
    "shock-lines-mask",
    "tension-lines-mask",
    "worry-squiggle-mask",
    "breath-puff-mask",
    "dizzy-spiral-mask",
    "hot-spring-mask",
    "bandage-mask",
    "music-notes-mask",
    "sleep-zzz-mask",
    "lightning-zap-mask",
    "motion-swish-mask",
    "suit-club-mask",
    "basic-circle-mask",
    "basic-triangle-mask",
    "basic-square-mask",
    "basic-trapezoid-mask",
}
_BASIC_SYMBOL_KINDS = {
    "basic-circle-mask": "circle",
    "basic-triangle-mask": "triangle",
    "basic-square-mask": "square",
    "basic-trapezoid-mask": "trapezoid",
}
_MASK_SFX_ASSETS.update(_SYMBOL_SFX_ASSETS)
_MASK_SFX_ASSETS.update(
    {
        "dokkunn-vertical-gpt-v1",
        "bubyuu-vertical-gpt-v1",
        "giri-small-tsu-vertical-mask",
        "nuron-angular-vertical-mask",
        "dochu-exclamation-angular-vertical-mask",
        "chiro-vertical-uniform-mask",
        "upu-vertical-uniform-mask",
        "chuu-vertical-uniform-mask",
        "boto-small-tsu-vertical-uniform-mask",
        "dochu-vertical-uniform-mask",
        "giu-long-angular-vertical-mask",
        "hiku-small-tsu-angular-vertical-mask",
        "giu-angular-vertical-mask",
        "zuru-angular-vertical-mask",
        "dokun-hiragana-angular-vertical-mask",
        "dokun-hiragana-angular-horizontal-mask",
        "zubu-small-tsu-angular-vertical-mask",
        "sore-dame-horizontal-gpt-v1",
        "nani-kore-horizontal-gpt-v1",
        "shii-horizontal-gpt-v1",
        "naisho-horizontal-gpt-v1",
        "ikisou-horizontal-gpt-v1",
        "joo-vertical-gpt-v1",
        "gokkun-vertical-gpt-v1",
        "pushaa-vertical-gpt-v1",
        "chira-vertical-gpt-v1",
        "woo-vertical-gpt-v1",
        "rerorero-vertical-gpt-v1",
        "haa-katakana-vertical-gpt-v1",
        "dokkunn-hiragana-vertical-gpt-v1",
        "handdrawn-filled-heart-mask",
        "n-small-tsu-gpt-v2",
        "yamero-horizontal-gpt-v1",
        "sore-iku-horizontal-gpt-v1",
        "baka-vertical-gpt-v1",
    }
)
_SFX_ASSETS.update(
    {
        asset_id: os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", f"{asset_id}.webp")
        for asset_id in _SYMBOL_SFX_ASSETS
    }
)
_SFX_ASSETS.update(
    {
        asset_id: os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", f"{asset_id}.webp")
        for asset_id in {
            "n-small-tsu-gpt-v2",
            "yamero-horizontal-gpt-v1",
            "sore-iku-horizontal-gpt-v1",
            "baka-vertical-gpt-v1",
        }
    }
)
_SFX_ASSETS.update(
    {
        asset_id: os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", f"{asset_id}.webp")
        for asset_id in {"sweat-glossy", "sweat-flying"}
    }
)
_SFX_ASSETS.update(
    {
        "rarity-crown-ssr-gold": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "crown_ssr_gold.png"),
        "rarity-crown-sr-silver": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "crown_sr_silver.png"),
        "rarity-crown-r-red": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "crown_r_red.png"),
        "rarity-crown-n-green": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "crown_n_green.png"),
        "rarity-ribbon-super-rare-gold": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ribbon_super_rare_gold.png"),
        "rarity-ribbon-very-rare-silver": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ribbon_very_rare_silver.png"),
        "rarity-ribbon-rare-red": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ribbon_rare_red.png"),
        "rarity-ribbon-normal-green": os.path.join(_NODE_DIRECTORY, "web", "assets", "sfx", "ribbon_normal_green.png"),
    }
)



def rebuild_asset_caches():
    """Refresh common catalogs without importing the compatibility renderer."""
    reload_sfx_asset_catalog()
    _FRAME_DISCOVERY_WARNINGS.clear()
    _FRAME_SCALE_WARNED.clear()
    updated = _load_frame_presets()
    _FRAME_PRESETS.clear()
    _FRAME_PRESETS.update(updated)
    _FRAME_ASSETS.clear()
    _FRAME_ASSETS_2X.clear()
    for frame_id, preset in _FRAME_PRESETS.items():
        for key, target in (("asset_src", _FRAME_ASSETS), ("asset_src_2x", _FRAME_ASSETS_2X)):
            source = str(preset.get(key) or "").strip()
            if source:
                target[frame_id] = _frame_asset_path(source)
    _cached_rgba_image.cache_clear()
    return {"sfx": len(get_sfx_asset_catalog().get("items", [])), "frames": len(_FRAME_PRESETS)}
