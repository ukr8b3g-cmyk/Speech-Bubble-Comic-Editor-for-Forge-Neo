# 0.5.0 — User Presets / Self Diagnostics V1

## Added

- Settings内のUser Presets登録・管理UI
- PNG／静止WebPの安全なローカル保存
- SFX／Stampカテゴリ
- D&D／ファイル選択、プレビュー、名前指定
- 768px超過画像の任意縮小と元サイズ登録
- User PresetレイヤーのOriginal / Fill切替とFill Color対応
- 不透明画像の確認
- 同名置換／別名保存
- 名前・種類変更、画像差し替え、削除、検索、Grid/List
- 2カラムの追加・再編集UIと、配置時のサイズ・色・輪郭・Opacity・Drop Shadow初期値
- txt2img／img2img起動パネルの開閉状態をCtrl+F5後に復元
- 起動パネルからSettingsのSpeech Bubble Editor項目へ移動するリンク
- SettingsのDropdown／Checkbox／Slider／数値欄／補足文の縦間隔を調整
- User PresetのSwatches実色表示・選択表示を修正し、Drop Shadowにも共通パレットを追加
- Export & Saving／Editor & Layoutを横幅優先のコンパクトな2カラムへ変更
- 起動パネル下部の注記・Settingsリンク・状態表示を1行へ集約
- Export & Savingを形式・圧縮・命名・バックアップ・保存先の順に再編
- Speech Bubble Editor設定パネルを画面幅40%にし、Sliderつまみと次項目の重なりを小さな下余白で解消
- Sliderつまみが次項目の文字へ重ならないよう、Slider行の下側だけに最小外余白を追加
- Fill Color／Fill Swatch変更時に初期スタイルを自動でFillへ切り替え、即時プレビューへ反映
- 更新機能付き設定の入力欄と更新（🔄）ボタンを同じ行へ移動し、右側に常時表示
- User Preset追加／編集ダイアログを78remから52remへ縮小
- User PresetのDrop ShadowへEditor共通の3×3方向パッドを追加
- User Preset管理カードのサムネイルへ保存済みFill・Outline・Opacity・Drop Shadowを合成
- EditorのMy Presetsカードにも保存済みFill・Outline・Opacity・Drop Shadowを合成
- 重複時の別名保存を自動命名から名前欄でのユーザー確定へ変更
- 再編集画面へ別名保存を追加し、既存プリセットの上書き前に警告を表示
- EditorのMy Presetsとクリック／ドラッグ配置
- 不変asset IDによるCanvas／Pillow描画
- Settingsの4セクションAccordion
- Self Diagnosticsとコピー可能なレポート
- V1 API、セキュリティ、テスト、Codex指示書
- V2の一括登録、ZIPバックアップ／復元、手動並べ替え計画

## Preserved

- Editor起動、初回focus、既存Editor再接続
- window.open、PING / PONG / ACK、requestId
- image / standalone分離
- Save Layout / Export Image
- Emphasis Lines
- 既存素材

## Deferred

- 複数ファイル一括登録
- ZIPバックアップ／復元
- 手動並べ替え
- 孤立assetの参照解析付き整理
