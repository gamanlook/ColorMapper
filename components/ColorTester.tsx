import React, { useState, useEffect } from 'react';
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

const ColorTester: React.FC<ColorTesterProps> = ({ color, hueDef, onSubmit, onSkip }) => {
  const [bgBlack, setBgBlack] = useState(false);
  const [inputName, setInputName] = useState('');
  const [suggestedPrefixesList, setSuggestedPrefixesList] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    // Reset on new color
    setInputName('');
    setSuggestedPrefixesList(suggestPrefixes(color));
  }, [color]);

  const handlePrefixClick = (prefix: string) => {
    setInputName(prev => {
      // Check if starts with any known prefix to replace it, or just append
      const existingPrefix = PREFIXES.find(p => prev.startsWith(p));
      if (existingPrefix) {
         return prefix + prev.substring(existingPrefix.length);
      }
      return prefix + prev;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;

    setIsSubmitting(true);

    // 1. Clean input (Rule: remove trailing "色")
    let cleanedName = inputName.trim();
    if (cleanedName.endsWith('色') && cleanedName.length > 1) {
      cleanedName = cleanedName.slice(0, -1);
    }

    // 2. AI Validation
    try {
      const validation = await validateColorName(color, cleanedName, hueDef.nameEN);
      onSubmit(cleanedName, validation.isSuspicious, validation.reason, validation.feedback);
    } catch (err) {
      console.error(err);
      // Proceed even if AI fails
      onSubmit(cleanedName, false, undefined, "命名已收錄！");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentColorCss = toCss(color);
  
  // Text contrast depends on the color itself, not the background container
  const textColorClass = color.l > 0.65 ? 'text-black/70' : 'text-white/90';

  return (
    <div className="flex flex-col gap-6 w-full max-w-md mx-auto">
      
      {/* Visual Stage - IMPORTANT: Background must remain absolute white/black for color reference, ignoring global theme */}
      <div className={`
        relative aspect-square rounded-3xl border border-theme-card-border overflow-hidden transition-colors duration-500
        flex items-center justify-center
        ${bgBlack ? 'bg-black' : 'bg-white/85'}
      `}>
        {/* Toggle BG Button */}
        <button 
          onClick={() => setBgBlack(!bgBlack)}
          className={`absolute top-4 right-4 p-2 rounded-full border backdrop-blur-md transition-all z-10 
            ${bgBlack ? 'bg-white/10 border-white/20 text-white hover:bg-white/40 hover:border-transparent' : 'bg-white/20 border-gray-600/20 text-gray-600 hover:bg-gray-600/20 hover:border-transparent'}
          `}
          title="切換背景顏色"
        >
          {bgBlack ? (
             // Sun Icon (Switch to Light)
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
             // Moon Icon (Switch to Dark)
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
          )}
        </button>

        {/* The Color Swatch */}
        <div 
          className="w-3/4 h-3/4 rounded-full shadow-2xl transition-all duration-300 ease-out flex items-end justify-center pb-8 group"
          style={{ backgroundColor: currentColorCss }}
        >
           {/* Values Overlay - On the color */}
           <div className={`text-xs font-mono font-medium tracking-wider transition-opacity duration-300 ${textColorClass}`}>
              OKLch({(color.l*100).toFixed(0)}% {color.c.toFixed(3)} {color.h}°)
           </div>
        </div>
        
      </div>

      {/* Input Section */}
      <div className="flex flex-col gap-4">

        {/* Suggested Prefixes */}
        <div className="flex flex-wrap justify-center gap-2">
          {suggestedPrefixesList.map(prefix => (
            <button
              key={prefix}
              type="button"
              onClick={() => handlePrefixClick(prefix)}
              className="px-3 py-1.5 text-sm bg-theme-brand-bg text-theme-brand-text hover:opacity-80 active:opacity-60 rounded-lg transition-colors border border-transparent"
            >
              {prefix}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="試試自己取名"
              className="w-full px-4 py-3 text-lg border-2 border-theme-input-border bg-theme-input text-theme-text-main rounded-xl focus:border-theme-text-main focus:ring-0 outline-none transition-all placeholder-[var(--color-text-muted)] text-center hover:border-theme-text-main"
              autoFocus
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
