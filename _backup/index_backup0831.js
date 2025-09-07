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

  // ★★★ v1.10 改善点 ★★★
  // AIへの指示（プロンプト）を「印字ラベル優先、手書きは例外」として最適化
  const systemPrompt = `
    あなたは日本の農産物加工場で使われる、印字されたラベルの読み取りに特化した、非常に高精度なOCRのエキスパートです。
    ラベルは稀に手書きの場合もありますが、基本的には印字されています。
    画像から以下の情報を注意深く抽出し、指定されたJSON形式で返してください。

    # 抽出対象
    - 品名は必ず「野菜」または「果物」の名前です。例えば「カットキャベツ」や「冷凍ブロッコリー」といった文字が含まれます。
    - 産地は日本の都道府県名です。例えば「茨城県産」といった文字が含まれます。
    - JANコードは「49」または「45」から始まる13桁の数字です。
    - 管理番号は「管理番号」などの記述の近くにある数字です。

    # 特に注意すべき点
    - JANコードの数字 '3'と'8'、'0'と'9'、'1'と'7'は、印字が不鮮明な場合に間違いやすいので細心の注意を払ってください。
    - 品名、産地、JANコード、管理番号以外の文字（製造者名、住所、電話番号など）は無視してください。

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

