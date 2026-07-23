// 之後改咒語請至 api/gemini

import { OklchColor } from "../types";
import { oklchToHex } from "../utils";

// Define the response shape for TypeScript
interface ValidationResponse {
  reason?: string;
  feedback?: string;
  isSuspicious: boolean;
}

export const validateColorName = async (
  color: OklchColor,
  inputName: string,
  hueName: string
): Promise<ValidationResponse> => {
  // 1. 前端負責計算 Hex，因為這需要數學函式庫，前端剛好有，算好傳給後端最方便
  const hexReference = oklchToHex(color.l, color.c, color.h);

  try {
    // 2. 只傳送「數據」，不傳送「指令(Prompt)」
    // 這樣就算有人攔截封包，也只看得到參數，看不到你的 AI 邏輯
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputName,
        color,
        hueName,
        hexReference // <-- 關鍵：把算好的 Hex 傳過去
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // 將後端的 details (包含安全阻擋關鍵字) 或 error 拋出，讓下面的 catch 可以抓到字串
      throw new Error(errorData.details || errorData.error || 'API call failed');
    }

    const data = await response.json();
    const jsonText = data.text;
    if (!jsonText) throw new Error("No response from AI");

    const parsedResult = JSON.parse(jsonText);

    return {
      reason: parsedResult.reason,
      feedback: parsedResult.feedback,
      isSuspicious: parsedResult.isSuspicious,
    };

  } catch (error: any) {
    console.error("Gemini Validation Error:", error);

    const errMsg = String(error).toLowerCase();

    // 定義所有 Google 官方阻擋時可能出現的關鍵字
    const blockKeywords = ["safety", "blocked", "prohibited", "recitation", "other"];
    
    // 1. 只要包含任何一個關鍵字，就判定為 Safety Block
    const isGoogleSafetyBlock = blockKeywords.some(keyword => errMsg.includes(keyword));

    if (isGoogleSafetyBlock) {
      return {
        reason: "NSFW/Blocked" as any,
        feedback: "不會吧不會吧？打出這種變態又噁心的字，你該不會還自以為很幽默吧？真的懶得理你🙃",
        isSuspicious: true,
      };
    }

    // 2. 網路/伺服器異常：一樣安全優先，預設阻擋
    return {
      reason: "AI unavailable" as any,
      feedback: "目前 AI 伺服器大塞車🚦暫時沒辦法玩🥲",
      isSuspicious: true,
    };
  }
};
