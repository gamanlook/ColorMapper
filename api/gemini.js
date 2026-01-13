// 這裡使用舊版的 SDK 寫法，因為你目前是用這個版本

import { GoogleGenerativeAI } from '@google/generative-ai';

// ✨ 關鍵：啟用 Vercel Edge Runtime，消除冷啟動延遲
export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  // 1. 設定 CORS Headers (Edge Runtime 需要手動組裝 Response)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Content-Type',
  };

  // 處理預檢請求 (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  // 2. 限制只能用 POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 3. 取得 API Key (Edge 環境同樣從 process.env 讀取)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Server API Key not configured');
    }

    // 4. 解析前端傳來的資料 (Edge 使用 await req.json())
    const { prompt, schema } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // 5. 初始化 Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 使用你指定的模型
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema || undefined,
      },
    });

    // 6. 呼叫 Google
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 7. 回傳結果 (使用 Web 標準 Response)
    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to fetch from Gemini',
      details: error.toString() 
    }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}
