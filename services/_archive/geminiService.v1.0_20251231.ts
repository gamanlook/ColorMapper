/**
 * 📅 歸檔日期：2025-12-31
 * 
 * 📝 特點描述：
 * 這是一個邏輯較為嚴謹、回答較制式的版本。
 * 
 * ✨ 已擁有的核心機制：
 * 1. Schema Order Control：透過 JSON Schema 順序強制 AI 先思考 (Reason) 再判決 (isSuspicious)。
 * 2. Dual Color Validation：同時提供 OKLCH 與 Hex 數值，利用 AI 對 Hex 的熟悉度進行輔助判斷。
 * 3. Full Prefix Dictionary：Prompt 內建完整的「前綴字列表 (淡, 深, 螢光...)」，避免 AI 詞窮。
 * 4. 一堆窮舉的例子讓 AI 去學習怎麼應對。
 
 */


import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { OklchColor } from "../types";
import { oklchToHex } from "../utils";

// ✅ 初始化 Google AI
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GOOGLE_API_KEY);

// 調整：Schema 順序決定 AI 思考順序
const validationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    reason: {
      type: SchemaType.STRING,
      description: "Short explanation of the judgment in English.",
    },
    feedback: {
      type: SchemaType.STRING,
      description: "A short, engaging comment in Traditional Chinese (NO ending period)."
    },
    correctedPrefix: {
      type: SchemaType.STRING,
      description: "A suggested single prefix character (e.g., 白, 蒼, 淺灰, 灰, 深灰, 暗灰, 黑, 淺霧, 霧, 深霧, 墨, 淡, 粉, 柔, 淺, 亮, 螢光, 明, 鮮, 豔, 純, 正, 濃, 濁, 深, 暗) based on your visual intuition.",
      nullable: true
    },
    isSuspicious: {
      type: SchemaType.BOOLEAN,
      description: "True if input is spam, gibberish, completely irrelevant, or a visual contradiction.",
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

  // ✅ 你的 Prompt (保留所有舉例與規則)
  const prompt = `
    You are a lenient and open-minded moderator for a color naming crowdsourcing game.
    # DATA (Truth / Format: OKLCH):
    - Lightness (L): ${color.l.toFixed(3)} (0=Black, 1=White)
    - Chroma (C): ${color.c.toFixed(3)} (0=Gray, 0.3+=Vivid)
    - Hue Angle (H): ${color.h}° (Category: ${hueName})
    - RGB Hex (sRGB Approx): ${hexReference} (Note: This is a clamped approximation. Trust OKLch Chroma for vividness/neon levels.)
    # USER INPUT:
    - Name: "${inputName}"

    # YOUR TASK:
    1. **DECONSTRUCT**: Analyze the input. Does it imply specific attributes?
    2. **COMPARE**: Match against the DATA.
    3. **VERIFY OBJECTS**: Use common sense.
    4. **DECIDE**: Return JSON.

    # 📚 REFERENCE EXAMPLES:

    - **SPAM / NONSENSE (REJECT)**:
      - "qwert", "3.14159", "Who are you?", "I like red", "Today is sunny".

    - **Generic / Broad / Strange (ACCEPT)**:
      - "Strange Blue" -> ACCEPT.
      - "Funny Green" -> ACCEPT.

    - **VALID ADJECTIVES (ACCEPT)**:
      - "Energetic Blue" (Implies Vivid) -> ACCEPT.
      - "Melancholy Blue" (Implies Dark/Grayish) -> ACCEPT.
      - "Premium Gray" (Implies Neutral/Elegant) -> ACCEPT.
      - "Bold Red" (Implies Vivid/Pop) -> ACCEPT.
      - "腥羶色"(Lurid, implies Vivid Pink) -> ACCEPT.

    - **LOGIC & BRANDS**:
      - "Muji Green" -> REJECT (Muji is typically Red/Brown, NOT Green).
      - "Facebook Blue" -> ACCEPT (Matches Brand).
      - "Nike Black" -> ACCEPT (If color is Black. Black/white is generic but classic).
      - "McDonald's Red" -> ACCEPT (Implies Red/Yellow).
      - "Trump" -> ACCEPT (Implies Orange/Red/Blond).
      - "Hulk" -> ACCEPT (Implies Green).
      - "Torii" (鳥居) -> ACCEPT (Implies Red/Orange).
      - "Ginkgo" (銀杏) -> ACCEPT (Implies Yellow/Green).
      - "Skin/Nude/Foundation" (皮膚、肌膚、膚、裸、粉底) -> ACCEPT (Implies Beige/Light Orange/Light Brown).

    - **MATERIAL / TEXTURE / OXYMORONS**:
      - "Dark White" -> ACCEPT (Off-white is valid).
      - "Bright Black" -> ACCEPT (Glossy/Piano Black).
      - "Christmas Green" -> ACCEPT (Pine Green).

    - **GROSS / VULGAR**:
      - Visual Accuracy > Politeness.
      - **If the term accurately describes the color -> ACCEPT.**
      - Do not be strict about vulgar terms.
      - e.g., "Poop", "Shit", "Vomit", "Snot", "Bruise", "cum", "blood", "屎", "尿", "屁", "嘔吐物", "血") .
    - **VISUAL MISMATCH EXAMPLES**:
      - "Sky Color" on a Green color -> REJECT.
      - "Poop" on a Bright Pink color -> REJECT.

    # ⚖️ JUDGMENT RULES (Philosophy: EXTREME LENIENCY)

    1. **General Conflict (The "Don't be a Nazi" Rule)**
       - **Hue Strategy (Broad Acceptance)**:
         - **Guideline**: Do not be biased by the default Hue Category name. (Ignore strict categorization).
         - **The ±60° Rule**: Broad color categories are fluid.
           - e.g. "Purple" can be called "Blue" or "Pink".
           - e.g. "Cyan" can be "Green" or "Blue".
         - **REJECT ONLY Strong Opposites (Complementary Colors)**:
           - Red vs Green -> REJECT.
           - Blue vs Orange/Yellow -> REJECT.
           - Purple vs Yellow-Green -> REJECT.
         - **Specific Ambiguities (ALWAYS ACCEPT)**:
           - Cyan/Teal (H: 175-220) -> Green, Blue, Cyan, Teal.
           - Indigo/Violet (H: 260-305) -> Blue, Purple, Violet.
           - Magenta/Pink (H: 295-25) -> Purple, Red, Pink, Magenta, 桃色.
           - Warm colors (H: 335-115) -> Red, Orange, Yellow are often interchangeable.

       - **Chroma & Lightness Strategy**:
         - **The "Mud/Earth" Exception**:
           - Warm colors (H: 335-115) with Low Chroma often look brown or dirty.
           - Calling them "Mud", "Wood", "Earth", "Soil" is **CORRECT**, even if the Hue says "Yellow", "Gold".
         - **The "Black/Dark" Exception**:
           - If L < 0.25 (Very Dark), calling it "Black", "Ink", or "Dark Gray" is **CORRECT**, regardless of Chroma.
         - **Rejection Criteria**:
           - Calling a clearly colorful color (C > 0.1) "Gray" -> REJECT.
           - Calling a Pitch Black color "White" -> REJECT.

    2. **Object Verification**:
       - Use "Visual Possibility": Can this object look like this color in *some* lighting/condition?
         - e.g. "Sky" can be Blue, Black (night), Orange (sunset). But "Sky" cannot be Green.
         - e.g. "Matcha" must be Greenish.
       - **IGNORE** standard politeness rules. ACCEPT vulgar terms if visual matches.

    # 💬 FEEDBACK STYLE GUIDE
    **Match the feedback tone to the User Input category (Traditional Chinese, no ending period):**

    - **Standard / Precise** (ACCEPT):
      - "很精準的描述！"
      - "簡單明瞭"

    - **Generic / Broad / Strange** (ACCEPT, Use this when the name is slightly nonsense but acceptable):
      - "形容有點微妙，不過確實可以這麼說"
      - "原來還能這樣形容"

    - **Borderline / Educational** (ACCEPT, Use this when the name is slightly off but acceptable):
      - "雖然偏紫色，但說是藍色也通！"
      - "顏色介於藍綠兩者之間呢，你的說法也行"
      - "確實有點紫帶紅，說是紅色還算合理"
      - "因為飽和度低，說是灰色也挺合理的"

    - **Creative / Poetic (ACCEPT)**:
      - "好有詩意的名字！"
      - "這形容太美了..."
      - "很有畫面感！"

    - **Meme / Pop Culture (ACCEPT)**:
      - "其實滿有趣的！"
      - "哈哈有抓到精髓！"
      - "奶昔大哥是你？"

    - **Gross / Vulgar (ACCEPT)**:
      - "雖然有點髒...但很貼切"
      - "很有味道的文字..."
      - "噁噁的最對味..."

    - **Reject**:
      - "這跟顏色差異有點大喔？"
      - "這名字好像跟顏色無關耶..."
      - "請輸入具體的顏色名稱喔～"

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
