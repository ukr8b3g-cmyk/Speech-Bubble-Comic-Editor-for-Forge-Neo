# Verification

実施済み:

- Python構文確認（`py_compile`）
- Forge側JavaScript構文確認（`node --check`）
- Editor内インラインJavaScript構文確認
- Forge Settings登録モックテスト
- FastAPIの静的配信、設定、画像別レイアウト保存、画像書き出しテスト
- Export ImageがレイアウトJSONを暗黙出力しないことを確認
- Pillow合成PNG／透明Overlay PNGの生成確認
- PNG／JPEG／WebP形式別保存、日付フォルダー、連番命名、世代バックアップ確認
- Forge出力先／固定保存先の切替と、ブラウザー選択保存先用の一時配信・削除API確認
- 保存先を毎回選択し、前回フォルダーを開始位置として記憶・リセットできることを確認
- Export後にForge生成ギャラリーへ独自サムネイル／結果カードを追加しないことを確認
- ブラウザーモックによるローカル画像読込、Save Layout、Discard Changes、Export Image確認
- Forge UIモックによるScript直前配置、アイコン表示、単一ウィンドウ、重複追加防止確認
- ZIP展開・ファイル整合性確認
- Emphasis Lines JSコアテスト（4プリセット、Seed決定性、Center Random外端不変）
- Emphasis Lines Pillowテスト（保存済みrays、フォールバック生成、Overlay出力）
- Canvas / PillowフォールバックGeometry一致（180 rays、最大差 `5.55e-17`）
- 配信中Editor HTMLのEmphasis Lines DOM確認

User Presets V1反映後（2026-07-24）:

- Python 9ファイルの非書込み構文確認
- `speech_bubble_forge.js`、`speech_bubble_cache.js`、`speech_bubble_settings.js`の`node --check`
- Nodeテスト5件合格
- Editor内inline JavaScript 2件の構文確認
- HTML ID 156件に重複なし
- User Assetの登録、一覧、更新、画像差し替え、削除、旧asset保持、不透明画像確認のスモークテスト
- 1032×640画像の元サイズ登録と、選択時の長辺768px縮小
- User PresetのOriginal / Fill切替、Fill色のPillow描画、保存復元コード
- `javascript/speech_bubble_forge.js`の起動・再接続ロジックを維持し、起動パネル開閉状態の保存だけを追加
- `git diff --check`

User Preset初期スタイル再編集・起動パネル状態保存（2026-07-24）:

- Forge側JavaScript 2ファイルの`node --check`
- Nodeテスト5件合格
- Editor内inline JavaScript 2件の構文確認
- HTML ID 157件に重複なし
- User Asset初期スタイルの登録、部分更新、既存値保持スモークテスト
- API manifest JSON構文確認
- `git diff --check`

Settingsリンク・フォーム間隔調整（2026-07-24）:

- 起動パネルからSettingsタブ／Speech Bubble Editor項目を順に開く処理
- Dropdown／Checkbox／Slider／数値欄／補足文を対象にしたSettings内限定CSS
- Forge側JavaScript 2ファイルの`node --check`
- Nodeテスト5件合格
- `git diff --check`

Swatches・Drop Shadow・Settingsコンパクト化（2026-07-24）:

- User PresetのFill／Outline／Shadow SwatchesをCSS変数で実色表示
- Swatch選択色のactive表示とプレビュー更新
- EditorのDrop Shadowへ共通カラーパレットを追加
- Export & Saving／Editor & Layoutを2カラム化し、過大な最小高さを撤去
- Editor URL cache versionを`20260724-07`へ更新
- Forge側JavaScript 2ファイルの`node --check`
- Nodeテスト5件、Editor inline JavaScript構文、`git diff --check`合格

Settings再配置・起動パネル1行化（2026-07-24）:

- 起動パネル下部の注記・Settingsリンク・状態表示を同一行へ配置
- Export & Savingを形式・圧縮・命名・バックアップ・保存先の順に再配置
- Sliderの見出し／数値欄とrangeを別段に保ち、Dropdownを固定小高さに調整
- Settingsパネルを画面幅40%へ変更し、Slider下に約10pxのつまみ安全域を追加
- Slider行の下側へ約7pxの外余白を追加し、次項目ラベルとの描画領域を分離
- Fill Color／Fill Swatch操作時のOriginal→Fill自動切替とプレビュー再描画コードを確認
- 更新機能付き設定では`refresh_<setting key>`ボタンを入力欄へ再配置するコードを確認
- User Presetダイアログ幅を52remへ変更し、Drop Shadow方向パッドの8方向／中央OFF計算をNodeテスト
- User Preset管理カードが元サムネイルをフォールバックに、保存済み初期スタイルをCanvas合成するコードを確認
- EditorのMy Presetsカード描画へ同じ初期スタイル合成を追加し、Editor URL cache versionを`20260724-08`へ更新
- 別名保存は名前欄で確定し、上書き保存は確認警告を経由するコードを確認

未実施:

- WebUI Forge Neo実機でのEmphasis Lines最終表示・クリック／ドラッグ操作確認
- WebUI Forge Neo実機でのUser Presets / Self Diagnostics確認
- Python `pytest`（システムPython、Forge Neo venvともに未導入）
