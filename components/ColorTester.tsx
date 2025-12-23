
import React, { useState, useEffect, useRef } from 'react';
import { OklchColor, HueDefinition } from '../types';
import { toCss, suggestPrefixes } from '../utils';
import { PREFIXES } from '../constants';
import { validateColorName } from '../services/geminiService';

interface ColorTesterProps {
  color: OklchColor;
  hueDef: HueDefinition;
  onSubmit: (name: string, isSuspicious: boolean, reason?: string, feedback?: string) => void;
  onSkip: () => void;
}

const STANDALONE_ALLOWED = ['白', '淺灰', '灰', '深灰', '暗灰', '黑'];
const MAX_CHARS = 23;

const ColorTester: React.FC<ColorTesterProps> = ({ color, hueDef, onSubmit, onSkip }) => {
  const [bgBlack, setBgBlack] = useState(false);
  const [inputName, setInputName] = useState('');
  const [suggestedPrefixesList, setSuggestedPrefixesList] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  
  // ✨ 新增：紀錄是否已經互動過 (用來判斷是不是第一次彈鍵盤) ✨
  const hasInteractedRef = useRef(false);
  
  const [offsetX, setOffsetX] = useState(0);

  useEffect(() => {
    setInputName('');
    setSuggestedPrefixesList(suggestPrefixes(color));
  }, [color]);

  const normalizedInput = inputName.replace(/艷/g, '豔');
  const showSuffixHint = PREFIXES.includes(normalizedInput) && !STANDALONE_ALLOWED.includes(normalizedInput);

  useEffect(() => {
    if (showSuffixHint && hintRef.current) {
      const hintWidth = hintRef.current.offsetWidth;
      setOffsetX(-(hintWidth / 2));
    } else {
      setOffsetX(0);
    }
  }, [inputName, showSuffixHint]);

  // ✨ 修正版：智慧型捲動邏輯 ✨
  const scrollToBottom = () => {
    const doScroll = () => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    if (!hasInteractedRef.current) {
      // 情況 A：第一次互動 (鍵盤冷啟動)
      // 策略：雙重補槍。
      // 1ms: 為了攔截掉 Android 預設的置中輸入框位置這行為。也為了讓靈敏的iOS先鍵盤升起，動畫完成後，就不會察覺到有第二動500ms。
      // 500ms: 為了接住 Android 那慢半拍的鍵盤升起變化。
      setTimeout(doScroll, 1);
      setTimeout(doScroll, 500);
      
      // 標記為已互動
      hasInteractedRef.current = true;
    } else {
      // 情況 B：後續互動 (鍵盤熱啟動 / 已經在打字)
      // 策略：單發 150ms。
      // 既然瀏覽器已經穩定了，我們就不要多做一次動作，這樣可以避免畫面抖動。
      // 但時間數字也不能設定太小，因為 Android 還是需要一點慢半拍時間。
      setTimeout(doScroll, 150);
    }
  };

  const handlePrefixClick = (prefix: string) => {
    const currentName = inputName;
    let newName = prefix;
    
    const existingPrefix = PREFIXES.find(p => currentName.startsWith(p));
    if (existingPrefix) {
       newName = prefix + currentName.substring(existingPrefix.length);
    } else {
       newName = prefix + currentName;
    }
    
    if (newName.replace(/\s/g, '').length <= MAX_CHARS) {
      setInputName(newName);
    } else {
      return;
    }
    
    if (inputRef.current) {
      // iOS 必須同步 Focus
      inputRef.current.focus({ preventScroll: true });
      
      // 游標設定 (非同步以確保文字已更新)
      setTimeout(() => {
        if (inputRef.current) {
          const len = newName.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 0);

      // 觸發智慧捲動
      scrollToBottom();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const nonSpaceCount = val.replace(/\s/g, '').length;

    if (nonSpaceCount <= MAX_CHARS || val.length < inputName.length) {
      setInputName(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;

    setIsSubmitting(true);

    let cleanedName = inputName.trim().replace(/艷/g, '豔');
    if (cleanedName.endsWith('色') && cleanedName.length > 1) {
      cleanedName = cleanedName.slice(0, -1);
    }

    const isPrefixOnly = PREFIXES.includes(cleanedName) && !STANDALONE_ALLOWED.includes(cleanedName);

    if (isPrefixOnly) {
      onSubmit(
        cleanedName, 
        true, 
        "PREFIX_ONLY", 
        `後面好像少了顏色？試試看：${cleanedName}紅、${cleanedName}藍...`
      );
      setIsSubmitting(false);
      
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus({ preventScroll: true });
          const len = inputName.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 0);
      return; 
    }

    try {
      const validation = await validateColorName(color, cleanedName, hueDef.nameEN);
      onSubmit(cleanedName, validation.isSuspicious, validation.reason, validation.feedback);
    } catch (err) {
      console.error(err);
      onSubmit(cleanedName, false, undefined, "命名已收錄！");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentColorCss = toCss(color);
  const textColorClass = color.l > 0.65 ? 'text-black/70' : 'text-white/90';

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
      
      {/* Visual Stage */}
      <div className={`
        relative aspect-square rounded-3xl border border-theme-card-border overflow-hidden transition-colors duration-500
        flex items-center justify-center
        ${bgBlack ? 'bg-black' : 'bg-white/85'}
      `}>
        <button 
          onClick={() => setBgBlack(!bgBlack)}
          className={`absolute top-4 right-4 p-2 rounded-full border backdrop-blur-md transition-all z-10 
            ${bgBlack ? 'bg-white/10 border-white/20 text-white hover:bg-white/40 hover:border-transparent' : 'bg-white/20 border-slate-600/20 text-slate-600 hover:bg-slate-600/20 hover:border-transparent'}
          `}
          title="切換背景顏色"
        >
          {bgBlack ? (
             // Sun Icon
             <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
             // Moon Icon
             <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          )}
        </button>

        <div 
          className="w-3/4 h-3/4 rounded-full shadow-2xl transition-all duration-300 ease-out flex items-end justify-center pb-8 group"
          style={{ backgroundColor: currentColorCss }}
        >
           <div className={`text-[10px] font-mono font-medium tracking-wider transition-opacity duration-300 ${textColorClass}`}>
              OKLch({(color.l*100).toFixed(0)}% {color.c.toFixed(3)} {color.h}°)
           </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">

        {/* Suggested Prefixes */}
        {/* 
          修正重點：
          1. -mx-6: 負邊距 24px (1.5rem)，對應 App.tsx 卡片的 p-6。
          2. px: 把內容推回對齊線。(px-6 = 24px，的話能剛好切齊其餘物件左右側。但我最後在想要不要用 px-4 或 px-5)
          3. w-[calc(100%+3rem)]: 總寬度 = 100% + 左負邊距 + 右負邊距 (1.5rem * 2)。
          4. Mask Image: 使用 mask-image 做出漸層消失效果。
        */}
        <div 
          className="flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar -mx-6 px-5 w-[calc(100%+3rem)]"
          style={{
            // 定義遮罩：從左側 0px (透明) 到 24px (不透明)，然後到右側倒數 24px (不透明) 再到結尾 (透明)
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)',
            maskImage: 'linear-gradient(to right, transparent, black 24px, black calc(100% - 24px), transparent)'
          }}
        >
          {suggestedPrefixesList.map(prefix => (
            <button
              key={prefix}
              type="button"
              onClick={() => handlePrefixClick(prefix)}
              onMouseDown={(e) => e.preventDefault()}
              className="first:ml-auto last:mr-auto whitespace-nowrap flex-shrink-0 px-3.5 py-1.5 text-[12px] bg-theme-brand-bg text-theme-brand-text hover:opacity-80 active:opacity-60 rounded-full transition-colors border border-transparent"
            >
              {prefix}
            </button>
          ))}
        </div>

        {/* Form */}
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3 scroll-mb-4">
          <div className="relative w-full group">
            
            {/* Background Layer */}
            <div className="absolute inset-0 z-0 border-2 border-theme-input-border bg-theme-input rounded-xl group-focus-within:border-theme-text-main transition-colors"></div>

            {/* Ghost Layer */}
            <div 
              className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-4 py-3 transition-transform duration-100 ease-out"
              style={{ transform: `translateX(${offsetX}px)` }}
            >
              <div className="relative flex items-center">
                <span className={`text-base font-sans whitespace-pre ${inputName ? 'text-theme-text-main' : 'text-theme-text-muted'}`}>
                  {inputName || '試試自己取名'}
                </span>
                
                {showSuffixHint && (
                  <span 
                    ref={hintRef}
                    className="absolute left-full top-0 h-full flex items-center text-theme-text-muted whitespace-nowrap pl-0.5 text-base font-sans"
                  >
                    什麼色？
                  </span>
                )}
              </div>
            </div>

            {/* Input Layer */}
            <input
              ref={inputRef}
              type="search" 
              name="color-input"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
              role="presentation" 
              aria-autocomplete="none"
              
              value={inputName}
              onChange={handleInputChange}
              onFocus={scrollToBottom}
              onClick={scrollToBottom}
              
              placeholder="" 
              className="relative z-20 w-full px-4 py-3 text-base bg-transparent border-none outline-none text-transparent rounded-xl transition-all text-center hover:cursor-text caret-theme-text-main"
              style={{ transform: `translateX(${offsetX}px)` }}
            />
          </div>

          <div className="flex gap-3">
             <button
              type="button"
              onClick={onSkip}
              className="flex-1 py-3 text-theme-text-muted font-medium hover:bg-theme-input rounded-xl transition-colors"
            >
              跳過
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !inputName.trim()}
              className="flex-[2] py-3 bg-theme-brand text-white font-bold rounded-xl transition-all flex justify-center items-center shadow-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : '送出命名'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ColorTester;
