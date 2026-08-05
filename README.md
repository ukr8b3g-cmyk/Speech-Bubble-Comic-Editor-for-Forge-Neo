# Speech Bubble Comic Editor for Forge Neo

Forge Neoで生成した画像や手元の画像を、一枚絵・4コマ漫画・自由なコマ割りのコミックへ編集・仕上げするローカル漫画エディターです。

Forge Neo上では **Comic Panel Editor** と表示されます。吹き出し、文字、縦書き、SFX、スタンプ、フレーム、集中線を重ね、画像の配置、コマ割り、背景処理、コミック変換、書き出しまでを同じプロジェクト内で行えます。

> **Local post-production comic editor for Forge-generated and imported artwork.**

## 主な機能

- 「一枚画像」「4コマ漫画」「コミック」の3ワークスペース
- Forgeギャラリーの選択画像、ローカルPNG／JPEG／WebP、クリップボード画像の読み込み
- 3モードで共有できる折りたたみ式の「ページ画像」トレイ
- 複数画像レイヤー、表示、ロック、順序、移動、拡大縮小、回転、不透明度
- 4コマのコマ高さ・余白・見出し・枠線・背景の編集
- コミックの縦横分割、結合、表示／非表示、斜め境界、一定幅のコマ間隔
- Speech Bubbles、Text、縦書き、SFX、Stamps、Frames、Emphasis Lines
- ベジェ曲線で編集できる吹き出しとユーザープリセット
- 単色、グラデーション、網点、雲、木目、集中線など23種類のCanvas背景
- グレースケール、白黒コミック、モノクロ、XDoGのコミック変換
- isnet-animeによるAI背景削除、ブラシ、自動選択、マスク補正
- フリンジ、不要色、白マット、黒マットのエッジカラー補正
- Undo／Redo、自動保存、ローカルプロジェクト保存、PNG／JPEG／WebP書き出し
- 日本語／英語の切り替え、操作ボタンと入力欄のマウスオーバー説明
- テレメトリー、広告、クラウド同期なし

## 対応環境

- Forge Neo
- Windowsを主な検証対象としています
- ライセンス: [MIT](LICENSE)

この拡張はForge Neo本体を変更せず、拡張フォルダー内で動作します。ComfyUIは必要ありません。

## インストール

Forge Neoを終了してから、Forge Neoの`extensions`フォルダーへ配置します。

通常のForge Neo構成例:

```powershell
cd C:\stable-diffusion-webui-forge\extensions
git clone https://github.com/ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo.git
```

Stability Matrixの構成例:

```powershell
cd D:\StabilityMatrix\Data\Packages\Forge-Neo\extensions
git clone https://github.com/ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo.git
```

Forge Neoの設置場所を変更している場合は、実際の`Forge-Neo\extensions`または`stable-diffusion-webui-forge\extensions`を使用してください。配置後にForge Neoを起動または再起動します。追加の必須Pythonパッケージはありません。

更新:

```powershell
cd D:\StabilityMatrix\Data\Packages\Forge-Neo\extensions\Speech-Bubble-Comic-Editor-for-Forge-Neo
git pull
```

フォルダー名を`sd-webui-speech-bubble-forge-neo`として既に導入している場合も、そのまま更新できます。

## 起動

1. Forge Neoの`txt2img`または`img2img`を開きます。
2. **Comic Panel Editor**を展開します。
3. **コミックパネルエディターを開く ↗**を押します。
4. 別ウィンドウでEditorが開きます。

Forge設定でEnglishを選ぶと、ボタンは**Open Comic Panel Editor ↗**になります。同じEditorウィンドウが開いている場合は、新しいウィンドウを増やさず既存ウィンドウへフォーカスします。

上部の「新規プロジェクト」は確認後に無題プロジェクトを作成します。最初に名前入力を要求しないため、すぐ編集を開始できます。タイトルはEditor上部で後から変更できます。

## 画像の読み込みとページ画像

### Forgeの生成画像

Forgeギャラリーで画像を選択し、Editor上部の「Forge選択画像を追加」を押します。画像は「ページ画像」へ登録され、初期設定では現在のモードにも配置されます。

### ローカル画像

- キャンバスへPNG／JPEG／WebPをドラッグ
- 「ページ画像」の「＋ 画像を追加」
- 一枚画像のLayersにある「＋ Image」
- `Ctrl+V`でクリップボード画像を貼り付け

「ページ画像」は初期状態では折りたたまれています。見出し行全体をクリックして開閉できます。サムネイルは縦横比を保ち、選択中と使用中をバッジで区別します。画像名などの詳細はマウスオーバーで確認できます。

新しく配置した画像レイヤーは初期状態でロックされないため、すぐに移動・拡大縮小できます。誤操作を防ぐ場合はLayersの鍵を有効にしてください。

## 3つの編集モード

### 一枚画像

Canvas背景の上へ複数の画像や素材を重ねるモードです。背景削除やコミック変換の結果は新しい画像レイヤーとして追加され、元画像を残したまま比較・再編集できます。

### 4コマ漫画

縦4コマのページです。キャンバス寸法、余白、コマ間隔、枠線、見出し、各コマの背景を編集できます。ページ画像のサムネイルを目的のコマへドラッグすると配置できます。

### コミック

標準5コマを基点に、コマを縦分割・横分割・結合・非表示にできます。境界端のハンドルで斜め境界を作り、中央ハンドルまたは境界線のドラッグで角度を保ったまま平行移動できます。

- `Shift`を押しながら端点をドラッグ: 15度刻みで吸着
- 水平／垂直付近: 通常操作でも吸着
- `Alt`を押したまま離す: 自動吸着を一時的に無効化

青い境界ガイドとハンドルは編集表示で、画像書き出しには含まれません。

## 素材とLayers

左パネルからSpeech Bubbles、Text、SFX、Stamps、Frames、Emphasis Linesを追加できます。各「Browse…」から開く素材Drawerは個別に幅を変更でき、幅とMy Presets／Built-inの開閉状態を保存します。最小幅でも素材は2列で表示されます。

4コマとコミックでは、素材を漫画ページ上または特定のコマ内へ配置できます。コマ内の素材はコマ形状でクリップされます。重なって選択しにくい場合は、フローティングのLayersから対象を選び、Propertiesで調整してください。PropertiesとLayersは移動・リサイズでき、位置と大きさを保存します。

吹き出しはPropertiesでベジェ曲線のアンカーとハンドルを編集できます。`Finish Path`で確定後、ユーザープリセットとして保存するとMy Presetsから再利用できます。Built-inは上書きされません。

## コミック変換

「コミック変換を開く」からカラー画像を変換します。

- 単純グレースケール
- 白黒コミック
- 単純モノクロ
- XDoG 100

プレビューで設定を調整し、適用時は元解像度で処理します。結果は元画像を破壊せず、新しいページ画像または画像レイヤーとして追加されます。

## AI背景削除

「背景削除を開く」から選択画像を透過できます。自動処理の後に、復元ブラシ、消しゴム、自動選択、マスクしきい値、拡張・縮小、境界ぼかし、穴埋め、小領域除去で調整できます。

エッジカラー補正では、輪郭のアルファ形状を維持したままRGBを補正します。

- フリンジ削除
- 不要色を除去
- 白マット削除
- 黒マット削除

isnet-animeモデル（約168MB）は同梱していません。モデルがない状態で背景削除を初めて実行すると取得確認を表示し、承認した場合だけダウンロードします。Forge Settingsから明示的に「モデルを取得」を押すこともできます。モデル取得後の推論と画像処理はローカルで実行され、画像は外部へ送信されません。

## Forge Settings

設定はForge Neo本体の`Settings > Comic Panel Editor`から変更します。Editor内には重複するSettingsボタンや、効果のない独立Settings画面を設けていません。設定を適用すると、開いているComic Panel Editorにも表示言語やページ画像の動作が反映されます。

主な設定:

- 表示言語: 自動／日本語／English
- 空の一枚画像に「画像をドロップ」を表示するか（初期値OFF）
- ページ画像を3モードで共有するか（初期値ON）
- Forge画像を現在のモードへ配置するか、ページ画像へ追加だけにするか
- PNG／JPEG／WebP、品質、圧縮、ファイル名、保存先、バックアップ
- Editorウィンドウ、Supersample、自動保存、前回レイアウト
- SFX／StampのUser Presets
- 編集キャッシュ、素材キャッシュ、自己診断
- AI背景削除モデルの取得状態、取得、中止、削除

言語変更はEditorの主要UI、Properties、Layers、素材Drawer、背景削除、コミック変換へ反映されます。日本語／Englishの切り替えはEditorを開き直さなくても反映されます。ユーザーが入力した文字やプリセット名は翻訳しません。

## 保存と書き出し

プロジェクトはForge Neoのローカルデータ領域に保存されます。Editor上部の「プロジェクトを保存」で明示保存でき、自動保存も利用できます。「プロジェクトを開く」から保存済みプロジェクトを選択します。

画像書き出しはPNG／JPEG／WebPと透明Overlay PNGに対応します。保存先、形式、品質、同名ファイルの世代バックアップはForge Settingsで設定します。

## 主なショートカット

| 操作 | 動作 |
| --- | --- |
| `Ctrl+N` | 新規プロジェクト |
| `Ctrl+S` | プロジェクト／レイアウトを保存 |
| `Ctrl+Shift+S` | 画像を書き出す |
| `Ctrl+Z` | 元に戻す |
| `Ctrl+Y`／`Ctrl+Shift+Z` | やり直す |
| `Ctrl+C`／`Ctrl+V` | レイヤーをコピー／貼り付け |
| `Ctrl+J` | レイヤーを複製 |
| `Ctrl+G`／`Ctrl+Shift+G` | グループ化／解除 |
| `T` | Textレイヤーを追加 |
| `Delete`／`Backspace` | 選択対象を削除 |
| `Ctrl+0` | 全体表示 |
| ホイール | キャンバスをズーム |
| 中ボタンドラッグ、またはSpace＋左ドラッグ | キャンバスを移動 |
| コマ画像を選択して`Ctrl`＋ホイール | コマ内画像を拡大縮小 |

背景削除画面では`B`で復元ブラシ、`E`で消しゴム、右ドラッグの横移動でブラシサイズを変更します。

## データとプライバシー

画像、プロジェクト、プリセット、設定、診断情報はローカルへ保存します。テレメトリー、広告、開発者運営サーバー、クラウド同期、自動アップロードはありません。ネットワーク通信が必要なのは、ユーザーが許可したAI背景削除モデルの取得などに限られます。

詳細は[PRIVACY.md](PRIVACY.md)、セキュリティ報告は[SECURITY.md](SECURITY.md)、モデルと第三者コンポーネントは[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)を参照してください。

## English

**Speech Bubble Comic Editor for Forge Neo** is a local post-production comic editor for Forge-generated and imported artwork. The Forge UI shows the short name **Comic Panel Editor**.

It provides three independent workspaces—Single Image, 4-Panel Manga, and Comic—plus Page Images, layers, speech bubbles, text and vertical writing, SFX, stamps, frames, emphasis lines, procedural backgrounds, comic conversion, AI background removal, local project persistence, and PNG/JPEG/WebP export.

Install it under `Forge-Neo/extensions`, restart Forge Neo, expand **Comic Panel Editor** in `txt2img` or `img2img`, and click **Open Comic Panel Editor ↗**. Language, Page Images behavior, export, presets, cache, diagnostics, and the optional AI model are managed from `Settings > Comic Panel Editor` in the Forge Neo window. Changes to the display language are also sent to an Editor window that is already open.

The optional isnet-anime model is not bundled. It is downloaded only after the user approves the first-use prompt or clicks **Download Model** in Forge Settings. Processing remains local.

## ライセンス / License

[MIT License](LICENSE)
