    const functions = require("firebase-functions");
    const admin = require("firebase-admin");
    const { GoogleGenerativeAI } = require("@google/generative-ai");

    admin.initializeApp();

    // ★★★ 変更点 ★★★
    // AIへの指示（プロンプト）を、より詳細で具体的な内容に変更
    const SYSTEM_PROMPT = `あなたは日本の食品表示ラベルを読み取る専門家です。
    画像から以下の情報を抽出し、JSON形式で返してください。
    - productName: 商品名
    - origin: 産地
    - janCode: 13桁のJANコード。バーコードの下にある数字を正確に読み取ってください。数字以外の文字は含めないでください。
    - mngId: 「管理番号」やそれに類する項目があればその値。なければnull。
    もし情報が読み取れない場合は、該当するキーの値をnullにしてください。`;
    
    // APIキーを環境変数から取得
    const geminiApiKey = functions.config().gemini.key;
    if (!geminiApiKey) {
        console.error("Gemini APIキーが設定されていません。");
    }
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    exports.analyzeLabel = functions.https.onCall(async (data, context) => {
        if (!data.imageData) {
            throw new functions.https.HttpsError('invalid-argument', '画像データが必要です。');
        }
        if (!geminiApiKey) {
            throw new functions.https.HttpsError('internal', 'サーバー側でAPIキーが設定されていません。');
        }

        try {
            const imagePart = {
                inlineData: {
                    data: data.imageData,
                    mimeType: 'image/jpeg'
                }
            };

            const result = await model.generateContent([SYSTEM_PROMPT, imagePart]);
            const response = await result.response;
            let text = response.text();

            // AIの返答からJSON部分だけを抽出する
            text = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            
            const jsonData = JSON.parse(text);

            return jsonData;

        } catch (error) {
            console.error("AIの解析中にエラーが発生しました:", error);
            throw new functions.https.HttpsError('internal', 'AIの解析に失敗しました。', error.message);
        }
    });
    
