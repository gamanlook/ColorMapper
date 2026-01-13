import { GoogleGenerativeAI, SchemaType, Schema } from '@google/generative-ai';

// Schema 順序決定 AI 思考順序
// Explicitly type this as Schema to satisfy TypeScript strict checks
const validationSchema: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    // Step 1: 先思考理由 (加入 "Don't make up excuses" 的提示)
    reason: {
      type: SchemaType.STRING,
      description: "Step 1: Concise English explanation (Max 30 words). Focus on PRIMARY visual reality. Do not invent hypothetical scenarios (e.g. 'fan art') to justify a mismatch.",
    },
    // Step 2: 擬定回覆 (強調 Internet-savvy 與引導性)
    feedback: {
      type: SchemaType.STRING,
      description: "Step 2: A short, witty, internet-savvy comment in Traditional Chinese, no ending period. Be guiding if the user is 'Chatting'. Be humorous if 'Vulgar'. Be educational if 'Wrong'."
    },
    // Step 3: 最後下判決
    isSuspicious: {
      type: SchemaType.BOOLEAN,
      description: "Step 3: Final Verdict. True ONLY if the input falls under CASE B (Hard Conflict, Nonsense, Spam, Statement/Chat). Teachable moments (CASE A) must be False.",
    },
  },
  required: ["reason", "feedback", "isSuspicious"],
};

// Vercel Serverless Function Handler
export default async function handler(req: any, res: any) {
  // --- 1. 嚴謹的 CORS 設定，VIP才能進門 ---
  const allowedOrigin = 'https://color-mapper.vercel.app';
  // --- 2. 檢查來的人是誰 ---
  const origin = req.headers.origin;
  // --- 3. 判斷能不能進來，允許正式站或本機開發 (localhost:3000) ---
  const isAllowed = origin === allowedOrigin || origin?.startsWith('http://localhost');

  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // 如果是白名單內的來源，就回傳該來源；否則回傳 null (或 allowedOrigin 讓瀏覽器擋掉)
  res.setHeader('Access-Control-Allow-Origin', isAllowed && origin ? origin : allowedOrigin);
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

    // Receive Data
    // Frontend sends: { color: {l,c,h}, hexReference: "#...", inputName: "...", hueName: "..." }
    const { color, hexReference, inputName, hueName } = req.body;

    if (!color || !inputName) {
      return res.status(400).json({ error: 'Missing required fields (color, inputName)' });
    }

    // ✅ Prompt (已調整語氣為 Warm & Design-savvy)
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
         - e.g. "很有XXX的感覺！雖然這色偏XX了一點～", "這名字很美，雖然我覺得它帶點XX調"
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

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
      },
    });

    // 5. Call API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 6. Return Result
    return res.status(200).json({ text });

  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch from Gemini',
      details: error.toString()
    });
  }
}
