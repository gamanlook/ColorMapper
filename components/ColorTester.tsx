import React, { useState, useEffect, useRef } from 'react';
import { OklchColor, HueDefinition } from '../types';
import { toCss, suggestPrefixes, oklchToHex } from '../utils';
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
  const [showHex, setShowHex] = useState(false);
  const [inputName, setInputName] = useState('');
  const [suggestedPrefixesList, setSuggestedPrefixesList] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    setInputName('');
    setSuggestedPrefixesList(suggestPrefixes(color));
  }, [color]);

  const normalizedInput = inputName.replace(/艷/g, '豔');
  const showSuffixHint = PREFIXES.includes(normalizedInput) && !STANDALONE_ALLOWED.includes(normalizedInput);

  const scrollToBottom = () => {
    const doScroll = () => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    };

    if (!hasInteractedRef.current) {
      setTimeout(doScroll, 1);
      setTimeout(doScroll, 500);
      hasInteractedRef.current = true;
    } else {
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
    
    if (textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
      // 保持游標在最後
      setTimeout(() => {
        if (textareaRef.current) {
          const len = newName.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 0);
      scrollToBottom();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    // 簡單過濾換行符，保持單純
    const cleanVal = val.replace(/\n/g, ''); 
    const nonSpaceCount = cleanVal.replace(/\s/g, '').length;

    if (nonSpaceCount <= MAX_CHARS || cleanVal.length < inputName.length) {
      setInputName(cleanVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ⚠️⚠️⚠️ CRITICAL FIX FOR IME (Input Method Editor) ⚠️⚠️⚠️
    // ⚠️ DO NOT REMOVE THIS CHECK! 請勿刪除此檢查！⚠️
    // 當使用者正在使用注音/拼音輸入法「選字」並按下 Enter 時，isComposing 會是 true。
    // 這時候的 Enter 是為了確認選字，絕對不能送出表單。
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === 'Enter') {
      // 阻止 textarea 預設的換行行為
      e.preventDefault();
      
      // 使用 requestSubmit() 模擬原生表單送出
      // 這會觸發 <form> 的 onSubmit 事件
      formRef.current?.requestSubmit();
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
        if (textareaRef.current) {
          textareaRef.current.focus({ preventScroll: true });
          const len = inputName.length;
          textareaRef.current.setSelectionRange(len, len);
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
  const hexValue = oklchToHex(color.l, color.c, color.h);
  
  const hasContent = inputName.trim().length > 0;

  return (
    <div className="flex flex-col gap-4 w-full max-w-md mx-auto">
      
      {/* Visual Stage */}
      <div className={`
        relative aspect-square rounded-3xl border border-theme-card-border overflow-hidden transition-colors duration-500
        flex items-center justify-center
        ${bgBlack ? 'bg-black' : 'bg-white/85'}
      `}>
        {/* Toggle Hex/OKLch Button */}
        <button 
          onClick={() => setShowHex(!showHex)}
          className={`absolute top-3 left-3 p-2 rounded-full border transition-all z-10 
            ${bgBlack ? 'bg-white/10 border-white/10 text-white hover:bg-white/40 hover:border-transparent' : 'bg-white/40 border-slate-600/10 text-slate-600 hover:bg-slate-600/20 hover:border-transparent'}
          `}
          title={showHex ? "切換回 OKLch" : "切換顯示 Hex 色碼"}
        >
          {showHex ? (
             <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <polyline points="1 5 1 19 5 19" />
               <polyline points="17.6666 5 17.6666 19" />
               <polyline points="17.6666 12 23 12" />
               <polyline points="23 5 23 19" />
               <path d="M13.8398 8.37988C13.7904 7.91013 13.7226 7.42749 13.6211 7.01953C13.5753 6.8357 13.4885 6.52265 13.3242 6.20312C13.2442 6.04755 13.079 5.75727 12.7871 5.47559C12.486 5.18509 11.8796 4.75 11 4.75C10.1204 4.75 9.51399 5.18509 9.21289 5.47559C8.92098 5.75727 8.75581 6.04755 8.67578 6.20312C8.51146 6.52265 8.42466 6.8357 8.37981 7.01953C8.27739 7.42749 8.2096 7.91013 8.16016 8.37988C8.05798 9.35074 8 10.6296 8 12C8 13.3704 8.05798 14.6493 8.16016 15.6201C8.2096 16.0899 8.27739 16.5725 8.37891 16.9805C8.42466 17.1643 8.51146 17.4773 8.67578 17.7969C8.75581 17.9524 8.92098 18.2427 9.21289 18.5244C9.51399 18.8149 10.1204 19.25 11 19.25C11.8796 19.25 12.486 18.8149 12.7871 18.5244C13.079 18.2427 13.2442 17.9524 13.3242 17.7969C13.4885 17.4773 13.5753 17.1643 13.6211 16.9805C13.7226 16.5725 13.7904 16.0899 13.8398 15.6201" />
             </svg>
          ) : (
             <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <line x1="5.25" y1="9" x2="19.5" y2="9" />
               <line x1="4.5" y1="15" x2="18.75" y2="15" />
               <line x1="10" y1="4" x2="8" y2="20" />
               <line x1="16" y1="4" x2="14" y2="20" />
             </svg>
          )}
        </button>

        {/* Toggle BG Color Button */}
        <button 
          onClick={() => setBgBlack(!bgBlack)}
          className={`absolute top-3 right-3 p-2 rounded-full border transition-all z-10 
            ${bgBlack ? 'bg-white/10 border-white/10 text-white hover:bg-white/40 hover:border-transparent' : 'bg-white/40 border-slate-600/10 text-slate-600 hover:bg-slate-600/20 hover:border-transparent'}
          `}
          title="切換背景顏色"
        >
          {bgBlack ? (
             <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
             </svg>
          ) : (
             <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
               <path d="M20.96724 12.76724A9 9 0 1 1 11.23276 3.03276A7 7 0 0 0 20.96724 12.76724z" />
             </svg>
          )}
        </button>

        <div 
          className="w-3/4 h-3/4 rounded-full shadow-2xl transition-all duration-300 ease-out flex items-end justify-center pb-8 group"
          style={{ backgroundColor: currentColorCss }}
        >
           <div className={`text-[10px] font-mono font-medium tracking-wider transition-opacity duration-300 ${textColorClass}`}>
              {showHex 
                ? hexValue 
                : `OKLch(${(color.l*100).toFixed(0)}% ${color.c.toFixed(3)} ${color.h}°)`
              }
           </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">

        {/* Suggested Prefixes */}
        <div 
          className="flex flex-nowrap gap-1.5 overflow-x-auto no-scrollbar -mx-6 px-5 w-[calc(100%+3rem)]"
          style={{
            WebkitMaskImage: `linear-gradient(to right, 
              transparent, 
              rgba(0,0,0, 0.1) 4px, 
              rgba(0,0,0, 0.4) 10px, 
              rgba(0,0,0, 0.8) 18px, 
              black 24px, 
              
              black calc(100% - 24px), 
              rgba(0,0,0, 0.8) calc(100% - 18px), 
              rgba(0,0,0, 0.4) calc(100% - 10px), 
              rgba(0,0,0, 0.1) calc(100% - 4px), 
              transparent
            )`,
            maskImage: `linear-gradient(to right, 
              transparent, 
              rgba(0,0,0, 0.1) 4px, 
              rgba(0,0,0, 0.4) 10px, 
              rgba(0,0,0, 0.8) 18px, 
              black 24px, 
              
              black calc(100% - 24px), 
              rgba(0,0,0, 0.8) calc(100% - 18px), 
              rgba(0,0,0, 0.4) calc(100% - 10px), 
              rgba(0,0,0, 0.1) calc(100% - 4px), 
              transparent
            )`
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

        {/* Auto-growing Textarea Form */}
        <form ref={formRef} className="scroll-mb-4" onSubmit={handleSubmit}>
          {/* 
            Container Setup:
            - min-h-[3rem] to match previous size
            - rounded-[2rem] (32px) to form concentric circles with the button
            - p-2 to give breathing room for the button
          */}
          <div className="relative w-full rounded-[2rem] border border-theme-input-border bg-theme-input transition-colors p-2">
            
            {/* 
              CSS Grid Stack:
              We stack the Ghost Div and the Textarea exactly on top of each other (row-1, col-1).
              The Ghost Div has the content and forces the container to grow.
              The Textarea is absolute/stretched to cover the area.
            */}
            <div className="grid w-full h-full relative items-center">
              
              {/* 
                 Ghost Layer (Visuals): 
                 - Controls height via content
                 - Displays text + Suffix
                 - padding must match Textarea exactly
              */}
              <div 
                className="col-start-1 row-start-1 px-4 py-2 pr-12 text-lg whitespace-pre-wrap break-words invisible-scrollbar pointer-events-none"
                aria-hidden="true"
              >
                 <span className={`${inputName ? 'text-theme-text-main' : 'text-theme-text-muted'}`}>
                    {inputName || '試試自己取名'}
                 </span>
                 {showSuffixHint && (
                    <span className="text-theme-text-muted text-lg ml-0.5">
                       什麼色？
                    </span>
                 )}
                 {/* 
                   這是一個零寬空格 (Zero-width space) + 換行，
                   確保當最後一個字剛好滿一行時，Ghost Layer 能正確撐開下一行的高度 
                 */}
                 <span className="inline-block w-0">&#8203;</span>
              </div>

              {/* 
                 Interactive Layer (Textarea):
                 - Transparent text color (to show ghost layer below)
                 - Visible caret (caret-theme-text-main)
                 - "Search-like" attributes to prevent autocomplete
              */}
              <textarea
                ref={textareaRef}
                name="color-input"
                rows={1}
                value={inputName}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={scrollToBottom}
                onClick={scrollToBottom}
                placeholder="" 
                
                /* Mobile "Search" Input Simulation */
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                enterKeyHint="send"

                className={`
                  col-start-1 row-start-1 w-full h-full 
                  px-4 py-2 pr-12 text-lg 
                  bg-transparent border-none outline-none 
                  resize-none overflow-hidden
                  text-transparent caret-theme-text-main
                `}
              />
            </div>
            
            {/* 
               Action Button:
               - Absolute positioned to stay at bottom-right
               - p-3 as requested
            */}
            <button
              type={hasContent ? "submit" : "button"}
              onClick={hasContent ? undefined : onSkip}
              disabled={isSubmitting}
              className={`
                absolute right-2 bottom-2 p-3 rounded-full
                flex items-center justify-center z-30
                ${hasContent ? 'bg-theme-brand text-white' : 'bg-theme-input-action text-theme-text-muted-solid'}
                hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-colors
              `}
            >
              {isSubmitting ? (
                // Spinner
                <svg className="animate-spin w-[18px] h-[18px] text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : hasContent ? (
                // Submit Icon (Arrow Up)
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="5 11 12 4 19 11" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
              ) : (
                // Skip Icon (Refresh)
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 12C20 16.4183 16.4183 20 12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4C13.0609 4 14.0736 4.20651 15 4.58152" />
                  <polyline points="13 1.15 16 4.15 13 7.15" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ColorTester;
