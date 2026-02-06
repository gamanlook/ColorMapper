
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HUES, SEED_DATA_POINTS } from './constants';
import { generateRandomColor, generateSeedData } from './utils';
import { ColorEntry, HueDefinition, OklchColor } from './types';
import SemanticMap from './components/SemanticMap';
import ColorTester from './components/ColorTester';
import Toast, { ToastData } from './components/Toast';
import { subscribeToEntries, addEntryToCloud, isFirebaseActive, pruneOldData } from './services/firebaseService';

function App() {
  const [entries, setEntries] = useState<ColorEntry[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isCloudMode, setIsCloudMode] = useState(false);
  const [currentHueIndex, setCurrentHueIndex] = useState<number>(0);
  const [currentColor, setCurrentColor] = useState<OklchColor | null>(null);
  const [quizFilter, setQuizFilter] = useState<number | 'all'>('all');
  const [viewHueAngle, setViewHueAngle] = useState<number>(HUES[0].angle);
  const [toast, setToast] = useState<ToastData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkFirebase = () => {
      const active = isFirebaseActive();
      setIsCloudMode(active);
      
      if (active) {
        return subscribeToEntries((cloudEntries) => {
          if (cloudEntries && cloudEntries.length > 0) {
            setEntries(cloudEntries);
          } else {
            setEntries(generateSeedData());
          }
          setHasLoaded(true);
        });
      } else {
        const saved = localStorage.getItem('oklch-mapper-data');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setEntries(Array.isArray(parsed) && parsed.length > 0 ? parsed : generateSeedData());
          } catch (e) {
            setEntries(generateSeedData());
          }
        } else {
          setEntries(generateSeedData());
        }
        setHasLoaded(true);
        return () => {};
      }
    };

    const cleanup = checkFirebase();
    return () => cleanup();
  }, []);

  useEffect(() => {
    if (!currentColor) {
       const randIdx = Math.floor(Math.random() * HUES.length);
       setCurrentHueIndex(randIdx);
       setCurrentColor(generateRandomColor(HUES[randIdx].angle));
    }
  }, []);

  useEffect(() => {
    if (!isCloudMode && hasLoaded && entries.length > 0) {
      localStorage.setItem('oklch-mapper-data', JSON.stringify(entries));
    }
  }, [entries, hasLoaded, isCloudMode]);

  useEffect(() => {
    if (HUES[currentHueIndex]) {
      setViewHueAngle(HUES[currentHueIndex].angle);
    }
  }, [currentHueIndex]);

  const currentHueDef: HueDefinition = HUES[currentHueIndex];

  const handleNextColor = () => {
    let nextIdx: number;
    
    if (quizFilter === 'all') {
      const len = HUES.length;
      
      // 1. 定義要排除的索引 (自己、上一個、下一個)
      // 使用 (i + len) % len 來處理陣列頭尾相接的問題
      const forbiddenIndices = new Set([
        currentHueIndex,
        (currentHueIndex - 1 + len) % len,
        (currentHueIndex + 1) % len
      ]);

      // 2. 建立候選名單 (Candidate Pool)
      // 遍歷所有索引，只要不在排除名單內，就加入候選
      const candidates: number[] = [];
      for (let i = 0; i < len; i++) {
        if (!forbiddenIndices.has(i)) {
          candidates.push(i);
        }
      }

      // 3. 從候選名單中隨機抽一個 (保證一次成功)
      // HUES 有 18 個，扣掉 3 個，還有 15 個可以選，絕對安全
      const rand = Math.floor(Math.random() * candidates.length);
      nextIdx = candidates[rand];

    } else {
      // 指定色相模式
      nextIdx = HUES.findIndex(h => h.angle === quizFilter);
      if (nextIdx === -1) nextIdx = 0; 
    }

    setCurrentHueIndex(nextIdx);
    // 呼叫新的生成演算法 (記得 utils.ts 也要更新喔)
    setCurrentColor(generateRandomColor(HUES[nextIdx].angle));
  };

  const handleQuizFilterChange = (value: string) => {
    if (value === 'all') {
      setQuizFilter('all');
      const randIdx = Math.floor(Math.random() * HUES.length);
      setCurrentHueIndex(randIdx);
      setCurrentColor(generateRandomColor(HUES[randIdx].angle));
    } else {
      const angle = Number(value);
      setQuizFilter(angle);
      const idx = HUES.findIndex(h => h.angle === angle);
      if (idx !== -1) {
        setCurrentHueIndex(idx);
        setCurrentColor(generateRandomColor(HUES[idx].angle));
      }
    }
  };

  const handleSubmit = (name: string, isSuspicious: boolean, reason?: string, feedback?: string) => {
    if (!currentColor) return;

    setToast({
      color: currentColor,
      name: name,
      hueDef: currentHueDef,
      isSuspicious: isSuspicious,
      feedback: feedback || (isSuspicious ? "這名字沒辦法收錄喔" : "命名十分貼切！")
    });

    if (name && name.length > 30) {
      console.warn("字數過長，略過上傳步驟"); // 在 Console 留個記錄給自己看
      
      handleNextColor(); // 雖然不存檔，但還是要換下一題，讓使用者繼續玩
      return; // 關鍵！直接結束函式，不往下執行
    }

    const newEntry: ColorEntry = {
      id: Date.now().toString(),
      color: currentColor,
      name,
      votes: 1,
      isSuspicious,
      suspiciousReason: reason,
      timestamp: Date.now(),
      isSeed: false
    };

    if (isCloudMode) {
      addEntryToCloud(newEntry).catch(err => {
        alert("資料上傳失敗，請檢查 Firebase 規則設定是否為測試模式（Test Mode）");
      });
    } else {
      setEntries(prev => [...prev, newEntry]);
    }
    handleNextColor();
  };

  // Toast 測試用
  const triggerToastTest = (suspicious: boolean) => {
    const testColor = currentColor || generateRandomColor(25);
    setToast({
      color: testColor,
      name: suspicious ? "奇怪的名字" : "標準色名",
      hueDef: HUES.find(h => h.angle === testColor.h) || HUES[0],
      isSuspicious: suspicious,
      feedback: suspicious ? "這跟顏色差異有點大喔，沒辦法收錄" : "命名十分貼切！"
    });
  };

  const handlePrune = async () => {
    try {
      const { deletedCount, updatedCount } = await pruneOldData();
      alert(`清理完成！\n\n🗑️ 刪除無效資料： ${deletedCount} 筆\n✨ 瘦身有效資料： ${updatedCount} 筆\n\n(記得去關門 .write: false)`);
    } catch (error: any) {
      if (error.code === 'PERMISSION_DENIED' || error.message?.includes('PERMISSION_DENIED')) {
        alert("❌ 權限不足！門沒開！\n\n請去 Firebase Console -> Realtime Database -> Rules\n把 .write 改成 true。\n\n(清理完記得馬上改回 false！)");
      } else {
        alert("發生錯誤: " + error.message);
      }
    }
  };

  const handleToastClick = () => {
    if (toast) {
      setViewHueAngle(toast.hueDef.angle);
      setToast(null);
    }
  };

  const handleBackup = () => {
    const dataToExport = entries.filter(e => !e.isSuspicious);
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oklch-semantic-map-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const importedData = JSON.parse(text) as ColorEntry[];
        if (!Array.isArray(importedData)) return;
        if (isCloudMode) {
           if (window.confirm(`確定要將 ${importedData.length} 筆資料匯入到雲端嗎？`)) {
             importedData.forEach(item => addEntryToCloud(item));
             alert(`已開始匯入資料...`);
           }
        } else {
          setEntries(prev => {
            const currentHumanEntries = prev.filter(entry => !entry.isSeed);
            const merged = [...currentHumanEntries, ...importedData];
            const uniqueMap = new Map();
            merged.forEach(item => { if (item.id) uniqueMap.set(item.id, item); });
            return Array.from(uniqueMap.values());
          });
        }
      } catch (err) { alert('匯入失敗。'); }
    };
    reader.readAsText(file);
  };

  const humanEntries = entries.filter(e => !e.isSeed).length;

  // --- Helpers for Custom Dropdown Display ---
  
  // Get short label for display (e.g., "紅 (25°)")
  const getQuizFilterLabel = () => {
    if (quizFilter === 'all') return '隨機出題';
    const hue = HUES.find(h => h.angle === quizFilter);
    return hue ? `${hue.nameZH} (${hue.angle}°)` : '';
  };

  const getViewHueLabel = () => {
    const hue = HUES.find(h => h.angle === viewHueAngle);
    return hue ? `${hue.nameZH} (${hue.angle}°)` : '';
  };

  return (
    <div className="min-h-screen bg-theme-page text-theme-text-main pb-20 relative transition-colors duration-300">
      {toast && <Toast data={toast} onClick={handleToastClick} onClose={() => setToast(null)} />}
      <input type="file" ref={fileInputRef} onChange={handleRestore} accept="application/json" style={{ display: 'none' }} />
      
      {/* Header Container */}
      <div className="w-full mx-auto px-4 pt-8 pb-2 grid grid-cols-1 lg:grid-cols-layout-desktop justify-center gap-12">
        {/* Header Content: 跨越兩欄 (col-span-2) */}
        <div className="col-span-1 lg:col-span-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">

               {/* 改為連結 (a tag) */}
               <a 
                 href="https://github.com/gamanlook/ColorMapper" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 className="relative w-10 h-10 flex-shrink-0 hover:opacity-80 transition-opacity"
                 title="View Source on GitHub"
               >
                 <svg width="100%" height="100%" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                   {/* 內容群組：套用下方的遮罩 ID */}
                   <g clipPath="url(#clip0_7305_18028)">
                     <rect width="36" height="36" rx="9" fill="#CAE0E8"/>
                     <path d="M32 38C32 44.0751 25.0604 45 16.5 45C7.93959 45 1 44.0751 1 38C1 30.4 5.7 23 16.5 23C27.3 23 32 30.4 32 38Z" fill="#314146"/>
                     <ellipse cx="17" cy="26" rx="5" ry="4" fill="#93A7AE"/>
                     <circle cx="18" cy="16" r="11" fill="#FAFDFF"/>
                     <circle cx="20" cy="15" r="6" fill="#CAE0E8"/>
                     <circle cx="20" cy="15" r="4" fill="#516166"/>
                     <circle cx="19" cy="15" r="3" fill="#314146"/>
                   </g>
                  
                   {/* 定義遮罩：rx="9" 就是圓角大小 */}
                   <defs>
                     <clipPath id="clip0_7305_18028">
                       <rect width="36" height="36" rx="9" fill="white"/>
                     </clipPath>
                   </defs>
                 </svg>
               </a>

               <div className="flex flex-col">
                 <h1 className="text-xl font-bold tracking-tight text-theme-text-main leading-none">
                   Semantic<span className="text-theme-brand">Color</span>Mapper
                 </h1>
                 <div className="flex items-center gap-1.5 mt-1">
                   <span className={`w-2 h-2 rounded-full ${isCloudMode ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                   <span className="text-[0.625rem] font-medium text-theme-text-muted uppercase tracking-wide">
                     {isCloudMode ? 'Online' : 'Local'} · 已蒐集 {humanEntries} 組
                   </span>
                 </div>
               </div>
          </div>
        </div>
      </div>

      <main className="w-full mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-layout-desktop justify-center gap-12 items-start">
        
        {/* 左側容器 */}
        <div className="space-y-8 w-full">
           <div className="bg-theme-card p-6 rounded-[2.5rem] transition-colors duration-300">
              
              {/* Header with Adaptive Layout */}
              <div className="flex justify-between items-center mb-2 gap-4">
                <h2 className="text-2xl font-bold text-theme-text-main line-clamp-2 min-w-0">形容顏色</h2>
                
                {/* Custom Overlay Dropdown for Quiz Filter */}
                <div className="relative max-w-[50%] min-w-[120px] flex-shrink-0">
                  {/* Visual Layer (Short Text + Truncate) */}
                  <div className="w-full flex items-center justify-between text-sm font-medium pl-4 pr-3 py-2 bg-theme-input rounded-full text-theme-text-main border-none focus-within:ring-2 focus-within:ring-theme-brand">
                     <span className="truncate block">{getQuizFilterLabel()}</span>
                     <svg className="h-4 w-4 fill-current text-theme-text-muted flex-shrink-0 ml-2" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                  </div>

                  {/* Functional Layer (Native Select, Invisible, Long Text options) */}
                  <select 
                    value={quizFilter === 'all' ? 'all' : quizFilter} 
                    onChange={(e) => handleQuizFilterChange(e.target.value)} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
                  >
                    <option value="all">隨機出題</option>
                    {/* Separator Removed */}
                    {HUES.map(h => (
                      <option key={h.id} value={h.angle}>
                        {h.nameZH} {h.nameEN} ({h.angle}°)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-sm text-theme-text-muted mb-6">協助建立人類對顏色的感知地圖。你會如何形容這個顏色？</p>
              {currentColor && <ColorTester color={currentColor} hueDef={currentHueDef} onSubmit={handleSubmit} onSkip={handleNextColor} />}
           </div>
        </div>

        {/* 右側容器 */}
        <div className="flex flex-col gap-4 w-full">
           <div className="bg-theme-card p-6 rounded-[2.5rem] flex flex-col items-center transition-colors duration-300">
             
             {/* Header with Adaptive Layout */}
             <div className="w-full flex justify-between items-center mb-6 gap-4">
               <h3 className="text-2xl font-bold text-theme-text-main line-clamp-2 min-w-0">色彩分布</h3>
                
               {/* Custom Overlay Dropdown for View Filter */}
               <div className="relative max-w-[50%] min-w-[120px] flex-shrink-0">
                  {/* Visual Layer */}
                  <div className="w-full flex items-center justify-between text-sm font-medium pl-4 pr-3 py-2 bg-theme-input rounded-full text-theme-text-main border-none focus-within:ring-2 focus-within:ring-theme-brand">
                     <span className="truncate block">{getViewHueLabel()}</span>
                     <svg className="h-4 w-4 fill-current text-theme-text-muted flex-shrink-0 ml-2" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                  </div>

                  {/* Functional Layer */}
                  <select 
                    value={viewHueAngle} 
                    onChange={(e) => setViewHueAngle(Number(e.target.value))} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
                  >
                    {HUES.map(h => (
                      <option key={h.id} value={h.angle}>
                        {h.nameZH} {h.nameEN} ({h.angle}°)
                      </option>
                    ))}
                  </select>
                </div>
             </div>

             <SemanticMap hue={viewHueAngle} data={entries} currentColor={currentColor} width={448} height={408} />
             <div className="mt-3 text-center">
                <p className="text-xs text-theme-text-muted max-w-xs mx-auto leading-relaxed">
                  區域由多數人的共識形成<br />
                  縱軸(L)-體感亮度 ∙ 橫軸(C)-刺眼度
                </p>
             </div>
           </div>
        </div>
      </main>

      {/* 底部功能與資訊區 */}
      <footer className="w-full mx-auto px-4 pt-12 pb-24 grid grid-cols-1 lg:grid-cols-layout-desktop justify-center gap-12">
        {/* 內容跨越兩欄 (col-span-2) */}
        <div className="col-span-1 lg:col-span-2 border-t border-theme-card-border pt-8 flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <button 
                onClick={() => triggerToastTest(false)}
                className="px-3.5 py-2 text-xs font-bold rounded-full bg-slate-200/40 text-green-700/80 dark:bg-zinc-900 dark:text-green-400/70 hover:opacity-80 transition-transform"
              >
                測試收錄
              </button>
              <button 
                onClick={() => triggerToastTest(true)}
                className="px-3.5 py-2 text-xs font-bold rounded-full bg-slate-200/40 text-red-700/80 dark:bg-zinc-900 dark:text-red-400/75 hover:opacity-80 transition-transform"
              >
                測試不收錄
              </button>
              <button 
                onClick={handlePrune}
                className="px-3.5 py-2 text-xs font-bold rounded-full bg-slate-200/40 text-slate-700/80 dark:bg-zinc-900 dark:text-slate-400/75 hover:opacity-80 transition-transform"
              >
                清理無用資料
              </button>
            </div>
          </div>
          <div className="max-w-md">
            <p className="text-xs text-theme-text-muted leading-relaxed">
              使用 OKLch 色彩空間與 Gemini 進行語意分析。
            </p>
            <div className="flex gap-1.5 text-xs text-theme-text-muted underline-offset-[2px] decoration-[0.5px]">
              作者
              <a 
                href="https://github.com/gamanlook/ColorMapper" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline decoration-theme-text-underline hover:text-theme-text-main hover:decoration-theme-text-main transition-colors"
              >
                GitHub
              </a>
              <span>·</span>
              <a 
                href="https://www.youtube.com/@gaman_look" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline decoration-theme-text-underline hover:text-theme-text-main hover:decoration-theme-text-main transition-colors"
              >
                YouTube
              </a>
              <span>·</span>
              <a 
                href="https://drive.google.com/file/d/1z5BYq5XMvQnxo-jtU_t4YVrG7uF9fCcG/view?usp=sharing" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="underline decoration-theme-text-underline hover:text-theme-text-main hover:decoration-theme-text-main transition-colors"
              >
                Portfolio
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default App;
