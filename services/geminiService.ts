import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { OklchColor } from "../types";

// ✅ 初始化 Google AI
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GOOGLE_API_KEY);

const validationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    isSuspicious: {
      type: SchemaType.BOOLEAN,
      description: "True if input is spam, gibberish, completely irrelevant, or a visual contradiction.",
    },
    reason: {
      type: SchemaType.STRING,
      description: "Short explanation of the judgment.",
    },
    correctedPrefix: {
      type: SchemaType.STRING,
      description: "A suggested single prefix character (e.g., '淡', '深', '鮮') that better fits the color.",
      nullable: true
    },
    feedback: {
      type: SchemaType.STRING,
      description: "A short, engaging comment in Traditional Chinese."
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
    You are a lenient but fair moderator for a color naming crowdsourcing game.
    
    # DATA (Truth):
    - Lightness (L): ${color.l.toFixed(3)} (0=Black, 1=White)
    - Chroma (C): ${color.c.toFixed(3)} (0=Gray, 0.3+=Vivid)
    - Hue Angle (H): ${color.h}° (Category: ${hueName})
    
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
      
    - **VAGUE ADJECTIVES (REJECT)**:
      - "Strange Blue" (Subjective) -> REJECT.
      - "Funny Green" -> REJECT.
      
    - **VALID ADJECTIVES (ACCEPT)**:
      - "Energetic Blue" (Implies Vivid) -> ACCEPT.
      - "Melancholy Blue" (Implies Dark/Grayish) -> ACCEPT.
      - "Premium Gray" (Implies Neutral/Elegant) -> ACCEPT.
      - "Bold Red" (Implies Vivid/Pop) -> ACCEPT.
      
    - **LOGIC & BRANDS**:
      - "Muji Green" -> REJECT (Muji is typically Red/Brown, NOT Green).
      - "Facebook Blue" -> ACCEPT (Matches Brand).
      - "Nike Black" -> ACCEPT (If color is Black. Black/white is generic but classic).
      - "McDonald's Red" -> ACCEPT (Implies Red/Yellow).
      - "Trump" -> ACCEPT (Implies Orange/Red/Blond).
      - "Hulk" -> ACCEPT (Implies Green).
      - "Torii" (鳥居) -> ACCEPT (Implies Red/Orange).
      - "Ginkgo" (銀杏) -> ACCEPT (Implies Yellow/Green).
      
    - **MATERIAL / TEXTURE / OXYMORONS**:
      - "Dark White" -> ACCEPT (Off-white is valid).
      - "Bright Black" -> ACCEPT (Glossy/Piano Black).
      - "Dirty Pee" -> ACCEPT (Gross but descriptive).
      - "Christmas Green" -> ACCEPT (Pine Green).
      
    - **VISUAL MISMATCH EXAMPLES**:
      - "Sky Color" on a Green color -> REJECT.
      - "Poop" on a Bright Pink color -> REJECT.

    # ⚖️ JUDGMENT RULES (General Principles)

    1. **Chroma Rules (Gray Zone)**:
       - If C > 0.08 (Clearly Colorful), calling it "Gray" is SUSPICIOUS.
       - If C < 0.08, calling it "Gray" is ACCEPTABLE.
       - *Exception*: If L < 0.20 (Very Dark), calling it "Black" is OKAY even if C is slightly high.
       
    2. **Lightness Rules**:
       - Calling a Bright color (L > 0.7) "Dark/Deep/Abyss" is SUSPICIOUS.
       - Calling a Dark color (L < 0.3) "Light/Pale/Snow" is SUSPICIOUS.
       - "Dark White" is VALID for L < 0.95. If L=0.99 (Pure White), "Dark" is weird but acceptable (user might mean screen brightness).

    3. **Hue Rules**:
       - Red vs Green = REJECT.
       - Blue vs Orange = REJECT.
       - *Leniency*: Adjacent hues are OKAY (e.g. Gold called Yellow is OK. Teal called Blue/Green is OK).

    # 💬 FEEDBACK STYLE GUIDE
    
    **Choose a tone based on the input (Traditional Chinese, no ending period):**

    - **Standard / Precise**:
      - "很精準的描述！"
      - "簡單明瞭"
      - "這就是標準的顏色"
      
    - **Generic but Correct** (e.g. "Nike Black", "Apple White"):
      - "形容有點籠統，不過確實可以這麼說"
      - "原來還能這樣形容"
      
    - **Borderline / Educational** (e.g. Purple called Blue, Teal called Green/Blue, Magenta called Purple/Red):
      - "雖然偏紫色，但說是藍色也通！"
      - "稍微偏綠了一點，但還算藍色範圍"
      - "顏色介於紫紅兩者之間呢，你的說法也行"
      
    - **Creative / Poetic**:
      - "好有詩意的名字！"
      - "這形容太美了..."
      - "很有畫面感！"
      
    - **Meme / Pop Culture**:
      - "其實滿有趣的！"
      - "哈哈有抓到精髓！"
      
    - **Gross / Vulgar** (only if valid):
      - "雖然有點髒...但很貼切"
      - "很有味道的文字..."
      - "無法反駁的形容..."
      
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
      isSuspicious: parsedResult.isSuspicious,
      reason: parsedResult.reason,
      correctedPrefix: parsedResult.correctedPrefix,
      feedback: parsedResult.feedback
    };

  } catch (error) {
    console.error("Gemini Validation Error:", error);
    
    return { 
      isSuspicious: false,
      feedback: "命名已收錄！(AI連線忙碌中)",
      reason: null as any,
      correctedPrefix: null as any
    };
  }
};
