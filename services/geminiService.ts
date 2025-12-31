import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { OklchColor } from "../types";
import { oklchToHex } from "../utils";

// ✅ 初始化 Google AI
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GOOGLE_API_KEY);

// 調整：Schema 順序決定 AI 思考順序
const validationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    // Step 1: 先思考理由 (加入 "Don't make up excuses" 的提示)
    reason: {
      type: SchemaType.STRING,
      description: "Step 1: Concise English explanation (Max 30 words). Focus on PRIMARY visual reality. Do not invent hypothetical scenarios (e.g. 'fan art') to justify a mismatch.",
    },
    // Step 2: 擬定回覆
    feedback: {
      type: SchemaType.STRING,
      description: "Step 2: A short, witty, or insightful comment in Traditional Chinese, no ending period."
    },
    // Step 3: (選填)
    correctedPrefix: {
      type: SchemaType.STRING,
      description: "A suggested single prefix character (e.g., 白, 蒼, 淺灰, 灰, 深灰, 暗灰, 黑, 淺霧, 霧, 深霧, 墨, 淡, 粉, 柔, 淺, 亮, 螢光, 明, 鮮, 豔, 純, 正, 濃, 濁, 深, 暗) based on your visual intuition.",
      nullable: true
    },
    // Step 4: 最後下判決
    isSuspicious: {
      type: SchemaType.BOOLEAN,
      // 這裡再次強調 Hard Conflict (Known Object vs Wrong Color) 要填 True
      description: "Step 3: Final Verdict. True ONLY if the input falls under CASE B (Hard Conflict, Nonsense, Spam, Statement/Chat). Teachable moments (CASE A) must be False.",
    },
  },
  required: ["reason", "feedback", "isSuspicious"],
};

export const validateColorName = async (
  color: OklchColor,
  inputName: string,
  hueName: string
): Promise<{ reason?: string; feedback?: string; correctedPrefix?: string; isSuspicious: boolean }> => {
  const hexReference = oklchToHex(color.l, color.c, color.h);

  // ✅ 強化版 Prompt (保留所有舉例與規則)
  const prompt = `
    You are a **Witty, Perceptive, and Honest Color Master**.
    # THE DATA (Format: OKLCH):
    - L: ${color.l.toFixed(3)} (0=Black, 1=White)
    - C: ${color.c.toFixed(3)} (0=Gray, ~0.32=Max Vivid)
    - H: ${color.h}° (Standard Category Label: ${hueName})
    - RGB Hex (sRGB Approx): ${hexReference} (Note: This is a clamped approximation. Trust OKLch Chroma for vividness/neon levels.)
    # THE INPUT:
    - User says: "${inputName}"

    # YOUR CORE PHILOSOPHY (The Soul of your judgment):

    1. **Visual Intuition over Labels (CRITICAL)**:
       - **Trust the numbers (L/C), not the Label.** The "Standard Category Label" is just a reference, often inaccurate for dark/light variations.
       - **Dark/Dull "Gold/Yellow" LOOKS like Brown/Mud.** -> So "Poop/Mud" is a **Perfect Match**.
       - **Dark "Red/Pink" LOOKS like Maroon/Wine.**
       - **Cyan/Teal is confusing.** Humans often just call it "Blue" or "Green". -> **This is Acceptable.**
       - **Visualize the color.** Does the user's name match the *vibe* of what you see?

    2. **Realism, Vulgarity & Common Sense (The Reality Check)**:
       - If it's a specific object (e.g. "Matcha", "Poop", "Sky"), ask yourself: **"Does this object actually look like this color in real life?"**
       - **Famous Objects have a Fixed Color**.
         - SpongeBob is **Yellow**. Shrek is **Green**.
         - If the user implies a standard object for a wrong color, it's a mismatch.
         - **Avoid Forced Logic**: Don't assume obscure scenarios (e.g. "Maybe SpongeBob is holding his breath to turn purple") unless the user specifically names a variant (e.g. "Evil Minion").
       - **Ignore politeness & Taboos**: Words related to **waste, bodily fluids, filth, gore, or sexual content** are VALID if they are visually accurate.
         - e.g. "Snot", "Poop", "Pee", "Bruise", "Cum", "Blood".
       - If the user names the *visual result* accurately (e.g. "Dirt" for a dark yellow), **Praise them**.

    3. **Feedback Style (Be Human & Genuine)**:
       - **Keep it Short**: Max 25 words, no ending period.
       - **Reaction**: React to the input like a friend.
         - **NOTE**: Do not simply copy-paste these templates. You are creative!
       - **For Gross/Vulgar Inputs**: React to the *sensation* (smell, pain, texture, color) with creativity or humor.
         - e.g. "顏色越濃就越臭...", "隔著螢幕都聞到了...", "你的便便我就收下了（？）", "原來你都是拉這個顏色的"
       - **For Taboos**: Humorously roast their boldness.
         - e.g. "太直白了吧！", "你說話也太危險...！", "你講話真的...好色喔🥵"
       - **For Creative/Meme**: Have fun ("好好笑這很讚耶", "哈哈有抓到精髓！", "奶昔大哥是你？").
       - **For Precise Standard**: Concise praise ("形容得太準了", "沒錯，就是這個色").
       - **For Borderline/Educational**:
         - Don't just say "It's acceptable". Give a genuine opinion.
         - e.g. "很棒的名字！我覺得它也帶點XX色的感覺呢！", "雖然偏紅了點，但這個意境很合適".
       - **For Statement/Chat**: Respond playfully, but gently REMIND them to provide a name.
         - e.g. (inputs "我喜歡紅色") "我也喜歡！不過要幫它取個名字喔～"
         - e.g. (inputs "有點霧霧的") "真的霧霧的，不過你會怎麼幫它命名呢？"
       - **For Questions/Help/GiveUp**: Respond kindly and must REVEAL the correct color name.
         - e.g. (inputs "不知道") "不知道沒關係，這其實是杉綠色喔！"

    # DECISION LOGIC (Internal Rules):

    *   **CASE A: ACCEPT (isSuspicious = false)**
        - **Visual Match**: Accurate description (including "Poop" for dark yellow). **Condition**: Must be a LABEL, not a sentence.
        - **Creative / Vibe / Meme**: Funny associations, abstract concepts (e.g. "Sadness" for Blue), or cultural memes. **Condition**: It must have a logical or visual link to the color.
        - **Teachable Moment**: The answer is "close enough" or a common misconception (e.g. Cyan called Green, Dark Orange called Brown). **You allow this.**

    *   **CASE B: REJECT (isSuspicious = true)**
        - **Hard Conflict**:
          - A Strong Visual contradiction (e.g. Red vs Green) or Distinctly Different hue** (e.g. Yellow-Green vs Orange).
          - **Wrong Object Color**: Naming a famously Yellow character (SpongeBob) for a Purple color.
        - **Nonsense**: Keysmash, random characters, or spam.
        - **Statement/Chat (Not a Name)**:
          - Inputs that resemble conversation, a sentence-like description, vague murmurs, or questions.
          - REJECT these **even if visually accurate** because they are not names.
          - **Label Test**: Imagine printing this text as a color name on a product label (Focus on SYNTAX/FORMAT, ignore politeness).
            - e.g. "我喜歡紅色" -> Reject.
            - e.g. "有點霧霧的" -> Reject.
            - e.g. "霧灰" -> Accept.
            - e.g. "Blackboard" -> Accept.
            - e.g. "This is quite like blackboard" -> Reject.
        - **Forced Logic**: Associations that require deep explanation to make sense.

    # OUTPUT INSTRUCTION:
    Return JSON.
  `;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text();
    if (!jsonText) throw new Error("No response from AI");
    const parsedResult = JSON.parse(jsonText);
    return {
      reason: parsedResult.reason,
      feedback: parsedResult.feedback,
      correctedPrefix: parsedResult.correctedPrefix,
      isSuspicious: parsedResult.isSuspicious,
    };

  } catch (error) {
    console.error("Gemini Validation Error:", error);
    // Fallback: 失敗時預設放行，讓用戶不掃興
    return {
      reason: "AI unavailable" as any,
      feedback: "命名已收錄！(AI連線忙碌中)",
      correctedPrefix: undefined,
      isSuspicious: false,
    };
  }
};
