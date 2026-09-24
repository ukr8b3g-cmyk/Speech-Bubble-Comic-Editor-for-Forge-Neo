# Speech Bubble Comic Editor for Forge Neo

Forge Neoで生成した画像や手元の画像を、一枚絵・4コマ漫画・自由なコマ割りのコミックへ編集・仕上げするローカル漫画エディターです。

Forge Neo上では **Comic Panel Editor** と表示されます。吹き出し、文字、縦書き、SFX、スタンプ、フレーム、集中線を重ね、画像の配置、コマ割り、背景処理、コミック変換、書き出しまでを同じプロジェクト内で行えます。

> **Local post-production comic editor for Forge-generated and imported artwork.**

## 2026-09-24 保守更新

JSON APIの受信上限を統一し、プロジェクト新規作成は一時ディレクトリーで完成させてから公開する方式へ変更しました。Data URLのCR/LF、互換Pillow出力の吹き出し装飾も修正しています。既存プロジェクト、保存先、画像・プリセットの形式は変更していません。

現行画面のCSS/JavaScriptを `web/project/editor-shell.css` / `editor-shell.js` へ分離しました。旧Editorの専用資産は `web/legacy/` へ隔離していますが、旧HTML・資産URLと互換APIは引き続き利用できます。追加の必須ランタイムパッケージはありません。

構造と互換範囲は [ARCHITECTURE](docs/ARCHITECTURE.md)、検証方法と実機チェック項目は [VALIDATION](docs/VALIDATION.md)、過去の検証記録は [Archive](docs/archive/README.md) を参照してください。

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
- ベース画像の直接編集、選択マスク、ペイント、対象色別の部分色変更、トーンカーブに対応する簡易レタッチ
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

Forge Neoを終了してから、拡張フォルダーへ配置します。

```powershell
cd D:\StabilityMatrix\Data\Packages\Forge-Neo\extensions
git clone https://github.com/ukr8b3g-cmyk/Speech-Bubble-Comic-Editor-for-Forge-Neo.git
```

Stability Matrixのパッケージ場所を変更している場合は、実際の`Forge-Neo\extensions`を使用してください。配置後にForge Neoを起動または再起動します。追加の必須Pythonパッケージはありません。

更新:

```powershell
cd D:\StabilityMatrix\Data\Packages\Forge-Neo\extensions\Speech-Bubble-Comic-Editor-for-Forge-Neo
git pull --ff-only
```

フォルダー名を`sd-webui-speech-bubble-forge-neo`として既に導入している場合も、そのまま更新できます。

更新前に `git rev-parse --show-toplevel` がこの拡張のフォルダーを示すことと、`git status --short` の内容を確認してください。ZIP導入などで拡張自身に `.git` がない場合、Gitが親のForgeリポジトリを対象にすることがあります。ローカル変更・未完了マージ・履歴分岐がある場合は、内容を保護してから解消してください。通常更新に `reset --hard` は使用しません。

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

### 非破壊画像クロップ

一枚画像・4コマ・コミックのすべてで、画像Propertiesの「クロップを編集／リセット」を利用できます。画像選択中の `C` キーやダブルクリックからも開始できます。元画像は変更せず、クロップ状態をレイヤーまたはコマ画像へ保存します。確定・キャンセル・リセット、Undo／Redoに対応します。一枚画像の回転中クロップには制限があるため、0°へ戻してから編集してください。

## 素材とLayers

左パネルからSpeech Bubbles、Text、SFX、Stamps、Frames、Emphasis Linesを追加できます。各「Browse…」から開く素材Drawerは個別に幅を変更でき、幅とMy Presets／Built-inの開閉状態を保存します。最小幅でも素材は2列で表示されます。

4コマとコミックでは、素材を漫画ページ上または特定のコマ内へ配置できます。コマ内の素材はコマ形状でクリップされます。重なって選択しにくい場合は、フローティングのLayersから対象を選び、Propertiesで調整してください。PropertiesとLayersは移動・リサイズでき、位置と大きさを保存します。

吹き出しはPropertiesでベジェ曲線のアンカーとハンドルを編集できます。`Finish Path`で確定後、ユーザープリセットとして保存するとMy Presetsから再利用できます。Built-inは上書きされません。

## 簡易レタッチ（Quick Retouch・UI再設計版）

左パネルの「簡易レタッチを開く」、または画像レイヤーの右クリックメニューから起動します。生成画像の小さな修正、不要部分の透明化や塗りつぶし、髪・服・装飾などの部分的な色変更、明暗調整を行います。Quick Retouch内ではベース画像を直接編集でき、適用結果は新しい画像レイヤーまたは「ページ画像」として追加されます。

### 1枚Canvasとフローティングパネル

編集画像は中央の1枚Canvasへ大きく表示します。元画像との常時2画面表示は行いません。

- 「編集前を表示（長押し）」: 押している間だけ、Quick Retouchを開いた時点の画像へ切り替え
- 「左右比較」: 同じCanvas内を元画像と編集結果に分割して比較
- 選択範囲、レイヤー、Properties: Editor内のフローティングパネル

3つのパネルは移動、リサイズ、最小化、非表示、再表示に対応します。位置、サイズ、最小化状態、重なり順、最後に選択したツールとレイヤーを保存し、次回起動時に復元します。画面解像度が変わった場合は、画面外へ出たパネルだけ表示領域内へ戻します。

Quick Retouchウィンドウは、通常表示時の位置と大きさ、および最大化状態を保存します。最大化して閉じた場合は、次回も最大化して開きます。

### 初期状態とツール

初回起動では`ブラシ`と`ペイント1`が選択されます。前回利用後は、最後に選択したツールと、ペイント／ベース画像の編集対象を復元します。左ツールは使用頻度とPhotoshopに近い分類で並びます。

- 描画: ブラシ、消しゴム、スポイト
- 選択: 矩形選択、フリーハンド投げ縄、自動選択（魔法の杖）、色域選択
- 表示: 手のひら、ズーム

選択中ツールのサイズ、硬さ、不透明度、許容値、選択方法などはCanvas上部のツールオプションバーに表示されます。

### ベース画像レイヤー

「ベース画像」はQuick Retouch内で通常の画像レイヤーとして扱います。

- 目アイコン: 表示／非表示
- 鍵アイコン: ロック／ロック解除
- ロック解除中: ブラシで直接描画、消しゴムで直接透明化
- ロック中: 描画と消去を禁止
- 複製: 現在のベース画像を新しいペイントレイヤーとして複製
- 削除・上下移動: ベース画像では禁止

ページ画像一覧には元の画像が残るため、Quick Retouch内ではベース画像を直接編集できます。「編集前を表示（長押し）」と左右比較は、Quick Retouchを開いた時点の画像を参照します。

### ブラシと色

ブラシカーソルは実際のサイズと一致する白黒二重線の円と中央の「＋」で表示し、描画中だけ円内を薄い赤で示します。消しゴムは中央の「−」と水色系の表示、調整レイヤーマスクの編集時は青系の表示になります。

- 右ボタンを押しながら左右ドラッグ: ブラシサイズ変更。円形枠と`80 px`形式の表示をリアルタイム更新
- `[` / `]`: ブラシサイズを縮小／拡大
- ホイール: ポインター付近を中心にCanvasを拡大／縮小
- 中ボタンドラッグ: 一時的な手のひら操作でCanvasを移動
- Space＋左ドラッグ: 一時的な手のひら操作でCanvasを移動
- Alt＋クリック: 一時スポイト
- 前景色／背景色の色面: カラーピッカー
- `⇄`: 前景色と背景色を入れ替え

### 選択範囲

選択範囲は通常の画像レイヤーではなく、独立した「選択範囲」パネルで管理します。初期表示は境界線だけではなく、選択部分を青／シアンで示す半透明マスクです。

- 全選択、解除、反転
- 新規、追加、削除、共通部分
- 境界ぼかし、拡張、縮小
- 境界線、青い半透明マスク、非表示
- 目アイコンでCanvas上の表示だけをON／OFF


選択表示を非表示にしても、選択データは保持されます。独立した旧「保護範囲」はありません。`Q` のクイックマスクでは赤い領域が選択外となり、ブラシで追加、消しゴムで削除できます。

Shiftは追加、Altは削除、Shift＋Altは共通部分として一時的に動作し、押している間は上部の選択方法ボタンも連動して強調されます。

### 選択ツール

- 矩形選択: ドラッグした矩形を選択
- 投げ縄選択: マウスを押したまま自由な形に囲み、離して確定
- 自動選択（魔法の杖）: クリック色に近い画素を選択。許容値、連続領域、表示レイヤー参照、アンチエイリアスを設定可能
- 色域選択: 基準色、追加色、除外色を専用スポイトで登録。許容値と表示レイヤー参照を設定し、画像クリック時に選択範囲へ即時反映

自動選択で「連続領域のみ」をONにするとクリック位置につながる近似色だけ、OFFにすると参照画像全体の近似色を選択します。「表示レイヤーを参照」をONにすると、選択中レイヤー単体ではなく、表示中レイヤーの合成結果を参照します。

確定済みの選択範囲は青／シアン、色域選択の再計算中候補は紫で表示されます。

### ペイント、消しゴム、選択制限

ペイントレイヤーまたはロック解除したベース画像を選択して、ブラシと消しゴムを使用します。選択範囲がある場合は選択内だけに作用します。

例えば、背景の不要部分を魔法の杖で選択してベース画像を消しゴムで透明化したり、服の黄色だけを色域選択して調整できます。

### 調整レイヤーとマスク

調整レイヤーを追加すると、現在の選択範囲がレイヤー専用マスクへコピーされます。

- 色相・彩度・明度、色彩の統一
- 明るさ・コントラスト・ガンマ
- トーンカーブ: RGB、Red、Green、Blue

色相・彩度では、編集対象を次から選べます。

- マスター
- 赤系
- 黄色系
- 緑系
- シアン系
- 青系
- マゼンタ系
- スポイトで取得したカスタム色域

対象色スポイト、追加スポイト、除外スポイトと、色域幅・境界の柔らかさを使って、特定の色だけを調整できます。たとえば服の黄色を色域選択したうえで「黄色系」の色相・彩度・明度を変更できます。

マスクサムネイルのボタンを押すとマスク編集へ入り、白で効果を適用、消しゴムで黒くして効果を保護します。

### トーンカーブ

グラフ上をクリックして制御点を追加し、ドラッグまたは入力／出力の数値で調整します。リニア、コントラスト、強いコントラスト、シャドウを持ち上げる、ハイライトを抑えるプリセットを備えます。処理は256段階のLUTへ変換してプレビューと元解像度出力へ適用します。

### 保存方式と制約

「一枚画像へ適用」または「新しいページ画像として適用」を押すと、現在の結果をPNGとして追加します。Quick Retouch内のベース画像、ペイントレイヤー、調整レイヤー、選択範囲は、適用時に1枚のPNGへ統合されます。

ページ画像側の元画像は残りますが、Quick Retouchを閉じた後にレタッチレイヤーや調整レイヤーを再編集することはできません。コピースタンプ、修復ブラシ、ぼかし、シャープ、グラデーション、AIインペイントは未実装です。

### Quick Retouchのショートカット

| 操作 | 動作 |
| --- | --- |
| `B` / `E` / `I` | ブラシ／消しゴム／スポイト |
| `M` / `L` / `W` / `U` | 矩形／投げ縄／自動選択／色域選択 |
| `H` / `Z` | 手のひら／ズーム |
| `Ctrl+A` | すべてを選択 |
| `Ctrl+D` | 選択を解除 |
| `Ctrl+Shift+D` | 直前に解除した選択範囲を再選択 |
| `Ctrl+Shift+I` | 選択範囲を反転 |
| `Shift` / `Alt` / `Shift+Alt` | 選択へ追加／削除／共通部分 |
| `Ctrl+J` | 選択中のレタッチレイヤーを複製 |
| `Ctrl+0` / `Ctrl+1` | 全体表示／100%表示 |
| `Ctrl++` / `Ctrl+-` | 拡大／縮小 |
| ホイール | ポインター付近を中心に拡大／縮小 |
| 中ボタンドラッグ | Canvasを移動 |
| Space＋左ドラッグ | Canvasを移動 |
| 右ボタン＋左右ドラッグ | ブラシサイズをリアルタイム変更 |
| `[` / `]` | ブラシサイズを縮小／拡大 |
| `\`を押している間 | 元画像を表示 |

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

設定はForge Neo本体の`Settings > Comic Panel Editor`から変更します。Editor内に重複する設定ボタンや独立Settings画面は設けていません。

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

言語変更はEditorの主要UI、Properties、Layers、素材Drawer、背景削除、コミック変換へ反映されます。ユーザーが入力した文字やプリセット名は翻訳しません。

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

Install it under `Forge-Neo/extensions`, restart Forge Neo, expand **Comic Panel Editor** in `txt2img` or `img2img`, and click **Open Comic Panel Editor ↗**. Language, Page Images behavior, export, presets, cache, diagnostics, and the optional AI model are managed from `Settings > Comic Panel Editor` in the Forge Neo window.

The optional isnet-anime model is not bundled. It is downloaded only after the user approves the first-use prompt or clicks **Download Model** in Forge Settings. Processing remains local.

## Development / validation

The current editor uses `web/project-editor.html` and its split shell assets. Legacy editor URLs, image/standalone layouts, user assets and Pillow layout export remain compatible; only unreachable legacy launcher UI factories were removed. Shared frame/SFX catalogs live in `speech_bubble_forge/asset_catalog.py` and do not eagerly load the Pillow drawing implementation.

CI runs Python tests, JavaScript syntax, Node contracts and upstream exact-file hash checks on Ubuntu and Windows. A separate Chromium job requires browser smokes rather than treating an unavailable browser as a pass. These checks do not replace a Windows Forge Neo host/GPU test. See [validation instructions](docs/VALIDATION.md).

## ライセンス / License

[MIT License](LICENSE)
