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
const MAX_CHARS = 23; // 最大字數限制

const ColorTester: React.FC<ColorTesterProps> = ({ color, hueDef, onSubmit, onSkip }) => {
  const [bgBlack, setBgBlack] = useState(false);
  const [inputName, setInputName] = useState('');
  const [suggestedPrefixesList, setSuggestedPrefixesList] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  
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

  const handlePrefixClick = (prefix: string) => {
    const wasAlreadyFocused = document.activeElement === inputRef.current;

    const currentName = inputName;
    let newName = prefix;
    
    const existingPrefix = PREFIXES.find(p => currentName.startsWith(p));
    if (existingPrefix) {
       newName = prefix + currentName.substring(existingPrefix.length);
    } else {
       newName = prefix + currentName;
    }
    
    // 檢查字數限制 (雖然前綴通常很短，但加上去後可能會爆，這裡也防一下)
    if (newName.replace(/\s/g, '').length <= MAX_CHARS) {
      setInputName(newName);
    } else {
      // 如果加上前綴會爆字數，就只取前面合法的長度 (選用邏輯，通常不會發生)
      // 這裡簡單處理：如果爆了就不加
      return;
    }
    
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
        const len = newName.length;
        inputRef.current.setSelectionRange(len, len);

        if (!wasAlreadyFocused) {
          setTimeout(() => {
            formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 100); 
        }
      }
    }, 10);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    
    // ✨ 字數限制邏輯 (忽略空白) ✨
    const nonSpaceCount = val.replace(/\s/g, '').length;

    // 只有在「字數未滿」或是「正在刪除文字(長度變短)」時才更新
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
    <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
      
      {/* Visual Stage */}
      <div className={`
        relative aspect-square rounded-3xl border border-theme-card-border overflow-hidden transition-colors duration-500
        flex items-center justify-center
        ${bgBlack ? 'bg-black' : 'bg-white/85'}
      `}>
        <button 
          onClick={() => setBgBlack(!bgBlack)}
          className={`absolute top-4 right-4 p-2 rounded-full border backdrop-blur-md transition-all z-10 
            ${bgBlack ? 'bg-white/10 border-white/20 text-white hover:bg-white/40 hover:border-transparent' : 'bg-white/20 border-gray-600/20 text-gray-600 hover:bg-gray-600/20 hover:border-transparent'}
          `}
          title="切換背景顏色"
        >
          {bgBlack ? (
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          )}
        </button>

        <div 
          className="w-3/4 h-3/4 rounded-full shadow-2xl transition-all duration-300 ease-out flex items-end justify-center pb-8 group"
          style={{ backgroundColor: currentColorCss }}
        >
           <div className={`text-xs font-mono font-medium tracking-wider transition-opacity duration-300 ${textColorClass}`}>
              OKLch({(color.l*100).toFixed(0)}% {color.c.toFixed(3)} {color.h}°)
           </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">

        {/* Suggested Prefixes */}
        <div className="flex flex-wrap justify-center gap-2">
          {suggestedPrefixesList.map(prefix => (
            <button
              key={prefix}
              type="button"
              onClick={() => handlePrefixClick(prefix)}
              onMouseDown={(e) => e.preventDefault()}
              className="px-3 py-1.5 text-sm bg-theme-brand-bg text-theme-brand-text hover:opacity-80 active:opacity-60 rounded-lg transition-colors border border-transparent"
            >
              {prefix}
            </button>
          ))}
        </div>

        {/* Form - 綁定 ref 以控制捲動 */}
        <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative w-full group">
            
            {/* Background Layer */}
            <div className="absolute inset-0 z-0 border-2 border-theme-input-border bg-theme-input rounded-xl group-focus-within:border-theme-text-main transition-colors"></div>

            {/* Ghost Layer */}
            <div 
              className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-4 py-3 transition-transform duration-100 ease-out"
              style={{ transform: `translateX(${offsetX}px)` }}
            >
              <div className="relative flex items-center">
                {/* 
                   Ghost 文字：顯示 inputName
                   這裡不需要 normalize，因為我們希望視覺上跟使用者打的一模一樣，
                   這樣游標才會對齊。
                */}
                {/* 主文字 */}
                <span className={`text-lg font-sans whitespace-pre ${inputName ? 'text-theme-text-main' : 'text-theme-text-muted'}`}>
                  {inputName || '試試自己取名'}
                </span>
                
                {/* 提示後綴 */}
                {showSuffixHint && (
                  <span 
                    ref={hintRef}
                    className="absolute left-full top-0 h-full flex items-center text-theme-text-muted whitespace-nowrap pl-0.5 text-lg font-sans"
                  >
                    什麼色？
                  </span>
                )}
              </div>
            </div>

            {/* Input Layer */}
            <input
              ref={inputRef}
              type="text"
              value={inputName}
              onChange={handleInputChange}
              placeholder="" 
              className="relative z-20 w-full px-4 py-3 text-lg bg-transparent border-none outline-none text-transparent rounded-xl transition-all text-center hover:cursor-text caret-theme-text-main"
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
