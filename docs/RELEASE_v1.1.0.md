# Speech Bubble Comic Editor for Forge Neo v1.1.0

2026-10-24 — Manga Finishと保存・読込の安全性をまとめた更新です。

## 変更内容

- Manga Finishの6プリセット、CPU漫画仕上げ、原寸プレビュー・キャッシュを追加。一枚画像・4コマ・自由なコマ割り、Undo / Redo、プロジェクト保存・再読込に対応し、元画像を保持します。[操作と制約](manga-finish.md)
- 初期読込・画像デコード・復元が完了するまで保存・画像追加・未使用画像整理を禁止。失敗時は編集を止め、再読込ボタンを表示します。
- フォルダー書き出しでは合成画像とOverlayを先に取得し、旧主ファイルとバックアップ履歴を退避してから更新。通常の書込失敗では双方を復元し、復元失敗時は残した旧コピーの場所と対象ファイルを表示します。
- 出力URLにサーバーが決めた出力先IDを付与。同名ファイルの取り違えを防ぎ、曖昧な旧URLは409で拒否します。
- 変更破棄で保存済みのレイアウト・画像一覧・共有／個別トレイを復元。保存処理中の変更破棄を禁止します。
- 欠損画像は参照を削除せずプレースホルダーとして保持。保存・再読込と同じ画像の再登録による復旧に対応します。
- API・画面・診断・ブラウザーキャッシュのバージョンを1.1.0に統一。

プロジェクト形式、既存の設定・素材ID・保存場所は維持します。追加の必須ランタイム依存やモデルダウンロードはありません。Manga FinishはForge内のOpenCV・NumPy・Pillowを使用し、OpenCVを読み込めない場合はこの変換だけが503となります。

## 検証と制約

公開候補でPython 148件、Node 29スイート、実Chromiumブラウザー5スイートを実行します。GitHub Releaseは同一コミットのLinux／Windows／Chromium CIがすべて成功した場合だけ作成します。

Forge Neo／Neo2への同じ機能・保存系修正のローカル導入と隔離API検証は別途実施済みです。稼働中Forgeの再起動・実画面操作・GPU生成・AI背景削除推論は今回の公開検証には含めていません。複数ファイルの強制終了・停電に対する完全な原子性は保証しません。

## 更新

- Git導入では、既存変更と作品をバックアップしてからForgeのExtensions画面で更新します。
- 手動導入ではReleaseの `Speech-Bubble-Comic-Editor-for-Forge-Neo-v1.1.0.zip` を展開し、既存の拡張のコードを更新します。既存拡張フォルダー全体や作品データは削除しないでください。SHA256SUMS.txtでZIPのハッシュを確認できます。
- 更新後のForge再起動とブラウザー再読込は利用者のタイミングで行ってください。

旧v1.0／v1.0.1のタグとReleaseを保持します。

## English

Manga Finish adds six CPU finishing presets, full-resolution preview/cache and safe application across all three workspaces. Persistence fixes block saves after failed initialization, protect paired folder exports and backup history, disambiguate output roots, restore saved image trays on discard, and retain missing-image references. Existing formats, settings and assets remain compatible. No new mandatory runtime packages. Release publication requires successful Linux, Windows and Chromium CI on the exact source commit. Live Forge UI/GPU acceptance and crash/power-loss atomicity are outside that gate.
