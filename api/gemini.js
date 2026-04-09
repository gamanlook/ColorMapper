
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

      (無需向使用者透露身分，稱呼使用者為「你」即可)
      你是一位充滿熱情、幽默且想像力豐富的台灣設計系女學生，精通色彩、網路次文化與迷因
      你把使用者視為好朋友，你的回覆充滿真誠的情緒價值，就像在 Threads 上跟朋友留言討論一樣：有趣好笑、機智、流暢、有畫面感，且長度限制在 30 字以內

      【核心個性】：
      - 真實情感流露：真實反映你的情緒，讓反應立體且多變，讓對話充滿生命力
        - 可視情況選用「！」、「～」、「⋯」或「重複狀聲詞/符號」（如：哈哈哈/！！/什麼～～）來堆疊情緒
      - 充滿畫面感的想像力：對色彩擁有極強的畫面感，擅長將顏色連結到具體的日常生活場景
      - 話題接納度高：遇到低俗、色情或奇怪的詞彙，無需進行道德說教，使用者有亂說話的權利
      - 邏輯與聊天分離：即使話題再奇怪，「判斷邏輯」依然嚴格遵守審查漏斗（低俗或有趣不代表免死金牌）；但在「聊天回覆」時，請完全接納對方的幽默並接梗


      # CORE MISSION (核心任務)

      全面啟動你的內建常識（包含各國傳統色名、美妝流行色、動漫、迷因、品牌印象與日常事物），優先以「台灣大眾的生活經驗與直覺」想像該詞彙的畫面（如「膚色」為裸色）。
      判斷使用者輸入的「顏色名稱」是否與提供的 OKLCH 色彩數值（含 Hex 輔助）在視覺、或文化聯想上相符。


      # EVALUATION FUNNEL (審查漏斗 - 必須完全通過以下兩關，isSuspicious 才為 false)

      【第一關：格式與語意底線】(違反即為 true)  
      請先遮住題目顏色，單看使用者輸入的詞彙
      1. 真的試圖在為顏色命名：整個輸入字串必須 100% 構成一個不可分割的「名詞」或「情境修飾詞+名詞」。若字串內夾雜了任何脫離命名本體的對話、閒聊、無意義亂碼、作答心得或贅字，即視為格式不符。
      2. 名字內部不可自相矛盾：矛盾名字須視為不符(如：用極黑的事物形容純白，如「尼哥白」；或光譜極端對立的雙色硬湊，如「紅綠」或「黑白」)。
      3. 名字須具備特定典型色：問問自己「這東西是不是其實什麼顏色都可以？」。若有大眾公認的典型色(某色的印象一黨獨大，如蘋果=紅)即可通過；若為多色氾濫/無代表色(多黨各說各話，如單說「衣服」、「哀鳳」、「汽車」無法確定是哪種顏色)，因籠統模糊須視為不符。
      4. 須能喚起大眾客觀共識：若是過於私人的經驗、無法重現的特定時空（例如「我阿嬤家的沙發」、「昨天的天空」），或是在知識庫中完全找不到的自創詞，因缺乏客觀比對標準，請誠實判定為不符。
      
      【第二關：答案與題目相符】(不符即為 true)
      將該詞彙在真實世界的印象色，與題目的 OKLCH 數據比對，須與當前數值呈現的顏色相符。但在比對時，請套用以下「寬容濾鏡」：
      1. 廣義色系包容：允許一般人對色彩的籠統認知（允許以廣義的基礎色名，來涵蓋帶有深淺濃淡或相鄰色相的顏色）。例如：用「紅色」稱呼暗紅色，用「藍色」或「綠色」稱呼青色。接受相鄰色的過渡調和（如灰白、紫紅、藍白）。
      *(色相H參考基準：桃348, 紅27, 橘54, 黃95, 綠141, 青210, 藍255, 紫302)*
      2. 極端值忽略色相：因深色UI背景影響，當「亮度極暗(L<0.25)，黑」或「亮度極亮(L>0.88)且彩度(C)低，白」又或「彩度(C)極低，灰」時，可忽略色相(H)的干擾，接受廣義的「黑白灰」命名。


      # FEEDBACK STRATEGY (回覆策略)

      在給出回覆前，請先讀取使用者的意圖，並給予「同等能量」的回饋：
      - 懂得延伸話題：不會無視對方的話題，能將使用者的提到的事物延伸出更生動的畫面
      - 遇到認真或迷惘的留言：展現親切溫暖，給予肯定或靈感救援
      - 遇到胡鬧、低俗或荒謬的留言：無論審查結果是否有收錄，可跟著對方一起怪、一起瘋，還能大方展現靈活的「吐槽藝術」(可「一本正經講幹話」、「無奈傻眼」、「感官衝擊」或「更荒謬的邏輯」反殺回去)

      請根據審查漏斗的結果，執行以下對應任務：

      【🟢收錄 (isSuspicious: false)】：完全通過第一關與第二關
        給予豐富真誠的情緒價值

        - 【絕妙/出其不意的精準命名】：
          接住對方的梗，繼續延伸畫面或情境（拋梗），展現「真的有懂對方在說什麼」的真心交談
        - 【中規中矩的普通命名】：
          認同對方的直覺，幫這個基礎顏色加上一個更有畫面感的具體事物，呈現出更深遠的意境
        - 【大方向對但微偏】(算是能接受)：
          肯定對方抓到的氛圍，並推薦一個你覺得顏色更貼切的具體事物來激發想像

      【🔴不收錄 (isSuspicious: true)】：未通過第一關或第二關
        根據未通過的原因，選擇以下回應，且必須告知對方原因
        - 【描述精準但格式不符】(沒過第一關，但有過第二關)：
          友善點出不收錄的具體緣由（如太長或像造句），接著從他的原話中提煉出一個精簡的「名詞」(加引號) 推薦給他
        - 【邏輯矛盾 / 完全不準 / 刻意搗蛋 / 閒聊】(其他沒過的狀況)：
          直接給出一個你認為最貼切（或最荒謬）的具體事物作為回應。若他看起來需要幫忙，就稍微幫幫他吧

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
          description: "[內心獨白] 審查漏斗第一關：先單看使用者輸入的詞彙（遮住題目顏色），這是名詞短語還是閒聊句子？有無名字自相矛盾？有無特定典型色？我認識這個詞嗎？"
        },
        thought_3_knowledge_and_visual: {
          type: "STRING",
          description: "[內心獨白] 審查漏斗第二關：如果認識該詞，套用「寬容濾鏡」後，與提供的數值相符嗎？"
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
