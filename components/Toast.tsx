import React, { useEffect, useState } from 'react';
import { OklchColor, HueDefinition } from '../types';
import { toCss } from '../utils';

export interface ToastData {
  color: OklchColor;
  name: string;
  hueDef: HueDefinition;
  feedback: string;
  isSuspicious: boolean;
}

interface ToastProps {
  data: ToastData;
  onClick: () => void;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ data, onClick, onClose }) => {
  const colorCss = toCss(data.color);
  
  const [animationState, setAnimationState] = useState<'entering' | 'active' | 'exiting'>('entering');

  useEffect(() => {
    const enterTimer = setTimeout(() => {
      setAnimationState('active');
    }, 10);

    const exitTimer = setTimeout(() => {
      handleExit();
    }, 4500);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, []);

  const handleExit = () => {
    setAnimationState('exiting');
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const handleClick = () => {
    setAnimationState('exiting');
    setTimeout(() => {
      onClick();
    }, 500);
  };

  const getAnimationStyles = () => {
    switch (animationState) {
      case 'entering':
        return 'translate-y-12 opacity-0 backdrop-blur-[0px] scale-95';
      case 'active':
        return 'translate-y-0 opacity-100 backdrop-blur-md scale-100';
      case 'exiting':
        return 'translate-y-4 opacity-0 backdrop-blur-[0px] scale-95';
      default:
        return '';
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`
        fixed bottom-6 right-6 z-50 cursor-pointer 
        will-change-transform transform 
        transition-all duration-700 
        ease-[cubic-bezier(0.16,1,0.3,1)]
        
        /* 外層：負責裁切背景模糊，確保模糊邊緣也是圓的 */
        rounded-2xl overflow-hidden
        
        ${getAnimationStyles()}
      `}
    >
      <div className={`
        bg-theme-toast-bg 
        shadow-2xl shadow-slate-700/10 dark:shadow-black/50 
        border border-theme-toast-border 
        
        /* ✨ 修正這裡：內層也要加圓角，這樣邊框才會是圓的！ ✨ */
        rounded-2xl
        
        p-4 pr-6 flex items-center gap-4 
        hover:bg-theme-toast-bg/80 
        transition-colors duration-300
      `}>
        
        {/* Color Circle with Badge */}
        <div className="relative flex-shrink-0">
          <div 
            className="w-16 h-16 rounded-full shadow-inner border-2 border-white dark:border-white"
            style={{ backgroundColor: colorCss }}
          ></div>
          
          {/* Status Badge */}
          <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 bg-white dark:bg-white rounded-full flex items-center justify-center">
            {data.isSuspicious ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="stroke-red-600" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" className="stroke-indigo-600"  strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 12 10 19 20 6"></polyline></svg>
            )}
          </div>
        </div>

        {/* Text Content */}
        <div className="flex flex-col min-w-[140px]">
          <div className="font-bold text-theme-text-main text-lg leading-tight">
            {data.name}
          </div>
          <div className="text-xs text-theme-text-muted font-medium mb-1">
            {data.hueDef.nameZH} {data.hueDef.nameEN} ({data.hueDef.angle}°)
          </div>
          <div className="text-sm text-theme-text-main font-medium">
            {data.feedback}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toast;