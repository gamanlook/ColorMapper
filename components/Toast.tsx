import React, { useEffect, useState } from "react";
import { OklchColor, HueDefinition } from "../types";
import { toCss } from "../utils";

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

  const [animationState, setAnimationState] = useState<
    "entering" | "active" | "exiting"
  >("entering");

  useEffect(() => {
    const enterTimer = setTimeout(() => {
      setAnimationState("active");
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
    setAnimationState("exiting");
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const handleClick = () => {
    setAnimationState("exiting");
    setTimeout(() => {
      onClick();
    }, 500);
  };

  const getAnimationStyles = () => {
    switch (animationState) {
      case "entering":
        return "translate-y-12 opacity-0 backdrop-blur-[0px] scale-95";
      case "active":
        return "translate-y-0 opacity-100 backdrop-blur-[40px] scale-100";
      case "exiting":
        return "translate-y-4 opacity-0 backdrop-blur-[0px] scale-95";
      default:
        return "";
    }
  };

  const includeIconL = data.color.l * 0.5 + 0.05;
  const excludeIconColor = data.color.l > 0.7 ? "text-black/80" : "text-white/95";
  const includeIconColor = data.color.l > 0.7 ? { color: `oklch(${includeIconL} 0.18 ${data.color.h})` } : { color: "rgba(255, 255, 255, 0.95)" };

  return (
    <div
      onClick={handleClick}
      className={`
        fixed bottom-4 right-4 lg:bottom-8 lg:left-1/2 lg:-translate-x-1/2 z-50 cursor-pointer 
        will-change-transform transform 
        transition-all duration-700 
        ease-[cubic-bezier(0.16,1,0.3,1)]
        w-max max-w-[min(calc(100vw-2rem),480px)] break-words
        rounded-3xl overflow-hidden
        ${getAnimationStyles()}
      `}
    >
      <style>{`
        @keyframes sink {
          0% { transform: translateY(0px); }
          100% { transform: translateY(6px); }
        }
        @keyframes springUp {
          0% { transform: translateY(24px); }
          100% { transform: translateY(0px); }
        }
        @keyframes draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
      <div
        className={`
        bg-theme-toast-bg
        shadow-2xl shadow-black/50 
        border border-theme-toast-border 
        rounded-3xl
        p-4 pr-6 lg:p-5 lg:pr-7 flex items-center gap-4
      `}
      >
        {/* Color Circle with Badge */}
        <div className="relative flex-shrink-0">
          <div
            className="w-16 h-16 rounded-full shadow-inner border border-white/20 flex items-center justify-center"
            style={{ backgroundColor: colorCss }}
          >
            {data.isSuspicious ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-5 h-5 ${excludeIconColor} animate-[sink_0.6s_cubic-bezier(0.34,2,0.64,1)_0.2s_both]`}
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle cx="6.5" cy="7.5" r="2.5" fill="currentColor"/>
                <circle cx="17.5" cy="7.5" r="2.5" fill="currentColor"/>
                <path d="M 6 18 C 9 15 15 15 18 18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 animate-[springUp_0.6s_cubic-bezier(0.20,1.28,0.56,1)_0.2s_both]"
                style={includeIconColor}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline 
                  points="4 12.5 10 19.5 20 6.5"
                  strokeDasharray="28"
                  strokeDashoffset="28"
                  className="animate-[draw_0.3s_ease-out_0.2s_both]"
                ></polyline>
              </svg>
            )}
          </div>
        </div>

        {/* Text Content */}
        <div className="flex flex-col min-w-0">
          <div className="font-bold text-theme-text-main text-lg leading-tight break-words mb-0.5">
            {data.name}
          </div>
          <div className="text-xs font-mono tracking-wider text-theme-text-muted uppercase mb-1 truncate">
            {data.isSuspicious ? (
              <span className="text-red-400 font-bold">不收錄</span>
            ) : (
              <>{data.hueDef.nameZH} {data.hueDef.nameEN} ({data.hueDef.angle}°)</>
            )}
          </div>
          <div className="text-sm lg:text-base text-theme-text-main break-words">
            {data.feedback}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Toast;
