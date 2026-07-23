# Codex Instructions

このフォルダーはWebUI Forge Neo用の完成済み単体拡張です。

## 設置

フォルダー全体をForge Neoの `extensions` 直下へコピーし、Forge Neoを再起動します。

## 必須維持

- Forge本体ファイルを直接変更しない
- Speech Bubble EditorパネルはScript欄の直前
- ギャラリーの吹き出し＋斜めペンアイコン
- エディターは1ウィンドウのみ
- ローカル画像はEditor内で選択・D&D・貼り付け
- 画像SHA-256ごとの明示レイアウトと下書きを分離
- Close / Discard Changes / Save Layout / Export Imageを分離
- Save Layoutで画像を書き出さない
- Export Imageで明示レイアウトを暗黙保存しない
- 元画像を上書きしない
- ライト／ダークテーマ追従
- Settingsの保存先、ウィンドウサイズ、Supersample、自動保存、画像ごとの保持、Overlay、キャッシュ再構築

## アセット処理禁止

`web/assets` 内の完成PNG / WebPに対し、再描画、再生成、減色、再圧縮、白黒化、マスク化、Tint、アウトライン焼き込み、自動トリミングを行わないでください。

不具合修正では関連ファイルだけを確認し、最小差分で変更してください。
