// 之後改咒語請至 api/gemini

import { OklchColor } from "../types";
import { oklchToHex } from "../utils";

let nsfwCount = 0;
let errorCount = 0;

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
      // 雌小鬼 NSFW 嘲諷語錄 (5 階段)
      const nsfwMessages = [
        "不會吧不會吧？打出這種變態又噁心的字，你該不會還自以為很幽默吧？懶得理你🙃",
        "哈？你還繼續寫這些骯髒的東西啊？是不是現實中沒人理你，只能來這裡找存在感呀？😰",
        "噫⋯你的腦袋裡只裝得下這些廢料嗎？別再用可悲的骯髒小頭思考了🙄",
        "真的好噁心⋯！你這樣是很興奮嗎？再怎麼試也不會理你的，快點放棄吧🙂‍↔️",
        "快閉嘴，沒腦袋的穢物😍你跟你的言論都進垃圾桶囉，掰掰～👋🗑️" // 第 5 次之後永遠卡在這一句
      ];

      // 選擇對應的訊息，如果超過陣列長度，就一直顯示最後一個
      const messageIndex = Math.min(nsfwCount, nsfwMessages.length - 1);
      const selectedMessage = nsfwMessages[messageIndex];
      
      // 將次數加 1
      nsfwCount++;

      return {
        reason: "NSFW/Blocked" as any,
        feedback: selectedMessage,
        isSuspicious: true,
      };
    }

    // 2. 網路/伺服器異常：一樣安全優先，預設阻擋
     const errorMessages = [
      "目前 AI 伺服器大塞車🚦暫時沒辦法玩🥲",
      "哇⋯你真的是有點堅持耶，等等再來玩嘛！🥺",
      "🚙🚕🚗系統還在塞車中！要不晚點再來？",
      "系統還是沒回應耶⋯🥹先休息一下好不好！！",
      "系統現在真的動不了，晚點再來試試看好嗎？😭" // 第 5 次之後永遠卡在這一句
    ];

    // 選擇對應的訊息，如果超過陣列長度，就一直顯示最後一個
    const messageIndex = Math.min(errorCount, errorMessages.length - 1);
    const selectedMessage = errorMessages[messageIndex];
    
    // 將次數加 1
    errorCount++;

    return {
      reason: "AI unavailable" as any,
      feedback: selectedMessage,
      isSuspicious: true,
    };
  }
};
