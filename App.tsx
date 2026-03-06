import React, { useState, useEffect, useMemo, useRef } from "react";
import { HUES, SEED_DATA_POINTS } from "./constants";
import { generateRandomColor, generateSeedData, toCss } from "./utils";
import { ColorEntry, HueDefinition, OklchColor } from "./types";
import SemanticMap from "./components/SemanticMap";
import ColorTester from "./components/ColorTester";
import Toast, { ToastData } from "./components/Toast";
import {
  subscribeToEntries,
  addEntryToCloud,
  isFirebaseActive,
  pruneOldData,
} from "./services/firebaseService";

function App() {
  const [entries, setEntries] = useState<ColorEntry[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isCloudMode, setIsCloudMode] = useState(false);
  const[currentHueIndex, setCurrentHueIndex] = useState<number>(0);
  const [currentColor, setCurrentColor] = useState<OklchColor | null>(null);
  const [isFirstQuestion, setIsFirstQuestion] = useState(true);
  const [quizFilter, setQuizFilter] = useState<number | "all">("all");
  const [viewHueAngle, setViewHueAngle] = useState<number>(HUES[0].angle);
  const [showHex, setShowHex] = useState(false);
  const[toast, setToast] = useState<ToastData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);

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
        const saved = localStorage.getItem("oklch-mapper-data");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setEntries(
              Array.isArray(parsed) && parsed.length > 0
                ? parsed
                : generateSeedData(),
            );
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
  },[]);

  useEffect(() => {
    if (!currentColor) {
      const randIdx = Math.floor(Math.random() * HUES.length);
      setCurrentHueIndex(randIdx);
      setCurrentColor(generateRandomColor(HUES[randIdx].angle, true));
    }
  },[]);

  useEffect(() => {
    if (!isCloudMode && hasLoaded && entries.length > 0) {
      localStorage.setItem("oklch-mapper-data", JSON.stringify(entries));
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

    if (quizFilter === "all") {
      const len = HUES.length;

      const forbiddenIndices = new Set([
        currentHueIndex,
        (currentHueIndex - 1 + len) % len,
        (currentHueIndex + 1) % len,
      ]);

      const candidates: number[] =[];
      for (let i = 0; i < len; i++) {
        if (!forbiddenIndices.has(i)) {
          candidates.push(i);
        }
      }

      const rand = Math.floor(Math.random() * candidates.length);
      nextIdx = candidates[rand];
    } else {
      nextIdx = HUES.findIndex((h) => h.angle === quizFilter);
      if (nextIdx === -1) nextIdx = 0;
    }

    setCurrentHueIndex(nextIdx);
    setCurrentColor(generateRandomColor(HUES[nextIdx].angle, false));
    setIsFirstQuestion(false);
  };

  const handleQuizFilterChange = (value: string) => {
    if (value === "all") {
      setQuizFilter("all");
      const randIdx = Math.floor(Math.random() * HUES.length);
      setCurrentHueIndex(randIdx);
      setCurrentColor(generateRandomColor(HUES[randIdx].angle, isFirstQuestion));
    } else {
      const angle = Number(value);
      setQuizFilter(angle);
      const idx = HUES.findIndex((h) => h.angle === angle);
      if (idx !== -1) {
        setCurrentHueIndex(idx);
        setCurrentColor(generateRandomColor(HUES[idx].angle, isFirstQuestion));
      }
    }
  };

  const handleSubmit = (
    name: string,
    isSuspicious: boolean,
    reason?: string,
    feedback?: string,
  ) => {
    if (!currentColor) return;

    setToast({
      color: currentColor,
      name: name,
      hueDef: currentHueDef,
      isSuspicious: isSuspicious,
      feedback:
        feedback || (isSuspicious ? "這名字沒辦法收錄喔" : "命名十分貼切！"),
    });

    if (name && name.length > 30) {
      console.warn("字數過長，略過上傳步驟");
      handleNextColor();
      return;
    }

    const newEntry: ColorEntry = {
      id: Date.now().toString(),
      color: currentColor,
      name,
      votes: 1,
      isSuspicious,
      suspiciousReason: reason,
      timestamp: Date.now(),
      isSeed: false,
    };

    if (isCloudMode) {
      addEntryToCloud(newEntry).catch((err) => {
        alert(
          "資料上傳失敗，請檢查 Firebase 規則設定是否為測試模式（Test Mode）",
        );
      });
    } else {
      setEntries((prev) => [...prev, newEntry]);
    }
    handleNextColor();
  };

  const triggerToastTest = (suspicious: boolean) => {
    const testColor = currentColor || generateRandomColor(25, false);
    setToast({
      color: testColor,
      name: suspicious ? "測試：奇怪名" : "測試：標準色名",
      hueDef: HUES.find((h) => h.angle === testColor.h) || HUES[0],
      isSuspicious: suspicious,
      feedback: suspicious
        ? "這跟顏色差異有點大喔，沒辦法收錄"
        : "命名十分貼切！",
    });
  };

  const handlePrune = async () => {
    try {
      const { deletedCount, updatedCount } = await pruneOldData();
      alert(
        `清理完成！\n\n🗑️ 刪除無效資料： ${deletedCount} 筆\n✨ 瘦身有效資料： ${updatedCount} 筆\n\n(記得去關門 .write: false)`,
      );
    } catch (error: any) {
      if (
        error.code === "PERMISSION_DENIED" ||
        error.message?.includes("PERMISSION_DENIED")
      ) {
        alert(
          "❌ 權限不足！門沒開！\n\n請去 Firebase Console -> Realtime Database -> Rules\n把 .write 改成 true。\n\n(清理完記得馬上改回 false！)",
        );
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
          if (
            window.confirm(
              `確定要將 ${importedData.length} 筆資料匯入到雲端嗎？`,
            )
          ) {
            importedData.forEach((item) => addEntryToCloud(item));
            alert(`已開始匯入資料...`);
          }
        } else {
          setEntries((prev) => {
            const currentHumanEntries = prev.filter((entry) => !entry.isSeed);
            const merged =[...currentHumanEntries, ...importedData];
            const uniqueMap = new Map();
            merged.forEach((item) => {
              if (item.id) uniqueMap.set(item.id, item);
            });
            return Array.from(uniqueMap.values());
          });
        }
      } catch (err) {
        alert("匯入失敗。");
      }
    };
    reader.readAsText(file);
  };

  const humanEntries = entries.filter((e) => !e.isSeed).length;

  const getQuizFilterLabel = () => {
    if (quizFilter === "all") return "隨機出題";
    const hue = HUES.find((h) => h.angle === quizFilter);
    return hue ? `${hue.nameZH} (${hue.angle}°)` : "";
  };

  const getViewHueLabel = () => {
    const hue = HUES.find((h) => h.angle === viewHueAngle);
    return hue ? `${hue.nameZH} (${hue.angle}°)` : "";
  };

  const oklchValues = currentColor ? `${currentColor.l} ${currentColor.c} ${currentColor.h}` : "0 0 0";

  const renderHeader = (pane: "left" | "right") => (
    <header
      className={`relative flex justify-between items-end ${
        pane === "right" ? "hidden lg:flex" : ""
      }`}
    >
      <div
        className={`flex flex-col gap-1 transition-opacity transform-gpu will-change-[opacity] ${
          isProfileExpanded 
            ? "opacity-0 duration-300 delay-0 min-[480px]:opacity-100 pointer-events-none min-[480px]:pointer-events-auto" 
            : "opacity-100 duration-500 delay-300"
        } ${pane === "right" ? "invisible pointer-events-none select-none" : ""}`}
        aria-hidden={pane === "right" ? "true" : undefined}
      >
        <h1 className="text-xl/5 font-bold tracking-tight text-theme-text-main">
          Semantic Color Mapper
        </h1>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              pane === "left" && isCloudMode
                ? "bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                : "bg-white/30"
            }`}
          ></span>
          <span className="text-[0.625rem] tracking-wider text-white/50 uppercase">
            {isCloudMode ? "Live" : "Local"} · 顏色命名實驗 · 已蒐集 {humanEntries} 組
          </span>
        </div>
      </div>

      <div
        className={`absolute right-0 top-0 min-[480px]:relative z-50 flex items-center ring-1 ring-inset ring-white/10 rounded-full transition-all duration-500 ease-out overflow-hidden h-10 p-1 pl-2.5 min-w-10 ${
          isProfileExpanded
            ? "max-w-[500px] gap-1"
            : "max-w-10 gap-0 min-[480px]:max-w-[500px] min-[480px]:gap-1"
        } ${pane === "left" ? "lg:hidden" : ""}`}
        style={{
          background: `linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0.05)), oklch(${oklchValues} / 0.1)`
        }}
      >
        <button
          onClick={() => setIsProfileExpanded(!isProfileExpanded)}
          className={`shrink-0 rounded-full overflow-hidden focus:outline-none min-[480px]:cursor-default flex items-center justify-center transition-transform duration-500 ease-out origin-center w-5 h-5 ${
            isProfileExpanded ? "scale-100" : "scale-[2] min-[480px]:scale-100"
          }`}
          title="作者 Gaman"
        >
          <svg className="w-full h-full" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id={`circleClip-${pane}`}>
                <circle cx="18" cy="18" r="18" />
              </clipPath>
              <mask id={`cutHead-${pane}`} maskUnits="userSpaceOnUse">
                <rect width="36" height="36" fill="white" />
                <circle cx="18" cy="16" r="11" fill="black" />
              </mask>
              <mask id={`cutOuterEye-${pane}`} maskUnits="userSpaceOnUse">
                <rect width="36" height="36" fill="white" />
                <circle cx="20" cy="15" r="6" fill="black" />
              </mask>
              <mask id={`cutInnerEye-${pane}`} maskUnits="userSpaceOnUse">
                <rect width="36" height="36" fill="white" />
                <circle cx="20" cy="15" r="4" fill="black" />
              </mask>
              <mask id={`cutPupil-${pane}`} maskUnits="userSpaceOnUse">
                <rect width="36" height="36" fill="white" />
                <circle cx="19" cy="15" r="3" fill="black" />
              </mask>
            </defs>
            <g clipPath={`url(#circleClip-${pane})`}>
              <circle cx="18" cy="18" r="18" fill="white" fillOpacity="0.1" />
              <ellipse cx="16.5" cy="34" rx="14.5" ry="11" fill="white" fillOpacity="0.2" mask={`url(#cutHead-${pane})`} />
              <ellipse cx="17" cy="26" rx="5" ry="4" fill="white" fillOpacity="0.2" mask={`url(#cutHead-${pane})`} />
              <circle cx="18" cy="16" r="11" fill="white" fillOpacity="0.9" mask={`url(#cutOuterEye-${pane})`} />
              <circle cx="20" cy="15" r="6" fill="white" fillOpacity="0.5" mask={`url(#cutInnerEye-${pane})`} />
              <circle cx="20" cy="15" r="4" fill="white" fillOpacity="0.2" mask={`url(#cutPupil-${pane})`} />
            </g>
          </svg>
        </button>

        <div
          className={`flex items-center shrink-0 transition-opacity duration-300 ${
            isProfileExpanded ? "opacity-100 visible" : "opacity-0 invisible min-[480px]:opacity-100 min-[480px]:visible"
          }`}
        >
          <span className="text-[0.625rem] text-white/60 whitespace-nowrap ml-0 mr-1 select-none">
            作者
          </span>
          <a
            href="https://github.com/gamanlook/ColorMapper"
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-theme-text-soft hover:text-white shrink-0"
            title="GitHub"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 20c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 19.5 5.77 5.07 5.07 0 0 0 19.41 2S18.23 1.65 15.5 3.48a13.38 13.38 0 0 0-7 0C5.77 1.65 4.59 2 4.59 2A5.07 5.07 0 0 0 4.5 5.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 8.5 19.13V23"></path>
            </svg>
          </a>
          <a
            href="https://www.youtube.com/@gaman_look"
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-theme-text-soft hover:text-white shrink-0"
            title="YouTube"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path
                d="M 22.534 6.705 C 22.277 5.757 21.554 5.018 20.589 4.761 C 18.886 4.295 12 4.295 12 4.295 C 12 4.295 5.114 4.295 3.411 4.761 C 2.462 5.018 1.723 5.757 1.45 6.705 C 1 8.409 1 12 1 12 C 1 12 1 15.591 1.45 17.295 C 1.723 18.243 2.462 18.982 3.411 19.239 C 5.114 19.705 12 19.705 12 19.705 C 12 19.705 18.886 19.705 20.589 19.239 C 21.554 18.982 22.277 18.243 22.534 17.295 C 23 15.591 23 12 23 12 C 23 12 23 8.409 22.534 6.705 Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 10.6258 8.9936 L 14.6972 11.3509 A 0.75 0.75 0 0 1 14.6972 12.6491 L 10.6258 15.0064 A 0.75 0.75 0 0 1 9.5 14.3573 L 9.5 9.6427 A 0.75 0.75 0 0 1 10.6258 8.9936 Z"
                fill="currentColor"
              />
            </svg>
          </a>
          <a
            href="https://drive.google.com/file/d/1z5BYq5XMvQnxo-jtU_t4YVrG7uF9fCcG/view?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-theme-text-soft hover:text-white shrink-0"
            title="Portfolio"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M 14.5 8 C 16.387 8 17.287 9.451 17.537 9.951 C 17.877 10.63 18 11.359 18 12 C 18 12.641 17.877 13.37 17.537 14.049 C 17.287 14.549 16.387 16 14.5 16 C 13.582 16 12.898 15.656 12.409 15.245 C 12.176 15.05 11.824 15.05 11.591 15.245 C 11.102 15.656 10.418 16 9.5 16 C 7.613 16 6.713 14.549 6.463 14.049 C 6.123 13.37 6 12.641 6 12 C 6 11.359 6.123 10.63 6.463 9.951 C 6.713 9.451 7.613 8 9.5 8 C 10.418 8 11.102 8.344 11.591 8.754 C 11.824 8.949 12.176 8.949 12.409 8.754 C 12.898 8.344 13.582 8 14.5 8 Z M 10 10.75 A 1.25 1.25 0 1 0 10 13.25 A 1.25 1.25 0 1 0 10 10.75 Z M 15 10.75 A 1.25 1.25 0 1 0 15 13.25 A 1.25 1.25 0 1 0 15 10.75 Z"
                fill="currentColor"
              />
              <path
                d="M 12 5 C 12.747 3.133 14.608 2.939 18 2.96 C 19.409 2.969 20.114 2.974 20.645 3.247 C 21.114 3.489 21.491 3.868 21.73 4.339 C 22 4.872 22 5.581 22 7 V 16 C 22 17.3 22 17.95 21.726 18.485 C 21.485 18.955 21.099 19.34 20.627 19.578 C 20.09 19.85 19.395 19.847 18 19.84 C 15.788 19.829 13.523 20.173 12 22 C 10.477 20.173 8.212 19.829 6 19.84 C 4.605 19.847 3.91 19.85 3.373 19.578 C 2.901 19.34 2.515 18.955 2.274 18.485 C 2 17.95 2 17.3 2 16 V 7 C 2 5.581 2 4.872 2.27 4.339 C 2.509 3.868 2.886 3.489 3.355 3.247 C 3.886 2.974 4.591 2.969 6 2.96 C 9.392 2.939 11.253 3.133 12 5 Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <button
            onClick={() => setIsProfileExpanded(false)}
            className={`w-8 h-8 flex items-center justify-center rounded-full bg-white/5 transition-colors text-white/60 hover:text-white shrink-0 min-[480px]:hidden ml-1`}
            title="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path
                d="M 7 7 L 17 17 M 17 7 L 7 17"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );

  return (
    <div className="min-h-screen bg-theme-page text-white relative overflow-hidden selection:bg-white/30">
      {/* Immersive Dynamic Background */}
      <div
        className="absolute inset-0 opacity-40 transition-colors duration-1000 ease-in-out pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 45%, oklch(${oklchValues}) 0%, transparent 80%)`,
        }}
      />

      {/* Noise Overlay for texture */}
      <div
        className="absolute inset-0 opacity-[0.35] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage: `url("/noise.jpg")`,
          backgroundRepeat: "repeat",
          backgroundSize: "64px 64px",
        }}
      ></div>

      {toast && (
        <Toast
          data={toast}
          onClick={handleToastClick}
          onClose={() => setToast(null)}
        />
      )}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleRestore}
        accept="application/json"
        style={{ display: "none" }}
      />

      <div className="relative z-10 w-full max-w-[1400px] mx-auto min-h-screen flex flex-col lg:flex-row">
        
        {/* ======================= Left Pane ======================= */}
        <div className="w-full lg:w-1/2 min-h-[100svh] lg:min-h-screen flex flex-col justify-between p-6 lg:p-12 lg:border-r border-white/10">
          
          {/* Header */}
          {renderHeader("left")}

          <div className="flex-1 flex flex-col pt-8 pb-8 lg:pb-16 relative justify-center items-center">
            
            <div className="w-full flex flex-col justify-start lg:h-full lg:max-h-[42rem]">
              
              <div className="flex justify-between items-end mb-8 gap-2 shrink-0">
                <div className="min-w-0 flex-1">
                  <h2 className="ml-[0.0625rem] text-[0.625rem] font-mono tracking-widest text-white/50 uppercase">
                    Perception Test
                  </h2>
                  <p className="text-2xl font-bold tracking-tight truncate">
                    形容顏色
                  </p>
                </div>

                {/* Quiz Filter Dropdown */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowHex(!showHex)}
                    className="relative p-0.5 rounded-full bg-white/5 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
                    title={showHex ? "切換回 OKLch" : "切換顯示 Hex 色碼"}
                  >
                    {/* Sliding Background */}
                    <div
                      className={`absolute left-0.5 top-0.5 w-8 h-8 bg-white/15 rounded-full transition-transform duration-300 ease-out ${
                        showHex ? "translate-x-7" : "translate-x-0"
                      }`}
                    ></div>

                    {/* Icon Group Wrapper */}
                    <div className="relative z-10 flex -space-x-1">
                      {/* LCH Icon */}
                      <div
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-opacity duration-300 ${
                          !showHex ? "opacity-100" : "opacity-60"
                        }`}
                      >
                        <svg className="w-4 h-4 text-theme-text-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1 5 1 19 5 19" />
                          <polyline points="17.5 5 17.5 19" />
                          <polyline points="17.5 12 23 12" />
                          <polyline points="23 5 23 19" />
                          <path d="M 13.8398 8.3799 C 13.7624 7.6446 13.6671 6.8699 13.3242 6.2031 C 12.878 5.3356 11.9882 4.75 11 4.75 C 10.0118 4.75 9.122 5.3356 8.6758 6.2031 C 8.3329 6.8699 8.2376 7.6446 8.1602 8.3799 C 8.058 9.3507 8 10.6296 8 12 C 8 13.3704 8.058 14.6493 8.1602 15.6201 C 8.2376 16.3554 8.3329 17.1301 8.6758 17.7969 C 9.122 18.6644 10.0118 19.25 11 19.25 C 11.9882 19.25 12.878 18.6644 13.3242 17.7969 C 13.6671 17.1301 13.7624 16.3554 13.8398 15.6201" />
                        </svg>
                      </div>

                      {/* #Hex Icon */}
                      <div
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-opacity duration-300 ${
                          showHex ? "opacity-100" : "opacity-60"
                        }`}
                      >
                        <svg className="w-4 h-4 text-theme-text-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5.25" y1="9" x2="19.5" y2="9" />
                          <line x1="4.5" y1="15" x2="18.75" y2="15" />
                          <line x1="10" y1="4" x2="8" y2="20" />
                          <line x1="16" y1="4" x2="14" y2="20" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  <div className="relative flex-shrink-0 group">
                    <div className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full ring-1 ring-inset ring-white/10 bg-white/5 group-hover:bg-white/10 transition-colors cursor-pointer max-w-[140px] sm:max-w-none">
                      <span className="text-xs/3 font-medium whitespace-nowrap">
                        {getQuizFilterLabel()}
                      </span>
                      <svg
                        className="w-4 h-4 text-theme-text-soft flex-shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <select
                      value={quizFilter === "all" ? "all" : quizFilter}
                      onChange={(e) => handleQuizFilterChange(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    >
                      <option value="all">隨機出題</option>
                      {HUES.map((h) => (
                        <option key={h.id} value={h.angle}>
                          {h.nameZH} ({h.angle}°)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {currentColor && (
                <ColorTester
                  color={currentColor}
                  hueDef={currentHueDef}
                  onSubmit={handleSubmit}
                  onSkip={handleNextColor}
                  showHex={showHex}
                />
              )}
            </div>
          </div>

          {/* Footer of Left Pane */}
          <div className="flex justify-between items-center text-[0.625rem] font-mono tracking-widest text-white/30 uppercase">
            <span>OKLch Color Space</span>
            <span>AI Verified</span>
          </div>
        </div>


        {/* ======================= Right Pane ======================= */}
        {/* 手機版設定：h-auto 已經確保了「內容有多少就長多高，Hug content」。
            電腦版設定：保留 lg:min-h-screen 來跟左邊切齊。 */}
        <div className="w-full lg:w-1/2 h-auto lg:min-h-screen flex flex-col justify-between p-6 lg:p-12 bg-theme-pane border-t lg:border-t-0 lg:border-l border-white/5 relative">
          
          {/* Invisible Header for alignment on desktop */}
          {renderHeader("right")}

          <div className="flex-1 flex flex-col pt-0 pb-20 lg:pt-8 lg:pb-16 relative lg:justify-center lg:items-center">
            
            <div className="w-full flex flex-col justify-start lg:h-full lg:max-h-[42rem]">
              
              <div className="flex justify-between items-end mb-8 gap-2 shrink-0">
                <div className="min-w-0 flex-1">
                  <h2 className="ml-[0.0625rem] text-[0.625rem] font-mono tracking-widest text-white/50 uppercase">
                    Consensus Map
                  </h2>
                  <p className="text-2xl font-bold tracking-tight truncate">
                    色彩分布
                  </p>
                </div>

                {/* View Filter Dropdown */}
                <div className="relative flex-shrink-0 group">
                  <div className="flex items-center gap-2 pl-4 pr-3 py-2.5 rounded-full ring-1 ring-inset ring-white/10 bg-white/5 group-hover:bg-white/10 transition-colors cursor-pointer max-w-[140px] sm:max-w-none">
                    <span className="text-xs/3 font-medium whitespace-nowrap">
                      {getViewHueLabel()}
                    </span>
                    <svg
                      className="w-4 h-4 text-theme-text-soft flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <select
                    value={viewHueAngle}
                    onChange={(e) => setViewHueAngle(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  >
                    {HUES.map((h) => (
                      <option key={h.id} value={h.angle}>
                        {h.nameZH} ({h.angle}°)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col items-center pt-2">
                <SemanticMap
                  hue={viewHueAngle}
                  data={entries}
                  currentColor={currentColor}
                  width={448}
                  height={448}
                />
                <div className="mt-8 flex gap-8 text-[0.625rem] font-mono tracking-wide text-theme-text-muted uppercase">
                  <div className="flex items-center gap-2">
                    <span className="w-px h-3 bg-theme-text-muted"></span>
                    <span>L：Lightness(%) 體感亮度</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-px h-3 bg-theme-text-muted rotate-90"></span>
                    <span>C：Chroma 濃豔值</span>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Invisible Footer for alignment on desktop */}
          <div className="hidden lg:flex justify-between items-center text-[0.625rem] font-mono tracking-widest text-white/30 uppercase invisible pointer-events-none select-none" aria-hidden="true">
            <span>OKLch Color Space</span>
            <span>AI Verified</span>
          </div>

          {/* Admin / Debug Tools */}
          <div className="absolute bottom-4 right-4 flex flex-wrap gap-2 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity z-50">
            <button
              onClick={() => triggerToastTest(false)}
              className="px-3 py-1.5 text-[0.625rem] font-mono tracking-widest rounded-full border border-white/20 bg-black/50 hover:bg-white/10 transition-colors"
            >
              Test Success
            </button>
            <button
              onClick={() => triggerToastTest(true)}
              className="px-3 py-1.5 text-[0.625rem] font-mono tracking-widest rounded-full border border-white/20 bg-black/50 hover:bg-white/10 transition-colors"
            >
              Test Reject
            </button>
            <button
              onClick={handlePrune}
              className="px-3 py-1.5 text-[0.625rem] font-mono tracking-widest rounded-full border border-white/20 bg-black/50 hover:bg-white/10 transition-colors"
            >
              Prune Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default App;
