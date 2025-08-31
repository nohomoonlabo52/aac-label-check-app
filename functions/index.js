/**
 * ラベルチェックアプリ Cloud Function v1.2.5
 * * 機能:
 * - 画像データを受け取り、Google Gemini APIを使用して画像内のテキストを抽出します。
 * - AIの役割を純粋なOCRに限定し、見たままのテキストを返すことに特化させます。
 * * v1.2.5 変更点:
 * - AIへのプロンプトを、解釈や推測を排除した、純粋な文字起こし（OCR）の指示に変更。
 * - 返り値の形式を、構造化されたJSONではなく、抽出したテキスト全体を含むシンプルなオブジェクトに変更。
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
    
    // ★★★ v1.2.5 変更点 ★★★
    // プロンプトを純粋なOCRタスクに限定
    const prompt = `
      あなたは高性能なOCRエンジンです。
      添付された画像に含まれるすべてのテキストを、改行も含めて、見たまま一字一句正確に書き出してください。
      余計な解釈、要約、JSON形式への変換は一切不要です。ただのプレーンテキストとして回答してください。
    `;

    try {
      const result = await model.generateContent([prompt, {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: "image/jpeg"
        }
      }]);
      const response = result.response;
      const rawText = response.text();
      
      // AIが返したプレーンテキストをそのまま返す
      return { rawText: rawText };

    } catch (error) {
      console.error("Gemini APIの呼び出しでエラーが発生しました:", error);
      throw new functions.https.HttpsError('internal', 'AIの解析中にエラーが発生しました。');
    }
});

