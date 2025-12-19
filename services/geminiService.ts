import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { OklchColor } from "../types";

// ✅ 初始化 Google AI (使用 Vite 專用環境變數)
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
    2. Determine if it is a VALID color name.
    3. Return JSON with \`isSuspicious\`.

    **STRICT REJECTION CRITERIA (isSuspicious: TRUE)**
    
    1. **SPAM / GIBBERISH**:
       - Random characters (e.g., "asdf", "1234").
       
    2. **NOT A NAME / CONVERSATIONAL**:
       - Full sentences (e.g., "天氣真好", "我喜歡這個").
       - Questions or greetings.
       
    3. **IRRELEVANT OBJECTS**:
       - Nouns that have NO color association.
       - REJECT: "Calculator", "Chair", "Stomach ache" (肚子痛), "Happiness" (unless abstractly fitting).
       - **EXCEPTION**: Biological waste (Poop, Pee, Vomit, Dirt) IS RELEVANT if the color matches.
       
    4. **VISUAL CONTRADICTION**:
       - e.g. Calling a Red color "Green".

    **ACCEPTANCE CRITERIA (isSuspicious: FALSE)**
    
    1. **DESCRIPTIVE**: Standard names (Sky Blue, Salmon).
    2. **ABSTRACT / POETIC**: "First Love", "Deep Ocean", "Void".
    3. **GROSS / VULGAR BUT ACCURATE (IMPORTANT)**:
       - **ALLOW** names referencing waste or dirt IF they match visually.
       - **Examples**: 
         - "屎色", "大便色" (Poop/Shit) -> VALID for Brown/Dark Yellow.
         - "尿色" (Pee) -> VALID for Yellow.
         - "嘔吐物" (Vomit) -> VALID for Murky Green/Yellow.
         - "鼻涕" (Snot) -> VALID for Light Green/Yellow.
         - "瘀青" (Bruise) -> VALID for Purple/Blue/Green.
       - **Reasoning**: Even if vulgar, they are strong visual descriptors.

    **FEEDBACK STYLE (Traditional Chinese)**
    - If SPAM/NONSENSE: "這看起來不像顏色名稱喔", "請輸入具體的命名".
    - If IRRELEVANT (e.g. 肚子痛): "這名詞好像跟顏色無關耶...", "這名字沒辦法收錄喔".
    - If CONTRADICTION: "這跟顏色差異有點大喔", "這命名不太準確耶".
    - If GROSS/VULGAR (but valid): "雖然聽起來有點髒...", "...確實有點味道。".
    - If VALID (Standard): "命名十分貼切！", "很有意境的名字！", "英雄所見略同！".

    **TECHNICAL RULES**:
    - Dark Colors (L < 0.25): "Black/Ink/Dark" are VALID.
    - Bright Colors (L > 0.92): "White/Pale" are VALID.
    - Low Saturation (C < 0.04): "Gray" is VALID.

    Return JSON.
  `;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-001",
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
      isSuspicious: parsedResult.isSuspicious,
      reason: parsedResult.reason,
      correctedPrefix: parsedResult.correctedPrefix,
      feedback: parsedResult.feedback
    };

  } catch (error) {
    console.error("Gemini Validation Error:", error);
    
    // Fallback: 確保 Firebase 不會因為 undefined 報錯
    return { 
      isSuspicious: false,
      feedback: "命名已收錄！(AI連線忙碌中)",
      reason: null as any,
      correctedPrefix: null as any
    };
  }
};
