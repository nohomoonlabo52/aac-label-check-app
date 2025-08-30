const functions = require("firebase-functions");
const {VertexAI} = require("@google-cloud/vertexai");

// Firebaseプロジェクトの初期化（Admin SDK）
const admin = require("firebase-admin");
admin.initializeApp();

// Cloud Functionのメイン処理
exports.analyzeLabel = functions.https.onCall(async (data, context) => {
  // 画像データがない場合はエラーを返す
  if (!data.imageData) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "画像データが必要です。",
    );
  }

  const project = process.env.GCLOUD_PROJECT;
  const location = "us-central1";

  // Vertex AIの初期化
  const vertexAI = new VertexAI({project: project, location: location});

  // 使用するAIモデルを指定
  const generativeModel = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
  });

  // ★★★ 改善点 ★★★
  // AIへの指示（プロンプト）を、より詳細かつ専門的に変更
  const systemPrompt = `
    あなたは日本の食品商品ラベルを読み取るための、非常に高精度なOCRのエキスパートです。
    画像から以下の情報を注意深く抽出し、指定されたJSON形式で返してください。

    # 抽出する情報
    - 商品名 (productName)
    - 産地 (origin)
    - 管理番号 (mngId): 「管理番号」またはそれに類する記述の近くにある数字。なければnull。
    - JANコード (janCode): 13桁の数字の羅列。

    # JANコードを読み取る際の最重要指示
    - 日本のJANコードは「49」または「45」から始まる13桁の数字です。この形式に完全に従ってください。
    - 数字の '3' と '8'、'0' と '9'、'1' と '7' は特に間違いやすいので、細心の注意を払って識別してください。
    - バーコードの線が数字にかかっている場合でも、正確に読み取るように努めてください。

    # 出力形式 (JSON)
    {
      "productName": "抽出した商品名",
      "origin": "抽出した産地",
      "mngId": "抽出した管理番号",
      "janCode": "抽出したJANコード"
    }

    もし特定の情報が見つからない場合は、そのキーの値をnullにしてください。
    余計な説明は一切含めず、JSONオブジェクトのみを返してください。
  `;

  // AIに渡す画像データを準備
  const imagePart = {
    inlineData: {
      mimeType: "image/jpeg",
      data: data.imageData,
    },
  };

  try {
    // AIに画像と指示を送信し、結果を待つ
    const response = await generativeModel.generateContent({
      contents: [{role: "user", parts: [imagePart]}],
      systemInstruction: {
        role: "system",
        parts: [{text: systemPrompt}],
      },
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    // AIからの返答を取得
    const contentResponse = response.response;
    const jsonString = contentResponse.candidates[0].content.parts[0].text;
    const resultJson = JSON.parse(jsonString);

    // 結果を呼び出し元（ブラウザ）に返す
    return resultJson;
  } catch (error) {
    console.error("AIの解析中にエラーが発生しました:", error);
    throw new functions.https.HttpsError(
        "internal",
        "AIの解析に失敗しました。",
        error.message,
    );
  }
});
