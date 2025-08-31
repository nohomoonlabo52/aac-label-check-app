/**
 * ラベルチェックアプリ Cloud Function v1.2.3
 * * 機能:
 * - 画像データを受け取り、Google Gemini APIを使用して画像内のテキストを解析します。
 * - 商品マスタ登録用に、管理番号、商品名、産地、JANコードを抽出して返します。
 * * v1.2.3 変更点:
 * - products.html用にプロンプトを最適化。
 * - mngId (管理番号) の抽出を明確に指示。
 * - AIの役割を「商品マスタ登録用のラベル読み取り専門家」に設定。
 */

const functions = require("firebase-functions");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ★★★ v1.10で手動変更した場合は、このバージョンに合わせてください ★★★
// Firebaseの環境変数からAPIキーを安全に取得
const geminiApiKey = functions.config().gemini.key;
if (!geminiApiKey) {
  console.error("Gemini APIキーが設定されていません。firebase functions:config:set gemini.key=\"YOUR_API_KEY\" を実行してください。");
}
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

exports.analyzeLabel = functions
  .region('asia-northeast1') // 東京リージョン
  .https.onCall(async (data, context) => {
    if (!geminiApiKey) {
      throw new functions.https.HttpsError('internal', 'サーバーにGemini APIキーが設定されていません。');
    }
    if (!data.imageData) {
      throw new functions.https.HttpsError('invalid-argument', '画像データが見つかりません。');
    }

    const imageBuffer = Buffer.from(data.imageData, 'base64');
    
    // ★★★ v1.2.3 変更点 ★★★
    // プロンプトを商品マスタ登録用に最適化
    const prompt = `
      あなたは日本の農産物加工場で使用される、商品マスタ登録用のラベル読み取りに特化したOCRの専門家です。
      添付された画像から、以下の4つの情報を日本語で正確に抽出してください。
      
      1. 管理番号 (mngId): ラベルに記載されている可能性のある3桁または4桁の数字。もし見つからなければnullを返してください。
      2. 商品名 (productName): 必ず野菜か果物の名前です。例えば「カットキャベツ」や「冷凍ブロッコリー」などです。
      3. 産地 (origin): 必ず日本の都道府県名です。例えば「茨城県産」や「静岡県」などです。
      4. JANコード (janCode): 日本のJANコードで、49または45から始まる13桁の数字です。
      
      注意事項:
      - ラベルは稀に手書きの場合もありますが、基本的には印字されています。
      - 数字の'3'と'8'、'0'と'9'、'1'と'7'は特に間違いやすいので注意深く読み取ってください。
      - 該当する情報が見つからない場合は、その項目には必ずnullを返してください。
      - 回答は必ず以下のJSON形式で、キーも英語のまま返してください。余計な説明は不要です。
      
      {
        "mngId": "抽出した管理番号",
        "productName": "抽出した商品名",
        "origin": "抽出した産地",
        "janCode": "抽出したJANコード"
      }
    `;

    try {
      const result = await model.generateContent([prompt, {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: "image/jpeg"
        }
      }]);
      const response = result.response;
      const text = response.text();
      
      // AIの返答からJSON部分のみを抽出する
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        console.error("AIからの返答に有効なJSONが含まれていませんでした:", text);
        throw new functions.https.HttpsError('internal', 'AIが有効な形式で応答しませんでした。');
      }
    } catch (error) {
      console.error("Gemini APIの呼び出しでエラーが発生しました:", error);
      throw new functions.https.HttpsError('internal', 'AIの解析中にエラーが発生しました。');
    }
});

