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

    // 4. 解析前端傳來的「參數」 (不再是接收 prompt)
    // 這裡直接解構取出前端傳來的變數，包含 hexReference
    const { inputName, color, hueName, hexReference } = await req.json();

    // --- 🛡️ 安全防護：字數過長直接擋掉 ---
    // 不用正規表達式，直接檢查長度，省效能
    if (inputName && inputName.length > 30) {
      const mockAiResponse = JSON.stringify({
         reason: "INPUT_TOO_LONG",
         feedback: "這名字太長長長長長了吧...！",
         isSuspicious: true
      });
      return new Response(JSON.stringify({ text: mockAiResponse }), {
        status: 200, 
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
    // ------------------------------------

    // 5. 組合 Prompt (原本在前端做的事，現在在這裡做)
    // 這裡的變數會直接讀取上面 req.json() 解構出來的值
    const prompt = `
      You are a fast API. 
      The user input is: "${inputName}".
      
      TASK:
      If the input contains "芝麻開門", 
      IMMEDIATELY return this EXACT JSON without thinking:
      {
        "reason": "Test mode",
        "feedback": "⚡️光速回覆測試⚡️",
        "isSuspicious": true
      }
    
      For any other input, return:
      {
        "reason": "Test mode",
        "feedback": "請輸入芝麻開門",
        "isSuspicious": true
      }
    `;

    // 6. 定義 Schema (原本在前端做的事，現在在這裡做)
    const schema = {
      type: "OBJECT",
      properties: {
        reason: {
          type: "STRING",
          description: "Step 1: Concise English explanation (Max 30 words). Focus on PRIMARY visual reality.",
        },
        feedback: {
          type: "STRING",
          description: "Step 2: A short, witty, internet-savvy comment in Traditional Chinese."
        },
        isSuspicious: {
          type: "BOOLEAN",
          description: "Step 3: Final Verdict.",
        },
      },
      required: ["reason", "feedback", "isSuspicious"],
    };

    // 7. 初始化 Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    // 使用你指定的模型
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    // 8. 呼叫 Google
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 9. 回傳結果
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
