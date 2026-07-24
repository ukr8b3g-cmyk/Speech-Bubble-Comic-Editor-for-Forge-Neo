# Codex Instructions

このフォルダーはWebUI Forge Neo用の完成済み単体拡張です。

## 設置

フォルダー全体をForge Neoの `extensions` 直下へコピーし、Forge Neoを完全再起動します。JavaScript更新後はブラウザーを`Ctrl+F5`で更新します。

## 作業前の必須確認

```bash
git status --short
git diff -- web/speech-bubble-editor.html
git diff -- speech_bubble_forge/renderer.py
git diff -- javascript/speech_bubble_forge.js
git diff -- scripts/speech_bubble_forge.py
git diff -- style.css
```

- ローカル未コミット差分を破棄しない。
- `git reset --hard`を実行しない。
- GitHub mainや古いZIPで対象ファイルを全面置換しない。
- 関連箇所だけを最小差分で変更する。
- Forge Neo本体を変更しない。

## 必須維持

- Speech Bubble EditorパネルはScript欄の直前
- ギャラリーの吹き出し＋斜めペンアイコン
- エディターは1ウィンドウのみ
- 初回focus修正、既存Editor再接続、window.open、PING / PONG / ACK、requestId
- ローカル画像はEditor内で選択・D&D・貼り付け
- image / standaloneの背景・配置物・明示保存・下書きを分離
- Close / Discard Changes / Save Layout / Export Imageを分離
- Save Layoutで画像を書き出さない
- Export Imageで明示レイアウトを暗黙保存しない
- 元画像を上書きしない
- ライト／ダークテーマ追従
- Settingsの保存先、Forge出力先連携、前回フォルダー、命名、日付フォルダー、世代バックアップ、PNG／JPEG／WebP品質、ウィンドウサイズ、Supersample、自動保存、画像ごとの保持、Overlay、キャッシュ
- Export結果をForge生成ギャラリーへ独自サムネイル／結果カードとして挿入しない
- Emphasis Linesの保存済みrays、Canvas/Pillow一致、中心点ドラッグ

## User Presets V1

- Settings内の`User Presets`、`Export & Saving`、`Editor & Layout`、`Cache & Diagnostics`構成を維持する。
- User Preset追加・変更・削除は即時保存し、Apply settingsを要求しない。
- PNG／静止WebPだけを許可し、バックエンドで実形式を検証する。
- 最大4MB、元画像25,000,000画素、名前48文字。
- 長辺768px超過画像は任意で縮小でき、未選択時は元サイズで登録する。不透明画像は明示確認を要求する。
- 画像本体をLocalStorageやリポジトリへ保存しない。
- プリセットIDはUUID、アセットIDは正規化画像のSHA-256。
- 配置済みレイヤーは不変`user_asset_id`を保持する。
- User Presetレイヤーは`Original / Fill`を切替可能にし、`mask_mode`を保存してCanvas／Pillowで一致させる。
- User Presetの追加・編集画面は2カラムを維持し、名前・種類・配置時の初期スタイルを再編集可能にする。変更は新規配置だけへ適用する。
- 差し替え・削除で旧アセットを削除しない。
- 新しいレイヤーtypeを作らず、既存`type: "sfx"`を使用する。
- Settingsからの更新ではEditorを再読込せず、User Asset catalogだけを更新する。
- Self Diagnosticsは検出と報告だけを行い、自動修復しない。
- txt2img／img2imgの起動パネル開閉状態をタブ別に保存し、Ctrl+F5後に復元する。

詳細指示:

- `docs/USER_PRESETS_V1_MANIFEST.md`
- `docs/CODEX_USER_PRESETS_V1_INSTRUCTIONS.md`
- `docs/USER_PRESETS_V2_PLAN.md`

## アセット処理禁止

`web/assets`内の完成PNG / WebPに対し、再描画、再生成、減色、再圧縮、白黒化、マスク化、Tint、アウトライン焼き込み、自動トリミングを行わないでください。

不具合修正では関連ファイルだけを確認し、最小差分で変更してください。
