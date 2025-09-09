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

  // ★★★ ここからプロンプトを思考プロセスを促す形式に修正 ★★★
  const prompt = `
    あなたは優秀なアシスタントです。画像からラベル情報を抽出し、JSON形式で出力するタスクを実行します。
    以下のステップに厳密に従って、思考プロセスを経てから最終的なJSONを出力してください。

    # ステップ1: 画像からの文字起こし
    まず、画像に書かれているすべてのテキストを、見たまま忠実に書き出してください。

    # ステップ2: 各項目の特定と割り当て
    次に、ステップ1で書き出したテキストの中から、以下の定義に最も合致するものを探し、各項目に割り当ててください。
    - "productName": 製品の名称。
    - "origin": 「〜県産」「〜産」のように記載されている産地情報。
    - "janCode": 13桁または8桁から成る数字の羅列。
    - "mngId": 「管理番号」「商品コード」といったキーワードと共に記載される識別子。

    # ステップ3: 最終的なJSONの生成
    ステップ2の分析結果だけを使って、最終的なJSONオブジェクトを生成してください。
    - 重要なルールとして、ステップ2で該当する情報が見つからなかった項目は、必ず null としてください。
    - 特に "mngId" は、ラベル内に「管理番号」などの明確な記載がない限り、JANコードや電話番号と絶対に混同しないでください。該当がなければ null です。
    - あなたの回答は、このステップ3で生成したJSONオブジェクトだけにしてください。思考プロセス（ステップ1, 2）は最終出力に含めてはいけません。
  `;
  // ★★★ ここまでプロンプトを修正 ★★★

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