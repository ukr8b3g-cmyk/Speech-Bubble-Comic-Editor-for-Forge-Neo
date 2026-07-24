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

未実施:

- WebUI Forge Neo実機でのEmphasis Lines最終表示・クリック／ドラッグ操作確認
