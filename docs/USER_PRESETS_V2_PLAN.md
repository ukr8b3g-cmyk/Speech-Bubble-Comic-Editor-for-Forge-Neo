# User Presets V2 実装計画

V2はV1の保存形式と不変asset IDを維持したまま、次の3機能を段階導入する。

1. 一括登録
2. ZIPバックアップ／復元
3. 手動並べ替え

一度に全機能を混在させず、`2A → 2B → 2C`の順で実装・リリースする。

---

## V2A: 一括登録

### 目的

複数PNG／静止WebPを、登録前に一覧確認してから安全に追加する。

### UI

- Settingsのドロップ領域と追加ダイアログで複数ファイルを受け付ける。
- 1件時はV1ダイアログを維持する。
- 2件以上は`一括登録キュー`を開く。

各行:

- サムネイル
- 元ファイル名
- 表示名
- カテゴリ
- 寸法／形式／容量／透明背景
- 状態: 待機、要確認、登録中、完了、失敗、キャンセル
- リサイズ確認
- 不透明確認
- 同名処理
- 行削除

上部一括操作:

- 全件カテゴリをSFX／Stampへ設定
- 全件の超過画像を768pxへ縮小する／個別確認
- 同名時の既定動作: 停止、別名、置換
- `有効な項目を登録`
- `キャンセル`

### 制限

- 1回最大100ファイル。
- 入力合計最大128MB。
- 1ファイル4MB。
- 元画像25,000,000画素／件。
- 同時解析2件、同時API送信2件。
- UI threadを長時間占有しない。

### 実装方針

第一段階ではV1の単体POSTをクライアント側キューから並列度2で再利用する。これによりサーバー側の巨大multipart処理を増やさず、1件ごとの原子性を維持する。

キュー項目ごとに:

1. preflight解析
2. ユーザー確認
3. POST
4. 成功時revision記録
5. 失敗時その行だけ停止

全件完了後に`catalog_changed`を1回だけ送る。途中キャンセルでは未送信項目だけ停止し、既に登録済みの項目を自動ロールバックしない。結果サマリーに成功／失敗／未処理を明示する。

### API拡張の判断

100件規模で単体POSTのオーバーヘッドが問題になった場合のみ、次を追加する。

```text
POST /speech-bubble-forge/user-assets/batch
```

ただし、base64を巨大JSON一件にまとめない。multipartまたは一時upload token方式を採用し、サーバー側でも総容量・件数・個別容量を検証する。部分成功結果を項目別に返す。

### テスト

- 100件上限
- 128MB合計上限
- PNG/WebP混在
- 一部壊れた画像
- 同名混在
- キャンセル
- 送信並列度2
- catalog更新通知1回
- 1件失敗で他件を失わない

---

## V2B: ZIPバックアップ／復元

### 目的

User Presetを別環境へ安全に移行し、更新前の退避を可能にする。

### ZIP構造

```text
speech-bubble-user-presets-v2.zip
├─ manifest.json
├─ index.json
├─ checksums.sha256
├─ assets/
│  └─ <sha256>.<png|webp>
└─ thumbnails/
   └─ <sha256>.webp
```

`manifest.json`:

```json
{
  "format": "speech-bubble-forge-user-presets",
  "archive_version": 1,
  "created_at": "...",
  "extension_version": "...",
  "index_schema_version": 1,
  "preset_count": 20,
  "asset_count": 18
}
```

### エクスポート

- indexで参照されるassetとthumbnailを収録する。
- V1で保持された旧assetは、保存済みレイアウト保護用の`retained_assets`として任意収録できる設計にする。
- 全ファイルのSHA-256一覧を作る。
- ZIP生成中は一時ファイルを使用し、完成後のみダウンロード可能にする。
- 元データを変更しない。

### インポート前検査

ZIPを直接本番フォルダーへ展開しない。専用stagingへ展開してから検査する。

必須防御:

- `..`、絶対パス、ドライブ文字、NULを含むentry拒否
- symlink／hardlink／device entry拒否
- entry数上限5000
- ZIPファイル最大512MB
- 展開後合計最大1GB
- 圧縮率上限を設けZIP bombを拒否
- manifest format／version検証
- index schema検証
- asset IDと実SHA-256一致
- image verify／静止WebP確認
- thumbnail verify
- 不明な余剰ファイルを拒否または明示警告

### Dry Run

復元前に必ず差分を表示する。

- 新規プリセット数
- 同一プリセットID
- 同名競合
- 同一asset
- 欠損／破損
- schema互換性

競合方針:

- `merge_new`: 新規だけ追加
- `rename_conflicts`: 同名を別名
- `replace_by_preset_id`: 同一preset IDのみ置換
- `replace_all`: 明示確認付き完全置換
- `cancel`

### 原子的復元

1. stagingへ展開
2. 全検証
3. 現行indexと必要assetをtimestamp付きbackupへ保存
4. assetをcontent-addressed保存先へコピー
5. 新indexを一時ファイルへ生成
6. `os.replace`
7. 失敗時は旧indexへ戻す
8. 成功後`catalog_changed`を1回送る

### API案

```text
POST /speech-bubble-forge/user-assets/backup
POST /speech-bubble-forge/user-assets/restore/preflight
POST /speech-bubble-forge/user-assets/restore/commit
DELETE /speech-bubble-forge/user-assets/restore/{token}
```

restore tokenは短時間有効、推測困難、保存ルート外アクセス不可。未完了stagingは期限後に削除する。

### テスト

- 正常export/import
- checksum改ざん
- path traversal
- symlink
- ZIP bomb
- entry過多
- 欠損asset
- schema不一致
- 競合各方式
- commit途中失敗とrollback
- V1 index互換

---

## V2C: 手動並べ替え

### 目的

管理画面とEditorのMy Presetsをユーザー指定順で表示する。

### Schema

既存presetオブジェクトへ連番を直接埋め込むより、カテゴリ別順序配列を追加する。

```json
{
  "schema_version": 2,
  "revision": 42,
  "order": {
    "sfx": ["preset-uuid-1", "preset-uuid-2"],
    "stamp": ["preset-uuid-3"]
  },
  "presets": []
}
```

移行:

- schema 1読込時は現在の配列順から`order`を生成する。
- schema 2書込前に全preset IDが正確に1回含まれるよう正規化する。
- 欠損IDは末尾へ追加し、未知IDは除外する。

### UI

- 管理画面へ`並べ替え`モードを追加。
- ドラッグハンドルのみで移動し、カード本体クリックと競合させない。
- キーボード操作:
  - Spaceで掴む／離す
  - Arrowで移動
  - Home / End
  - Escapeでキャンセル
- 現在位置と移動先をaria-liveで通知する。
- 検索中は並べ替えを無効化するか、全件順序への影響を明確にする。推奨は検索解除を要求する。

### API

```text
PATCH /speech-bubble-forge/user-assets/order
```

```json
{
  "category": "sfx",
  "preset_ids": ["...", "..."],
  "expected_revision": 41
}
```

- `expected_revision`不一致は409。
- サーバーはカテゴリ内ID集合が完全一致することを検証する。
- 更新はindexの原子的置換1回。
- 成功後revisionを返す。

### フロントエンド

- ドラッグ中はUI内でoptimistic表示してよい。
- API失敗／409時は最新catalogを再取得し、元順へ戻す。
- EditorのMy Presetsだけ手動順を使用する。
- Built-in素材の順序、お気に入り、使用回数ソートを変更しない。
- 管理画面の`名前順／新しい順`表示は手動順を破壊しない一時表示とする。

### テスト

- schema 1→2移行
- ID重複／欠損／別カテゴリ混入拒否
- revision競合
- keyboard reorder
- D&D reorder
- API失敗rollback
- Editor即時反映
- Built-in順序不変

---

## V2共通の変更禁止

- Forge Neo本体
- Editor起動・再接続・focus
- PING / PONG / ACK / requestId
- image / standalone分離
- Save Layout / Export Image
- Emphasis Lines
- 既存Built-in素材

## V2完了条件

- V1データを無変換で読み込める、または明示的で可逆なschema移行を行う。
- 一括登録の部分失敗で既存データを失わない。
- ZIP復元はpreflightとrollbackを持つ。
- 並べ替えはrevision競合を検出する。
- 全操作後も既存配置レイヤーの不変asset_idを維持する。
