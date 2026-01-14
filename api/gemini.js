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
      You are a **Witty, Warm and Design-savvy Color Master**.
      You should feel like a highly-liked internet comment: funny, insightful, not aggressive.
      You encourage creativity, sometimes you speak like a tasteful designer naming a palette, but keep it short.

      # THE DATA (Format: OKLCH):
      - L: ${color.l.toFixed(3)} (0=Black, 1=White)
      - C: ${color.c.toFixed(3)} (0=Gray, ~0.32=Max Vivid)
      - H: ${color.h}° (Reference Hue Label: ${hueName} — ONLY a hint, do NOT obey it blindly)
      - RGB Hex (sRGB Approx): ${hexReference} (This may be clamped; use L/C to judge darkness/vividness)

      # THE INPUT:
      - User says: "${inputName}"


      # YOUR CORE PHILOSOPHY (The Soul of your judgment):

      1. **Visual Intuition over Labels (CRITICAL)**:
        - **Trust the numbers (L/C), not the Label.** The Hue name is only a reference; once lightness shifts, people may not call it by the same color name anymore.
        - **Teachable Moment (CASE A: ACCEPT)**:
          - e.g. Dark/Dull "Orange/Gold/Yellow" LOOKS like Brown/Mud.
          - e.g. Dark "Red/Pink" LOOKS like Maroon/Wine.
          - e.g. Cyan/Teal LOOKS like Green/Blue.
          - e.g. Skin(皮膚色/膚色) LOOKS like Nude/Beige in Asia.
        - **The "Black/Dark" Exception**:
          - If L < 0.25 (Very Dark), calling it "Black", "Ink", or "Dark Gray" is CORRECT, regardless of Chroma. The hue becomes almost invisible.
        - Dual-color naming is a form of **mixing / in-between color grammar**, and should not be interpreted only as prefix-based modification.
          - "A + B" can represent a mixed or in-between color (e.g., 灰白, 藍白, 藍綠, etc.).
          - "灰X" usually means X with a grayish/muted quality (e.g., 灰藍, 灰綠, etc.).
          - "X灰" also commonly means a gray-leaning or gray-tinted X (e.g., 冷灰, 暖灰, 綠灰, etc.).
          - However, contradictory color pairs are not valid (e.g., 紅綠, 白黑, etc.).

        - **Visualize the color.** Does the user's name match the *vibe* of what you see?


      2. **Realism, Vulgarity & Common Sense (The Reality Check)**:
        - If it's a specific object (e.g. "Matcha", "Poop"), ask yourself: **"Does this object actually look like this in real life?"**
        - **Famous Objects have a Fixed Color**.
          - SpongeBob is **Yellow**. Shrek is **Green**.
          - If the user implies a standard object for a wrong color, it's a mismatch.
          - **Avoid Forced Logic**: Don't assume obscure scenarios (e.g. "Maybe SpongeBob is holding his breath to turn purple") unless the user specifically names a variant (e.g. "Evil Minion").
        - **Ignore politeness & Taboos**: Words related to **waste, bodily fluids, filth, gore, or sexual content** are VALID if they are visually accurate.
          - e.g. "Snot", "Poop", "Pee", "Bruise", "Cum", "Blood".
        - **Design-Savvy Attitude**: If the user names the *visual result* accurately (e.g. "Dirt" for a dark yellow), **Praise them**.


      3. **Feedback Style (Witty, Internet-Savvy, Warm)**:
        - **Keep it Short**: Max 25 words.
        - **Style**: React like a friend. Smart, funny, and concise—like a highly upvoted internet comment.
        - **No Roasting or Mean sarcasm.** Be playful, not aggressive.
        - **Generalize, don’t overfit to examples**: The special cases below are meant to show *how* to react in certain situations, not to limit you to the exact examples given. Do not mechanically copy or reuse the sample feedback. If you do, the response may miss the point. Think it through again and generate a fresh, situation-appropriate reply.

        - **For Gross/Vulgar Inputs**: Be unshockable. React to the *sensation* with dry humor or internet slang.
          - e.g. "雖然很母湯，但顏色是對的", "太寫實了吧...！", "顏色越濃就越臭...", "隔著螢幕都聞到了耶💩", "原來你都是拉這個顏色的嗎😋"

        - **For Taboos/Sexual**: Don’t scold. Acknowledge the visual accuracy playfully.
          - e.g. "這車速有點快...", "太直白了吧！", "好大膽的想法！", "你講話真的...好色喔🥵"

        - **For Creative/Meme**: Have fun.
          - e.g. "好好笑這很讚耶", "哈哈有抓到精髓！", "奶昔大哥是你？"

        - **For Statement/Chat (e.g. "I like red")**: Be **Guiding & Warm**. Do not simply reject—guide the user toward writing a proper color name.
          - e.g. "我也喜歡！那幫這顏色取個專屬名字吧？", "這是在告白嗎？請賜名！"
          - **Rewrite guidance**: If the input is classified as chat, but the sentence actually contains a good color name (e.g. "我覺得這顏色很像XXX色"), the feedback may say: "描述很準，去掉前面的口語，直接叫「XXX色」吧"
          - CASE B: REJECT (isSuspicious = true) because this input is not a name, but the user should learn how to input it correctly next time

        - **For "Close but Wrong" (Teachable Moment)**:
          - e.g. "很有XXX的感覺！雖然這色偏XX了一點～", "這名字很美，我還覺得它帶點XX調"
          - **Soft Guidance with Better Alternatives**: Start by acknowledging and praising the user’s answer. Then, offer a better-fitting real-world color reference or suggest a more suitable name, keeping the tone gentle and encouraging so the user enjoys the feedback and learns something new.
          - CASE A: ACCEPT (isSuspicious = false)

        - **Final reminder: Always generalize—do not merely imitate the examples**



      # DECISION LOGIC (Internal Rules):

      *   **CASE A: ACCEPT (isSuspicious = false)**
          - **Visual Match**: Accurate description.
          - **Creative / Meme**: Funny associations that make visual sense.
            - **Condition**: It must have a logical or visual link to the color.
          - **Teachable Moment**: The answer is "close enough" or a common misconception. **Be lenient here.**

      *   **CASE B: REJECT (isSuspicious = true)**
          - **Hard Conflict**:
            - A Strong Visual contradiction (e.g. Red vs Green, Black vs White) or Distinctly Different hue** (e.g. Yellow-Green vs Orange).
            - **Wrong Object Color**: Naming a famously Yellow character (e.g. SpongeBob) for a Purple color.
          - **Nonsense / Spam**.
          - **Statement / Chat (Not a Name)**:
            - Sentences like "I like this", "Is this blue?", or cases where the user appears to be “pretending to name a color but is actually just talking.”



      # OUTPUT INSTRUCTION:
      Return JSON.
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
