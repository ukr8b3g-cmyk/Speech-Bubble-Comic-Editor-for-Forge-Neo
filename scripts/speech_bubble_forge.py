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
    DEFAULT_LANGUAGE,
    DEFAULT_OUTPUT_DIR,
    DEFAULT_OUTPUT_FORMAT,
    DEFAULT_PNG_COMPRESSION,
    DEFAULT_PROMPT_EXPORT_LOCATION,
    DEFAULT_REMEMBER_EXPORT_DIRECTORY,
    DEFAULT_SAVE_OVERLAY,
    DEFAULT_SHOW_EMPTY_GUIDE,
    DEFAULT_SHARED_PROJECT_IMAGES,
    DEFAULT_FORGE_IMPORT_BEHAVIOR,
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
from speech_bubble_forge.user_assets import (
    SETTINGS_UI_VERSION,
    USER_ASSET_MAX_SOURCE_PIXELS,
    USER_ASSET_MAX_UPLOAD_BYTES,
    USER_ASSET_RECOMMENDED_SIDE,
    USER_ASSET_RESIZE_SIDE,
)

_SETTINGS_SECTION = ("speech_bubble_forge", "Comic Panel Editor")


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
        f"""
        <div id="speech-bubble-forge-settings-panel" class="speech-bubble-forge-settings-panel" data-ui-version="{SETTINGS_UI_VERSION}">
          <div class="speech-bubble-forge-settings-heading">
            <div><strong>Comic Panel Editor 設定</strong><small>独立ウィンドウ型コミックエディターの設定とユーザー素材を管理します。</small></div>
          </div>

          <details class="speech-bubble-forge-settings-group" data-speech-bubble-settings-group="appearance" open>
            <summary><span>Appearance（表示）</span><small>言語・画像ガイド・ページ画像の共有</small></summary>
            <div class="speech-bubble-forge-settings-group-body" data-speech-bubble-settings-body="appearance"></div>
          </details>

          <details class="speech-bubble-forge-settings-group" data-speech-bubble-settings-group="user-presets" open>
            <summary><span>User Presets（ユーザープリセット）</span><small data-speech-bubble-user-summary>読み込み中…</small></summary>
            <div class="speech-bubble-forge-settings-group-body">
              <div class="speech-bubble-forge-preset-counts" aria-live="polite">
                <div><strong>Onomatopoeia / SFX</strong><span data-speech-bubble-user-count="sfx">0個</span></div>
                <div><strong>Comic Stamps / Symbols</strong><span data-speech-bubble-user-count="stamp">0個</span></div>
              </div>
              <div class="speech-bubble-forge-user-controls">
                <span>登録先</span>
                <div class="speech-bubble-forge-segmented" role="group" aria-label="ユーザープリセットの登録先">
                  <button type="button" data-speech-bubble-user-category="sfx" aria-pressed="true">SFX</button>
                  <button type="button" data-speech-bubble-user-category="stamp" aria-pressed="false">Stamp</button>
                </div>
              </div>
              <div class="speech-bubble-forge-user-drop" data-speech-bubble-user-drop tabindex="0" role="button" aria-label="PNGまたはWebPを登録">
                <strong>PNG / WebPをここへドロップ</strong>
                <span>または</span>
                <button type="button" data-speech-bubble-user-choose>ファイルを選択</button>
                <small>推奨: 長辺{USER_ASSET_RECOMMENDED_SIDE}px / 任意縮小: 長辺{USER_ASSET_RESIZE_SIDE}px / 上限: {USER_ASSET_MAX_UPLOAD_BYTES // 1024 // 1024}MB・{USER_ASSET_MAX_SOURCE_PIXELS // 10_000:,}万画素</small>
              </div>
              <input type="file" data-speech-bubble-user-file accept="image/png,image/webp,.png,.webp" hidden>
              <div class="speech-bubble-forge-user-actions">
                <button type="button" data-speech-bubble-user-manage>プリセット管理</button>
                <span data-speech-bubble-user-status aria-live="polite"></span>
              </div>
              <small>追加・変更・削除は即時保存されます。上部のApply settingsは不要です。</small>
            </div>
          </details>

          <details class="speech-bubble-forge-settings-group" data-speech-bubble-settings-group="export">
            <summary><span>Export &amp; Saving（保存とエクスポート）</span><small data-speech-bubble-summary="export">保存先・形式・品質・バックアップ</small></summary>
            <div class="speech-bubble-forge-settings-group-body" data-speech-bubble-settings-body="export"></div>
          </details>

          <details class="speech-bubble-forge-settings-group" data-speech-bubble-settings-group="editor">
            <summary><span>Editor &amp; Layout（エディタとレイアウト）</span><small data-speech-bubble-summary="editor">ウィンドウサイズ・Supersample・自動保存</small></summary>
            <div class="speech-bubble-forge-settings-group-body" data-speech-bubble-settings-body="editor"></div>
          </details>

          <details class="speech-bubble-forge-settings-group" data-speech-bubble-settings-group="cache">
            <summary><span>Cache &amp; Diagnostics（キャッシュと診断）</span><small data-speech-bubble-summary="cache">編集キャッシュ・素材キャッシュ・自己診断</small></summary>
            <div class="speech-bubble-forge-settings-group-body">
              <div data-speech-bubble-settings-body="cache"></div>
              <div class="speech-bubble-forge-diagnostics-card">
                <div><strong>自己診断</strong><small data-speech-bubble-diagnostic-last>前回: 未実行</small></div>
                <div class="speech-bubble-forge-diagnostics-actions">
                  <button type="button" data-speech-bubble-diagnostic-run>自己診断を実行</button>
                  <button type="button" data-speech-bubble-diagnostic-show disabled>前回レポート</button>
                </div>
              </div>
            </div>
          </details>

          <details class="speech-bubble-forge-settings-group" data-speech-bubble-settings-group="model">
            <summary><span>AI Background Removal Model（AI背景削除モデル）</span><small>isnet-anime・約168 MB</small></summary>
            <div class="speech-bubble-forge-settings-group-body speech-bubble-forge-model-card">
              <output data-speech-bubble-model-status aria-live="polite">確認待ち</output>
              <progress data-speech-bubble-model-progress max="1" value="0" style="width:100%"></progress>
              <div class="speech-bubble-forge-model-actions">
                <button type="button" data-speech-bubble-model-refresh>更新</button>
                <button type="button" data-speech-bubble-model-download>モデルを取得</button>
                <button type="button" data-speech-bubble-model-cancel hidden>中止</button>
                <button type="button" data-speech-bubble-model-delete>モデルを削除</button>
              </div>
              <small>初回利用時の確認、または「モデルを取得」を押した場合だけダウンロードします。画像処理はローカルで実行します。</small>
            </div>
          </details>
        </div>
        """
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
        ).info("互換レンダラー用。EditorのPNGはCanvas Blobを直接保存します"),
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
        ).info("互換レンダラー用。EditorのExport Imageは表示Canvasを直接保存します"),
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
        "speech_bubble_forge_language",
        shared.OptionInfo(
            DEFAULT_LANGUAGE,
            "エディターの表示言語",
            component=gr.Dropdown,
            component_args={
                "choices": [
                    ("自動（システム）", "auto"),
                    ("日本語", "ja"),
                    ("English", "en"),
                ]
            },
            section=_SETTINGS_SECTION,
        ).info("Comic Panel EditorのUIとマウスオーバー説明へ反映します"),
    )
    _add_option(
        "speech_bubble_forge_show_empty_guide",
        shared.OptionInfo(
            DEFAULT_SHOW_EMPTY_GUIDE,
            "画像未読込時に「画像をドロップ」を表示",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ),
    )
    _add_option(
        "speech_bubble_forge_shared_project_images",
        shared.OptionInfo(
            DEFAULT_SHARED_PROJECT_IMAGES,
            "ページ画像を3モードで共有",
            component=gr.Checkbox,
            section=_SETTINGS_SECTION,
        ).info("一枚画像・4コマ漫画・コミックで同じページ画像トレイを使用"),
    )
    _add_option(
        "speech_bubble_forge_import_behavior",
        shared.OptionInfo(
            DEFAULT_FORGE_IMPORT_BEHAVIOR,
            "Forge画像追加時",
            component=gr.Dropdown,
            component_args={"choices": ["place", "tray_only"]},
            section=_SETTINGS_SECTION,
        ).info("place: 現在のモードへ配置 / tray_only: ページ画像へ追加のみ"),
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
    """Hidden loader; the Project Editor bridge owns the current launcher UI."""

    setup_for_ui_only = True

    def title(self):
        return "Comic Panel Editor"

    def show(self, is_img2img):
        return False
