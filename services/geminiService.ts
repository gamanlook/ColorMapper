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
      throw new Error(errorData.error || errorData.details || 'API call failed');
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

  } catch (error) {
    console.error("Gemini Validation Error:", error);
    return {
      reason: "AI unavailable" as any,
      feedback: "AI罷工中，先算你過！",
      isSuspicious: false,
    };
  }
};
