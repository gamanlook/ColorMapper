// ❌ 移除 Google SDK 的 import，不需要在前端載入它了
//要改咒語要記得去 api/gemini.ts 改

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
  
  // 1. Calculate Hex on Frontend (as requested)
  const hexReference = oklchToHex(color.l, color.c, color.h);

  try {
    // 2. Send raw materials to Backend
    // No prompt, no schema, just data.
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        color, 
        hexReference,
        inputName, 
        hueName 
      }), 
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || errorData.details || 'API call failed');
    }

    const data = await response.json();
    
    // The backend now returns the parsed JSON object directly in `data.result` 
    // or as the root object, depending on how we structure the API response.
    // Based on the api/gemini.ts implementation below, we expect { text: string (JSON) }
    
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
    // Fallback: 失敗時預設放行
    return {
      reason: "API Error",
      feedback: "AI罷工中，先算你過！",
      isSuspicious: false,
    };
  }
};
