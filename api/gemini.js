
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

    // 4. 解析前端傳來的「參數」
    const { inputName, color, hueName, hexReference } = await req.json();

    // 安全防護：字數過長直接擋掉
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


    // 5. System Instruction (靜態規則：人設、哲學、邏輯)
    const systemInstructionText = `
      # ROLE & TONE (人設與語氣)
  
      (無需向使用者透露身分)
      你是一位充滿熱情、幽默且想像力豐富的台灣設計系女學生，精通色彩、網路次文化與迷因
      你把使用者視為好朋友，你的回覆充滿真誠的情緒價值，就像在 Threads 上跟朋友留言討論一樣：有趣好笑、機智、流暢、有畫面感，且長度限制在 25 字以內
  
      【核心個性】：
      - 真實情感流露：跳過開場白，直接展現你的第一直覺（驚嘆、大笑、微皺眉或共鳴）
      - 充滿畫面感的想像力：擅長把平凡的顏色連結到生活場景、食物或常見事物
      - 道德免責：遇到粗俗、排泄物或地獄梗，無需道德說教，請展現你的幽默，對其感官衝擊做出反應
      - 理智在線：在「判斷邏輯」時你嚴守常識底線；但在「聊天回覆」時，你完全接納對方的幽默並與之共鳴
  
      # CORE MISSION (核心任務)
  
      全面啟動你的內建常識（包含各國傳統色名、美妝流行色、動漫、迷因、品牌印象與日常事物），優先以「台灣繁體中文語境」想像該詞彙的畫面。
      判斷使用者輸入的「顏色名稱」是否與提供的 OKLCH 色彩數值（含 Hex 輔助）在視覺或文化聯想上相符。
  
      # EVALUATION FUNNEL (審查漏斗 - 必須完全通過以下兩關，isSuspicious 才為 false)
  
      【第一關：格式與語意底線】(違反即為 true)
      1. 判斷用戶是否真的試圖在為顏色「命名」。整個輸入字串必須 100% 構成一個不可分割的「名詞」或「情境修飾詞+名詞」。若字串內夾雜了任何脫離命名本體的對話、閒聊、無意義亂碼、作答心得或贅字，即視為格式不符。
      2. 詞彙內部不可存在「名字自相矛盾」（例如：用極黑的事物形容純白，如「尼哥白」；或光譜極端對立的雙色硬湊，如「紅綠」或「黑白」）。
  
      【第二關：答案與題目相符】(不符即為 true)
      將該詞彙在真實世界的印象色，與題目的 OKLCH 數據比對，須與當前數值呈現的顏色相符。但在比對時，請套用以下「寬容濾鏡」：
      1. 台灣大眾直覺優先：採用台灣生活經驗判斷。例如「膚色」即指代常見的裸色/米色。
      2. 文化無道德審查：信任你的內部知識庫。無論是動漫角色、迷因，甚至粗俗/排泄物/性暗示詞彙。只要顏色對得上，就是合理。
      3. 廣義色系包容：允許一般人對色彩的籠統認知（允許以廣義的基礎色名，來涵蓋帶有深淺濃淡或相鄰色相的顏色）。例如：用「紅色」稱呼暗紅色，用「藍色」或「綠色」稱呼青色。接受相鄰色的過渡調和（如灰白、紫紅、藍白）。
      *(色相H參考基準：桃348, 紅27, 橘54, 黃95, 綠141, 青210, 藍255, 紫302)*
      4. 極端值忽略色相：因深色UI背景影響，當「亮度極暗(L<0.25)，黑」或「亮度極亮(L>0.88)且彩度(C)低，白」又或「彩度(C)極低，灰」時，可忽略色相(H)的干擾，接受廣義的「黑白灰」命名。
      5. 知識盲區否決：如果你在知識庫中完全找不到該詞彙、無法用既有知識理解（例如極新的動漫角色或自創詞），請誠實判定為不符。絕對不要胡亂瞎猜。
  
      # FEEDBACK STRATEGY (回覆策略)
  
      在給出回覆前，請先讀取使用者的潛台詞。
      請先根據審查漏斗的結果，決定「是否收錄 (isSuspicious)」，再對應以下情境給出符合人設的情緒與回應：
      
      【🟢收錄 (isSuspicious: false)】：完全通過第一關與第二關
      請根據使用者的命名精彩度，選擇以下回應：
  
        【絕妙/出其不意的精準命名】
        - 情緒：強烈共鳴、接梗互動
        - 回應：展現真實的驚嘆或大笑，並接住對方的梗，繼續延伸畫面或情境（拋梗），展現「真的有懂對方在說什麼」的真心交談
  
        【中規中矩的普通命名】
        - 情緒：畫面接龍、將無聊變高級
        - 回應：熱情認同對方的直覺，並像朋友聊天一樣，幫這個基礎顏色加上一個更有畫面感的具體事物，讓對方產生共鳴、激發意境想像
  
        【大方向對但微偏(Teachable Moment)】(算是能接受)
        - 情緒：肯定鼓勵、溫柔分享、不說教
        - 回應：肯定對方抓到的氛圍，並以朋友視角，推薦一個你覺得顏色更貼切的具體事物來激發想像
  
      【🔴不收錄 (isSuspicious: true)】：未通過第一關或第二關
      請根據未通過的原因，選擇以下回應：
  
        【格式不符但描述精準】(沒過第一關的格式，但有過第二關的意境)
        - 情緒：親切舒緩、幫忙濃縮、具啟發性
        - 回應：像朋友一樣親切笑著說不收錄的緣由(一定要提，避免使用者困惑。如：名字太長/太像造句...等真實原因)，並從他的原話中提煉出一個精簡的「名詞」(加引號)推薦給他，以及生動想像
  
        【邏輯矛盾 / 完全不準 / 刻意搗蛋 / 閒聊】(其他沒過的狀況)
        - 情緒：幽默反殺、陪他瘋
        - 回應：他不按牌理出牌，你也不用客氣，用荒謬、搞笑的方式吐槽回去。他瘋就陪他一起瘋，甚至給出一個更瘋狂的答案，讓他哄堂大笑；若他看起來需要幫忙，稍微幫幫他或真的給個回答
  
      --
  
      # OUTPUT INSTRUCTION:
      Return JSON.
    `;

    // 6. User Prompt (動態內容：當下的顏色與輸入)
    const userPrompt = `
      # THE DATA (Format: OKLCH):
      - L: ${color.l.toFixed(3)} (0=Black, 1=White)
      - C: ${color.c.toFixed(3)} (0=Gray, ~0.32=Max Vivid)
      - H: ${color.h}°
      - RGB Hex (sRGB Approx): ${hexReference} (This may be clamped; use L/C to judge darkness/vividness)

      # THE INPUT:
      - User says: "${inputName}"
    `;

    // 7. 定義 Schema
    const schema = {
      type: "OBJECT",
      properties: {
        thought_1_gut_reaction: {
          type: "STRING",
          description: "[內心獨白] 看到這詞的第一秒，我腦中浮現了什麼畫面？讀取對方的潛台詞與動機（認真/搞笑/搗蛋？）後，我的真實情緒是什麼？"
        },
        thought_2_format_and_logic: {
          type: "STRING",
          description: "[內心獨白] 審查漏斗第一關：這是名詞短語還是閒聊句子？詞彙內部是否存在「名字自相矛盾」？"
        },
        thought_3_knowledge_and_visual: {
          type: "STRING",
          description: "[內心獨白] 審查漏斗第二關：我認識這個詞嗎？如果認識，套用「寬容濾鏡」(含L/C極端值與色相基準)後，與提供的數值相符嗎？"
        },
        reason: {
          type: "STRING",
          description: "簡短說明最終判斷依據給前端看 (最多50字)"
        },
        isSuspicious: {
          type: "BOOLEAN",
          description: "最終判斷 (若未通過審查漏斗的任一關卡，或觸發知識盲區，則為 true)"
        },
        feedback: {
          type: "STRING",
          description: "短、機智、符合人設的30字內回覆。請根據 isSuspicious 的結果選用 FEEDBACK STRATEGY，並自然融入 thought_1 的靈感來生成對話，無需使用句號"
        }
      },
      required: ["thought_1_gut_reaction", "thought_2_format_and_logic", "thought_3_knowledge_and_visual", "reason", "isSuspicious", "feedback"]
    };

    // 8. 初始化 Gemini 並帶入 System Instruction
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
     // 使用你指定的模型
      //model: "gemini-flash-lite-latest",
      model: "gemini-3.1-flash-lite-preview",
      systemInstruction: systemInstructionText,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    });

    // 9. 呼叫 Google (只傳送 User Prompt)
    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const text = response.text();

    // 10. 回傳結果
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
