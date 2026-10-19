# Speech Bubble Comic Editor for Forge Neo v1.0.1

**2026-10-19 — Stability and data-protection maintenance release.**

This release updates the canonical Forge Neo extension, not the retired `sd-webui-speech-bubble-forge-neo` legacy repository.

## 変更内容（日本語）

- **書き出し時の既存画像保護**: 合成画像と有効時のOverlay PNGを先に一時ファイルへ書き込み、全件の画像エンコードが成功した場合だけバックアップと本ファイルの更新を開始します。バックアップ回転・最終置換でエラーが発生した場合は、既存の主ファイルをスナップショットから復旧する処理を追加しました。
- **画像書き出し競合の軽減**: 連番付きファイル名の決定を保存ロック内に移し、同一プロセスからの並行採番の競合を抑制します。
- **破損レイアウトを安全に拒否**: 旧互換レイアウトの保存済みJSONが配列や数値等の不正な形式だった場合、HTTP 500ではなくHTTP 400を返します。読み込みエラー時に既存の保存ファイルを書き換えません。
- **v1.0以降の8コミットを収録**: プロジェクト保存競合と自動保存再試行の改善、Forge Neoの出力先とOverlay設定の反映、ユーザーSFX/スタンプURL処理、回帰テスト強化、バージョン整合。
- **バージョン表記の統一**: UIとmetadata.iniは`1.0.1`、API・診断の内部バージョンは`1.0.1`です。現行プロジェクトの保存形式・ID・拡張のインストール先・追加必須ランタイム依存は変更していません。

**制限事項**: 2つの異なる出力ファイルを停電や強制終了を含め完全に原子的に更新する仕組みではありません。バックアップ回転途中の失敗時は履歴の世代が進む場合があります。復旧不能なファイルシステム障害では、スナップショットを残してエラーを返します。大事な作品は別途バックアップしてください。実Forge Neoホスト／GPU生成／AI背景削除モデルの操作はこの隔離CIの合格だけでは保証されません。

## English

- Stage both composite and optional overlay outputs before changing previous saved images or backup generations. On ordinary encoding and publishing errors, preserve or restore the prior primary files from snapshots, where possible.
- Move sequential filename allocation under the export lock.
- Corrupted legacy layout documents with a non-object JSON root return HTTP 400 without modifying stored data.
- Include post-v1.0 changes addressing project save races, autosave retries, Forge Neo output/overlay settings, and user SFX URL portability.
- Keep stored project formats, extension APIs and user asset identifiers backward compatible. No new mandatory runtime packages.
- Note that multi-file crash/power-loss atomicity is **not guaranteed**.

## インストール／更新

Forge Neo → Extensions → Install from URL:

`https://github.com/ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo.git`

Git導入の場合は対象拡張フォルダーで変更・remoteを確認後、`git pull --ff-only`してください。Forge Neoを再起動し、必要に応じてブラウザーを強制再読込してください。旧版と正本を同時導入しないでください。

[Canonical repository](https://github.com/ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo) · [README](https://github.com/ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo/blob/main/README.md)
