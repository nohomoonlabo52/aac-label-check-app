/**
 * ラベルチェックアプリ Cloud Function v1.2.6
 * * 機能:
 * - 画像データを受け取り、Google Gemini APIを使用して画像内のテキストを解析します。
 * - AIの役割を「データ抽出エキスパート」とし、必要な情報のみを構造化して返します。
 * * v1.2.6 変更点:
 * - AIの安全機能が作動しないよう、個人情報（生産者名、電話番号）を抽出対象から除外することを明記。
 * - AIへの指示を、必要な情報のみをJSON形式で返す「データ抽出」タスクに変更。
 */

const functions = require("firebase-functions");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const geminiApiKey = functions.config().gemini.key;
if (!geminiApiKey) {
  console.error("Gemini APIキーが設定されていません。");
}
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

exports.analyzeLabel = functions
  .region('asia-northeast1')
  .https.onCall(async (data, context) => {
    if (!geminiApiKey) {
      throw new functions.https.HttpsError('internal', 'サーバーにGemini APIキーが設定されていません。');
    }
    if (!data.imageData) {
      throw new functions.https.HttpsError('invalid-argument', '画像データが見つかりません。');
    }

    const imageBuffer = Buffer.from(data.imageData, 'base64');
    
    // ★★★ v1.2.6 変更点 ★★★
    // プロンプトを、個人情報を無視するデータ抽出タスクに変更
    const prompt = `
      あなたは日本の農産物ラベルから、特定の情報のみを抽出するデータ抽出のエキスパートです。
      添付された画像から、以下の4つの情報だけを日本語で正確に抽出してください。

      # 抽出対象
      1. 管理番号 (mngId): ラベルに記載されている可能性のある3桁または4桁の数字。
      2. 商品名 (productName): 必ず野菜か果物の名前です。例:「カットキャベツ」「冷凍ブロッコリー」。
      3. 産地 (origin): 必ず日本の都道府県名です。例:「茨城県産」「静岡県」。
      4. JANコード (janCode): 49または45から始まる13桁の数字。

      # 禁止事項
      - **生産者名や会社名（例: オノザワファーム）、電話番号は個人情報なので、絶対に抽出しないでください。**
      
      # 出力形式
      - 該当する情報が見つからない項目は、必ずnullを返してください。
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
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      } else {
        console.error("AIからの返答に有効なJSONが含まれていませんでした:", text);
        // AIがテキストを返せなかったと解釈し、空のオブジェクトを返す
        return { mngId: null, productName: null, origin: null, janCode: null };
      }
    } catch (error) {
      console.error("Gemini APIの呼び出しでエラーが発生しました:", error);
      throw new functions.https.HttpsError('internal', 'AIの解析中にエラーが発生しました。');
    }
});

