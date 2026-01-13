import { GoogleGenerativeAI } from '@google/generative-ai';

// Vercel Serverless Function Handler
// 回歸初心：這只是一個帶有 API Key 的轉發器 (Proxy)
export default async function handler(req: any, res: any) {
  // CORS 設定
  //res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Server API Key not configured');
    }

    // 🔥 關鍵改變：不再由後端組裝 Prompt，而是直接接收前端傳來的一切
    const { prompt, schema } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt in request body' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 這裡我們只負責把前端的東西餵給 SDK
    // 不做任何型別檢查，不做任何 Schema 建構，避免 Serverless Crash
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema || undefined, // 如果前端有傳 schema 就用
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return res.status(200).json({ text });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch from Gemini',
      details: error.toString()
    });
  }
}
