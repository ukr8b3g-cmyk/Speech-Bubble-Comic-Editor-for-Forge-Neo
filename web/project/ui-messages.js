// Translate application-owned errors only; filenames and user content are preserved.
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SpeechBubbleUiMessages = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";
  const errors = {
    "画像サイズが大きすぎます。": "The image file is too large.",
    "出力フォルダーは絶対パスで指定してください。": "Use an absolute path for the output folder.",
    "出力フォルダーが存在しません。": "The output folder does not exist.",
    "出力先はフォルダーを指定してください。": "Choose a folder as the output destination.",
    "出力フォルダーへ書き込めません。": "The output folder is not writable.",
    "モデルのダウンロードをキャンセルしました。": "Model download cancelled.",
    "モデルのファイルサイズが一致しません。": "The model file size does not match.",
    "モデルのSHA-256が一致しません。": "The model SHA-256 does not match.",
    "ダウンロード中はモデルを削除できません。": "The model cannot be deleted during a download.",
    "背景削除モデルがありません。最初にモデルを取得してください。": "Download the background-removal model first.",
    "ONNX Runtimeを読み込めませんでした。": "Could not load ONNX Runtime.",
    "画像が空、またはサイズが大きすぎます。": "The image is empty or too large.",
    "画像を読み込めませんでした。": "Could not load the image.",
    "画像の解像度が大きすぎます。": "The image resolution is too large.",
  };
  function error(message, language) {
    if (language !== "en" || typeof message !== "string") return message;
    const prefix = "モデルを取得できませんでした: ";
    if (message.startsWith(prefix)) {
      const detail = message.slice(prefix.length);
      return "Could not download the model: " + (errors[detail] || detail);
    }
    return errors[message] || message;
  }
  return {error};
});
