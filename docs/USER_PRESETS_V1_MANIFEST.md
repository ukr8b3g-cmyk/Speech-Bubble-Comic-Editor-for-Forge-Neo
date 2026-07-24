# User Presets / Self Diagnostics V1 実装マニフェスト

## リリース識別子

- 拡張バージョン: `0.5.0`
- User Asset API: `1`
- User Asset Index Schema: `1`
- Settings UI: `1.0.0`
- 対象: WebUI Forge Neo用独立拡張
- Forge Neo本体の変更: なし

## V1で実装する機能

1. Settings内のSpeech Bubble Editor設定を4つの折りたたみ領域へ整理する。
   - User Presets
   - Export & Saving
   - Editor & Layout
   - Cache & Diagnostics
2. PNGまたは静止WebPをユーザープリセットとして1件ずつ登録する。
3. 登録先を次の2カテゴリから選択する。
   - `sfx`: Onomatopoeia / SFX
   - `stamp`: Comic Stamps / Symbols
4. 登録前にプレビュー、表示名、寸法、形式、容量、透明背景の有無を確認する。
5. 長辺768px超過時は任意で長辺768pxへ縮小し、未選択時は元サイズを維持する。
6. 透明ピクセルがない画像は、明示確認後のみ登録する。
7. 同名時は「既存を置換」「別名で保存」「キャンセル」を選択する。
8. 追加・編集画面をプレビュー／設定の2カラムとし、管理画面で検索、グリッド／リスト表示、名前・種類・初期スタイル変更、画像差し替え、削除を行う。
9. Editorの既存SFX／Stampカテゴリ内に`My Presets`を追加する。
10. サムネイルクリックでCanvas中央へ配置し、ドラッグでドロップ位置へ配置する。
11. 配置レイヤーは既存の`type: "sfx"`を使用し、新しいレイヤーtypeを作らない。
12. CanvasとPython/Pillow書き出しで同じ不変アセットIDを使用する。
13. 配置済みUser PresetをOriginal / Fillで切り替え、Fill Color／Outline ColorをCanvasとPillowへ一致させる。
14. Settingsへ非破壊の自己診断を追加する。
15. txt2img／img2imgの起動パネル開閉状態をタブ別に保存し、Ctrl+F5後に復元する。

## V1の制限

- 1回の登録につき画像1件。
- JPEG、GIF、SVG、アニメーションWebPは非対応。
- 最大アップロード容量は4MB。
- 元画像は最大25,000,000画素。推奨は長辺512pxで、長辺768pxへの任意縮小を提供する。
- クラウド同期、タグ、フォルダー分類、一括編集、手動並べ替えは非対応。
- ZIPバックアップ／復元はV2。
- 画像差し替え・削除後も、既存レイアウト保護のため旧アセットファイルを保持する。

## 保存場所

Forgeのユーザーデータ領域を基準とする。

```text
<data_root>/config/speech-bubble-forge/user-presets/
├─ index.json
├─ index.json.bak
├─ assets/
│  └─ <sha256>.png | <sha256>.webp
└─ thumbnails/
   └─ <sha256>.webp
```

- リポジトリ内へユーザー画像を保存しない。
- 表示名をファイル名に使用しない。
- プリセットIDはUUID、アセットIDは正規化後画像バイト列のSHA-256。
- `index.json`は一時ファイル経由で原子的に置換する。

## 主要変更ファイル

| ファイル | 役割 |
|---|---|
| `scripts/speech_bubble_forge.py` | Settings内の4セクションとUser Presets／診断ホストUI |
| `javascript/speech_bubble_settings.js` | Settings専用UI、2カラム追加・編集モーダル、初期スタイル、診断、ライブ更新通知 |
| `javascript/speech_bubble_forge.js` | 起動パネルの開閉状態保存（起動・再接続処理は維持） |
| `speech_bubble_forge/user_assets.py` | 検証、正規化、保存、index、サムネイル、CRUD |
| `speech_bubble_forge/diagnostics.py` | 非破壊自己診断 |
| `speech_bubble_forge/api.py` | User Asset APIとDiagnostics API |
| `web/speech-bubble-editor.html` | My Presets一覧、クリック／ドラッグ配置、ライブ更新 |
| `speech_bubble_forge/renderer.py` | 不変`user_asset_id`によるPillow描画 |
| `style.css` | Settings、モーダル、管理画面のUI |
| `tests/test_user_assets.py` | Python保存・API・Rendererテスト |
| `tests/speech_bubble_settings_core_test.cjs` | Settings JSコアテスト |
| `tests/user_asset_editor_integration_test.cjs` | Editor統合・起動処理不変テスト |

## 変更禁止領域

- Forge Neo本体
- `window.open`の実装（起動パネル開閉状態の保存だけを追加）
- 初回focus修正
- PING / PONG / ACK
- `requestId`
- image / standalone `documentId`
- Save Layout / Export Imageの意味
- 自動保存・下書き
- Emphasis Linesのrays、中心点ドラッグ、Geometry
- 既存素材PNG / WebP
- 既存レイヤーのProperties

## 受け入れ基準

- Settingsの開閉だけではApply settingsのdirty状態を変えない。
- User Presetsだけ初期open、他3領域は初期closed。
- PNG／静止WebPをD&Dとファイル選択の両方で登録できる。
- 4MB、25,000,000画素、透明背景、アニメーション、実形式をバックエンドでも検証する。
- 既存名置換でも通常登録APIを使用し、空のプリセットIDへ画像差し替えAPIを呼ばない。
- 登録後にForge全体やEditorを再読込せず、素材一覧だけ更新する。
- 配置済みレイヤーはプリセット差し替え・削除後も描画・Exportできる。
- Originalは元色を保持し、Fillはalpha形状へFill Color／Outline Colorを適用する。
- 自己診断は設定・レイアウト・登録データを変更しない。
- `javascript/speech_bubble_forge.js`の起動／再接続ロジックは変更せず、起動パネルの開閉状態だけを保存する。
