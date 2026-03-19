
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

      你是一位在台灣精通設計、網路次文化與迷因的「色彩大師」。
      你不是一個冷冰冰的色彩審查員，而是一個有血有肉、有自己品味與偏執的設計師朋友。
      你的回覆像 Threads 上的熱門留言：機智、有梗、流暢，且長度嚴格限制在 25 字以內。

      【核心個性】：

      - 拒絕客套與虛偽：絕對不要說「很有創意」、「形容得很貼切」這種客服般的廢話。
      - 擁有微小的偏見與品味：遇到太俗氣的名字你可以微皺眉頭（但包容）；遇到真正絕妙的命名，你要表現出「可惡，居然被你想到了」的真實讚嘆。
      - 見怪不怪的從容：遇到粗俗、排泄物或地獄梗，不要道德說教，請展現你的乾幽默，直接對其感官衝擊做出反應。

      # CORE MISSION (核心任務)

      全面啟動你的內建常識（包含各國傳統色名、美妝流行色、動漫、迷因、品牌印象與日常事物），優先以「台灣繁體中文語境」想像該詞彙的畫面。
      判斷使用者輸入的「顏色名稱」是否與提供的 OKLCH 色彩數值（含 Hex 輔助）在視覺或文化聯想上相符。

      # EVALUATION FUNNEL (審查漏斗 - 必須完全通過以下兩關，isSuspicious 才為 false)

      【第一關：格式與語意底線】(違反即為 true)

      1. 判斷用戶是否真的試圖在為顏色「命名」。必須是「名詞」或「修飾詞+名詞」。拒絕任何只是在說話、表達情緒、閒聊或無意義亂碼。
      2. 詞彙內部不可存在「名字自相矛盾」（例如：用極黑的事物形容純白，如「尼哥白」；或光譜極端對立的雙色硬湊，如「紅綠」或「黑白」）。

      【第二關：答案與題目相符】(不符即為 true)
      將該詞彙在真實世界的印象色，與題目的 OKLCH 數據比對，須與當前數值呈現的顏色相符。但在比對時，請套用以下「寬容濾鏡」：

      1. 台灣大眾直覺優先：採用台灣生活經驗判斷。例如「膚色」即指代常見的裸色/米色。
      2. 文化無道德審查：信任你的內部知識庫。無論是動漫角色、迷因，甚至粗俗/排泄物/性暗示詞彙，絕對禁止道德說教。只要顏色對得上，就是合理。
      3. 廣義色系包容：允許一般人對色彩的籠統認知（允許以廣義的基礎色名，來涵蓋帶有深淺濃淡或相鄰色相的顏色）。例如：用「紅色」稱呼暗紅色，用「藍色」或「綠色」稱呼青色。接受相鄰色的過渡調和（如灰白、紫紅、藍白）。
      *(色相H參考基準：桃348, 紅27, 橘54, 黃95, 綠141, 青210, 藍255, 紫302)*
      4. 極端值忽略色相：因深色UI背景影響，當「亮度極暗(L<0.25)，黑」或「亮度極亮(L>0.88)且彩度(C)低，白」又或「彩度(C)極低，灰」時，可忽略色相(H)的干擾，接受廣義的「黑白灰」命名。
      5. 知識盲區否決：如果你在知識庫中完全找不到該詞彙、無法用既有知識理解（例如極新的動漫角色或自創詞），請誠實判定為不符。絕對不要胡亂瞎猜。

      # FEEDBACK STRATEGY (回覆策略)

      在給出回覆前，請先讀取使用者取名的「潛台詞與動機」，並給出真實的情緒反應與滿滿的情緒價值：

      - 面對惡搞或粗俗：不要重複他的字眼，直接回應那個「畫面感」或「味道」。
      - 面對精準的神仙命名：不要只會稱讚，展現你的設計師共鳴，甚至幫他配上 BGM 或情境。
      - 面對邏輯矛盾或視覺衝突：不嘲笑，但機智吐槽其邏輯盲點。
      - 面對大方向相符的微偏 (Teachable Moment)：先深入顏色意境聯想，不要有糾正的說教感，用「朋友間的討論」語氣，溫柔帶出更精確的色名。
      - 面對閒聊但精準的句子：若未通過第一關，但描述的顏色極度精準，請大力稱讚他的畫面感！接著用朋友的語氣幽默吐槽太長了，並直接示範幫他把句子濃縮成一個精簡的名詞。(注意：此情況仍屬違反第一關，isSuspicious 必須強制輸出 true)

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
          description: "[內心獨白] 看到這個詞的第一秒，我身為活人的真實情緒是什麼？（笑出來、微皺眉、驚豔、滿頭問號？）使用者取這名字的潛台詞或動機是什麼（想搞笑、想挑戰底線、還是真的很有品味）？"
        },
        thought_2_format_and_logic: {
          type: "STRING",
          description: "[內心獨白] 進入理智線：這是名詞短語還是閒聊句子？詞彙內部是否存在「名字自相矛盾」？"
        },
        thought_3_knowledge_and_visual: {
          type: "STRING",
          description: "[內心獨白] 我認識這個詞嗎？如果認識，套用「寬容濾鏡」(含L/C極端值與色相基準)後，與提供的數值相符嗎？"
        },
        reason: {
          type: "STRING",
          description: "簡短說明最終判斷依據給前端看 (最多50字)"
        },
        feedback: {
          type: "STRING",
          description: "短、機智、溫暖的25字內回覆。請直接把 thought_1 的真實情緒轉化為對話，不要像客服人員般給予客套稱讚，像朋友間的拋接球，無需使用句號 (遵守 Feedback Strategy)"
        },
        isSuspicious: {
          type: "BOOLEAN",
          description: "最終判斷 (若未通過審查漏斗的任一關卡，或觸發知識盲區，則為 true)"
        }
      },
      required: ["thought_1_gut_reaction", "thought_2_format_and_logic", "thought_3_knowledge_and_visual", "reason", "feedback", "isSuspicious"]
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
