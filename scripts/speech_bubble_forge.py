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
    DEFAULT_BACKUP_ENABLED,
    DEFAULT_BACKUP_GENERATIONS,
    DEFAULT_DATE_SUBFOLDER,
    DEFAULT_FILENAME_FORMAT,
    DEFAULT_JPEG_QUALITY,
    DEFAULT_KEEP_LAYOUT,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_OUTPUT_FORMAT,
    DEFAULT_PNG_COMPRESSION,
    DEFAULT_PROMPT_EXPORT_LOCATION,
    DEFAULT_REMEMBER_EXPORT_DIRECTORY,
    DEFAULT_SAVE_OVERLAY,
    DEFAULT_SUPERSAMPLE,
    DEFAULT_USE_FORGE_OUTPUT_DIR,
    DEFAULT_WEBP_LOSSLESS,
    DEFAULT_WEBP_QUALITY,
    DEFAULT_WINDOW_HEIGHT,
    DEFAULT_WINDOW_WIDTH,
    cache_status,
    rebuild_all_caches,
    reset_export_directory_memory,
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

    export_note = shared.OptionHTML("<strong>画像書き出し</strong>")
    export_note.section = _SETTINGS_SECTION
    _add_option("speech_bubble_forge_export_settings_note", export_note)

    _add_option(
        "speech_bubble_forge_prompt_export_location_v2",
        shared.OptionInfo(
            DEFAULT_PROMPT_EXPORT_LOCATION,
            "Export時に毎回保存先を選択",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ).info("通常はON。保存のたびにフォルダー選択を表示し、キャンセル時は書き出しません"),
    )
    _add_option(
        "speech_bubble_forge_use_forge_output_dir",
        shared.OptionInfo(
            DEFAULT_USE_FORGE_OUTPUT_DIR,
            "Forge Neoの出力先を基準にする",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ).info("ON時はForgeのOutput Directoryを初回選択の目安とし、未対応ブラウザーの保存先にも使用"),
    )
    _add_option(
        "speech_bubble_forge_remember_export_directory",
        shared.OptionInfo(
            DEFAULT_REMEMBER_EXPORT_DIRECTORY,
            "前回選択したフォルダーを記憶",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ).info("次回の保存先選択を前回のフォルダーから開始します"),
    )
    reset_directory_info = shared.OptionInfo(
        "",
        "前回の保存先をリセット",
        component=gr.Textbox,
        component_args={"interactive": False, "lines": 1},
        section=_SETTINGS_SECTION,
        refresh=reset_export_directory_memory,
    ).info("右側の更新（↻）ボタンでブラウザーに記憶した開始フォルダーを無効化")
    reset_directory_info.do_not_save = True
    _add_option(
        "speech_bubble_forge_reset_export_directory",
        reset_directory_info,
    )
    _add_option(
        "speech_bubble_forge_output_dir",
        shared.OptionInfo(
            DEFAULT_OUTPUT_DIR,
            "固定保存先",
            section=_SETTINGS_SECTION,
            component=gr.Textbox,
            component_args={"placeholder": "outputs/speech-bubble-forge"},
        ).info("Forge出力先を基準にしない場合、またはフォルダー選択非対応時に使用。元画像は上書きしません"),
    )
    _add_option(
        "speech_bubble_forge_filename_format",
        shared.OptionInfo(
            DEFAULT_FILENAME_FORMAT,
            "ファイル名形式",
            component=gr.Dropdown,
            component_args={
                "choices": [
                    ("元名＋日時", "source_datetime"),
                    ("元名＋連番", "source_sequence"),
                    ("元名＋_edited", "source_only"),
                    ("speech_bubble＋日時", "speech_bubble_datetime"),
                ]
            },
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_date_subfolder",
        shared.OptionInfo(
            DEFAULT_DATE_SUBFOLDER,
            "日付別サブフォルダー",
            component=gr.Dropdown,
            component_args={
                "choices": [
                    ("使用しない", "none"),
                    ("YYYY-MM", "year_month"),
                    ("YYYY-MM-DD", "year_month_day"),
                ]
            },
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_backup_enabled",
        shared.OptionInfo(
            DEFAULT_BACKUP_ENABLED,
            "同名ファイルを世代バックアップ",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ).info("同じ名前を上書きする前に _backup_01 形式で退避"),
    )
    _add_option(
        "speech_bubble_forge_backup_generations",
        shared.OptionInfo(
            DEFAULT_BACKUP_GENERATIONS,
            "バックアップ世代数",
            component=gr.Slider,
            component_args={"minimum": 1, "maximum": 20, "step": 1},
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_output_format",
        shared.OptionInfo(
            DEFAULT_OUTPUT_FORMAT,
            "合成画像の形式",
            component=gr.Dropdown,
            component_args={
                "choices": [("PNG", "png"), ("JPEG", "jpeg"), ("WebP", "webp")]
            },
            section=_SETTINGS_SECTION,
        ).info("Overlayは透過保持のため常にPNG"),
    )
    _add_option(
        "speech_bubble_forge_png_compression",
        shared.OptionInfo(
            DEFAULT_PNG_COMPRESSION,
            "PNG圧縮レベル",
            component=gr.Slider,
            component_args={"minimum": 0, "maximum": 9, "step": 1},
            section=_SETTINGS_SECTION,
        ).info("高いほど小さくなりますが、保存に時間がかかります"),
    )
    _add_option(
        "speech_bubble_forge_jpeg_quality",
        shared.OptionInfo(
            DEFAULT_JPEG_QUALITY,
            "JPEG品質",
            component=gr.Slider,
            component_args={"minimum": 1, "maximum": 100, "step": 1},
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_webp_quality",
        shared.OptionInfo(
            DEFAULT_WEBP_QUALITY,
            "WebP品質",
            component=gr.Slider,
            component_args={"minimum": 1, "maximum": 100, "step": 1},
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_webp_lossless",
        shared.OptionInfo(
            DEFAULT_WEBP_LOSSLESS,
            "WebPをロスレス保存",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_save_overlay_v2",
        shared.OptionInfo(
            DEFAULT_SAVE_OVERLAY,
            "Overlay PNGも同時保存",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ),
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
    browser_cache = shared.OptionHTML(
        """
        <div id="speech-bubble-forge-cache-manager" class="speech-bubble-forge-cache-manager">
          <div data-speech-bubble-cache-usage aria-live="polite">使用量を計測しています…</div>
          <div class="speech-bubble-forge-cache-actions">
            <button type="button" data-speech-bubble-cache-refresh>使用量を更新</button>
            <button type="button" data-speech-bubble-cache-clear>編集キャッシュを削除</button>
          </div>
          <small>下書きは最大100件かつ90日、単体背景と再表示用生成画像は各最大10件。明示保存レイアウト・お気に入り・保存先設定は削除しません。</small>
        </div>
        """
    )
    browser_cache.section = _SETTINGS_SECTION
    _add_option("speech_bubble_forge_browser_cache_manager", browser_cache)

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
