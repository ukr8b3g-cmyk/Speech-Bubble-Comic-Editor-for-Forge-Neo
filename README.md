# Speech Bubble Editor for WebUI Forge Neo

Version: **0.4.0**

ComfyUI **Speech Bubble Layer** のHTMLエディターとPillow描画処理を、WebUI Forge Neoで単独動作するよう移植した拡張です。ComfyUIは不要です。

## インストール

ZIPを展開し、`sd-webui-speech-bubble-forge-neo` フォルダーをForge Neoの `extensions` 直下へコピーします。

```text
stable-diffusion-webui-forge/
└─ extensions/
   └─ sd-webui-speech-bubble-forge-neo/
```

Forge Neoを再起動し、ブラウザーを `Ctrl+F5` で更新してください。追加のpipインストールは不要です。

## Forge側UI

- `Speech Bubble Editor` パネルをtxt2img / img2imgの **Script欄の直前**へ表示します。
- `選択中の生成画像を開く ↗` は、ギャラリーで選択中の画像をEditorへ渡します。
- `エディターを開く ↗` は、画像なしのEditorを別ウィンドウで開きます。
- ギャラリー下へ **吹き出し＋斜めペン** アイコンを追加します。
- Editorは常に1ウィンドウだけです。再度押すと既存ウィンドウへフォーカスします。
- Forgeのライト／ダークテーマを自動検出してEditorへ反映します。

## ローカル画像

画像なしでEditorを開いた後、次の方法で読み込めます。

- `Open Image…` / `画像ファイルを選択`
- キャンバスへのドラッグ＆ドロップ
- `Ctrl+V` によるクリップボード画像の貼り付け

対応形式はPNG / JPEG / WebPです。ファイル選択後にポップアップを開かないため、ブラウザーが誤ってポップアップを遮断する問題を回避します。

## Editor上部ボタン

- **Close**: Editorを閉じます。自動保存ONなら現在画像の下書きを保持します。
- **Discard Changes**: 未保存変更を破棄し、最後に明示保存した画像ごとのレイアウトへ戻します。
- **Save Layout**: レイアウトJSONだけを保存します。画像は書き出しません。
- **Export Image**: 現在の状態から合成PNGを書き出します。明示保存レイアウトは変更しません。

`Export Image`は主要色、`Save Layout`は通常色、`Discard Changes`は警告色です。

## 画像ごとのレイアウト保存

画像内容のSHA-256をキーに、次を分離して保持します。

```text
明示保存したレイアウト
自動保存中の下書き
```

- 同じ画像はForge再起動後やtxt2img / img2img切替後も復元します。
- 新しい画像へ別画像のレイアウトを自動適用しません。
- 明示保存レイアウトはForgeの `config/speech-bubble-forge/layouts` に保存します。
- 編集中の下書きはブラウザーのlocalStorageへ保存します。

## Settings > Speech Bubble Editor

- 保存先
- 初期ウィンドウ幅／高さ
- Supersample（1～4）
- 自動保存 ON／OFF
- 画像ごとのレイアウトを保持
- Overlay PNGも同時保存
- 素材キャッシュ再構築

## 画像書き出し

設定した保存先へ重複しない名前で保存します。

```text
*_YYYYMMDD_HHMMSS_*.png
*_YYYYMMDD_HHMMSS_*_overlay.png  # 設定ON時
```

元画像は変更・上書きしません。書き出し後はForgeへフォーカスを戻し、生成ギャラリー付近へ結果リンクとサムネイルを追加します。

## アセット方針

収録済みフルカラーPNG / WebPは完成アセットとして扱います。再描画、白黒化、マスク化、Tint、アウトライン焼き込み、減色、再圧縮は行いません。表示時の変形と、レイアウトに明示された効果だけを適用します。
