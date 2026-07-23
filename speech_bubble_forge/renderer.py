import hashlib
import json
import math
import os
import re
from functools import lru_cache
from pathlib import Path, PurePosixPath

import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont


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


DEFAULT_LAYOUT = {
    "version": 1,
    "elements": [
        {
            "id": "bubble-1",
            "type": "bubble",
            "shape": "oval",
            "x": 580,
            "y": 120,
            "w": 330,
            "h": 250,
            "tail": "bottom-left",
            "fill": "#ffffff",
            "stroke": "#111111",
            "stroke_width": 5,
            "visible": True,
        },
        {
            "id": "text-1",
            "type": "text",
            "x": 610,
            "y": 160,
            "w": 270,
            "h": 180,
            "text": "こんにちは",
            "writing": "vertical",
            "font_size": 54,
            "tracking": 0,
            "font_scale_x": 100,
            "font_scale_y": 100,
            "font_path": "C:/Windows/Fonts/meiryo.ttc",
            "color": "#111111",
            "stroke_width": 0,
            "stroke_color": "#ffffff",
            "shadow_x": 0,
            "shadow_y": 0,
            "shadow_blur": 0,
            "shadow_color": "#000000",
            "bold": False,
            "italic": False,
            "underline": False,
            "strikethrough": False,
            "align": "center",
            "opacity": 1,
            "visible": True,
        },
    ],
}


def _parse_layout(raw):
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        data = DEFAULT_LAYOUT
    if isinstance(data, list):
        return {"version": 1, "elements": data}
    if isinstance(data, dict) and isinstance(data.get("elements"), list):
        return data
    return DEFAULT_LAYOUT


def _rgba(value, default="#00000000"):
    text = str(value or default).strip()
    try:
        if text.startswith("#") and len(text) == 9:
            return (
                int(text[1:3], 16),
                int(text[3:5], 16),
                int(text[5:7], 16),
                int(text[7:9], 16),
            )
        return ImageColor.getcolor(text, "RGBA")
    except ValueError:
        return ImageColor.getcolor(default, "RGBA")


def _font(font_path, size):
    candidates = [
        font_path,
        "C:/Windows/Fonts/meiryo.ttc",
        "C:/Windows/Fonts/YuGothM.ttc",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansJP-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if path and os.path.exists(path):
            try:
                return ImageFont.truetype(path, max(1, int(size)))
            except OSError:
                continue
    return ImageFont.load_default()


@lru_cache(maxsize=512)
def _font_path_from_id(font_id):
    if not font_id:
        return None
    roots = []
    if os.name == "nt":
        roots = [Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts", Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Windows/Fonts"]
    elif os.sys.platform == "darwin":
        roots = [Path("/System/Library/Fonts"), Path("/Library/Fonts"), Path.home() / "Library/Fonts"]
    else:
        roots = [Path("/usr/share/fonts"), Path("/usr/local/share/fonts"), Path.home() / ".fonts", Path.home() / ".local/share/fonts"]
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob("*"):
            if path.suffix.lower() not in {".ttf", ".otf", ".ttc", ".otc"}:
                continue
            normalized = str(path.resolve())
            if hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:20] == font_id:
                return normalized
    return None


def _text_size(draw, text, font):
    box = draw.textbbox((0, 0), text or " ", font=font)
    return box[2] - box[0], box[3] - box[1]


def _wrap_lines(draw, text, font, max_width, letter_spacing=0):
    lines = []
    for raw_line in str(text or "").split("\n"):
        current = ""
        for char in raw_line:
            candidate = current + char
            if current and _spaced_text_width(draw, candidate, font, letter_spacing) > max_width:
                lines.append(current)
                current = char
            else:
                current = candidate
        lines.append(current)
    return lines or [""]


def _draw_spaced_text(draw, x, y, text, font, fill, stroke_width, stroke_fill, letter_spacing=0, bold=False):
    text = str(text or "")
    if not text:
        return 0.0
    if bold:
        strength = max(1, int(round(getattr(font, "size", 16) * 0.035)))
        offsets = tuple(
            (ox, oy)
            for oy in range(max(1, strength // 2) + 1)
            for ox in range(strength + 1)
        )
    else:
        offsets = ((0, 0),)
    if abs(letter_spacing) < 0.001:
        for ox, oy in offsets:
            draw.text(
                (x + ox, y + oy),
                text,
                font=font,
                fill=fill,
                stroke_width=stroke_width,
                stroke_fill=stroke_fill,
            )
        return float(draw.textlength(text, font=font))
    cursor = x
    for index, char in enumerate(text):
        if index:
            cursor += letter_spacing
        for ox, oy in offsets:
            draw.text(
                (cursor + ox, y + oy),
                char,
                font=font,
                fill=fill,
                stroke_width=stroke_width,
                stroke_fill=stroke_fill,
            )
        cursor += draw.textlength(char, font=font)
    return cursor - x


def _spaced_text_width(draw, text, font, letter_spacing=0):
    chars = list(str(text or ""))
    if not chars:
        return 0.0
    if abs(letter_spacing) < 0.001:
        return float(draw.textlength("".join(chars), font=font))
    return sum(float(draw.textlength(char, font=font)) for char in chars) + letter_spacing * max(0, len(chars) - 1)


def _paste_clipped(target, source, x, y):
    left = max(0, int(x))
    top = max(0, int(y))
    right = min(target.width, int(x) + source.width)
    bottom = min(target.height, int(y) + source.height)
    if left >= right or top >= bottom:
        return
    crop = source.crop((left - int(x), top - int(y), right - int(x), bottom - int(y)))
    target.alpha_composite(crop, (left, top))


def _tail_points(element, scale):
    x = float(element.get("x", 0)) * scale
    y = float(element.get("y", 0)) * scale
    w = max(1.0, float(element.get("w", 1)) * scale)
    h = max(1.0, float(element.get("h", 1)) * scale)
    tail = str(element.get("tail") or "none")
    if tail == "none":
        return []
    tip_defaults = {
        "bottom-left": (0.05, 1.18),
        "bottom-right": (0.95, 1.18),
        "top-left": (0.05, -0.18),
        "top-right": (0.95, -0.18),
        "left": (-0.18, 0.50),
        "right": (1.18, 0.50),
    }
    default_tip_x, default_tip_y = tip_defaults.get(tail, (1.18, 0.50))
    tip_x = float(element.get("tail_tip_x", default_tip_x))
    tip_y = float(element.get("tail_tip_y", default_tip_y))
    dx = (tip_x - 0.5) * w
    dy = (tip_y - 0.5) * h
    length = max(1.0, math.hypot(dx, dy))
    perpendicular_x = -dy / length
    perpendicular_y = dx / length
    half_width = min(w, h) * 0.14
    points = [
        (0.5 + perpendicular_x * half_width / w, 0.5 + perpendicular_y * half_width / h),
        (0.5 - perpendicular_x * half_width / w, 0.5 - perpendicular_y * half_width / h),
        (tip_x, tip_y),
    ]
    flip_x = bool(element.get("flip_x"))
    flip_y = bool(element.get("flip_y"))
    points = [
        (x + w * (1.0 - px if flip_x else px), y + h * (1.0 - py if flip_y else py))
        for px, py in points
    ]
    return points


def _thought_tail_circles(element, scale):
    tail = str(element.get("tail") or "none")
    if tail == "none":
        return []
    x = float(element.get("x", 0)) * scale
    y = float(element.get("y", 0)) * scale
    w = max(1.0, float(element.get("w", 1)) * scale)
    h = max(1.0, float(element.get("h", 1)) * scale)
    tip_x = float(element.get("tail_tip_x", 0.95 if "right" in tail else 0.05))
    tip_y = float(element.get("tail_tip_y", -0.18 if "top" in tail else 1.18 if "bottom" in tail else 0.5))
    side = str(element.get("tail_side") or ("top" if "top" in tail else "left" if tail == "left" else "right" if tail == "right" else "bottom"))
    if side == "top":
        base_x, base_y = max(0.2, min(0.8, tip_x)), 0.08
    elif side == "left":
        base_x, base_y = 0.08, max(0.2, min(0.8, tip_y))
    elif side == "right":
        base_x, base_y = 0.92, max(0.2, min(0.8, tip_y))
    else:
        base_x, base_y = max(0.2, min(0.8, tip_x)), 0.92
    flip_x, flip_y = bool(element.get("flip_x")), bool(element.get("flip_y"))
    circles = []
    for amount, radius in zip((0.43, 0.88), (0.072, 0.038)):
        px = base_x + (tip_x - base_x) * amount
        py = base_y + (tip_y - base_y) * amount
        if flip_x:
            px = 1.0 - px
        if flip_y:
            py = 1.0 - py
        circles.append((x + px * w, y + py * h, min(w, h) * radius))
    return circles


def _expanded_mask(mask, amount):
    expanded = mask
    remaining = max(0, int(amount))
    while remaining > 0:
        radius = min(15, remaining)
        expanded = expanded.filter(ImageFilter.MaxFilter(radius * 2 + 1))
        remaining -= radius
    return expanded


def _composite_color_mask(layer, mask, color):
    rgba = tuple(color) if isinstance(color, (tuple, list)) and len(color) == 4 else _rgba(color, "#111111")
    image = Image.new("RGBA", layer.size, rgba)
    image.putalpha(mask.point(lambda value: int(value * rgba[3] / 255)) if rgba[3] < 255 else mask)
    layer.alpha_composite(image)


def _basic_symbol_alpha(size, kind, element):
    width, height = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)

    def point(x, y):
        return int(round(x)), int(round(y))

    if kind == "circle":
        radius = min(width, height) * 0.38
        center_x, center_y = width / 2, height / 2
        draw.ellipse(
            (
                int(round(center_x - radius)),
                int(round(center_y - radius)),
                int(round(center_x + radius)),
                int(round(center_y + radius)),
            ),
            fill=255,
        )
    elif kind == "triangle":
        draw.polygon(
            [
                point(width / 2, height * 0.08),
                point(width * 0.92, height * 0.90),
                point(width * 0.08, height * 0.90),
            ],
            fill=255,
        )
    elif kind == "square":
        raw_skew = float(element.get("symbol_skew", 0) or 0)
        skew = width * 0.22 * max(-1.0, min(1.0, raw_skew / 50.0))
        draw.polygon(
            [
                point(width * 0.08 + skew, height * 0.08),
                point(width * 0.92 + skew, height * 0.08),
                point(width * 0.92 - skew, height * 0.92),
                point(width * 0.08 - skew, height * 0.92),
            ],
            fill=255,
        )
    else:
        raw_top_width = float(element.get("symbol_top_width", 100) or 100)
        top_width = max(0.2, min(1.8, raw_top_width / 100.0))
        top_half = min(width * 0.48, width * 0.42 * top_width)
        bottom_half = width * 0.27
        center_x = width / 2
        draw.polygon(
            [
                point(center_x - top_half, height * 0.08),
                point(center_x + top_half, height * 0.08),
                point(center_x + bottom_half, height * 0.92),
                point(center_x - bottom_half, height * 0.92),
            ],
            fill=255,
        )
    return mask


def _all_tail_point_sets(element, scale):
    if str(element.get("tail_style") or "pointed") == "dots":
        return []
    result = []
    main = _tail_points(element, scale)
    if main:
        result.append(main)
    for tail in element.get("extra_tails") or []:
        extra = dict(element)
        extra["tail"] = tail
        extra.pop("tail_tip_x", None)
        extra.pop("tail_tip_y", None)
        extra.pop("tail_side", None)
        points = _tail_points(extra, scale)
        if points:
            result.append(points)
    return result


def _cloud_path_points(double_cloud=False):
    lobe_count = 10 if double_cloud else 9
    base = 0.35 if double_cloud else 0.34
    orbit = 0.30 if double_cloud else 0.31
    radii = (0.15, 0.16, 0.15) if double_cloud else (0.16, 0.17, 0.15)
    circles = [(0.5, 0.5, base)]
    for index in range(lobe_count):
        angle = -math.pi / 2 + index * math.pi * 2 / lobe_count
        circles.append(
            (
                0.5 + math.cos(angle) * orbit,
                0.5 + math.sin(angle) * orbit * 0.78,
                radii[index % len(radii)],
            )
        )
    count = 44 if double_cloud else 40
    anchors = []
    for index in range(count):
        angle = -math.pi / 2 + index * math.pi * 2 / count
        dx, dy = math.cos(angle), math.sin(angle)
        far = 0.01
        for cx, cy, radius in circles:
            vx, vy = cx - 0.5, cy - 0.5
            projection = dx * vx + dy * vy
            discriminant = radius * radius - (vx * vx + vy * vy - projection * projection)
            if discriminant >= 0:
                far = max(far, projection + math.sqrt(discriminant))
        anchors.append((0.5 + dx * far, 0.5 + dy * far))

    path = []
    tension = 0.42
    for index, (px, py) in enumerate(anchors):
        previous = anchors[(index - 1) % count]
        following = anchors[(index + 1) % count]
        control_x = (following[0] - previous[0]) * tension / 6
        control_y = (following[1] - previous[1]) * tension / 6
        path.append(
            {
                "x": px,
                "y": py,
                "in_x": px - control_x,
                "in_y": py - control_y,
                "out_x": px + control_x,
                "out_y": py + control_y,
            }
        )
    return path


def _fixed_thought_cloud_path_points():
    """Return the stable, rounded thinking-cloud contour used by the preset."""
    return [
        {"x": 0.15, "y": 0.37142857, "in_x": 0.082, "in_y": 0.42285714, "out_x": 0.112, "out_y": 0.3},
        {"x": 0.225, "y": 0.19285714, "in_x": 0.145, "in_y": 0.20714286, "out_x": 0.27, "out_y": 0.13142857},
        {"x": 0.39, "y": 0.18, "in_x": 0.34, "in_y": 0.12285714, "out_x": 0.43, "out_y": 0.08285714},
        {"x": 0.585, "y": 0.16, "in_x": 0.525, "in_y": 0.06, "out_x": 0.64, "out_y": 0.1},
        {"x": 0.77, "y": 0.2, "in_x": 0.735, "in_y": 0.10857143, "out_x": 0.85, "out_y": 0.17142857},
        {"x": 0.855, "y": 0.35714286, "in_x": 0.9, "in_y": 0.26, "out_x": 0.93, "out_y": 0.40285714},
        {"x": 0.865, "y": 0.54571429, "in_x": 0.936, "in_y": 0.50714286, "out_x": 0.92, "out_y": 0.63142857},
        {"x": 0.785, "y": 0.70428571, "in_x": 0.87, "in_y": 0.73571429, "out_x": 0.765, "out_y": 0.8},
        {"x": 0.615, "y": 0.77142857, "in_x": 0.68, "in_y": 0.83285714, "out_x": 0.565, "out_y": 0.86714286},
        {"x": 0.43, "y": 0.79285714, "in_x": 0.475, "in_y": 0.87428571, "out_x": 0.365, "out_y": 0.84857143},
        {"x": 0.285, "y": 0.70714286, "in_x": 0.28, "in_y": 0.8, "out_x": 0.205, "out_y": 0.73714286},
        {"x": 0.157, "y": 0.57428571, "in_x": 0.13, "in_y": 0.66, "out_x": 0.083, "out_y": 0.53142857},
    ]


def _dialogue_value(element, keys, default):
    for key in keys:
        value = element.get(key)
        if value is not None and value != "":
            return value
    return default


@lru_cache(maxsize=16)
def _load_dialogue_asset(relative_path):
    root = _SHAPE_ASSET_ROOT.resolve()
    path = (root / PurePosixPath(str(relative_path or ""))).resolve()
    if root not in path.parents or not path.is_file():
        return None
    with Image.open(path) as source:
        return source.convert("RGBA")


def _draw_dialogue_bubble(layer, element, scale):
    """Render layered dialogue-box presets without tails or path editing."""
    draw = ImageDraw.Draw(layer)
    x = float(element.get("x", 0)) * scale
    y = float(element.get("y", 0)) * scale
    w = max(1.0, float(element.get("w", 1)) * scale)
    h = max(1.0, float(element.get("h", 1)) * scale)
    style = str(element.get("dialogue_style") or "rpg").lower()
    asset = _load_dialogue_asset(element.get("dialogue_asset"))
    if asset is not None:
        resized = asset.resize(
            (max(1, int(round(w))), max(1, int(round(h)))),
            Image.Resampling.LANCZOS,
        )
        layer.alpha_composite(resized, (int(round(x)), int(round(y))))
        return
    outer_color = _rgba(_dialogue_value(element, ("dialogue_outer_color", "outer_color"), "#000000"), "#000000")
    border_color = _rgba(_dialogue_value(element, ("stroke", "dialogue_border_color", "border_color"), "#ffffff"), "#ffffff")
    fill_color = _rgba(_dialogue_value(element, ("fill", "dialogue_fill_color", "fill_color"), "#000000" if style == "rpg" else "#ffffff"), "#ffffff")
    outer_edge = max(0.0, float(_dialogue_value(element, ("dialogue_outer_edge", "outer_edge"), 5)) * scale)
    border_width = max(0.0, float(_dialogue_value(element, ("dialogue_border_width", "border_width", "stroke_width"), 4)) * scale)
    radius = max(0.0, float(_dialogue_value(element, ("dialogue_corner_radius", "corner_radius"), 20)) * scale)

    def rounded(left, top, right, bottom, corner, color):
        if right <= left or bottom <= top:
            return
        draw.rounded_rectangle(
            (int(round(left)), int(round(top)), int(round(right)), int(round(bottom))),
            radius=max(0, int(round(corner))),
            fill=color,
        )

    if style == "rpg":
        rounded(x, y, x + w, y + h, radius, outer_color)
        edge = min(outer_edge, min(w, h) / 4)
        rounded(x + edge, y + edge, x + w - edge, y + h - edge, max(0, radius - edge), border_color)
        inner = min(edge + border_width, min(w, h) / 3)
        rounded(x + inner, y + inner, x + w - inner, y + h - inner, max(0, radius - inner), fill_color)
        return

    rounded(x, y, x + w, y + h, radius, fill_color)
    if border_width > 0:
        draw.rounded_rectangle(
            (int(round(x)), int(round(y)), int(round(x + w)), int(round(y + h))),
            radius=max(0, int(round(radius))),
            outline=border_color,
            width=max(1, int(round(border_width))),
        )

    accent = border_color
    if style == "pink":
        for cx, cy, size in ((x + w * 0.14, y + h * 0.84, min(w, h) * 0.045), (x + w * 0.86, y + h * 0.16, min(w, h) * 0.04)):
            for index in range(5):
                angle = index * math.pi * 2 / 5 - math.pi / 2
                px = cx + math.cos(angle) * size * 0.72
                py = cy + math.sin(angle) * size * 0.72
                draw.ellipse((int(px - size * 0.45), int(py - size * 0.7), int(px + size * 0.45), int(py + size * 0.7)), fill=accent)
            draw.ellipse((int(cx - size * 0.18), int(cy - size * 0.18), int(cx + size * 0.18), int(cy + size * 0.18)), fill="#fff3a6")
    elif style == "blue":
        for cx, cy, size in ((0.13, 0.15, 0.018), (0.18, 0.12, 0.012), (0.86, 0.84, 0.02), (0.81, 0.88, 0.012)):
            radius_px = min(w, h) * size
            center_x, center_y = x + w * cx, y + h * cy
            draw.ellipse((int(center_x - radius_px), int(center_y - radius_px), int(center_x + radius_px), int(center_y + radius_px)), fill=accent)
    elif style == "ivory":
        line_width = max(1, int(min(w, h) * 0.008))
        points = ((x + w * 0.10, y + h * 0.86), (x + w * 0.14, y + h * 0.76), (x + w * 0.17, y + h * 0.72), (x + w * 0.22, y + h * 0.68))
        draw.line(points, fill=accent, width=line_width, joint="curve")
        for center_x, center_y, angle in ((x + w * 0.15, y + h * 0.77, -0.6), (x + w * 0.20, y + h * 0.69, 0.5)):
            radius_x, radius_y = w * 0.035, h * 0.015
            draw.ellipse((int(center_x - radius_x), int(center_y - radius_y), int(center_x + radius_x), int(center_y + radius_y)), outline=accent, width=line_width)


def _draw_bubble(layer, element, scale):
    x = float(element.get("x", 0)) * scale
    y = float(element.get("y", 0)) * scale
    w = max(1.0, float(element.get("w", 1)) * scale)
    h = max(1.0, float(element.get("h", 1)) * scale)
    if str(element.get("shape") or "") == "dialogue" or element.get("dialogue_style"):
        _draw_dialogue_bubble(layer, element, scale)
        return
    mask = Image.new("L", layer.size, 0)
    draw = ImageDraw.Draw(mask)
    fill = _rgba(element.get("fill"), "#ffffff")
    stroke = _rgba(element.get("stroke"), "#111111")
    stroke_width = max(0, int(float(element.get("stroke_width", 4)) * scale))
    tail_style = str(element.get("tail_style") or "pointed")
    stroke_style = str(element.get("stroke_style") or "solid")
    if stroke_style not in ("solid", "double"):
        stroke_style = "solid"
    tail_point_sets = _all_tail_point_sets(element, scale)
    dot_circles = _thought_tail_circles(element, scale) if tail_style == "dots" else []
    for tail_points in tail_point_sets:
        draw.polygon(tail_points, fill=255)
    for cx, cy, radius in dot_circles:
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=255)
    box = (x, y, x + w, y + h)
    shape = str(element.get("shape") or "oval")
    path_points = element.get("path_points")
    if str(element.get("preset_id") or "") == "base-thought" and element.get("user_modified_path") is not True:
        path_points = _fixed_thought_cloud_path_points()
    elif (not isinstance(path_points, list) or len(path_points) < 3) and shape in ("cloud", "double_cloud"):
        path_points = _cloud_path_points(shape == "double_cloud")
    sampled = []
    if isinstance(path_points, list) and len(path_points) >= 3:
        for index, current in enumerate(path_points):
            following = path_points[(index + 1) % len(path_points)]
            p0 = (float(current.get("x", 0)), float(current.get("y", 0)))
            p1 = (float(current.get("out_x", p0[0])), float(current.get("out_y", p0[1])))
            p3 = (float(following.get("x", 0)), float(following.get("y", 0)))
            p2 = (float(following.get("in_x", p3[0])), float(following.get("in_y", p3[1])))
            for step in range(16):
                t = step / 16.0
                inverse = 1.0 - t
                px = inverse**3 * p0[0] + 3 * inverse**2 * t * p1[0] + 3 * inverse * t**2 * p2[0] + t**3 * p3[0]
                py = inverse**3 * p0[1] + 3 * inverse**2 * t * p1[1] + 3 * inverse * t**2 * p2[1] + t**3 * p3[1]
                if element.get("flip_x"):
                    px = 1.0 - px
                if element.get("flip_y"):
                    py = 1.0 - py
                sampled.append((x + px * w, y + py * h))
        draw.polygon(sampled, fill=255)
    elif shape == "rounded_rect":
        radius = int(min(w, h) * 0.18)
        draw.rounded_rectangle(box, radius=radius, fill=255)
    elif shape == "cloud":
        draw.rounded_rectangle(box, radius=int(min(w, h) * 0.35), fill=255)
        for cx, cy, rx, ry in (
            (x + w * 0.18, y + h * 0.45, w * 0.24, h * 0.30),
            (x + w * 0.40, y + h * 0.28, w * 0.27, h * 0.36),
            (x + w * 0.66, y + h * 0.32, w * 0.30, h * 0.38),
            (x + w * 0.84, y + h * 0.52, w * 0.22, h * 0.28),
        ):
            draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=255)
    elif shape == "spike":
        points = []
        count = 24
        cx, cy = x + w / 2, y + h / 2
        for index in range(count * 2):
            angle = -math.pi / 2 + index * math.pi / count
            outer = index % 2 == 0
            rx = w * (0.56 if outer else 0.46)
            ry = h * (0.56 if outer else 0.46)
            points.append((cx + math.cos(angle) * rx, cy + math.sin(angle) * ry))
        draw.polygon(points, fill=255)
    else:
        draw.ellipse(box, fill=255)

    shadow_x = int(float(element.get("shadow_x", 0)) * scale)
    shadow_y = int(float(element.get("shadow_y", 0)) * scale)
    shadow_blur = max(0, int(float(element.get("shadow_blur", 0)) * scale))
    shadow_enabled = bool(element.get("shadow_enabled"))
    if shadow_enabled:
        shadow_mask = mask.filter(ImageFilter.GaussianBlur(shadow_blur)) if shadow_blur else mask
        shadow_color = _rgba(element.get("shadow_color"), "#000000")
        shadow = Image.new("RGBA", layer.size, shadow_color)
        if shadow_color[3] < 255:
            shadow_alpha = shadow_mask.point(lambda value: int(value * shadow_color[3] / 255))
            shadow.putalpha(shadow_alpha)
        else:
            shadow.putalpha(shadow_mask)
        _paste_clipped(layer, shadow, shadow_x, shadow_y)

    if stroke_width > 0:
        if stroke_style == "double":
            _composite_color_mask(layer, _expanded_mask(mask, stroke_width * 2.35), stroke)
            _composite_color_mask(layer, _expanded_mask(mask, stroke_width * 1.45), fill)
            _composite_color_mask(layer, _expanded_mask(mask, stroke_width * 0.65), stroke)
        else:
            _composite_color_mask(layer, _expanded_mask(mask, stroke_width), stroke)

    body = Image.new("RGBA", layer.size, fill)
    if fill[3] < 255:
        body_alpha = mask.point(lambda value: int(value * fill[3] / 255))
        body.putalpha(body_alpha)
    else:
        body.putalpha(mask)
    layer.alpha_composite(body)

def _apply_element_opacity(layer, element):
    opacity = max(0.0, min(1.0, float(element.get("opacity", 1))))
    if opacity < 1:
        layer.putalpha(layer.getchannel("A").point(lambda value: int(value * opacity)))
    return layer

    decoration_style = element.get("decoration_style")
    if decoration_style == "overlap" and stroke_width > 0:
        decoration = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        decoration_draw = ImageDraw.Draw(decoration)
        controls = ((0.60, 0.19), (0.47, 0.34), (0.47, 0.68), (0.57, 0.84))
        points = []
        for index in range(33):
            t = index / 32.0
            inverse = 1.0 - t
            px = inverse**3 * controls[0][0] + 3 * inverse**2 * t * controls[1][0] + 3 * inverse * t**2 * controls[2][0] + t**3 * controls[3][0]
            py = inverse**3 * controls[0][1] + 3 * inverse**2 * t * controls[1][1] + 3 * inverse * t**2 * controls[2][1] + t**3 * controls[3][1]
            if element.get("flip_x"):
                px = 1.0 - px
            if element.get("flip_y"):
                py = 1.0 - py
            points.append((x + px * w, y + py * h))
        decoration_draw.line(points, fill=stroke, width=max(1, int(stroke_width * 1.5)), joint="curve")
        layer.alpha_composite(decoration)
    elif decoration_style == "radiant" and stroke_width > 0:
        decoration = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        decoration_draw = ImageDraw.Draw(decoration)
        ray_count = 192
        for index in range(ray_count):
            wave_a = math.sin((index + 1) * 12.9898) * 0.5 + 0.5
            wave_b = math.sin((index + 1) * 78.233) * 0.5 + 0.5
            wave_c = math.sin((index + 1) * 37.719) * 0.5 + 0.5
            angle = -math.pi / 2 + index * math.pi * 2 / ray_count + (wave_c - 0.5) * 0.009
            inner = 1.0 + wave_a * 0.018
            outer = 1.05 + wave_b**2 * 0.18
            start_x = 0.5 + math.cos(angle) * 0.49 * inner
            start_y = 0.5 + math.sin(angle) * 0.49 * inner
            end_x = 0.5 + math.cos(angle) * 0.49 * outer
            end_y = 0.5 + math.sin(angle) * 0.49 * outer
            if element.get("flip_x"):
                start_x, end_x = 1.0 - start_x, 1.0 - end_x
            if element.get("flip_y"):
                start_y, end_y = 1.0 - start_y, 1.0 - end_y
            alpha = int(70 + wave_c * 125)
            ray_color = (stroke[0], stroke[1], stroke[2], min(stroke[3], alpha))
            decoration_draw.line(
                (x + start_x * w, y + start_y * h, x + end_x * w, y + end_y * h),
                fill=ray_color,
                width=max(1, int(stroke_width * (0.09 + wave_a * 0.18))),
            )
        layer.alpha_composite(decoration)


def _draw_text_layer(layer, element, default_font_path, scale):
    x = float(element.get("x", 0)) * scale
    y = float(element.get("y", 0)) * scale
    box_w = max(1.0, float(element.get("w", 1)) * scale)
    box_h = max(1.0, float(element.get("h", 1)) * scale)
    font_scale_x = max(0.1, min(5.0, float(element.get("font_scale_x", 100)) / 100.0))
    font_scale_y = max(0.1, min(5.0, float(element.get("font_scale_y", 100)) / 100.0))
    logical_box_w = box_w / font_scale_x
    logical_box_h = box_h / font_scale_y
    size = max(1, int(float(element.get("font_size", 48)) * scale))
    font = _font(element.get("font_path") or _font_path_from_id(str(element.get("font_id") or "")) or default_font_path, size)
    text = str(element.get("text") or "")
    writing = str(element.get("writing") or "horizontal")
    color = _rgba(element.get("color"), "#111111")
    stroke_color = _rgba(element.get("stroke_color"), "#ffffff")
    stroke_width = max(0, int(float(element.get("stroke_width", 0)) * scale))
    shadow_x = int(float(element.get("shadow_x", 0)) * scale)
    shadow_y = int(float(element.get("shadow_y", 0)) * scale)
    shadow_blur = max(0, int(float(element.get("shadow_blur", 0)) * scale))
    shadow_color = _rgba(element.get("shadow_color"), "#000000")
    shadow_enabled = bool(element.get("shadow_enabled", shadow_x or shadow_y or shadow_blur))
    bold = bool(element.get("bold"))
    if "tracking" in element:
        try:
            tracking = math.floor(float(element.get("tracking", 0)) + 0.5)
        except (TypeError, ValueError):
            tracking = 0
        tracking = max(-200, min(500, tracking))
        letter_spacing = size * tracking / 1000.0
    else:
        letter_spacing = float(element.get("letter_spacing", 0)) * scale
    letter_spacing = max(-size * 0.8, letter_spacing)
    measure = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    local_shadow_x = int(round(shadow_x / font_scale_x))
    local_shadow_y = int(round(shadow_y / font_scale_y))
    local_shadow_blur = max(0, int(round(shadow_blur / math.sqrt(font_scale_x * font_scale_y))))
    padding_x = max(
        4 / font_scale_x,
        stroke_width * 2 + (max(abs(local_shadow_x), local_shadow_blur) if shadow_enabled else 0),
    )
    padding_y = max(
        4 / font_scale_y,
        stroke_width * 2 + (max(abs(local_shadow_y), local_shadow_blur) if shadow_enabled else 0),
    )

    if writing.startswith("vertical"):
        columns = [list(line) for line in text.split("\n")]
        char_w = max(1, int(round(size * 1.2)))
        char_h = max(1, int(round(max(size * 0.25, size * 1.15 + letter_spacing))))
        content_w = max(char_w, char_w * max(1, len(columns)))
        content_h = max(char_h, char_h * max([len(line) for line in columns] or [1]))
        local = Image.new(
            "RGBA",
            (
                max(int(round(logical_box_w)), int(round(content_w + padding_x * 2))),
                max(int(round(logical_box_h)), int(round(content_h + padding_y * 2))),
            ),
            (0, 0, 0, 0),
        )
        draw = ImageDraw.Draw(local)
        for column_index, chars in enumerate(columns):
            if writing == "vertical-lr":
                cx = padding_x + column_index * char_w
            else:
                cx = local.width - padding_x - (column_index + 1) * char_w
            for char_index, char in enumerate(chars):
                cy = padding_y + char_index * char_h
                _draw_spaced_text(draw, cx, cy, char, font, color, stroke_width, stroke_color, 0, bold)
    else:
        wrap = bool(element.get("wrap", False))
        lines = _wrap_lines(measure, text, font, max(1, logical_box_w - padding_x * 2), letter_spacing) if wrap else text.split("\n")
        line_height = max(1, int(round(size * 1.2)))
        content_w = max([_spaced_text_width(measure, line, font, letter_spacing) for line in lines] or [1])
        content_h = line_height * max(1, len(lines))
        local = Image.new(
            "RGBA",
            (
                max(int(round(logical_box_w)), int(round(content_w + padding_x * 2))),
                max(int(round(logical_box_h)), int(round(content_h + padding_y * 2))),
            ),
            (0, 0, 0, 0),
        )
        draw = ImageDraw.Draw(local)
        align = str(element.get("align") or "center")
        y_cursor = padding_y
        for line in lines:
            line_w = _spaced_text_width(measure, line, font, letter_spacing)
            if align == "left":
                draw_x = padding_x
            elif align == "right":
                draw_x = local.width - padding_x - line_w
            else:
                draw_x = (local.width - line_w) / 2
            _draw_spaced_text(draw, draw_x, y_cursor, line, font, color, stroke_width, stroke_color, letter_spacing, bold)
            if element.get("underline") or element.get("strikethrough"):
                deco = color
                line_width = max(1, int(size / 18))
                if element.get("underline"):
                    draw.line((draw_x, y_cursor + size, draw_x + line_w, y_cursor + size), fill=deco, width=line_width)
                if element.get("strikethrough"):
                    mid = y_cursor + size * 0.55
                    draw.line((draw_x, mid, draw_x + line_w, mid), fill=deco, width=line_width)
            y_cursor += line_height

    if shadow_enabled and (local_shadow_x or local_shadow_y or local_shadow_blur):
        shadow = Image.new("RGBA", local.size, (0, 0, 0, 0))
        shadow_alpha = local.getchannel("A")
        shadow_colored = Image.new("RGBA", local.size, shadow_color)
        shadow_colored.putalpha(shadow_alpha)
        if local_shadow_blur:
            shadow_colored = shadow_colored.filter(ImageFilter.GaussianBlur(local_shadow_blur))
        _paste_clipped(shadow, shadow_colored, local_shadow_x, local_shadow_y)
        local = Image.alpha_composite(shadow, local)

    if element.get("italic"):
        shear = max(1, int(local.height * 0.18))
        local = local.transform(
            (local.width + shear, local.height),
            Image.Transform.AFFINE,
            (1, -0.18, shear, 0, 1, 0),
            resample=Image.Resampling.BICUBIC,
        )

    scaled_size = (
        max(1, int(round(local.width * font_scale_x))),
        max(1, int(round(local.height * font_scale_y))),
    )
    if scaled_size != local.size:
        local = local.resize(scaled_size, Image.Resampling.LANCZOS)

    rotation = float(element.get("rotation", 0) or 0)
    if rotation % 360:
        local = local.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)

    paste_x = int(round(x + box_w / 2 - local.width / 2))
    paste_y = int(round(y + box_h / 2 - local.height / 2))
    opacity = max(0.0, min(1.0, float(element.get("opacity", 1))))
    if opacity < 1:
        alpha = local.getchannel("A").point(lambda value: int(value * opacity))
        local.putalpha(alpha)
    _paste_clipped(layer, local, paste_x, paste_y)


def _draw_sfx_stamp(layer, element, scale):
    asset_id = str(element.get("asset_id") or "")
    symbol_kind = _BASIC_SYMBOL_KINDS.get(asset_id)
    box_w = max(1, int(round(float(element.get("w", 1)) * scale)))
    box_h = max(1, int(round(float(element.get("h", 1)) * scale)))
    if symbol_kind:
        alpha = _basic_symbol_alpha((box_w, box_h), symbol_kind, element)
        source = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    else:
        asset_path = _sfx_asset_path(asset_id)
        if not asset_path or not os.path.isfile(asset_path):
            return
        with Image.open(asset_path) as source_image:
            source = source_image.convert("RGBA").resize((box_w, box_h), Image.Resampling.LANCZOS)

    dynamic_mask = next((item.get("mask") for item in get_sfx_asset_catalog().get("items", []) if item.get("id") == asset_id), False)
    outline_width = max(0, int(round(float(element.get("stroke_width", 3 if dynamic_mask else 0)) * scale)))
    if symbol_kind or asset_id in _MASK_SFX_ASSETS or dynamic_mask:
        if not symbol_kind:
            alpha = source.getchannel("A")
        styled = Image.new("RGBA", source.size, (0, 0, 0, 0))
        if outline_width:
            outline_mask = _expanded_mask(alpha, outline_width)
            _composite_color_mask(styled, outline_mask, _rgba(element.get("stroke"), "#111111"))
        _composite_color_mask(styled, alpha, _rgba(element.get("fill"), "#ffffff"))
        source = styled
    elif outline_width:
        source_alpha = source.getchannel("A")
        padded_size = (source.width + outline_width * 2, source.height + outline_width * 2)
        padded_alpha = Image.new("L", padded_size, 0)
        padded_alpha.paste(source_alpha, (outline_width, outline_width))
        outlined = Image.new("RGBA", padded_size, (0, 0, 0, 0))
        _composite_color_mask(outlined, _expanded_mask(padded_alpha, outline_width), _rgba(element.get("stroke"), "#111111"))
        outlined.alpha_composite(source, (outline_width, outline_width))
        source = outlined

    if element.get("flip_x"):
        source = source.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if element.get("flip_y"):
        source = source.transpose(Image.Transpose.FLIP_TOP_BOTTOM)

    shadow_enabled = bool(element.get("shadow_enabled"))
    shadow_x = int(round(float(element.get("shadow_x", 0)) * scale))
    shadow_y = int(round(float(element.get("shadow_y", 0)) * scale))
    shadow_blur = max(0, int(round(float(element.get("shadow_blur", 0)) * scale)))
    padding = max(abs(shadow_x), abs(shadow_y), shadow_blur * 2) + 2 if shadow_enabled else 0
    local = Image.new("RGBA", (source.width + padding * 2, source.height + padding * 2), (0, 0, 0, 0))

    if shadow_enabled:
        shadow_alpha = source.getchannel("A")
        if shadow_blur:
            shadow_alpha = shadow_alpha.filter(ImageFilter.GaussianBlur(shadow_blur))
        shadow_color = _rgba(element.get("shadow_color"), "#000000")
        if shadow_color[3] < 255:
            shadow_alpha = shadow_alpha.point(lambda value: int(value * shadow_color[3] / 255))
        shadow = Image.new("RGBA", source.size, shadow_color)
        shadow.putalpha(shadow_alpha)
        local.alpha_composite(shadow, (padding + shadow_x, padding + shadow_y))

    local.alpha_composite(source, (padding, padding))
    opacity = max(0.0, min(1.0, float(element.get("opacity", 1))))
    if opacity < 1:
        local.putalpha(local.getchannel("A").point(lambda value: int(value * opacity)))

    rotation = float(element.get("rotation", 0) or 0)
    if rotation % 360:
        local = local.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)

    center_x = (float(element.get("x", 0)) + float(element.get("w", 1)) / 2) * scale
    center_y = (float(element.get("y", 0)) + float(element.get("h", 1)) / 2) * scale
    paste_x = int(round(center_x - local.width / 2))
    paste_y = int(round(center_y - local.height / 2))
    _paste_clipped(layer, local, paste_x, paste_y)


def _frame_bounds(element, canvas_width, canvas_height):
    fit_to_canvas = bool(element.get("fit_to_canvas", False))
    if not fit_to_canvas:
        return (
            float(element.get("x", 0) or 0),
            float(element.get("y", 0) or 0),
            max(1.0, float(element.get("w", canvas_width) or canvas_width)),
            max(1.0, float(element.get("h", canvas_height) or canvas_height)),
            False,
        )
    inset = float(element.get("frame_inset", 0) or 0)
    maximum_inset = max(0.0, min(float(canvas_width), float(canvas_height)) / 2.0 - 0.5)
    inset = max(-maximum_inset, min(maximum_inset, inset))
    return (
        inset,
        inset,
        max(1.0, float(canvas_width) - inset * 2.0),
        max(1.0, float(canvas_height) - inset * 2.0),
        True,
    )


def _frame_slice_pixels(slice_data, source_width, source_height):
    data = slice_data if isinstance(slice_data, dict) else {}
    units = str(data.get("units") or "px").lower()

    def value(key, dimension, fallback):
        raw = data.get(key, fallback)
        try:
            number = float(raw)
        except (TypeError, ValueError):
            number = fallback
        if units == "ratio":
            number *= dimension
        return max(1, min(dimension // 2 - 1, int(round(number))))

    return (
        value("left", source_width, 150),
        value("top", source_height, 150),
        value("right", source_width, 150),
        value("bottom", source_height, 150),
    )


def _edge_repeat_layout(box_width, box_height, part_sizes, part_scale, layout=None):
    """Return un-stretched edge/corner placements for an edge-repeat frame."""
    required = {
        "corner_tl", "corner_tr", "corner_bl", "corner_br",
        "edge_top", "edge_bottom", "edge_left", "edge_right",
    }
    if not required.issubset(part_sizes):
        return []

    box_width = max(1.0, float(box_width))
    box_height = max(1.0, float(box_height))
    part_scale = max(0.001, float(part_scale))
    layout = layout if isinstance(layout, dict) else {}
    minimum_tiles = max(0, min(512, int(layout.get("minimum_tiles", 1) or 0)))
    maximum_tiles = max(1, min(512, int(layout.get("maximum_tiles", 64) or 64)))

    def source_size(key):
        width, height = part_sizes[key]
        return max(1.0, float(width)), max(1.0, float(height))

    tl_w, tl_h = source_size("corner_tl")
    tr_w, tr_h = source_size("corner_tr")
    bl_w, bl_h = source_size("corner_bl")
    br_w, br_h = source_size("corner_br")
    fit_limits = [
        box_width / max(1.0, tl_w + tr_w),
        box_width / max(1.0, bl_w + br_w),
        box_height / max(1.0, tl_h + bl_h),
        box_height / max(1.0, tr_h + br_h),
    ]
    part_scale = min(part_scale, *fit_limits)

    scaled = {
        key: (max(1.0, width * part_scale), max(1.0, height * part_scale))
        for key, (width, height) in part_sizes.items()
    }
    placements = []

    def repeat_horizontal(key, start, end, y):
        tile_w, tile_h = scaled[key]
        available = end - start
        if available <= 0 or tile_w > available:
            return
        natural_count = int(available // tile_w)
        if natural_count < max(1, minimum_tiles):
            return
        count = min(natural_count, maximum_tiles)
        gap = max(0.0, (available - count * tile_w) / (count + 1))
        for index in range(count):
            placements.append((key, start + gap + index * (tile_w + gap), y, tile_w, tile_h))

    def repeat_vertical(key, start, end, x):
        tile_w, tile_h = scaled[key]
        available = end - start
        if available <= 0 or tile_h > available:
            return
        natural_count = int(available // tile_h)
        if natural_count < max(1, minimum_tiles):
            return
        count = min(natural_count, maximum_tiles)
        gap = max(0.0, (available - count * tile_h) / (count + 1))
        for index in range(count):
            placements.append((key, x, start + gap + index * (tile_h + gap), tile_w, tile_h))

    tl = scaled["corner_tl"]
    tr = scaled["corner_tr"]
    bl = scaled["corner_bl"]
    br = scaled["corner_br"]
    repeat_horizontal("edge_top", tl[0], box_width - tr[0], 0)
    bottom_height = scaled["edge_bottom"][1]
    repeat_horizontal("edge_bottom", bl[0], box_width - br[0], box_height - bottom_height)
    repeat_vertical("edge_left", tl[1], box_height - bl[1], 0)
    right_width = scaled["edge_right"][0]
    repeat_vertical("edge_right", tr[1], box_height - br[1], box_width - right_width)

    placements.extend(
        [
            ("corner_tl", 0, 0, tl[0], tl[1]),
            ("corner_tr", box_width - tr[0], 0, tr[0], tr[1]),
            ("corner_bl", 0, box_height - bl[1], bl[0], bl[1]),
            ("corner_br", box_width - br[0], box_height - br[1], br[0], br[1]),
        ]
    )
    return placements


def _draw_edge_repeat_frame(local, preset, frame_scale):
    part_sources = preset.get("parts") if isinstance(preset.get("parts"), dict) else {}
    part_images = {}
    for key, asset_src in part_sources.items():
        path = _frame_asset_path(asset_src)
        if not path or not os.path.exists(path):
            return False
        image = _load_cached_rgba(path)
        if image is None:
            return False
        part_images[key] = image

    source_size = preset.get("source_size") if isinstance(preset.get("source_size"), dict) else {}
    native_short_side = max(
        1.0,
        min(float(source_size.get("width", 1024) or 1024), float(source_size.get("height", 1536) or 1536)),
    )
    part_scale = min(local.width, local.height) / native_short_side * frame_scale
    placements = _edge_repeat_layout(
        local.width,
        local.height,
        {key: image.size for key, image in part_images.items()},
        part_scale,
        preset.get("layout"),
    )
    if not placements:
        return False
    for key, x, y, width, height in placements:
        image = part_images[key]
        draw_size = (max(1, int(round(width))), max(1, int(round(height))))
        if image.size != draw_size:
            image = image.resize(draw_size, Image.Resampling.LANCZOS)
        _paste_clipped(local, image, int(round(x)), int(round(y)))
    return True



def _decorated_border_layout(box_width, box_height, part_sizes, edge_sequences, part_scale, layout=None, filler_sequences=None):
    """Place independent corner/edge decorations without stretching them."""
    box_width = max(1.0, float(box_width))
    box_height = max(1.0, float(box_height))
    part_scale = max(0.001, float(part_scale))
    layout = layout if isinstance(layout, dict) else {}
    corner_scale = part_scale * max(0.05, float(layout.get("corner_scale", 1) or 1))
    edge_scale = part_scale * max(0.05, float(layout.get("edge_scale", 0.72) or 0.72))
    corner_keys = ("corner_tl", "corner_tr", "corner_bl", "corner_br")
    corners = {
        key: (max(1.0, part_sizes[key][0] * corner_scale), max(1.0, part_sizes[key][1] * corner_scale))
        for key in corner_keys if key in part_sizes
    }
    for key in corner_keys:
        corners.setdefault(key, (0.0, 0.0))
    fit = min(
        1.0,
        box_width / max(1.0, corners["corner_tl"][0] + corners["corner_tr"][0]),
        box_width / max(1.0, corners["corner_bl"][0] + corners["corner_br"][0]),
        box_height / max(1.0, corners["corner_tl"][1] + corners["corner_bl"][1]),
        box_height / max(1.0, corners["corner_tr"][1] + corners["corner_br"][1]),
    )
    if fit < 1.0:
        corners = {key: (width * fit, height * fit) for key, (width, height) in corners.items()}
        edge_scale *= fit

    placements = []
    for key, x, y in (
        ("corner_tl", 0.0, 0.0),
        ("corner_tr", box_width - corners["corner_tr"][0], 0.0),
        ("corner_bl", 0.0, box_height - corners["corner_bl"][1]),
        ("corner_br", box_width - corners["corner_br"][0], box_height - corners["corner_br"][1]),
    ):
        width, height = corners[key]
        if width > 0 and height > 0:
            placements.append((key, x, y, width, height))

    def place_edge(side, sequence, start, end, scale_factor):
        ids = [item_id for item_id in sequence if item_id in part_sizes]
        if not ids:
            return
        sizes = [(max(1.0, part_sizes[item_id][0] * scale_factor), max(1.0, part_sizes[item_id][1] * scale_factor)) for item_id in ids]
        horizontal = side in {"top", "bottom"}
        available = max(0.0, end - start)
        primary_total = sum(size[0] if horizontal else size[1] for size in sizes)
        if available <= 0 or primary_total <= 0:
            return
        shrink = min(1.0, available / primary_total)
        if shrink < 1.0:
            sizes = [(width * shrink, height * shrink) for width, height in sizes]
            primary_total *= shrink
        gap = max(0.0, (available - primary_total) / (len(ids) + 1))
        cursor = start + gap
        for item_id, (draw_width, draw_height) in zip(ids, sizes):
            if side == "top":
                x, y = cursor, 0.0
                cursor += draw_width + gap
            elif side == "bottom":
                x, y = cursor, box_height - draw_height
                cursor += draw_width + gap
            elif side == "left":
                x, y = 0.0, cursor
                cursor += draw_height + gap
            else:
                x, y = box_width - draw_width, cursor
                cursor += draw_height + gap
            placements.append((item_id, x, y, draw_width, draw_height))

    sequences = edge_sequences if isinstance(edge_sequences, dict) else {}
    place_edge("top", sequences.get("top", []), corners["corner_tl"][0], box_width - corners["corner_tr"][0], edge_scale)
    place_edge("bottom", sequences.get("bottom", []), corners["corner_bl"][0], box_width - corners["corner_br"][0], edge_scale)
    place_edge("left", sequences.get("left", []), corners["corner_tl"][1], box_height - corners["corner_bl"][1], edge_scale)
    place_edge("right", sequences.get("right", []), corners["corner_tr"][1], box_height - corners["corner_br"][1], edge_scale)
    fillers = filler_sequences if isinstance(filler_sequences, dict) else {}
    filler_scale = edge_scale * max(0.05, float(layout.get("filler_scale", 0.42) or 0.42))
    place_edge("top", fillers.get("top", []), corners["corner_tl"][0], box_width - corners["corner_tr"][0], filler_scale)
    place_edge("bottom", fillers.get("bottom", []), corners["corner_bl"][0], box_width - corners["corner_br"][0], filler_scale)
    place_edge("left", fillers.get("left", []), corners["corner_tl"][1], box_height - corners["corner_bl"][1], filler_scale)
    place_edge("right", fillers.get("right", []), corners["corner_tr"][1], box_height - corners["corner_br"][1], filler_scale)
    return placements


def _rounded_rectangle_polyline(width, height, inset, radius, arc_steps=14):
    inset = max(0.0, float(inset))
    left, top = inset, inset
    right, bottom = max(left, float(width) - inset), max(top, float(height) - inset)
    radius = max(0.0, min(float(radius), (right - left) / 2.0, (bottom - top) / 2.0))
    if radius <= 0:
        return [(left, top), (right, top), (right, bottom), (left, bottom), (left, top)]
    points = []
    centers = [
        (right - radius, top + radius, -math.pi / 2, 0),
        (right - radius, bottom - radius, 0, math.pi / 2),
        (left + radius, bottom - radius, math.pi / 2, math.pi),
        (left + radius, top + radius, math.pi, math.pi * 1.5),
    ]
    for center_x, center_y, start, end in centers:
        for index in range(arc_steps + 1):
            angle = start + (end - start) * index / arc_steps
            points.append((center_x + math.cos(angle) * radius, center_y + math.sin(angle) * radius))
    points.append(points[0])
    return points


def _draw_patterned_polyline(draw, points, fill, width, style, dash=None):
    width = max(1, int(round(width)))
    if style == "solid":
        draw.line(points, fill=fill, width=width, joint="curve")
        return
    dash = [max(0.1, float(value)) for value in (dash or [])]
    if len(dash) < 2:
        dash = [max(1.0, width * (0.25 if style == "dotted" else 2.4)), max(1.0, width * 2.2)]
    pattern_index = 0
    remaining = dash[0]
    on = True
    for start, end in zip(points, points[1:]):
        x0, y0 = start
        x1, y1 = end
        dx, dy = x1 - x0, y1 - y0
        segment_length = math.hypot(dx, dy)
        if segment_length <= 1e-6:
            continue
        consumed = 0.0
        while consumed < segment_length - 1e-6:
            take = min(remaining, segment_length - consumed)
            t0 = consumed / segment_length
            t1 = (consumed + take) / segment_length
            ax, ay = x0 + dx * t0, y0 + dy * t0
            bx, by = x0 + dx * t1, y0 + dy * t1
            if on:
                if style == "dotted":
                    cx, cy = (ax + bx) / 2.0, (ay + by) / 2.0
                    radius = width / 2.0
                    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=fill)
                else:
                    draw.line((ax, ay, bx, by), fill=fill, width=width)
            consumed += take
            remaining -= take
            if remaining <= 1e-6:
                pattern_index = (pattern_index + 1) % len(dash)
                remaining = dash[pattern_index]
                on = pattern_index % 2 == 0


def _draw_procedural_base_border(local, preset, frame_scale):
    base = preset.get("base_border") if isinstance(preset.get("base_border"), dict) else {}
    if base.get("enabled") is False:
        return True
    layers = base.get("layers") if isinstance(base.get("layers"), list) else []
    if not layers:
        return False
    source_size = preset.get("source_size") if isinstance(preset.get("source_size"), dict) else {}
    native_short = max(1.0, min(float(source_size.get("width", 1024) or 1024), float(source_size.get("height", 1536) or 1536)))
    unit_scale = min(local.width, local.height) / native_short * frame_scale
    draw = ImageDraw.Draw(local)
    base_inset = float(base.get("inset", 0) or 0) * unit_scale
    base_radius = float(base.get("radius", 0) or 0) * unit_scale
    for layer in layers:
        line_width = max(1.0, float(layer.get("width", 1) or 1) * unit_scale)
        inset = base_inset + float(layer.get("offset", 0) or 0) * unit_scale + line_width / 2.0
        points = _rounded_rectangle_polyline(local.width, local.height, inset, base_radius)
        dash = [float(value) * unit_scale for value in (layer.get("dash") or [])]
        _draw_patterned_polyline(
            draw,
            points,
            _rgba(layer.get("color"), "#ffffff"),
            line_width,
            str(layer.get("style") or "solid"),
            dash,
        )
    return True


def _draw_decorated_border_frame(local, preset, frame_scale):
    if not _draw_procedural_base_border(local, preset, frame_scale):
        return False
    images = {}
    for key, asset_src in (preset.get("decorated_corners") or {}).items():
        if not asset_src:
            continue
        path = _frame_asset_path(asset_src)
        image = _load_cached_rgba(path) if path and os.path.exists(path) else None
        if image is None:
            return False
        images[key] = image
    for key, asset_src in (preset.get("decorated_items") or {}).items():
        path = _frame_asset_path(asset_src)
        image = _load_cached_rgba(path) if path and os.path.exists(path) else None
        if image is None:
            return False
        images[key] = image
    source_size = preset.get("source_size") if isinstance(preset.get("source_size"), dict) else {}
    native_short = max(1.0, min(float(source_size.get("width", 1024) or 1024), float(source_size.get("height", 1536) or 1536)))
    part_scale = min(local.width, local.height) / native_short * frame_scale
    part_sizes = {}
    for key, image in images.items():
        width, height = image.size
        target_width = float((preset.get("decorated_targets") or {}).get(key, 0) or 0)
        if target_width > 0:
            target_scale = target_width / max(1.0, float(max(width, height)))
            width *= target_scale
            height *= target_scale
        part_sizes[key] = (width, height)
    placements = _decorated_border_layout(
        local.width,
        local.height,
        part_sizes,
        preset.get("decorated_edges"),
        part_scale,
        preset.get("decorated_layout"),
        preset.get("decorated_fillers"),
    )
    for key, x, y, width, height in placements:
        image = images.get(key)
        if image is None:
            continue
        draw_size = (max(1, int(round(width))), max(1, int(round(height))))
        if image.size != draw_size:
            image = image.resize(draw_size, Image.Resampling.LANCZOS)
        _paste_clipped(local, image, int(round(x)), int(round(y)))
    return True

def _effect_rgba(value, default, opacity):
    red, green, blue, alpha = _rgba(value, default)
    alpha = int(round(alpha * max(0.0, min(1.0, float(opacity)))))
    return red, green, blue, max(0, min(255, alpha))


def _apply_frame_effects(local, element, scale):
    shadow_enabled = bool(element.get("shadow_enabled", False))
    glow_enabled = bool(element.get("glow_enabled", False))
    shadow_x = int(round(float(element.get("shadow_x", 0) or 0) * scale))
    shadow_y = int(round(float(element.get("shadow_y", 0) or 0) * scale))
    shadow_blur = max(0.0, float(element.get("shadow_blur", 0) or 0) * scale)
    glow_blur = max(0.0, float(element.get("glow_blur", 0) or 0) * scale)
    glow_spread = max(0.0, float(element.get("glow_spread", 0) or 0) * scale)
    shadow_extent = int(math.ceil(shadow_blur * 3.0 + max(abs(shadow_x), abs(shadow_y))))
    glow_extent = int(math.ceil(glow_blur * 3.0 + glow_spread))
    padding = max(0, shadow_extent if shadow_enabled else 0, glow_extent if glow_enabled else 0)
    if not padding and not shadow_enabled and not glow_enabled:
        result = local
    else:
        result = Image.new(
            "RGBA",
            (local.width + padding * 2, local.height + padding * 2),
            (0, 0, 0, 0),
        )
        source_alpha = local.getchannel("A")
        if glow_enabled:
            glow_mask = Image.new("L", result.size, 0)
            glow_mask.paste(source_alpha, (padding, padding))
            spread_radius = int(round(glow_spread))
            if spread_radius > 0:
                spread_radius = min(63, spread_radius)
                glow_mask = glow_mask.filter(ImageFilter.MaxFilter(spread_radius * 2 + 1))
            if glow_blur > 0:
                glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(glow_blur))
            glow = Image.new(
                "RGBA",
                result.size,
                _effect_rgba(
                    element.get("glow_color"),
                    "#ffffff",
                    element.get("glow_opacity", 0.75),
                ),
            )
            glow_alpha = glow.getchannel("A")
            glow.putalpha(
                Image.eval(
                    glow_mask,
                    lambda value: int(value * glow_alpha.getextrema()[1] / 255),
                )
            )
            result.alpha_composite(glow)
        if shadow_enabled:
            shadow_mask = Image.new("L", result.size, 0)
            shadow_mask.paste(source_alpha, (padding + shadow_x, padding + shadow_y))
            if shadow_blur > 0:
                shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(shadow_blur))
            shadow = Image.new(
                "RGBA",
                result.size,
                _effect_rgba(
                    element.get("shadow_color"),
                    "#000000",
                    element.get("shadow_opacity", 0.55),
                ),
            )
            shadow_alpha_value = shadow.getchannel("A").getextrema()[1]
            shadow.putalpha(
                Image.eval(
                    shadow_mask,
                    lambda value: int(value * shadow_alpha_value / 255),
                )
            )
            result.alpha_composite(shadow)
        result.alpha_composite(local, (padding, padding))

    opacity = max(0.0, min(1.0, float(element.get("opacity", 1) or 0)))
    if opacity < 1:
        result.putalpha(result.getchannel("A").point(lambda value: int(value * opacity)))
    return result


def _draw_frame_asset(layer, element, scale, canvas_width, canvas_height):
    preset_id = str(element.get("frame_preset_id") or "")
    preset = _FRAME_PRESETS.get(preset_id, {})
    x, y, width, height, fit_to_canvas = _frame_bounds(element, canvas_width, canvas_height)
    box_w = max(1, int(round(width * scale)))
    box_h = max(1, int(round(height * scale)))
    mode = str(
        element.get("frame_mode")
        or preset.get("render_mode")
        or preset.get("frame_mode")
        or "nine-slice"
    )
    local = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))

    if mode in {"edge-repeat", "decorated-border"}:
        frame_scale = max(0.1, min(4.0, float(element.get("frame_scale", preset.get("default_scale", 100)) or 100) / 100.0))
        source_size = preset.get("source_size") if isinstance(preset.get("source_size"), dict) else {}
        native_short_side = max(
            1.0,
            min(float(source_size.get("width", 1024) or 1024), float(source_size.get("height", 1536) or 1536)),
        )
        source_scale = min(width, height) / native_short_side * frame_scale
        if source_scale > 1.25:
            warning_key = (preset_id, round(source_scale, 2))
            if warning_key not in _FRAME_SCALE_WARNED:
                _FRAME_SCALE_WARNED.add(warning_key)
                action = "replace or regenerate the frame master" if source_scale > 1.5 else "check decorative part sharpness"
                print(f"[Speech Bubble] Frame '{preset_id}' part/source scale is {source_scale:.2f}x; {action}.")
        drawn = (
            _draw_edge_repeat_frame(local, preset, frame_scale)
            if mode == "edge-repeat"
            else _draw_decorated_border_frame(local, preset, frame_scale)
        )
        if not drawn:
            return False
    else:
        frame_scale_value = max(10.0, min(400.0, float(element.get("frame_scale", 100) or 100)))
        use_2x = frame_scale_value > 100 or max(width * scale, height * scale) > 1536
        asset_path = (_FRAME_ASSETS_2X.get(preset_id) if use_2x else None) or _FRAME_ASSETS.get(preset_id)
        if not asset_path or not os.path.exists(asset_path):
            return False
        source = _load_cached_rgba(asset_path)
        if source is None:
            return False

    if mode == "full-overlay":
        fit_mode = str(element.get("fit_mode") or preset.get("fit_mode") or "cover").lower()
        if fit_mode not in {"cover", "contain", "stretch", "tile"}:
            fit_mode = "cover"
        frame_scale = max(0.1, min(4.0, float(element.get("frame_scale", 100) or 100) / 100.0))
        source_w, source_h = source.size
        if fit_mode == "stretch":
            draw_w = max(1, int(round(box_w * frame_scale)))
            draw_h = max(1, int(round(box_h * frame_scale)))
            fitted = source.resize((draw_w, draw_h), Image.Resampling.LANCZOS)
            local.alpha_composite(fitted, ((box_w - draw_w) // 2, (box_h - draw_h) // 2))
        elif fit_mode == "tile":
            tile_w = max(1, int(round(source_w * frame_scale * scale)))
            tile_h = max(1, int(round(source_h * frame_scale * scale)))
            tile = source.resize((tile_w, tile_h), Image.Resampling.LANCZOS)
            for tile_y in range(0, box_h, tile_h):
                for tile_x in range(0, box_w, tile_w):
                    local.alpha_composite(tile, (tile_x, tile_y))
        else:
            base_scale = (
                max(box_w / max(1, source_w), box_h / max(1, source_h))
                if fit_mode == "cover"
                else min(box_w / max(1, source_w), box_h / max(1, source_h))
            )
            draw_scale = max(0.001, base_scale * frame_scale)
            draw_w = max(1, int(round(source_w * draw_scale)))
            draw_h = max(1, int(round(source_h * draw_scale)))
            fitted = source.resize((draw_w, draw_h), Image.Resampling.LANCZOS)
            local.alpha_composite(fitted, ((box_w - draw_w) // 2, (box_h - draw_h) // 2))
    elif mode not in {"edge-repeat", "decorated-border"}:
        slice_data = element.get("frame_slice") or preset.get("slice") or preset.get("frame_slice")
        source_w, source_h = source.size
        source_left, source_top, source_right, source_bottom = _frame_slice_pixels(
            slice_data,
            source_w,
            source_h,
        )
        fit_scale = min(width / max(1, source_w), height / max(1, source_h))
        frame_scale = max(0.1, min(4.0, float(element.get("frame_scale", 100) or 100) / 100.0))
        source_scale = fit_scale * frame_scale
        if source_scale > 1.25:
            warning_key = (preset_id, round(source_scale, 2))
            if warning_key not in _FRAME_SCALE_WARNED:
                _FRAME_SCALE_WARNED.add(warning_key)
                action = "replace or regenerate the frame master" if source_scale > 1.5 else "check corner sharpness"
                print(
                    f"[Speech Bubble] Frame '{preset_id}' corner/source scale is {source_scale:.2f}x; {action}."
                )
        destination_scale = max(0.001, fit_scale * frame_scale * scale)
        left = max(1, int(round(source_left * destination_scale)))
        right = max(1, int(round(source_right * destination_scale)))
        top = max(1, int(round(source_top * destination_scale)))
        bottom = max(1, int(round(source_bottom * destination_scale)))
        if left + right > box_w:
            factor = box_w / max(1, left + right)
            left = max(1, int(round(left * factor)))
            right = max(1, box_w - left)
        if top + bottom > box_h:
            factor = box_h / max(1, top + bottom)
            top = max(1, int(round(top * factor)))
            bottom = max(1, box_h - top)
        middle_w = max(1, box_w - left - right)
        middle_h = max(1, box_h - top - bottom)

        def paste_part(source_box, destination_box):
            sx0, sy0, sx1, sy1 = source_box
            dx0, dy0, dx1, dy1 = destination_box
            if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                return
            part = source.crop((sx0, sy0, sx1, sy1)).resize(
                (max(1, dx1 - dx0), max(1, dy1 - dy0)),
                Image.Resampling.LANCZOS,
            )
            local.alpha_composite(part, (dx0, dy0))

        paste_part((0, 0, source_left, source_top), (0, 0, left, top))
        paste_part(
            (source_left, 0, source_w - source_right, source_top),
            (left, 0, left + middle_w, top),
        )
        paste_part(
            (source_w - source_right, 0, source_w, source_top),
            (box_w - right, 0, box_w, top),
        )
        paste_part(
            (0, source_top, source_left, source_h - source_bottom),
            (0, top, left, top + middle_h),
        )
        paste_part(
            (source_w - source_right, source_top, source_w, source_h - source_bottom),
            (box_w - right, top, box_w, top + middle_h),
        )
        paste_part(
            (0, source_h - source_bottom, source_left, source_h),
            (0, box_h - bottom, left, box_h),
        )
        paste_part(
            (source_left, source_h - source_bottom, source_w - source_right, source_h),
            (left, box_h - bottom, left + middle_w, box_h),
        )
        paste_part(
            (source_w - source_right, source_h - source_bottom, source_w, source_h),
            (box_w - right, box_h - bottom, box_w, box_h),
        )

        if mode == "composite-frame":
            decorations = preset.get("attached_decorations") or []
            enabled = element.get("attached_decorations")
            enabled_ids = (
                {str(value) for value in enabled}
                if isinstance(enabled, list)
                else {str(decoration.get("id")) for decoration in decorations}
            )
            decoration_scale = max(
                0.001,
                min(box_w / max(1, source_w), box_h / max(1, source_h)) * frame_scale,
            )
            for decoration in decorations:
                decoration_id = str(decoration.get("id") or "")
                if not decoration_id or decoration_id not in enabled_ids:
                    continue
                decoration_src = (
                    decoration.get("asset_src_2x") if use_2x else None
                ) or decoration.get("asset_src")
                decoration_path = _frame_asset_path(decoration_src)
                if not decoration_path or not os.path.exists(decoration_path):
                    continue
                decoration_image = _load_cached_rgba(decoration_path)
                if decoration_image is None:
                    continue
                item_scale = max(0.01, float(decoration.get("scale", 1) or 1))
                draw_w = max(1, int(round(decoration_image.width * decoration_scale * item_scale)))
                draw_h = max(1, int(round(decoration_image.height * decoration_scale * item_scale)))
                if (draw_w, draw_h) != decoration_image.size:
                    decoration_image = decoration_image.resize(
                        (draw_w, draw_h),
                        Image.Resampling.LANCZOS,
                    )
                anchor_x = box_w * float(decoration.get("x_ratio", 0.5) or 0.5)
                anchor_y = box_h * (1.0 - float(decoration.get("bottom_ratio", 0) or 0))
                _paste_clipped(
                    local,
                    decoration_image,
                    int(round(anchor_x - draw_w / 2)),
                    int(round(anchor_y - draw_h)),
                )

    if element.get("flip_x"):
        local = local.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if element.get("flip_y"):
        local = local.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    local = _apply_frame_effects(local, element, scale)
    rotation = 0.0 if fit_to_canvas else float(element.get("rotation", 0) or 0)
    if rotation % 360:
        local = local.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)
    center_x = (x + width / 2) * scale
    center_y = (y + height / 2) * scale
    _paste_clipped(
        layer,
        local,
        int(round(center_x - local.width / 2)),
        int(round(center_y - local.height / 2)),
    )
    return True


def _draw_frame(layer, element, scale, canvas_width, canvas_height):
    if _draw_frame_asset(layer, element, scale, canvas_width, canvas_height):
        return
    x, y, width, height, fit_to_canvas = _frame_bounds(element, canvas_width, canvas_height)
    box_w = max(1, int(round(width * scale)))
    box_h = max(1, int(round(height * scale)))
    legacy_border_width = float(element.get("border_width", 36) or 0)
    border_width_x = max(
        0,
        int(round(float(element.get("border_width_x", legacy_border_width) or 0) * scale)),
    )
    border_width_y = max(
        0,
        int(round(float(element.get("border_width_y", legacy_border_width) or 0) * scale)),
    )
    border_width_x = min(border_width_x, box_w // 2)
    border_width_y = min(border_width_y, box_h // 2)
    inner_width = max(0, int(round(float(element.get("inner_stroke_width", 0) or 0) * scale)))
    corner_radius = max(0, int(round(float(element.get("corner_radius", 0) or 0) * scale)))
    corner_radius = min(corner_radius, box_w // 2, box_h // 2)

    local = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
    border_mask = Image.new("L", local.size, 0)
    mask_draw = ImageDraw.Draw(border_mask)
    outer_box = (0, 0, box_w - 1, box_h - 1)
    mask_draw.rounded_rectangle(outer_box, radius=corner_radius, fill=255)
    inner_box = (
        border_width_x,
        border_width_y,
        box_w - 1 - border_width_x,
        box_h - 1 - border_width_y,
    )
    has_inner = inner_box[2] >= inner_box[0] and inner_box[3] >= inner_box[1]
    inner_radius = max(0, corner_radius - min(border_width_x, border_width_y))
    if has_inner:
        mask_draw.rounded_rectangle(inner_box, radius=inner_radius, fill=0)
    _composite_color_mask(local, border_mask, _rgba(element.get("border_color"), "#ffffff"))

    if inner_width and has_inner:
        outline_mask = Image.new("L", local.size, 0)
        outline_draw = ImageDraw.Draw(outline_mask)
        outline_draw.rounded_rectangle(
            inner_box,
            radius=inner_radius,
            outline=255,
            width=min(inner_width, max(1, min(box_w, box_h) // 2)),
        )
        _composite_color_mask(
            local,
            outline_mask,
            _rgba(element.get("inner_stroke_color"), "#111111"),
        )

    if element.get("flip_x"):
        local = local.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if element.get("flip_y"):
        local = local.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    local = _apply_frame_effects(local, element, scale)
    rotation = 0.0 if fit_to_canvas else float(element.get("rotation", 0) or 0)
    if rotation % 360:
        local = local.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)

    center_x = (x + width / 2) * scale
    center_y = (y + height / 2) * scale
    _paste_clipped(
        layer,
        local,
        int(round(center_x - local.width / 2)),
        int(round(center_y - local.height / 2)),
    )

def _render_layer(width, height, layout, font_path, supersample):
    scale = max(1, int(supersample))
    layer = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
    raw_elements = [element for element in layout.get("elements", []) if isinstance(element, dict)]
    normal_elements = [
        element
        for element in raw_elements
        if not (element.get("type") == "frame" and element.get("pin_to_top", True))
    ]
    pinned_frames = [
        element
        for element in raw_elements
        if element.get("type") == "frame" and element.get("pin_to_top", True)
    ]
    for element in [*normal_elements, *pinned_frames]:
        if element.get("visible") is False:
            continue
        if element.get("type") == "frame":
            _draw_frame(layer, element, scale, width, height)
        elif element.get("type") in ("bubble", "shape"):
            rotation = float(element.get("rotation", 0) or 0)
            if rotation % 360:
                bubble_layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
                _draw_bubble(bubble_layer, element, scale)
                _apply_element_opacity(bubble_layer, element)
                center = (
                    (float(element.get("x", 0)) + float(element.get("w", 1)) / 2) * scale,
                    (float(element.get("y", 0)) + float(element.get("h", 1)) / 2) * scale,
                )
                bubble_layer = bubble_layer.rotate(
                    -rotation,
                    resample=Image.Resampling.BICUBIC,
                    center=center,
                    expand=False,
                )
                layer.alpha_composite(bubble_layer)
            else:
                bubble_layer = Image.new("RGBA", layer.size, (0, 0, 0, 0))
                _draw_bubble(bubble_layer, element, scale)
                _apply_element_opacity(bubble_layer, element)
                layer.alpha_composite(bubble_layer)
        elif element.get("type") == "text":
            _draw_text_layer(layer, element, font_path, scale)
        elif element.get("type") in ("sfx", "sfx_stamp"):
            _draw_sfx_stamp(layer, element, scale)
    if scale > 1:
        layer = layer.resize((width, height), Image.Resampling.LANCZOS)
    return layer


def parse_layout(raw):
    """Parse a layout JSON string/dict using the original renderer contract."""
    return _parse_layout(raw)


def render_overlay(width, height, layout_json, font_path="", supersample=2):
    """Render only the transparent speech-bubble overlay."""
    width = max(1, int(width))
    height = max(1, int(height))
    supersample = max(1, min(4, int(supersample or 2)))
    layout = _parse_layout(layout_json)
    return _render_layer(width, height, layout, font_path or "", supersample), layout


def render_composite(background, layout_json, font_path="", supersample=2):
    """Render overlay and composite it over a PIL background image."""
    background = background.convert("RGBA")
    overlay, layout = render_overlay(
        background.width,
        background.height,
        layout_json,
        font_path=font_path,
        supersample=supersample,
    )
    if layout.get("background_visible", True):
        composite = Image.alpha_composite(background, overlay)
    else:
        composite = overlay.copy()
    return composite, overlay, layout


def rebuild_asset_caches():
    """Re-read manifests and clear decoded-image/font lookup caches."""
    global _FRAME_PRESETS, _FRAME_ASSETS, _FRAME_ASSETS_2X

    reload_sfx_asset_catalog()
    _FRAME_DISCOVERY_WARNINGS.clear()
    _FRAME_SCALE_WARNED.clear()
    _FRAME_PRESETS = _load_frame_presets()
    _FRAME_ASSETS = {}
    _FRAME_ASSETS_2X = {}
    for frame_id, preset in _FRAME_PRESETS.items():
        for source_key, asset_map in (
            ("asset_src", _FRAME_ASSETS),
            ("asset_src_2x", _FRAME_ASSETS_2X),
        ):
            asset_src = str(preset.get(source_key) or "").strip()
            if asset_src:
                asset_map[frame_id] = _frame_asset_path(asset_src)

    _cached_rgba_image.cache_clear()
    _font_path_from_id.cache_clear()
    _load_dialogue_asset.cache_clear()
    return {
        "sfx": len(get_sfx_asset_catalog().get("items", [])),
        "frames": len(_FRAME_PRESETS),
    }


__all__ = [
    "DEFAULT_LAYOUT",
    "get_frame_asset_catalog",
    "get_sfx_asset_catalog",
    "reload_sfx_asset_catalog",
    "rebuild_asset_caches",
    "parse_layout",
    "render_overlay",
    "render_composite",
]
