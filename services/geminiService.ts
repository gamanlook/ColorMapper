import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { OklchColor } from "../types";

// ✅ 初始化 Google AI (使用 Vite 環境變數)
// 注意：這裡使用的是 GoogleGenerativeAI (穩定版 SDK)
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GOOGLE_API_KEY);

// 定義回傳資料的格式 (Schema)
const validationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    isSuspicious: {
      type: SchemaType.BOOLEAN,
      description: "True if the input is spam, not a name, nonsense, irrelevant, or visually contradictory.",
    },
    reason: {
      type: SchemaType.STRING,
      description: "Short explanation.",
    },
    correctedPrefix: {
      type: SchemaType.STRING,
      description: "A suggested single prefix character (e.g., '淡', '深', '鮮') that better fits the color.",
      nullable: true
    },
    feedback: {
      type: SchemaType.STRING,
      description: "A short feedback comment in Traditional Chinese."
    }
  },
  required: ["isSuspicious", "reason", "feedback"],
};

export const validateColorName = async (
  color: OklchColor,
  inputName: string,
  hueName: string
): Promise<{ isSuspicious: boolean; reason?: string; correctedPrefix?: string; feedback?: string }> => {
  
  const prompt = `
    You are a strict moderator for a color naming crowdsourcing game.
    
    Data:
    - Color Values: Lightness (L)=${color.l.toFixed(3)}, Chroma (C)=${color.c.toFixed(3)}, Hue Angle=${color.h}°
    - General Hue Category: ${hueName}
    - User Input Name: "${inputName}"
    
    Your Task:
    1. Analyze the User Input.
    2. Determine if it is a VALID color name (Descriptive, Poetic, or Abstract).
    3. Return JSON with \`isSuspicious\`.

    **STRICT REJECTION CRITERIA (isSuspicious: TRUE)**
    
    1. **SPAM / GIBBERISH**:
       - Random characters with no meaning (e.g., "asdf", "eragergaerg", "1234").
       
    2. **NOT A NAME / CONVERSATIONAL**:
       - Full sentences, statements, or questions (e.g., "天氣真好", "今天吃什麼", "Hello world").
       - Greetings or conversational fillers.
       
    3. **IRRELEVANT / NONSENSE CONCEPTS**:
       - Nouns or states completely unrelated to color aesthetics or visual imagery.
       - **Examples to REJECT**: "肚子痛" (Stomach ache), "計算機" (Calculator), "椅子" (Chair - unless specific like 'Wood').
       
    4. **VISUAL CONTRADICTION**:
       - The name describes a color significantly different from the input.
       - e.g. Calling a Red color "Grass Green".

    **ACCEPTANCE CRITERIA (isSuspicious: FALSE)**
    
    1. **DESCRIPTIVE**: Standard color names (e.g., "Sky Blue", "Salmon", "Mint").
    2. **ABSTRACT / POETIC**: Names that evoke a mood or image consistent with the color.
       - e.g. "First Love" (for pink), "Deep Ocean" (for dark blue), "Void" (for black).
       - Even weird names like "Alien Skin" are OKAY if the color matches (e.g. bright green).
    
    **FEEDBACK STYLE (Traditional Chinese)**
    - If SPAM/NONSENSE: "這看起來不像顏色名稱喔", "請輸入具體的命名".
    - If IRRELEVANT (e.g. 肚子痛): "這名詞好像跟顏色無關耶...", "這名字沒辦法收錄喔".
    - If CONTRADICTION: "這跟顏色差異有點大喔", "這命名不太準確耶".
    - If VALID: "命名十分貼切！", "很有意境的名字！", "英雄所見略同！".

    **TECHNICAL RULES**:
    - Dark Colors (L < 0.25): "Black/Ink/Dark" are VALID.
    - Bright Colors (L > 0.92): "White/Pale" are VALID.
    - Low Saturation (C < 0.04): "Gray" is VALID.

    Return JSON.
  `;

  try {
    // ✅ 獲取模型 (使用穩定版 gemini-1.5-flash)
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: validationSchema,
      }
    });

    // ✅ 發送請求
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text();
    
    if (!jsonText) throw new Error("No response from AI");
    
    const parsedResult = JSON.parse(jsonText);
    return {
      isSuspicious: parsedResult.isSuspicious,
      reason: parsedResult.reason,
      correctedPrefix: parsedResult.correctedPrefix,
      feedback: parsedResult.feedback
    };

  } catch (error) {
    console.error("Gemini Validation Error:", error);
    // Fallback: 避免 API 錯誤時卡住使用