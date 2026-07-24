# User Asset API V1

Base: `/speech-bubble-forge`

## エラー形式

```json
{
  "detail": {
    "ok": false,
    "code": "duplicate_name",
    "message": "A preset with the same name already exists",
    "existing_id": "...",
    "suggested_name": "ドン (2)"
  }
}
```

主なstatus:

- `400`: 不正ID、カテゴリ、名前、JSON、実形式不一致
- `404`: プリセット／アセットなし
- `409`: 同名
- `422`: 透明背景確認、非対応形式、アニメーション、4MB超過
- `500`: index破損／schema不一致

## GET `/user-assets`

カタログを返す。

```json
{
  "ok": true,
  "schema_version": 1,
  "api_version": 1,
  "revision": 3,
  "limits": {
    "recommended_side": 512,
    "resize_side": 768,
    "maximum_source_pixels": 25000000,
    "maximum_bytes": 4194304,
    "name_max_length": 48
  },
  "counts": {"sfx": 2, "stamp": 1},
  "archive": {
    "active_assets": 3,
    "archived_assets": 2,
    "pending_assets": 1,
    "old_generation_assets": 3
  },
  "presets": []
}
```

`resize_oversize`は任意です。長辺768pxを超える画像で`true`なら長辺768pxへ縮小し、`false`なら元サイズを維持します。どちらの場合も4MB・25,000,000画素の上限を適用します。

## POST `/user-assets`

新規登録、または同名処理。

```json
{
  "category": "sfx",
  "name": "ドン!!",
  "image_data_url": "data:image/png;base64,...",
  "original_name": "don.png",
  "resize_oversize": false,
  "allow_opaque": false,
  "style_defaults": {
    "mask_mode": true,
    "width": 320,
    "height": 240,
    "opacity": 1,
    "fill": "#ffffff",
    "stroke": "#111111",
    "stroke_width": 3,
    "shadow_enabled": false,
    "shadow_color": "#000000",
    "shadow_x": 6,
    "shadow_y": 6,
    "shadow_blur": 4,
    "glow_enabled": false,
    "glow_color": "#ffffff",
    "glow_opacity": 0.75,
    "glow_blur": 16,
    "glow_spread": 0
  },
  "conflict": "error"
}
```

`conflict`:

- `error`: 409を返す。
- `rename`: 未使用名を自動割当。
- `replace`: 同名プリセットIDを維持して画像を更新。

## PATCH `/user-assets/{preset_id}`

名前、カテゴリ、配置時の初期スタイルを変更する。省略した項目は既存値を維持する。

```json
{"name": "ドン改", "category": "stamp", "style_defaults": {"opacity": 0.8}, "conflict": "error"}
```

## PUT `/user-assets/{preset_id}/image`

管理画面で指定プリセットの画像だけを差し替える。名前・カテゴリは維持する。

```json
{
  "image_data_url": "data:image/webp;base64,...",
  "original_name": "replacement.webp",
  "resize_oversize": true,
  "allow_opaque": false
}
```

## DELETE `/user-assets/{preset_id}`

indexからプリセットを削除する。アセットは保存済みレイアウト保護のため保持する。

## POST `/user-assets/archive/organize`

現行indexから参照されていない旧世代画像とサムネイルを`archive/`へ移動する。Asset APIはArchiveも検索するため、旧画像を参照する保存済みレイアウトは引き続き表示・書き出しできる。

## GET `/user-assets/asset/{asset_id}`

正規化済み画像を返す。`asset_id`は64桁SHA-256。immutable cache headerを返す。

## GET `/user-assets/thumbnail/{asset_id}`

192px以内のlossless WebPサムネイルを返す。

## POST `/diagnostics`

```json
{"frontend_version": "1.0.0"}
```

バックエンド診断結果を返す。Editor handshakeはSettings JS側で追加する。
