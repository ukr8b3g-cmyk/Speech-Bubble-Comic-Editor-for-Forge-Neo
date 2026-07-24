# User Presets / Self Diagnostics V1 操作マニュアル

## User Presetを登録する

1. Forgeの`Settings`を開く。
2. `Speech Bubble Editor`を表示する。
3. `User Presets`を開く。
4. 登録先を`SFX`または`Stamp`から選ぶ。
5. PNG／WebPをドロップするか、`ファイルを選択`を押す。
6. 左のプレビューと画像情報を確認する。
7. 右側で名前、種類、Size／Width／Height／Opacity、Original／Fill、色、Outline Width、Drop Shadowを設定する。
8. `登録する`を押す。

登録は即時保存される。上部の`Apply settings`は不要。

## 画像条件

- 対応: PNG、静止WebP
- 推奨: 長辺512px程度
- 任意縮小: 長辺768px
- 元画像上限: 25,000,000画素
- 最大容量: 4MB
- 透明背景推奨

長辺768pxを超える画像は、`長辺768pxへ縮小して登録する（任意）`を選ぶと縮小し、未選択なら元サイズのまま登録できる。大画像は保存容量、メモリ、Canvas、Export処理の負荷が増える場合があるため、通常は縮小を推奨する。不透明画像は、`透明背景なしでも登録する`へチェックした場合だけ登録できる。

## 同じ名前がある場合

- `既存を置換`: 警告確認後、同名ユーザープリセットの表示内容を新しい画像へ更新する。
- `別名で保存`: 候補名を名前欄へ入れ、自由に変更してから登録する。

管理画面の再編集では、`上書き保存`と`別名で保存`を選べます。上書き時は警告を表示します。内蔵素材は上書き対象外です。
- `キャンセル`: 何も変更しない。

既存を置換しても、過去にCanvasへ配置済みのレイヤーは以前の画像を維持する。

## プリセットを管理する

1. `プリセット管理`を押す。
2. SFX／Stampタブを選ぶ。
3. 名前で検索する。
4. 必要に応じてグリッド／リスト表示を切り替える。
5. 各カードの`…`から操作する。

操作:

- 名前・種類・初期スタイルを編集
- 画像を差し替え
- 削除

編集画面は左がプレビュー、右が設定の2カラム構成。初期スタイルの変更は次回配置分から適用され、配置済みレイヤーは変わらない。削除しても配置済みレイヤー用の画像ファイルは保持される。

## Editorで使用する

1. Speech Bubble Editorを開く。
2. `Onomatopoeia / SFX`または`Comic Stamps / Symbols`を開く。
3. `My Presets`を開く。
4. サムネイルをクリックするとCanvas中央へ配置される。
5. サムネイルをCanvasへドラッグするとドロップ位置へ配置される。

配置後は既存素材と同じ移動、拡大縮小、回転、Opacity、Drop Shadow、Undo / Redoを使用できる。

Propertiesの`Color Mode`では次を選択できる。

- `Original`: 登録画像の元の色を保持する。
- `Fill`: 透明度を形状としてFill Color／Outline Colorを適用する。

既存レイアウトは保存済みの表示を維持し、新規配置はプリセットに保存したOriginal／Fillと初期スタイルで開始する。Fillの選択はレイアウトへ保存され、CanvasとExport Imageで同じ結果になる。不透明画像をFillへ切り替えると画像全体の矩形が着色される。

## Forge起動パネルの開閉状態

txt2img／img2imgの`Speech Bubble Editor`起動パネルは開閉状態をタブ別に保存する。`Ctrl+F5`後も前回の開閉状態へ戻る。

## Self Diagnostics

1. Settingsの`Cache & Diagnostics`を開く。
2. `自己診断を実行`を押す。
3. 結果を確認する。
4. 問い合わせ時は`レポートをコピー`で内容を共有する。

診断はEditorを勝手に開かず、設定や画像、レイアウトを変更しない。Editor未起動時のHandshakeは`skip`になる。

## データの場所

User PresetはForgeユーザーデータ領域の次へ保存される。

```text
config/speech-bubble-forge/user-presets
```

拡張更新時にこのフォルダーを削除しない。
