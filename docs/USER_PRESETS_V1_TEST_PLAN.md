# User Presets V1 テスト計画

## 自動テスト

### Python

- PNG登録
- 静止WebP登録
- アニメーションWebP拒否
- 4MB制限
- 実形式不一致拒否
- 不正asset ID／preset ID拒否
- 不透明画像の確認要求
- 長辺768px超過画像の元サイズ登録と任意縮小
- 同名エラー／別名保存／既存置換
- 名前／カテゴリ変更
- 画像差し替え
- 削除後の旧asset保持
- index破損時に自動初期化しない
- asset／thumbnailのverify
- FastAPI CRUD／immutable配信
- Rendererが`user_asset_id`を描画する
- RendererがFill時にUser Assetを指定色で描画する

### JavaScript

- Settings UIバージョンと制限値
- ファイル形式判定
- MIME未設定ファイルのData URL正規化
- 名前正規化
- 同名置換はPOST、新規管理差し替えだけPUT
- EditorへMy Presets統合
- User Presetドラッグ処理
- User PresetのOriginal / Fill切替と保存復元
- BroadcastChannelによる更新／診断応答
- Editorへ`window.open`を追加していない

## 静的確認

- 全Python compile
- 全JS `node --check`
- Editor inline script `node --check`
- HTML重複IDなし
- patch clean apply
- overlay適用後のSHA一致
- ZIP整合性
- launcher JSの基準SHA一致

## Forge実機

1. 初回表示レイアウト。
2. Accordionのキーボード操作。
3. 開閉のみでSettings dirtyにならない。
4. PNG D&D、PNGファイル選択。
5. WebP D&D。
6. 768px超過画像を未選択で元サイズ登録し、選択時は768pxへ縮小。
7. 不透明画像確認。
8. 同名3択。
9. 管理画面検索・表示切替。
10. 名前・カテゴリ変更。
11. 画像差し替え後、旧配置と新配置を比較。
12. 削除後、旧配置のCanvas／Export確認。
13. Editorのクリック中央配置。
14. Canvasへのドラッグ位置配置。
15. Originalで元色を維持し、FillでFill Color／Outline Colorを反映。
16. Fill選択後の保存復元とCanvas／Export一致。
17. Undo / Redo。
18. image / standaloneの保存分離。
19. 自己診断とコピー。
20. Editor初回focus、再接続、二重起動なし。
