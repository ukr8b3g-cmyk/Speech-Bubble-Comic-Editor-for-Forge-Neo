from __future__ import annotations

import sys
from pathlib import Path

import gradio as gr
from modules import script_callbacks, scripts, shared

EXTENSION_ROOT = Path(__file__).resolve().parents[1]
if str(EXTENSION_ROOT) not in sys.path:
    sys.path.insert(0, str(EXTENSION_ROOT))

from speech_bubble_forge.api import register_routes
from speech_bubble_forge.settings import (
    DEFAULT_AUTO_SAVE,
    DEFAULT_KEEP_LAYOUT,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_SAVE_OVERLAY,
    DEFAULT_SUPERSAMPLE,
    DEFAULT_WINDOW_HEIGHT,
    DEFAULT_WINDOW_WIDTH,
    cache_status,
    rebuild_all_caches,
)

_SETTINGS_SECTION = ("speech_bubble_forge", "Speech Bubble Editor")


def _on_app_started(_demo, app):
    register_routes(app)


def _add_option(key, info):
    if key not in shared.opts.data_labels:
        shared.opts.add_option(key, info)



def _cache_component_args():
    return {
        "interactive": False,
        "lines": 1,
        "placeholder": cache_status(),
    }


def _on_ui_settings():
    note = shared.OptionHTML(
        "独立ウィンドウ型のSpeech Bubble Editor設定です。変更は次回エディター起動から反映されます。"
    )
    note.section = _SETTINGS_SECTION
    _add_option("speech_bubble_forge_settings_note", note)

    _add_option(
        "speech_bubble_forge_output_dir",
        shared.OptionInfo(
            DEFAULT_OUTPUT_DIR,
            "保存先",
            section=_SETTINGS_SECTION,
            component=gr.Textbox,
            component_args={"placeholder": "outputs/speech-bubble-forge"},
        ).info("相対パスはForgeのデータフォルダー基準。元画像は上書きしません"),
    )
    _add_option(
        "speech_bubble_forge_window_width",
        shared.OptionInfo(
            DEFAULT_WINDOW_WIDTH,
            "初期ウィンドウ幅",
            component=gr.Slider,
            component_args={"minimum": 900, "maximum": 3840, "step": 50},
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_window_height",
        shared.OptionInfo(
            DEFAULT_WINDOW_HEIGHT,
            "初期ウィンドウ高さ",
            component=gr.Slider,
            component_args={"minimum": 640, "maximum": 2160, "step": 50},
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_supersample",
        shared.OptionInfo(
            DEFAULT_SUPERSAMPLE,
            "Supersample",
            component=gr.Slider,
            component_args={"minimum": 1, "maximum": 4, "step": 1},
            section=_SETTINGS_SECTION,
        ).info("保存時の高解像度描画。2推奨"),
    )
    _add_option(
        "speech_bubble_forge_auto_save",
        shared.OptionInfo(
            DEFAULT_AUTO_SAVE,
            "自動保存 ON / OFF",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ).info("編集中のレイアウトJSONをブラウザーへ自動保存"),
    )
    _add_option(
        "speech_bubble_forge_keep_previous_layout",
        shared.OptionInfo(
            DEFAULT_KEEP_LAYOUT,
            "画像ごとのレイアウトを保持",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ).info("画像内容のハッシュごとに保存し、Forge再起動・タブ切替後も同じ画像へ復元"),
    )
    _add_option(
        "speech_bubble_forge_save_overlay",
        shared.OptionInfo(
            DEFAULT_SAVE_OVERLAY,
            "Overlay PNGも同時保存",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ),
    )

    cache_info = shared.OptionInfo(
        "",
        "素材キャッシュ再構築",
        component=gr.Textbox,
        component_args=_cache_component_args,
        section=_SETTINGS_SECTION,
        refresh=rebuild_all_caches,
    ).info("右側の更新（↻）ボタンで再構築。完了状態は入力欄へ表示")
    cache_info.do_not_save = True
    _add_option("speech_bubble_forge_rebuild_asset_cache", cache_info)


script_callbacks.on_app_started(_on_app_started, name="speech-bubble-forge-routes")
script_callbacks.on_ui_settings(_on_ui_settings, name="speech-bubble-forge-settings")


class Script(scripts.Script):
    """Hidden loader; all interaction is provided by the gallery icon and popup editor."""

    setup_for_ui_only = True

    def title(self):
        return "Speech Bubble Editor"

    def show(self, is_img2img):
        return False
