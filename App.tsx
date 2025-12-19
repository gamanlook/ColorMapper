import React, { useState, useEffect, useMemo, useRef } from 'react';
import { HUES, SEED_DATA_POINTS } from './constants';
import { generateRandomColor, generateSeedData } from './utils';
import { ColorEntry, HueDefinition, OklchColor } from './types';
import SemanticMap from './components/SemanticMap';
import ColorTester from './components/ColorTester';
import Toast, { ToastData } from './components/Toast';
import { subscribeToEntries, addEntryToCloud, isFirebaseActive } from './services/firebaseService';

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
      nextIdx = (currentHueIndex + 1 + Math.floor(Math.random() * (HUES.length - 1))) % HUES.length;
    } else {
      nextIdx = HUES.findIndex(h => h.angle === quizFilter);
      if (nextIdx === -1) nextIdx = 0; 
    }
    setCurrentHueIndex(nextIdx);
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

    const newEntry: ColorEntry = {
      id: Date.now().toString(),
      color: currentColor,
      name,
      votes: 1,
      isSuspicious,
      // ✨ 修正重點：加上 || null
      // 這是告訴 Firebase：「如果 reason 是 undefined，請存成 null」，這樣就不會報錯了！
      suspiciousReason: reason || null, 
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
      feedback: suspicious ? "這跟顏色差異有點大喔，沒辦法收錄。" : "命名十分貼切！"
    });
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

  return (
    <div className="min-h-screen bg-theme-page text-theme-text-main pb-20 relative transition-colors duration-300">
      {toast && <Toast data={toast} onClick={handleToastClick} onClose={() => setToast(null)} />}
      <input type="file" ref={fileInputRef} onChange={handleRestore} accept="application/json" style={{ display: 'none' }} />
      
      {/* 
        Header Content
      */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">OK</div>
             <div className="flex flex-col">
               <h1 className="text-xl font-bold tracking-tight text-theme-text-main hidden sm:block leading-none">
                 Semantic<span className="text-theme-brand">Color</span>Mapper
               </h1>
               <div className="flex items-center gap-1.5 mt-1">
                 <span className={`w-2 h-2 rounded-full ${isCloudMode ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
                 <span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-wide">
                   {isCloudMode ? 'Online' : 'Local'}
                 </span>
               </div>
             </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="text-xs sm:text-sm font-medium text-theme-text-muted">
              已蒐集 <span className="font-bold text-theme-text-main">{humanEntries}</span> 組
            </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
           <div className="bg-theme-card p-6 rounded-3xl transition-colors duration-300">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-2xl font-bold text-theme-text-main">這是什麼顏色？</h2>
                <div className="relative inline-block">
                  <select 
                    value={quizFilter === 'all' ? 'all' : quizFilter} 
                    onChange={(e) => handleQuizFilterChange(e.target.value)} 
                    className="appearance-none text-sm font-medium pl-4 pr-10 py-2 bg-theme-input rounded-lg text-theme-text-main border-none outline-none focus:ring-2 focus:ring-theme-brand cursor-pointer"
                  >
                    <option value="all">隨機出題</option>
                    <option disabled>──────────</option>
                    {HUES.map(h => (
                      <option key={h.id} value={h.angle}>
                        {h.nameZH} {h.nameEN} ({h.angle}°)
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-theme-text-muted">
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                  </div>
                </div>
              </div>
              <p className="text-theme-text-muted mb-6">協助我們建立人類對顏色的感知地圖。你會如何形容這個顏色？</p>
              {currentColor && <ColorTester color={currentColor} hueDef={currentHueDef} onSubmit={handleSubmit} onSkip={handleNextColor} />}
           </div>
        </div>

        <div className="flex flex-col gap-4">
           <div className="bg-theme-card p-6 rounded-3xl flex flex-col items-center transition-colors duration-300">
             <div className="w-full flex justify-between items-center mb-6">
               <h3 className="text-2xl font-bold text-theme-text-main">色彩分布圖</h3>
                <div className="relative inline-block">
                  <select 
                    value={viewHueAngle} 
                    onChange={(e) => setViewHueAngle(Number(e.target.value))} 
                    className="appearance-none text-sm font-medium pl-4 pr-10 py-2 bg-theme-input rounded-lg text-theme-text-main border-none outline-none focus:ring-2 focus:ring-theme-brand cursor-pointer"
                  >
                    {HUES.map(h => (
                      <option key={h.id} value={h.angle}>
                        {h.nameZH} {h.nameEN} ({h.angle}°)
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-theme-text-muted">
                    <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" /></svg>
                  </div>
                </div>
             </div>
             <SemanticMap hue={viewHueAngle} data={entries} currentColor={currentColor} width={360} height={360} />
             <div className="mt-6 text-center">
                <p className="text-xs text-theme-text-muted max-w-xs mx-auto">
                  區域由多數人的共識形成。圓點顯示目前的題目顏色。<br />
                  <span className="opacity-70 mt-1 inline-block">{isCloudMode ? '● 連線中 (資料即時同步)' : '○ 離線模式 (資料僅存於本機)'}</span>
                </p>
             </div>
           </div>
        </div>
      </main>

      {/* 底部功能與資訊區 */}
      <footer className="max-w-6xl mx-auto px-4 mt-12 pb-24">
        <div className="border-t border-theme-card-border pt-8 flex flex-col md:flex-row justify-between items-start gap-8">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {/* 決定把上傳跟下載資料的按鈕隱藏 */}
              {/*<button onClick={handleBackup} className="px-4 py-2 text-xs font-bold text-theme-brand-text bg-theme-brand-bg hover:opacity-80 rounded-lg transition-colors border border-transparent">備份資料</button>*/}
              {/*<button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 text-xs font-bold text-theme-text-main hover:bg-theme-card-border rounded-lg transition-colors border border-theme-card-border">匯入資料</button>*/}
              <button 
                onClick={() => triggerToastTest(false)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-500 border border-green-200 dark:border-green-900/30 hover:opacity-80 transition-transform"
              >
                測試收錄
              </button>
              <button 
                onClick={() => triggerToastTest(true)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-500 border border-red-200 dark:border-red-900/30 hover:opacity-80 transition-transform"
              >
                測試不收錄
              </button>
            </div>
          </div>
          <div className="max-w-md">
            <p className="text-xs text-theme-text-muted leading-relaxed">
              本工具使用 OKLch 色彩空間與 Gemini AI 模型進行語義分析。所有上傳資料均匿名儲存於 Firebase Realtime Database，用於開源色彩地圖研究。
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default App;
