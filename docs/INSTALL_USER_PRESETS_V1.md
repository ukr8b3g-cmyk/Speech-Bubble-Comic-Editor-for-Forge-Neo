# User Presets V1 インストール／更新手順

## 推奨: 完成版ZIPで更新

1. Forge Neoを完全終了する。
2. 現在の拡張フォルダーをバックアップする。
3. 完成版ZIPを展開する。
4. `sd-webui-speech-bubble-forge-neo`フォルダーをForgeの`extensions`直下へ配置する。
5. 既存フォルダーへ上書きする場合、ユーザーが変更した未追跡ファイルを削除しない。
6. Forgeを起動する。
7. ブラウザーで`Ctrl+F5`を実行する。

ユーザープリセット画像は拡張フォルダーではなく、Forgeのユーザーデータ領域に保存される。

## 既存ローカル差分へパッチキットを適用

パッチキットには、差分パッチ、変更ファイルだけのoverlay、適用スクリプト、基準SHA-256を含む。

### PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\apply_patch.ps1 `
  -Destination "C:\path\to\stable-diffusion-webui-forge\extensions\sd-webui-speech-bubble-forge-neo"
```

### Bash

```bash
bash tools/apply_patch.sh /path/to/extensions/sd-webui-speech-bubble-forge-neo
```

適用スクリプトは次を行う。

- 対象パスを確認する。
- V1変更対象の既存ファイルをtimestamp付きフォルダーへバックアップする。
- overlayを上書きする。
- 未知のファイルを削除しない。
- Git履歴や未コミット差分を操作しない。

基準SHAが一致しないファイルは警告する。警告が出た場合は自動的に古い版へ戻さず、`patches/user-presets-v1.patch`を参照して手動マージする。

## 更新後の確認

```bash
python -m compileall -q speech_bubble_forge scripts
python -m pytest -q
node --check javascript/speech_bubble_settings.js
```

Forge実機:

1. Settings > Speech Bubble Editorを開く。
2. User Presetsへ透過PNGを1件登録する。
3. Editorを開き、My Presetsから配置する。
4. Export Imageで表示一致を確認する。
5. Cache & Diagnosticsから自己診断を実行する。

## ロールバック

適用スクリプトが作成した`_speech_bubble_v1_backup_<timestamp>`内のファイルを元の相対パスへ戻す。

注意:

- User Presetデータは別領域なので、コードを戻しても自動削除されない。
- `index.json`や画像を手作業で削除しない。
- V1コードへ戻した後もデータを保全したい場合は、`config/speech-bubble-forge/user-presets`を別途コピーする。
