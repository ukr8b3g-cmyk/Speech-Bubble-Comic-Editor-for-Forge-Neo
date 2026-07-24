# User Presets V1 セキュリティ仕様

## 入力境界

- 拡張子やMIMEだけを信用しない。
- Pillowでデコード後、`source.format`を確認する。
- 宣言形式と実形式が一致しない場合は拒否する。
- WebPは`n_frames == 1`のみ許可する。
- 入力・正規化後4MB、元画像25,000,000画素、登録数1000件を上限とする。
- 長辺768px超過画像は任意縮小とし、未選択時は元サイズを保持する。大画像はメモリ・Canvas・Export負荷が増えるためUIとREADMEで縮小を推奨する。
- Pillow DecompressionBombWarningをエラーとして扱う。

## 保存境界

- 受信したファイル名を保存パスに使わない。
- UUIDとSHA-256以外をパス構築に使用しない。
- asset IDは`^[a-f0-9]{64}$`。
- preset IDは正規UUID形式。
- resolve後のパスが`assets`／`thumbnails`配下であることを確認する。
- index、asset、thumbnailは一時ファイルから`os.replace`する。

## 内容正規化

- EXIF向きを反映する。
- RGBAへ変換する。
- PNGまたはlossless WebPへ再エンコードする。
- 不要メタデータや埋め込みプロファイルをそのまま保存しない。
- サムネイルも再生成する。

## 整合性

- index schemaを検証する。
- 重複preset IDを拒否する。
- 壊れたindexを自動初期化しない。
- `index.json.bak`を保持する。
- 診断は一時ファイル以外を書き換えない。

## V1で意図的に残すデータ

画像差し替え・削除後も古いassetを削除しない。これは保存済みレイアウトの再現性を優先した仕様であり、孤立assetの安全な整理はV2以降のバックアップ／参照解析と合わせて設計する。
