// Names are keyed by stable asset ID. Artwork and serialized IDs stay unchanged.
// Ambiguous sound effects use their written pronunciation, without an inferred meaning.
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SpeechBubbleAssetLabels = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const labels = {
  "don-exclamation-mask": {
    "ja": "ドン！",
    "en": "Don! (Impact)"
  },
  "ban-mask": {
    "ja": "バン",
    "en": "Ban (Bang)"
  },
  "doka-mask": {
    "ja": "ドカ",
    "en": "Doka (Heavy Impact)"
  },
  "baki-mask": {
    "ja": "バキ",
    "en": "Baki (Crack)"
  },
  "gashaan-mask": {
    "ja": "ガシャーン",
    "en": "Gashaan (Crash)"
  },
  "jaan-mask": {
    "ja": "ジャーン！",
    "en": "Jaan! (Fanfare)"
  },
  "parin-mask": {
    "ja": "パリン",
    "en": "Parin (Glass Breaking)"
  },
  "shu-mask": {
    "ja": "シュ",
    "en": "Shu (Swift Movement)"
  },
  "exclamation-mask": {
    "ja": "！",
    "en": "Exclamation Mark"
  },
  "question-mask": {
    "ja": "？",
    "en": "Question Mark"
  },
  "dakuten-mask": {
    "ja": "濁点 ゛",
    "en": "Dakuten (Voicing Mark)"
  },
  "small-tsu-mask": {
    "ja": "小さいッ",
    "en": "Small Tsu (Clipped Sound Mark)"
  },
  "basic-circle-mask": {
    "ja": "丸",
    "en": "Circle"
  },
  "basic-triangle-mask": {
    "ja": "三角",
    "en": "Triangle"
  },
  "basic-square-mask": {
    "ja": "四角",
    "en": "Square"
  },
  "basic-trapezoid-mask": {
    "ja": "台形",
    "en": "Trapezoid"
  },
  "punpun-mask": {
    "ja": "ぷんぷん",
    "en": "Punpun (Anger)"
  },
  "jii-mask": {
    "ja": "じーっ",
    "en": "Jii' (Stare)"
  },
  "wakuwaku-mask": {
    "ja": "わくわく",
    "en": "Wakuwaku (Excitement)"
  },
  "mochimochi-mask": {
    "ja": "もちもち",
    "en": "Mochimochi (Soft / Chewy)"
  },
  "mushamusha-mask": {
    "ja": "むしゃむしゃ",
    "en": "Mushamusha (Munching)"
  },
  "mogumogu-mask": {
    "ja": "もぐもぐ",
    "en": "Mogumogu (Chewing)"
  },
  "zuruzuru-mask": {
    "ja": "ズルズル",
    "en": "Zuruzuru (Slurping)"
  },
  "gyuu-mask": {
    "ja": "ぎゅーっ",
    "en": "Gyuu' (Squeeze)"
  },
  "nadenade-mask": {
    "ja": "なでなで",
    "en": "Nadenade (Patting)"
  },
  "dokidoki-mask": {
    "ja": "どきどき",
    "en": "Dokidoki (Heartbeat)"
  },
  "kirakira-mask": {
    "ja": "きらきら",
    "en": "Kirakira (Sparkling)"
  },
  "fuwafuwa-mask": {
    "ja": "ふわふわ",
    "en": "Fuwafuwa (Fluffy)"
  },
  "pyonpyon-mask": {
    "ja": "ぴょんぴょん",
    "en": "Pyonpyon (Hopping)"
  },
  "anger-mark-mask": {
    "ja": "怒りマーク",
    "en": "Anger Mark"
  },
  "brush-exclamation-mask": {
    "ja": "筆 ！",
    "en": "Brush Exclamation Mark"
  },
  "brush-question-mask": {
    "ja": "筆 ？",
    "en": "Brush Question Mark"
  },
  "brush-heart-mask": {
    "ja": "筆ハート",
    "en": "Brush Heart"
  },
  "biku-katakana-mask": {
    "ja": "ビクッ",
    "en": "Biku' (Twitch, Katakana)"
  },
  "biku-katakana-mask-original-01": {
    "ja": "ビクッ 01",
    "en": "Biku' 01 (Original)"
  },
  "biku-hiragana-mask": {
    "ja": "びくっ",
    "en": "Biku' (Twitch, Hiragana)"
  },
  "biku-hiragana-mask-original-01": {
    "ja": "びくっ 01",
    "en": "Biku' 01 (Original)"
  },
  "bikun-mask": {
    "ja": "びくん",
    "en": "Bikun"
  },
  "bikun-mask-original-01": {
    "ja": "びくん 01",
    "en": "Bikun 01 (Original)"
  },
  "zokuzoku-mask": {
    "ja": "ぞくぞく",
    "en": "Zokuzoku"
  },
  "gyu-katakana-mask": {
    "ja": "ギュッ",
    "en": "Gyu'"
  },
  "katakata-mask": {
    "ja": "カタカタ",
    "en": "Katakata"
  },
  "dokidoki-katakana-mask": {
    "ja": "ドキドキ",
    "en": "Dokidoki (Heartbeat, Katakana)"
  },
  "gugu-mask": {
    "ja": "ぐぐっ",
    "en": "Gugu'"
  },
  "piku-mask": {
    "ja": "ぴくっ",
    "en": "Piku'"
  },
  "hiku-mask": {
    "ja": "ひくっ",
    "en": "Hiku'"
  },
  "rerorero-mask": {
    "ja": "れろれろ",
    "en": "Rerorero"
  },
  "kunekune-mask": {
    "ja": "くねくね",
    "en": "Kunekune"
  },
  "sawasawa-mask": {
    "ja": "さわさわ",
    "en": "Sawasawa"
  },
  "taputapu-mask": {
    "ja": "たぷたぷ",
    "en": "Taputapu"
  },
  "jupu-mask": {
    "ja": "じゅぷっ",
    "en": "Jupu'"
  },
  "nyuru-mask": {
    "ja": "にゅる",
    "en": "Nyuru"
  },
  "buchu-mask": {
    "ja": "ブチュ",
    "en": "Buchu"
  },
  "buchu-small-tsu-mask": {
    "ja": "ブチュッ",
    "en": "Buchu'"
  },
  "buchupon-mask": {
    "ja": "ブチュポン",
    "en": "Buchupon"
  },
  "chu-small-tsu-mask": {
    "ja": "チュッ",
    "en": "Chu'"
  },
  "chupu-mask": {
    "ja": "チュプ",
    "en": "Chupu"
  },
  "chupu-small-tsu-mask": {
    "ja": "チュプッ",
    "en": "Chupu'"
  },
  "chupun-mask": {
    "ja": "チュプン",
    "en": "Chupun"
  },
  "chupo-mask": {
    "ja": "チュポ",
    "en": "Chupo"
  },
  "chupon-mask": {
    "ja": "チュポン",
    "en": "Chupon"
  },
  "chupa-mask": {
    "ja": "チュパ",
    "en": "Chupa"
  },
  "chupachupa-mask": {
    "ja": "チュパチュパ",
    "en": "Chupachupa"
  },
  "puchu-mask": {
    "ja": "プチュ",
    "en": "Puchu"
  },
  "puchu-small-tsu-mask": {
    "ja": "プチュッ",
    "en": "Puchu'"
  },
  "puchun-mask": {
    "ja": "プチュン",
    "en": "Puchun"
  },
  "nuchu-mask": {
    "ja": "ぬちゅ",
    "en": "Nuchu"
  },
  "nupu-mask": {
    "ja": "ぬぷ",
    "en": "Nupu"
  },
  "nupu-small-tsu-mask": {
    "ja": "ぬぷっ",
    "en": "Nupu'"
  },
  "picha-mask": {
    "ja": "ぴちゃ",
    "en": "Picha"
  },
  "pichapicha-mask": {
    "ja": "ぴちゃぴちゃ",
    "en": "Pichapicha"
  },
  "kapu-mask": {
    "ja": "かぷ",
    "en": "Kapu"
  },
  "kapu-small-tsu-mask": {
    "ja": "かぷっ",
    "en": "Kapu'"
  },
  "pan-small-tsu-mask": {
    "ja": "ぱんっ",
    "en": "Pan'"
  },
  "topo-small-tsu-mask": {
    "ja": "とぽっ",
    "en": "Topo'"
  },
  "an-katakana-small-tsu-mask": {
    "ja": "アンっ",
    "en": "An'"
  },
  "haa-long-small-tsu-mask": {
    "ja": "はーっ",
    "en": "Haa'"
  },
  "faaa-small-tsu-mask": {
    "ja": "ふぁぁっ",
    "en": "Faa'"
  },
  "tapun-small-tsu-mask": {
    "ja": "たぷんっ",
    "en": "Tapun'"
  },
  "a-small-tsu-mask": {
    "ja": "あっ",
    "en": "A'"
  },
  "an-hiragana-mask": {
    "ja": "あん",
    "en": "An"
  },
  "gyupu-mask": {
    "ja": "ぎゅぷ",
    "en": "Gyupu"
  },
  "buchupo-small-tsu-mask": {
    "ja": "ぶちゅぽっ",
    "en": "Buchupo'"
  },
  "haa-mask": {
    "ja": "はぁ",
    "en": "Haa"
  },
  "haa-small-tsu-mask": {
    "ja": "はぁっ",
    "en": "Haa'"
  },
  "ipu-small-tsu-mask": {
    "ja": "イプッ",
    "en": "Ipu'"
  },
  "dobyuu-small-tsu-mask": {
    "ja": "ドビュッ",
    "en": "Dobyu'"
  },
  "aha-small-tsu-mask": {
    "ja": "あはっ",
    "en": "Aha'"
  },
  "aha-katakana-small-tsu-mask": {
    "ja": "アハッ",
    "en": "Aha'"
  },
  "hachun-small-tsu-mask": {
    "ja": "ぱちゅんっ",
    "en": "Pachun'"
  },
  "n-small-tsu-ellipsis-mask": {
    "ja": "ん゛っ…",
    "en": "N (Voiced)'..."
  },
  "u-small-tsu-ellipsis-mask": {
    "ja": "うっ…",
    "en": "U'..."
  },
  "iccha-mask": {
    "ja": "いっちゃ",
    "en": "Iccha"
  },
  "ii-small-tsu-mask": {
    "ja": "いいっ",
    "en": "Ii'"
  },
  "uwaaa-small-tsu-mask": {
    "ja": "うわぁああっ",
    "en": "Uwaaaa'"
  },
  "oo-dakuten-small-tsu-mask": {
    "ja": "おぉおおっ",
    "en": "Oooo'"
  },
  "iguuu-mask": {
    "ja": "いぐぅう",
    "en": "Iguuu"
  },
  "viin-mask": {
    "ja": "ヴィ～ン",
    "en": "Viin"
  },
  "nichaa-mask": {
    "ja": "ニチャア",
    "en": "Nichaa"
  },
  "gori-small-tsu-mask": {
    "ja": "ゴリッ！",
    "en": "Gori'!"
  },
  "deru-small-tsu-mask": {
    "ja": "でるっ！",
    "en": "Deru'!"
  },
  "dokun-small-tsu-mask": {
    "ja": "ドクンッ！",
    "en": "Dokun'!"
  },
  "uguuu-ellipsis-mask": {
    "ja": "うぐぅ...",
    "en": "Uguu..."
  },
  "au-small-tsu-mask": {
    "ja": "あぅっ！",
    "en": "Au'!"
  },
  "kaha-small-tsu-mask": {
    "ja": "かはっ！",
    "en": "Kaha'!"
  },
  "igu-small-tsu-mask": {
    "ja": "イグッ！",
    "en": "Igu'!"
  },
  "tehepero-mask": {
    "ja": "テヘペロ",
    "en": "Tehepero"
  },
  "iee-small-tsu-mask": {
    "ja": "イエーイ！",
    "en": "Ieei!"
  },
  "oke-mask": {
    "ja": "オーケー",
    "en": "Ookee"
  },
  "dokkunn-vertical-gpt-v1": {
    "ja": "ドックン！",
    "en": "Dokkun!"
  },
  "bubyuu-vertical-gpt-v1": {
    "ja": "ぶびゅっ",
    "en": "Bubyu'"
  },
  "giri-small-tsu-vertical-mask": {
    "ja": "ギリッ",
    "en": "Giri'"
  },
  "nuron-angular-vertical-mask": {
    "ja": "ぬろん",
    "en": "Nuron"
  },
  "dochu-exclamation-angular-vertical-mask": {
    "ja": "どちゅ！",
    "en": "Dochu!"
  },
  "chiro-vertical-uniform-mask": {
    "ja": "チロ",
    "en": "Chiro"
  },
  "upu-vertical-uniform-mask": {
    "ja": "うぷ",
    "en": "Upu"
  },
  "chuu-vertical-uniform-mask": {
    "ja": "ちゅう",
    "en": "Chuu"
  },
  "boto-small-tsu-vertical-uniform-mask": {
    "ja": "ボトッ",
    "en": "Boto'"
  },
  "dochu-vertical-uniform-mask": {
    "ja": "どちゅ",
    "en": "Dochu"
  },
  "giu-long-angular-vertical-mask": {
    "ja": "ぎう～",
    "en": "Giuu"
  },
  "hiku-small-tsu-angular-vertical-mask": {
    "ja": "ひくっ",
    "en": "Hiku'"
  },
  "giu-angular-vertical-mask": {
    "ja": "ぎう",
    "en": "Giu"
  },
  "zuru-angular-vertical-mask": {
    "ja": "ずる",
    "en": "Zuru"
  },
  "dokun-hiragana-angular-vertical-mask": {
    "ja": "どくん（縦）",
    "en": "Dokun (Vertical)"
  },
  "dokun-hiragana-angular-horizontal-mask": {
    "ja": "どくん（横）",
    "en": "Dokun (Horizontal)"
  },
  "zubu-small-tsu-angular-vertical-mask": {
    "ja": "ずぶっ",
    "en": "Zubu'"
  },
  "sore-dame-horizontal-gpt-v1": {
    "ja": "それ、ダメ",
    "en": "Sore, dame (No / Do Not)"
  },
  "nani-kore-horizontal-gpt-v1": {
    "ja": "ナニコレ？",
    "en": "Nanikore? (What Is This?)"
  },
  "shii-horizontal-gpt-v1": {
    "ja": "しーっ",
    "en": "Shii' (Hush)"
  },
  "naisho-horizontal-gpt-v1": {
    "ja": "ナイショ",
    "en": "Naisho (Secret)"
  },
  "ikisou-horizontal-gpt-v1": {
    "ja": "イキそう",
    "en": "Ikisou"
  },
  "joo-vertical-gpt-v1": {
    "ja": "ジョーッ",
    "en": "Joo'"
  },
  "gokkun-vertical-gpt-v1": {
    "ja": "ごっくん！",
    "en": "Gokkun!"
  },
  "pushaa-vertical-gpt-v1": {
    "ja": "プシャァ",
    "en": "Pushaa"
  },
  "chira-vertical-gpt-v1": {
    "ja": "チラッ",
    "en": "Chira'"
  },
  "woo-vertical-gpt-v1": {
    "ja": "うぉおお",
    "en": "Uooo"
  },
  "rerorero-vertical-gpt-v1": {
    "ja": "レロレロ",
    "en": "Rerorero"
  },
  "haa-katakana-vertical-gpt-v1": {
    "ja": "ハァ",
    "en": "Haa"
  },
  "dokkunn-hiragana-vertical-gpt-v1": {
    "ja": "どっくん",
    "en": "Dokkun"
  },
  "n-small-tsu-gpt-v2": {
    "ja": "んっ",
    "en": "N'"
  },
  "yamero-horizontal-gpt-v1": {
    "ja": "やめろぉ",
    "en": "Yameroo (Stop)"
  },
  "sore-iku-horizontal-gpt-v1": {
    "ja": "それ、イクっ！",
    "en": "Sore, iku'!"
  },
  "baka-vertical-gpt-v1": {
    "ja": "バカ！",
    "en": "Baka! (Fool)"
  },
  "damee-mask": {
    "ja": "ダメぇ",
    "en": "Damee (No)"
  },
  "u-dakuten-long-small-tsu-mask": {
    "ja": "う゛～っ！",
    "en": "U (Voiced)e'!"
  },
  "moo-long-small-tsu-mask": {
    "ja": "もぉ～～っ！",
    "en": "Moooo'!"
  },
  "e-small-tsu-question-mask": {
    "ja": "えっ？",
    "en": "E'?"
  },
  "yadaa-mask": {
    "ja": "やだぁ",
    "en": "Yadaa (No / I Do Not Want To)"
  },
  "burun-katakana-small-tsu-mask": {
    "ja": "ブルンッ！",
    "en": "Burun'!"
  },
  "burun-small-tsu-mask": {
    "ja": "ぶるんっ！",
    "en": "Burun'!"
  },
  "purun-small-tsu-mask": {
    "ja": "ぷるんっ！",
    "en": "Purun'!"
  },
  "gyuu-reference-vertical-mask": {
    "ja": "ぎゅう",
    "en": "Gyuu"
  },
  "pito-reference-vertical-mask": {
    "ja": "ぴと",
    "en": "Pito"
  },
  "norun-reference-vertical-mask": {
    "ja": "のるん",
    "en": "Norun"
  },
  "kuu-reference-vertical-mask": {
    "ja": "くぅ",
    "en": "Kuu"
  },
  "ki-katakana-reference-vertical-mask": {
    "ja": "キ",
    "en": "Ki"
  },
  "munyu-reference-vertical-mask": {
    "ja": "むにゅ",
    "en": "Munyu"
  },
  "piyo-reference-vertical-mask": {
    "ja": "ぴよ",
    "en": "Piyo"
  },
  "nuri-small-tsu-reference-vertical-mask": {
    "ja": "ぬりっ",
    "en": "Nuri'"
  },
  "oga-reference-vertical-mask": {
    "ja": "おが",
    "en": "Oga"
  },
  "oa-exclamation-reference-vertical-mask": {
    "ja": "おあ！",
    "en": "Oa!"
  },
  "nuru-small-tsu-reference-vertical-mask": {
    "ja": "ぬるっ",
    "en": "Nuru'"
  },
  "boyon-reference-vertical-mask": {
    "ja": "ぼよん",
    "en": "Boyon"
  },
  "byon-katakana-reference-vertical-mask": {
    "ja": "ビョン",
    "en": "Byon"
  },
  "zucha-reference-vertical-mask": {
    "ja": "ずちゃ",
    "en": "Zucha"
  },
  "sucha-reference-vertical-mask": {
    "ja": "すちゃ",
    "en": "Sucha"
  },
  "byuu-long-reference-vertical-mask": {
    "ja": "びゅー",
    "en": "Byuu"
  },
  "goku-reference-vertical-mask": {
    "ja": "ごく",
    "en": "Goku"
  },
  "doku-small-tsu-katakana-reference-vertical-mask": {
    "ja": "ドクッ",
    "en": "Doku'"
  },
  "haga-small-tsu-reference-vertical-mask": {
    "ja": "はがっ",
    "en": "Haga'"
  },
  "filled-heart-mask": {
    "ja": "塗りハート",
    "en": "Filled Heart"
  },
  "handdrawn-filled-heart-mask": {
    "ja": "手描き塗りハート",
    "en": "Hand-drawn Filled Hearts"
  },
  "pink-stamp-dyurururu": {
    "ja": "ドュルルル",
    "en": "Dyurururu (Pink)"
  },
  "pink-stamp-dyu-heart": {
    "ja": "ドュ♡",
    "en": "Dyu (Heart, Pink)"
  },
  "pink-stamp-double-heart": {
    "ja": "ダブルハート",
    "en": "Double Heart (Pink)"
  },
  "pink-stamp-biku-heart": {
    "ja": "ビクッ♡",
    "en": "Biku' (Heart, Pink)"
  },
  "suit-club-mask": {
    "ja": "クローバー",
    "en": "Four-leaf Clover"
  },
  "arrow-thick-right-mask": {
    "ja": "太矢印",
    "en": "Thick Right Arrow"
  },
  "arrow-thin-right-mask": {
    "ja": "細矢印",
    "en": "Thin Right Arrow"
  },
  "arrow-handdrawn-right-mask": {
    "ja": "手描き矢印",
    "en": "Hand-drawn Right Arrow"
  },
  "arrow-curved-right-mask": {
    "ja": "曲線矢印",
    "en": "Curved Arrow"
  },
  "arrow-loop-mask": {
    "ja": "ループ矢印",
    "en": "Loop Arrow"
  },
  "arrow-double-mask": {
    "ja": "両矢印",
    "en": "Double-ended Arrow"
  },
  "star-outline-mask": {
    "ja": "手描き星",
    "en": "Hand-drawn Star"
  },
  "star-filled-mask": {
    "ja": "塗り星",
    "en": "Filled Star"
  },
  "sparkle-four-mask": {
    "ja": "四方光",
    "en": "Four-point Sparkle"
  },
  "sparkle-cluster-mask": {
    "ja": "キラキラ光",
    "en": "Sparkle Cluster"
  },
  "sparkle-radiant-mask": {
    "ja": "放射星",
    "en": "Radiant Star"
  },
  "anger-mark-small-mask": {
    "ja": "怒りマーク 小",
    "en": "Small Anger Mark"
  },
  "sweat-glossy": {
    "ja": "光沢汗",
    "en": "Glossy Sweat Drop"
  },
  "sweat-flying": {
    "ja": "飛び散る汗",
    "en": "Flying Sweat Drops"
  },
  "sweat-drop-mask": {
    "ja": "汗 1滴",
    "en": "Single Sweat Drop"
  },
  "sweat-drops-mask": {
    "ja": "汗 2滴",
    "en": "Two Sweat Drops"
  },
  "emphasis-lines-mask": {
    "ja": "強調線",
    "en": "Emphasis Lines"
  },
  "shock-lines-mask": {
    "ja": "衝撃線",
    "en": "Shock Lines"
  },
  "tension-lines-mask": {
    "ja": "緊張線",
    "en": "Tension Lines"
  },
  "worry-squiggle-mask": {
    "ja": "不安波線",
    "en": "Worry Squiggle"
  },
  "breath-puff-mask": {
    "ja": "息・ため息",
    "en": "Breath / Sigh"
  },
  "dizzy-spiral-mask": {
    "ja": "うずまき",
    "en": "Dizzy Spiral"
  },
  "hot-spring-mask": {
    "ja": "温泉マーク",
    "en": "Hot Spring Symbol"
  },
  "bandage-mask": {
    "ja": "絆創膏",
    "en": "Bandage"
  },
  "music-notes-mask": {
    "ja": "音符",
    "en": "Music Notes"
  },
  "sleep-zzz-mask": {
    "ja": "Zzz",
    "en": "Zzz"
  },
  "lightning-zap-mask": {
    "ja": "稲妻",
    "en": "Lightning"
  },
  "motion-swish-mask": {
    "ja": "動き線",
    "en": "Motion Lines"
  },
  "rarity-crown-ssr-gold": {
    "ja": "SSR Crown Gold",
    "en": "Crown Ssr Gold"
  },
  "rarity-crown-sr-silver": {
    "ja": "SR Crown Silver",
    "en": "Crown Sr Silver"
  },
  "rarity-crown-r-red": {
    "ja": "R Crown Red",
    "en": "Crown R Red"
  },
  "rarity-crown-n-green": {
    "ja": "N Crown Green",
    "en": "Crown N Green"
  },
  "rarity-ribbon-super-rare-gold": {
    "ja": "超激レア Ribbon Gold",
    "en": "Super Rare Ribbon (Gold)"
  },
  "rarity-ribbon-very-rare-silver": {
    "ja": "激レア Ribbon Silver",
    "en": "Very Rare Ribbon (Silver)"
  },
  "rarity-ribbon-rare-red": {
    "ja": "レア Ribbon Red",
    "en": "Rare Ribbon (Red)"
  },
  "rarity-ribbon-normal-green": {
    "ja": "ノーマル Ribbon Green",
    "en": "Normal Ribbon (Green)"
  },
  "kawaii-shortcake": {
    "ja": "ショートケーキ",
    "en": "Strawberry Shortcake"
  },
  "kawaii-cupcake": {
    "ja": "カップケーキ",
    "en": "Cupcake"
  },
  "kawaii-macaron": {
    "ja": "マカロン",
    "en": "Macaron"
  },
  "kawaii-donut": {
    "ja": "ドーナツ",
    "en": "Donut"
  },
  "kawaii-candy": {
    "ja": "キャンディ",
    "en": "Candy"
  },
  "kawaii-strawberry": {
    "ja": "いちご",
    "en": "Strawberry"
  },
  "kawaii-cherries": {
    "ja": "さくらんぼ",
    "en": "Cherries"
  },
  "kawaii-gift": {
    "ja": "プレゼント",
    "en": "Gift"
  },
  "kawaii-teddy-bear": {
    "ja": "くまぬいぐるみ",
    "en": "Teddy Bear"
  },
  "kawaii-rabbit": {
    "ja": "うさぎぬいぐるみ",
    "en": "Plush Rabbit"
  },
  "kawaii-cat": {
    "ja": "ねこ",
    "en": "Cat"
  },
  "kawaii-chick": {
    "ja": "ひよこ",
    "en": "Chick"
  },
  "kawaii-paw": {
    "ja": "肉球",
    "en": "Paw Print"
  },
  "kawaii-fluffy-cloud": {
    "ja": "ふわふわ雲",
    "en": "Fluffy Cloud"
  },
  "kawaii-soap-bubble": {
    "ja": "シャボン玉",
    "en": "Soap Bubbles"
  },
  "kawaii-small-flowers": {
    "ja": "小花",
    "en": "Small Flowers"
  },
  "kawaii-butterfly": {
    "ja": "蝶",
    "en": "Butterfly"
  },
  "kawaii-feather": {
    "ja": "羽",
    "en": "Feather"
  },
  "kawaii-manga-meat": {
    "ja": "漫画肉",
    "en": "Manga Meat"
  },
  "kawaii-temari": {
    "ja": "手まり",
    "en": "Temari Ball"
  },
  "kawaii-maneki-neko": {
    "ja": "招き猫",
    "en": "Maneki Neko (Lucky Cat)"
  },
  "kawaii-crown": {
    "ja": "王冠",
    "en": "Crown"
  },
  "kawaii-magic-wand": {
    "ja": "魔法ステッキ",
    "en": "Magic Wand"
  },
  "kawaii-perfume-bottle": {
    "ja": "香水瓶",
    "en": "Perfume Bottle"
  },
  "kawaii-teacup": {
    "ja": "ティーカップ",
    "en": "Teacup"
  },
  "kawaii-origami-crane": {
    "ja": "折り鶴",
    "en": "Origami Crane"
  },
  "kawaii-wind-chime": {
    "ja": "風鈴",
    "en": "Wind Chime"
  },
  "corner-kawaii-ribbon-lace": {
    "ja": "リボンレースコーナー",
    "en": "Ribbon Lace Corner"
  },
  "corner-kawaii-heart-lace": {
    "ja": "ハートレースコーナー",
    "en": "Heart Lace Corner"
  },
  "corner-kawaii-flower-vine": {
    "ja": "花唐草コーナー",
    "en": "Flower Vine Corner"
  },
  "corner-kawaii-star-vine": {
    "ja": "星唐草コーナー",
    "en": "Star Vine Corner"
  },
  "corner-kawaii-clover-vine": {
    "ja": "クローバーコーナー",
    "en": "Clover Corner"
  },
  "corner-kawaii-frill": {
    "ja": "フリルコーナー",
    "en": "Frill Corner"
  },
  "corner-shoujo-rose-vine": {
    "ja": "薔薇唐草コーナー",
    "en": "Rose Vine Corner"
  },
  "corner-shoujo-lace-pearl": {
    "ja": "レースパールコーナー",
    "en": "Lace and Pearl Corner"
  },
  "corner-shoujo-feather": {
    "ja": "羽根コーナー",
    "en": "Feather Corner"
  },
  "corner-shoujo-lily": {
    "ja": "百合コーナー",
    "en": "Lily Corner"
  },
  "corner-shoujo-gem-chain": {
    "ja": "宝石チェーンコーナー",
    "en": "Gem Chain Corner"
  },
  "corner-shoujo-monochrome-rose": {
    "ja": "モノクロ薔薇コーナー",
    "en": "Monochrome Rose Corner"
  },
  "corner-standard-geometric": {
    "ja": "幾何学コーナー",
    "en": "Geometric Corner"
  },
  "corner-standard-laurel": {
    "ja": "月桂樹コーナー",
    "en": "Laurel Corner"
  },
  "corner-standard-art-deco": {
    "ja": "アールデココーナー",
    "en": "Art Deco Corner"
  },
  "corner-standard-japanese-wave": {
    "ja": "和柄コーナー",
    "en": "Japanese Wave Corner"
  },
  "corner-standard-classic-leaf": {
    "ja": "クラシックリーフコーナー",
    "en": "Classic Leaf Corner"
  },
  "corner-standard-monochrome": {
    "ja": "モノクロラインコーナー",
    "en": "Monochrome Line Corner"
  },
  "sfx-corrected-05-a-small-tsu-heart": {
    "ja": "あっ♡",
    "en": "A' (Heart)"
  },
  "sfx-corrected-07-a-long-small-tsu-heart": {
    "ja": "あぁーっ♡",
    "en": "Aaa' (Heart)"
  },
  "sfx-corrected-08-byurururu-small-tsu": {
    "ja": "びゅるるるっ",
    "en": "Byurururu'"
  },
  "sfx-corrected-09-dopu-small-tsu-heart": {
    "ja": "どぷっ♡",
    "en": "Dopu' (Heart)"
  },
  "sfx-corrected-10-bibyurururu-small-tsu": {
    "ja": "びびゅるるるっ",
    "en": "Bibyurururu'"
  },
  "sfx-corrected-11-a-dakuten-small-tsu": {
    "ja": "あ゛っ",
    "en": "A (Voiced)'"
  },
  "sfx-corrected-12-oku-small-tsu-heart": {
    "ja": "おくっ♡",
    "en": "Oku' (Heart)"
  },
  "sfx-corrected-13-dopyuyu-small-tsu": {
    "ja": "どぴゅっ",
    "en": "Dopyu'"
  },
  "sfx-corrected-14-a-dakuten": {
    "ja": "あ゛",
    "en": "A (Voiced)"
  },
  "sfx-corrected-15-o-a-long-small-tsu-heart": {
    "ja": "お゛ーっ♡",
    "en": "O (Voiced)e' (Heart)"
  },
  "sfx-corrected-16-byurururu-small-tsu-2": {
    "ja": "びゅるるるっ（短）",
    "en": "Byurururu' (Short)"
  },
  "sfx-corrected-19-ogatsu-two-dots-heart": {
    "ja": "お゛っ♡",
    "en": "O (Voiced)' (Heart)"
  },
  "sfx-corrected-20-biku-biku-biku-question": {
    "ja": "びく！びく！びく！？",
    "en": "Biku!biku!biku!?"
  },
  "sfx-builtin-papu-small-tsu": {
    "ja": "ぱぷっ",
    "en": "Papu'"
  },
  "sfx-builtin-a-small-tsu-heart-2": {
    "ja": "あっ♡",
    "en": "A' (Heart)"
  },
  "sfx-builtin-zupyu-small-tsu": {
    "ja": "ズピューッ",
    "en": "Zupyuu'"
  },
  "sfx-builtin-h-exclamation": {
    "ja": "H!!",
    "en": "H!!"
  },
  "sfx-builtin-birun-heart": {
    "ja": "びるん♡",
    "en": "Birun (Heart)"
  },
  "sfx-builtin-ooo-exclamation-heart": {
    "ja": "おおお!♡",
    "en": "Ooo! (Heart)"
  },
  "sfx-builtin-ooo-exclamation-heart-2": {
    "ja": "おおお!♡ 2",
    "en": "Ooo! (Heart) 2"
  },
  "sfx-builtin-a-small-tsu-triple-exclamation": {
    "ja": "あっ!!!",
    "en": "A'!!!"
  },
  "sfx-builtin-doku-small-tsu-heart-2": {
    "ja": "ドクッ♡",
    "en": "Doku' (Heart)"
  },
  "sfx-builtin-biku-small-tsu-ellipsis-heart": {
    "ja": "ビクッ...♡",
    "en": "Biku'... (Heart)"
  },
  "sfx-builtin-n-small-tsu-heart": {
    "ja": "んっ♡",
    "en": "N' (Heart)"
  },
  "sfx-builtin-a-small-tsu-heart-3": {
    "ja": "あっ♡ 2",
    "en": "A' (Heart) 2"
  },
  "sfx-builtin-opu-long-small-tsu-heart": {
    "ja": "おぷーっ♡",
    "en": "Opuu' (Heart)"
  },
  "sfx-builtin-ngi-small-tsu-exclamation": {
    "ja": "んぎっ!!",
    "en": "Ngi'!!"
  },
  "sfx-builtin-o-small-tsu-exclamation": {
    "ja": "おっ!!",
    "en": "O'!!"
  }
};
  function display(preset, language) {
    if (!preset) return "";
    const original = String(preset.displayName || preset.ocrLabel || preset.label || preset.id || "").trim();
    if (preset.userPreset) return original;
    if (language === "en") return String(preset.displayNameEn || preset.display_name_en || preset.labelEn || preset.label_en || preset.labels?.en || labels[preset.id]?.en || original).trim();
    return String(preset.displayNameJa || preset.labels?.ja || original || labels[preset.id]?.ja || "").trim();
  }
  function search(preset) {
    return [preset.id, preset.displayName, preset.ocrLabel, preset.label, preset.displayNameJa, preset.display_name_ja, preset.displayNameEn, preset.display_name_en, preset.labelEn, preset.label_en, preset.labels?.ja, preset.labels?.en, labels[preset.id]?.ja, labels[preset.id]?.en, preset.keywords].filter(Boolean).join(" ").toLocaleLowerCase();
  }
  return { labels, display, search };
});
