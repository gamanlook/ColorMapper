# 🎨 Semantic Color Mapper (語意色彩映射計畫)

> 協助我們建立人類對顏色的感知地圖。

這是一個實驗專案，旨在探索**數學上的顏色數值** (OKLch)與**人類語言描述** (Semantic Name)之間的關聯。

透過收集使用者的命名數據，我們試圖回答一個問題：**「在人類眼中，黃色是在哪裡變成了橘色？深藍色又是在哪裡變成了黑色？」**


# ✨ 核心功能

- **🎯 隨機色彩測驗**：系統會在 OKLch 色彩空間中隨機生成顏色，邀請使用者進行命名。
- **🤖 AI 智慧審核**：整合 **Google Gemini AI**，即時分析使用者的命名。
  - 自動過濾亂碼與無意義詞彙。
  - 識別具創意或「有味道」的命名（如：屎色）並給予幽默回饋。
  - 防止明顯的視覺矛盾（如把紅色說成綠色）。
- **📊 即時數據視覺化**：使用 **D3.js** 繪製色彩分佈圖，即時顯示眾人對特定色相的定義範圍。
- **☁️ 雲端同步**：結合 **Firebase Realtime Database**，所有數據即時上傳並同步給所有用戶。
- **🌓 現代化介面**：支援深色/淺色模式切換，專注於色彩體驗的 UI 設計。


# 🛠️ 技術棧 (Tech Stack)

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS, clsx
- **Visualization**: D3.js (d3-delaunay)
- **AI Integration**: Google Generative AI SDK (Gemini 1.5 Flash)
- **Backend / Database**: Firebase Realtime Database
- **Deployment**: Vercel
