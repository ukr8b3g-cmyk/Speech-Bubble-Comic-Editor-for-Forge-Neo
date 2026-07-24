# Codex実装・監視指示書 — User Presets / Self Diagnostics V1

この文書は、添付パッチを既存のローカル実装へ適用・監査・追加修正する際の優先指示です。

## 1. 作業開始前

必ず実行し、結果を保存すること。

```bash
git status --short
git diff -- web/speech-bubble-editor.html
git diff -- speech_bubble_forge/renderer.py
git diff -- javascript/speech_bubble_forge.js
git diff -- scripts/speech_bubble_forge.py
git diff -- style.css
```

禁止:

- `git reset --hard`
- `git checkout -- <file>`による未コミット差分の破棄
- GitHub mainや古いZIPによる対象ファイル全面置換
- Forge Neo本体の変更
- 関連しない整形・リネーム・リファクタリング

このパッチは、提供された現行拡張ZIPを基準に作成している。GitHub mainとの差分ではなく、現行ローカル差分の上へV1差分だけを重ねること。

## 2. 実装境界

V1で変更してよい範囲:

- SettingsのSpeech Bubble Editorセクション
- User Presetのローカル保存・API
- Editor素材カタログのUser Preset表示
- 既存SFXレイヤーとしての配置
- Pillow RendererのUser Asset解決
- 自己診断
- 上記のCSSとテスト、文書

変更禁止:

- `javascript/speech_bubble_forge.js`の起動、再接続、focus、window.open、PING/PONG/ACK、requestId（起動パネル開閉状態の保存は変更可）
- Editorのimage / standalone保存分離
- Close / Discard / Save Layout / Export Imageの意味
- レイアウト自動保存
- Emphasis Lines
- 既存ビルトイン素材

V1作業後に、`javascript/speech_bubble_forge.js`の差分が起動パネル開閉状態の保存だけで、起動・再接続ロジックへ影響しないことを確認すること。

## 3. Settings UI

### 3.1 セクション

`scripts/speech_bubble_forge.py`の`_on_ui_settings()`で、`speech_bubble_forge_settings_note`として次のホストを登録する。

1. User Presets: 初期open
2. Export & Saving: 初期closed
3. Editor & Layout: 初期closed
4. Cache & Diagnostics: 初期closed

`javascript/speech_bubble_settings.js`は既存Option行をキー単位で対応する`details`内へ移動する。既存Optionキー、値、保存方法、refreshコールバックを変えない。

開閉状態は`localStorage`の`Speech Bubble`専用キーへ保存する。`details`のtoggleイベントでForge設定値を変更しない。矢印はCSS `summary::before`だけで表示する。

### 3.2 イベント登録

- `onUiLoaded(setupPanel)`と`onAfterUiUpdate(setupPanel)`を使用する。
- `data-speech-bubble-settings-ready`等のガードで二重登録を防ぐ。
- ダイアログ側も`data-bound="1"`で一度だけ登録する。
- 開閉・検索・表示切替ではApply settingsをdirtyにしない。

## 4. User Asset保存層

`speech_bubble_forge/user_assets.py`を単一責任の保存層とする。

### 4.1 入力検証順

1. JSONオブジェクトであること。
2. `category`が`sfx`または`stamp`。
3. `name`をNFKC正規化し、制御文字除去、空白圧縮、1～48文字。
4. Data URLが`image/png`または`image/webp`。
5. Base64を厳格にデコード。
6. 入力バイト数4MB以下。
7. Pillowで実際にデコード。
8. 宣言形式と実形式の一致。
9. `n_frames == 1`。
10. 元画像総画素数25,000,000以下。
11. 透明ピクセルがない場合、`allow_opaque: true`が必要。
12. 長辺768px超過時、`resize_oversize: true`なら768pxへ縮小し、未指定または`false`なら元サイズを維持。
13. RGBAへ変換し、EXIF向きを反映。
14. PNGまたはlossless WebPとして再保存し、不要メタデータを落とす。
15. 正規化後の出力も4MB以下。

### 4.2 不変アセット

- 正規化後画像バイト列のSHA-256を`asset_id`とする。
- ファイル名は`<asset_id>.<format>`。
- プリセットはUUID `id`を持つ。
- 画像差し替えはプリセットIDを維持し、新しいasset_idを割り当てる。
- 古いassetファイルを削除しない。保存済みレイアウトが古いasset_idを参照できるようにする。
- プリセット削除でもassetファイルを保持する。

### 4.3 原子的更新

- 画像／サムネイルは一時ファイルを書いて`os.replace`する。
- `index.json`更新前に既存indexを`index.json.bak`へ退避する。
- 壊れたindexを自動的に空へ置換しない。診断とAPIでエラーを返す。

## 5. API契約

詳細は`API_USER_PRESETS_V1.md`を参照する。

重要な分岐:

- 新規登録および同名の「既存を置換」は`POST /user-assets`を使用する。
- 管理画面から特定プリセットの画像だけを差し替える場合のみ`PUT /user-assets/{preset_id}/image`を使用する。
- 同名置換で空の`preset_id`を含むPUT URLを生成してはならない。
- JSの`registrationRequestSpec()`を変更する場合、Nodeテストを更新する。

## 6. Editor統合

### 6.1 カタログ

Editor起動時に、ビルトインSFXカタログと並行して`GET /speech-bubble-forge/user-assets`を取得する。

User Presetの内部表現:

```javascript
{
  id: `user-preset:${preset.id}`,
  userPreset: true,
  userPresetId: preset.id,
  userAssetId: preset.asset_id,
  category: preset.category,
  src: preset.asset_url,
  thumb: preset.thumbnail_url,
  mask: false
}
```

- User PNG/WebPは初期状態ではフルカラーRGBAとして扱う。Propertiesの`Original / Fill`でFillを選択した場合だけalphaをマスクとして着色する。
- `type: "sfx"`のまま配置する。
- `mask_mode`へOriginal / Fillの選択を保存する。

### 6.2 保存済みレイヤー

配置時に以下をレイアウトへ保持する。

- `user_preset_id`
- `user_asset_id`
- `asset_src`
- `asset_width`
- `asset_height`
- `mask_mode`

レイアウト復元時、`user_asset_id`がある場合は現在のプリセットカタログを参照してasset_idを更新してはならない。保存済みの不変asset_idを優先する。

### 6.3 配置

- クリックは既存の中央配置フローを再利用する。
- ドラッグは既存のSFX素材ドラッグフローを再利用する。
- Undo / Redo、回転、拡縮、Opacity、Drop Shadow、削除は既存処理を再利用する。
- User PresetだけにOriginal / Fill切替を表示し、Fill時はFill Color／Outline Colorを有効にする。
- 新しいCanvas描画ルートを増やさない。

### 6.4 ライブ更新

`BroadcastChannel("speech-bubble-forge:user-assets:v1")`で`catalog_changed`を受けた時だけUser Asset catalogを再取得する。

禁止:

- Editor全体のreload
- 背景・レイアウトの再初期化
- `window.open`の追加
- host message handshakeの変更

## 7. Renderer

`speech_bubble_forge/renderer.py`のSFX描画で、`user_asset_id`がある場合だけ`resolve_user_asset_path()`を使用する。

- asset IDは64桁小文字16進のみ受理する。
- 保存ルート外のパスを返さない。
- ファイルがない場合はそのレイヤーだけ描画をスキップする。
- 既存SFX素材、Basic Symbol、mask素材の処理を変えない。

## 8. Self Diagnostics

診断は次のみを行う。

- Python API／拡張バージョン
- 必須ファイル存在
- Settings JSバージョン一致
- User Preset保存先への一時書込み・読込み・削除
- index構文・schema・参照整合性
- 登録画像とサムネイルのPillow verify
- ビルトイン素材キャッシュ状態
- Editorが既に起動している場合だけBroadcastChannel応答確認
- Settingsイベントバインドのsingletonガード確認

診断で行ってはならないこと:

- Editorを起動・再読込する
- indexを修復・初期化する
- presetやassetを削除する
- Settingsを書き換える
- レイアウトや下書きを変更する

## 9. 必須テスト

```bash
python -m compileall -q speech_bubble_forge scripts
python -m pytest -q
node --check javascript/speech_bubble_forge.js
node --check javascript/speech_bubble_cache.js
node --check javascript/speech_bubble_settings.js
for f in tests/*.cjs; do node "$f"; done
```

追加確認:

1. Editor HTML内の全inline scriptを`node --check`する。
2. HTMLの重複IDを検出する。
3. パッチを基準ツリーの複製へ適用できること。
4. 適用後ツリーが完成ツリーと一致すること。
5. `javascript/speech_bubble_forge.js`の起動・再接続ロジックが基準と同一であること。
6. ZIPを`unzip -t`で検査する。

## 10. 実機スモークテスト

Forgeを完全終了して再起動し、ブラウザーを`Ctrl+F5`する。

- Settings > Speech Bubble Editorが4領域に整理される。
- User Presetsだけ初期open。
- 開閉だけでApply settingsの未保存表示が変わらない。
- 透過PNGをSFXへ登録し、件数とEditorへ即時反映される。
- 同じPNGをStampへ登録できる。
- 長辺769px以上で任意縮小が表示され、未選択でも元サイズで登録できる。
- 不透明画像で確認が出る。
- 同名時に3択が機能する。
- 名前変更、種類変更、差し替え、削除が機能する。
- 既に配置したレイヤーが差し替え・削除後も維持される。
- CanvasとExport Imageが一致する。
- 自己診断を実行し、レポートをコピーできる。
- Editorが二重起動・再読込されない。
