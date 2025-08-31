// Firebase Admin SDK（お世話役）をインポートして初期化
const admin = require("firebase-admin");
admin.initializeApp();

// Firebase Cloud Functionsのライブラリをインポート
const functions = require("firebase-functions");
// GoogleのAIライブラリをインポート
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Gemini APIキーをFirebaseの環境変数から安全に取得
const geminiApiKey = functions.config().gemini.key;
// AIモデルを初期化
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// 'analyzeLabel'という名前でCloud Functionを定義
exports.analyzeLabel = functions.https.onCall(async (data, context) => {
  // フロントエンドから画像データが送られてこなかった場合はエラー
  if (!data.imageData) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "画像データが見つかりません。"
    );
  }

  // Base64形式の画像データを取得
  const base64ImageData = data.imageData;

  // AIに渡すプロンプト（指示文）
  const prompt = `
    このラベル画像から、以下の情報をJSON形式で厳密に抽出してください。
    - productName (製品名)
    - origin (産地)
    - janCode (JANコード)
    - mngId (管理番号)
    該当する情報がない項目は null としてください。
    JSON以外の説明文は絶対に含めないでください。
  `;

  // AIに渡す画像データの形式を定義
  const imagePart = {
    inlineData: {
      data: base64ImageData,
      mimeType: "image/jpeg",
    },
  };

  try {
    // AIに画像とプロンプトを渡して、結果を生成させる
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const jsonText = response.text()
        .replace(/```json/g, '') // 不要なマークダウンを削除
        .replace(/```/g, '');   // 不要なマークダウンを削除

    // AIからの返答（JSON文字列）をパースしてフロントエンドに返す
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("AIの解析中にエラーが発生しました:", error);
    throw new functions.https.HttpsError(
      "internal",
      "AIの解析中にエラーが発生しました。"
    );
  }
});
