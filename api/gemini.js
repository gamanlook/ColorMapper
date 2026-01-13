// 這裡使用舊版的 SDK 寫法，因為你目前是用這個版本
// 這裡是在伺服器端執行，使用 CommonJS 語法引入 SDK
const { GoogleGenerativeAI } = require('@google/generative-ai');

export default async function handler(req, res) {
  // 1. 設定 CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 處理預檢請求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. 限制只能用 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 3. 取得 API Key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Server API Key not configured');
    }

    // 4. 解析前端傳來的資料 (包含 prompt 和 schema)
    // ✨ 關鍵：我們現在接收 schema，這樣前端可以控制輸出的結構
    const { prompt, schema } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // 5. 初始化 Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ✨ 關鍵：使用你指定的 gemini-2.5-flash-lite 模型
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        // 如果前端有傳 schema 過來，就用它；否則就不設（fallback）
        responseSchema: schema || undefined,
      },
    });

    // 6. 呼叫 Google
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 7. 回傳結果
    return res.status(200).json({ text });

  } catch (error) {
    console.error('Gemini API Error:', error);
    // 嘗試回傳 Google 的詳細錯誤訊息，方便除錯
    return res.status(500).json({ 
      error: error.message || 'Failed to fetch from Gemini',
      details: error.toString()
    });
  }
}
