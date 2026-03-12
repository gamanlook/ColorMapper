import React, { useState, useEffect, useRef, useMemo } from "react";
import { GrainGradient } from "@paper-design/shaders-react";
import { OklchColor, HueDefinition, ColorEntry } from "../types";
import {
  toCss,
  suggestPrefixes,
  oklchToHex,
  generateShaderPalette,
} from "../utils";
import { PREFIXES } from "../constants";
import { validateColorName } from "../services/geminiService";

interface ColorTesterProps {
  color: OklchColor;
  hueDef: HueDefinition;
  onSubmit: (
    name: string,
    isSuspicious: boolean,
    reason?: string,
    feedback?: string,
  ) => void;
  onSkip: () => void;
  showHex: boolean;
  entries?: ColorEntry[];
}

const STANDALONE_ALLOWED = ["白", "淺灰", "灰", "深灰", "暗灰", "黑"];
const MAX_CHARS = 23;

const TEXT_PATH_RADIUS = 44;
const MAX_FONT_PX = 11;
const MIN_FONT_PX = 8;
const MAX_WIDTH_BREAKPOINT = 350;
const MIN_WIDTH_BREAKPOINT = 225;

const KAOMOJI = [
  "(´･ω･` )",
  "(*´･ч･`*)",
  "(*´ㅁ`*)",
  "( ˙꒳˙ )",
  "(  ᐛ  )",
  "( ˙ᗜ˙ )",
];

const INSPIRATIONS = [
  "可以⋯形容詞+顏色",
  "像是⋯水果顏色？",
  "或是⋯彩妝色？",
  "也許是⋯品牌顏色？",
  "或⋯卡通人物配色？",
  "還是⋯大自然顏色？"
];

const CHALLENGE_MESSAGES = [
  "抓到訣竅了！這題交給你自由發揮",
  "很棒！挑戰完全自己發明一個詞吧",
  "看來你很會，這題自己取名看看！"
];

const ColorTester: React.FC<ColorTesterProps> = ({
  color,
  hueDef,
  onSubmit,
  onSkip,
  showHex,
  entries = [],
}) => {
  const [inputName, setInputName] = useState("");
  const [suggestedPrefixesList, setSuggestedPrefixesList] = useState<string[]>(
    [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSkipHint, setShowSkipHint] = useState(false);
  const hasUsedSkipRef = useRef(false);
  const inputNameRef = useRef(inputName);
  const hintTimerExpiredRef = useRef(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [randomOffset, setRandomOffset] = useState(0);
  const [shaderKey, setShaderKey] = useState(0);
  const [isShaderVisible, setIsShaderVisible] = useState(true);
  const lastHiddenTimeRef = useRef(0);

  const [showChallengeChip, setShowChallengeChip] = useState(false);
  const [challengeMessage, setChallengeMessage] = useState(CHALLENGE_MESSAGES[0]);
  const [isInputGlowing, setIsInputGlowing] = useState(false);
  const usedPrefixesRef = useRef<boolean>(false);

  const [placeholderText, setPlaceholderText] = useState("試試替這顏色取名");
  const [isPlaceholderFading, setIsPlaceholderFading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const visualStageRef = useRef<HTMLDivElement>(null);

  const [svgFontSize, setSvgFontSize] = useState(3);
  const [dimensions, setDimensions] = useState({ width: 300, height: 300 });
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;
    let index = 0;

    const startCarousel = () => {
      interval = setInterval(() => {
        setIsPlaceholderFading(true);
        timeout = setTimeout(() => {
          index++;
          if (index % 2 === 0) {
            setPlaceholderText("試試替這顏色取名");
          } else {
            const inspirationIndex = Math.floor(index / 2) % INSPIRATIONS.length;
            setPlaceholderText(`${INSPIRATIONS[inspirationIndex]}`);
          }
          setIsPlaceholderFading(false);
        }, 300); // Wait for fade out
      }, 5000); // Change every 5 seconds
    };

    startCarousel();

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const timeGone = Date.now() - lastHiddenTimeRef.current;
        if (timeGone > 60000) {
          setIsShaderVisible(false);
          setTimeout(() => {
            setShaderKey((k) => k + 1);
            setIsShaderVisible(true);
          }, 200);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    inputNameRef.current = inputName;
    if (inputName) {
      setShowSkipHint(false);
    } else {
      if (hintTimerExpiredRef.current && !hasUsedSkipRef.current) {
        setShowSkipHint(true);
      }
    }
  }, [inputName]);

  useEffect(() => {
    setInputName("");
    inputNameRef.current = "";
    
    // Check if user has been relying too much on prefixes
    // This is a simple heuristic: if they used a prefix in the last turn,
    // there's a 30% chance to show the challenge chip.
    if (usedPrefixesRef.current && Math.random() < 0.3) {
      setShowChallengeChip(true);
      setChallengeMessage(CHALLENGE_MESSAGES[Math.floor(Math.random() * CHALLENGE_MESSAGES.length)]);
      setIsInputGlowing(true);
      setTimeout(() => setIsInputGlowing(false), 2000);
    } else {
      setShowChallengeChip(false);
    }
    usedPrefixesRef.current = false; // Reset for this turn
    
    // Idea 1: Community Answers + Fallback
    const humanEntries = entries.filter(e => !e.isSeed);
    const withDistance = humanEntries.map(e => {
      const dL = e.color.l - color.l;
      const dC = e.color.c - color.c;
      const dH = (e.color.h - color.h) / 360;
      const distance = Math.sqrt(dL*dL + dC*dC + dH*dH);
      return { ...e, distance };
    });
    
    withDistance.sort((a, b) => a.distance - b.distance);
    
    const uniqueNames = new Set<string>();
    const communityAnswers: string[] = [];
    for (const item of withDistance) {
      if (item.distance > 0.15) continue;
      if (!uniqueNames.has(item.name)) {
        uniqueNames.add(item.name);
        communityAnswers.push(item.name);
        if (communityAnswers.length >= 4) break;
      }
    }
    
    const defaultPrefixes = suggestPrefixes(color);
    const combined = [...communityAnswers];
    for (const p of defaultPrefixes) {
      if (combined.length >= 4) break;
      if (!combined.includes(p)) {
        combined.push(p);
      }
    }
    
    setSuggestedPrefixesList(combined);
    
    setShowSkipHint(false);
    hintTimerExpiredRef.current = false;
    setCopyFeedback(null);
    setRandomOffset(Math.random() * 2 - 1);

    const timer = setTimeout(() => {
      hintTimerExpiredRef.current = true;
      if (!inputNameRef.current && !hasUsedSkipRef.current) {
        setShowSkipHint(true);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [color, entries]);

  useEffect(() => {
    if (!visualStageRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const containerWidth = entry.contentRect.width;

        if (containerWidth > 0) {
          setDimensions({ width: containerWidth, height: containerWidth });

          let targetPixelSize = MIN_FONT_PX;

          if (containerWidth >= MAX_WIDTH_BREAKPOINT) {
            targetPixelSize = MAX_FONT_PX;
          } else if (containerWidth <= MIN_WIDTH_BREAKPOINT) {
            targetPixelSize = MIN_FONT_PX;
          } else {
            const percentage =
              (containerWidth - MIN_WIDTH_BREAKPOINT) /
              (MAX_WIDTH_BREAKPOINT - MIN_WIDTH_BREAKPOINT);
            targetPixelSize =
              MIN_FONT_PX + percentage * (MAX_FONT_PX - MIN_FONT_PX);
          }

          const calculatedSvgSize = (targetPixelSize * 100) / containerWidth;
          setSvgFontSize(calculatedSvgSize);
        }
      }
    });

    resizeObserver.observe(visualStageRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const { shaderColors, shaderBack } = useMemo(
    () => generateShaderPalette(color),
    [color],
  );

  const normalizedInput = inputName.replace(/艷/g, "豔");
  const showSuffixHint =
    PREFIXES.includes(normalizedInput) &&
    !STANDALONE_ALLOWED.includes(normalizedInput);

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
    usedPrefixesRef.current = true;
    const currentName = inputName;
    let newName = prefix;
    const existingPrefix = PREFIXES.find((p) => currentName.startsWith(p));
    if (existingPrefix) {
      newName = prefix + currentName.substring(existingPrefix.length);
    } else {
      newName = prefix + currentName;
    }
    if (newName.replace(/\s/g, "").length <= MAX_CHARS) {
      setInputName(newName);
    } else {
      return;
    }
    
    // Check if it's an incomplete prefix
    const isComplete = !PREFIXES.includes(prefix) || STANDALONE_ALLOWED.includes(prefix);
    if (!isComplete) {
      setIsInputGlowing(true);
      setTimeout(() => setIsInputGlowing(false), 1500);
    }
    
    if (textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
      setTimeout(() => {
        if (textareaRef.current) {
          const len = newName.length;
          textareaRef.current.setSelectionRange(len, len);
        }
      }, 0);
      scrollToBottom();
    }
  };

  const handleCustomInputClick = () => {
    setIsInputGlowing(true);
    setTimeout(() => setIsInputGlowing(false), 1500);
    if (textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
    }
    scrollToBottom();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const cleanVal = val.replace(/\n/g, "");
    const nonSpaceCount = cleanVal.replace(/\s/g, "").length;

    if (nonSpaceCount <= MAX_CHARS || cleanVal.length < inputName.length) {
      setInputName(cleanVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const handleSkipClick = () => {
    hasUsedSkipRef.current = true;
    setShowSkipHint(false);
    onSkip();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;

    setIsSubmitting(true);

    let cleanedName = inputName.trim().replace(/艷/g, "豔");
    if (cleanedName.endsWith("色") && cleanedName.length > 1) {
      cleanedName = cleanedName.slice(0, -1);
    }

    const isPrefixOnly =
      PREFIXES.includes(cleanedName) &&
      !STANDALONE_ALLOWED.includes(cleanedName);

    if (isPrefixOnly) {
      onSubmit(
        cleanedName,
        true,
        "PREFIX_ONLY",
        `後面好像少了顏色？試試看：${cleanedName}紅、${cleanedName}藍...`,
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
      const validation = await validateColorName(
        color,
        cleanedName,
        hueDef.nameEN,
      );
      onSubmit(
        cleanedName,
        validation.isSuspicious,
        validation.reason,
        validation.feedback,
      );
    } catch (err) {
      console.error(err);
      onSubmit(cleanedName, false, undefined, "命名已收錄！");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentColorCss = toCss(color);
  const textColorClass = color.l > 0.7 ? "text-black/55" : "text-white/70";
  const hexValue = oklchToHex(color.l, color.c, color.h);

  const baseDisplayText = showHex
    ? hexValue
    : `oklch(${(color.l * 100).toFixed(1)}% ${color.c.toFixed(3)} ${color.h})`;

  const renderedText = copyFeedback || baseDisplayText;
  const hasContent = inputName.trim().length > 0;

  const pathStartX = 50 - TEXT_PATH_RADIUS;
  const pathEndX = 50 + TEXT_PATH_RADIUS;
  const curvePathD = `M ${pathStartX},50 A ${TEXT_PATH_RADIUS},${TEXT_PATH_RADIUS} 0 0,0 ${pathEndX},50`;

  const highlightOpacity =
    color.l >= 0.25
      ? 0
      : color.l <= 0.15
        ? 0.5
        : 0.5 * (1 - (color.l - 0.15) / 0.125);

  const handleCopy = () => {
    if (copyFeedback) return;
    navigator.clipboard.writeText(baseDisplayText);
    const randomKaomoji = KAOMOJI[Math.floor(Math.random() * KAOMOJI.length)];
    setCopyFeedback(`Copied! ${randomKaomoji}`);
    setTimeout(() => {
      setCopyFeedback(null);
    }, 1000);
  };

  return (
    <div className="flex flex-col gap-8 w-full max-w-[448px] mx-auto">
      {/* Visual Stage */}
      <div
        ref={visualStageRef}
        className="w-full aspect-square rounded-full shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] transition-all duration-500 ease-out relative group overflow-hidden"
        style={{ backgroundColor: currentColorCss }}
      >
        {/* Shader Layer */}
        <div className="absolute inset-0 z-0">
          {isShaderVisible && (
            <GrainGradient
              key={shaderKey}
              width={dimensions.width}
              height={dimensions.height}
              colors={shaderColors}
              colorBack={shaderBack}
              softness={0.05}
              intensity={2}
              noise={0}
              shape="wave"
              speed={3}
              scale={1}
              offsetX={randomOffset}
              offsetY={0}
            />
          )}
        </div>

        {/* Highlight Layer */}
        {highlightOpacity > 0 && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none z-10 mix-blend-plus-lighter"
            style={{
              boxShadow: `inset 0 0.3px 1.5px rgba(255, 255, 255, ${highlightOpacity.toFixed(3)})`,
            }}
          ></div>
        )}

        {/* SVG Text Layer */}
        <svg
          viewBox="0 0 100 100"
          className={`absolute inset-0 w-full h-full overflow-visible pointer-events-none ${textColorClass}`}
        >
          <defs>
            <path id="text-curve" d={curvePathD} fill="none" />
          </defs>
          <text
            fontSize={svgFontSize}
            className="font-mono tracking-wider fill-current pointer-events-auto cursor-pointer"
            textAnchor="middle"
            dominantBaseline="middle"
            onClick={handleCopy}
          >
            <textPath href="#text-curve" startOffset="50%">
              {renderedText}
            </textPath>
          </text>
        </svg>
      </div>

      <div className="flex flex-col gap-6">
        {/* Suggested Prefixes or Challenge Chip */}
        <div className="relative min-h-[32px] flex items-center justify-center">
          {showChallengeChip ? (
            <div className="flex items-center gap-3 px-4 py-2 text-xs font-medium bg-white/5 ring-1 ring-inset ring-white/10 text-theme-text-main rounded-full animate-in fade-in slide-in-from-bottom-2 duration-300">
              <span>{challengeMessage}</span>
              <button
                type="button"
                onClick={() => setShowChallengeChip(false)}
                className="w-4 h-4 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                aria-label="Close challenge"
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M 7 7 L 17 17 M 17 7 L 7 17" />
                </svg>
              </button>
            </div>
          ) : (
            <div
              className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar -mx-6 px-6 w-[calc(100%+3rem)] animate-in fade-in duration-300"
              style={{
                WebkitMaskImage: `linear-gradient(to right, transparent, rgba(0,0,0, 0.1) 4px, rgba(0,0,0, 0.4) 10px, rgba(0,0,0, 0.8) 18px, black 24px, black calc(100% - 24px), rgba(0,0,0, 0.8) calc(100% - 18px), rgba(0,0,0, 0.4) calc(100% - 10px), rgba(0,0,0, 0.1) calc(100% - 4px), transparent)`,
                maskImage: `linear-gradient(to right, transparent, rgba(0,0,0, 0.1) 4px, rgba(0,0,0, 0.4) 10px, rgba(0,0,0, 0.8) 18px, black 24px, black calc(100% - 24px), rgba(0,0,0, 0.8) calc(100% - 18px), rgba(0,0,0, 0.4) calc(100% - 10px), rgba(0,0,0, 0.1) calc(100% - 4px), transparent)`,
              }}
            >
              {suggestedPrefixesList.map((prefix) => (
                <button
                  key={prefix}
                  type="button"
                  onClick={() => handlePrefixClick(prefix)}
                  onMouseDown={(e) => e.preventDefault()}
                  className="first:ml-auto whitespace-nowrap flex-shrink-0 px-4 py-2 text-xs font-medium bg-white/5 ring-1 ring-inset ring-white/10 text-theme-text-soft hover:bg-white/10 rounded-full transition-colors"
                >
                  {prefix}
                </button>
              ))}
              <button
                type="button"
                onClick={handleCustomInputClick}
                onMouseDown={(e) => e.preventDefault()}
                className="last:mr-auto whitespace-nowrap flex-shrink-0 px-4 py-2 text-xs font-medium bg-white/5 ring-1 ring-inset ring-white/10 text-theme-text-soft hover:bg-white/10 rounded-full transition-colors"
              >
                或輸入你的創意⋯
              </button>
            </div>
          )}
        </div>

        {/* Input Form */}
        <form ref={formRef} className="scroll-mb-4" onSubmit={handleSubmit}>
          <div 
            className={`flex items-end gap-3 w-full rounded-[1.875rem] ring-1 ring-inset transition-all duration-300 pl-6 pr-2 py-2 focus-within:ring-white/20 ${
              isInputGlowing 
                ? "bg-white/15 ring-white/30 shadow-[0_0_15px_rgba(255,255,255,0.3)]" 
                : "bg-white/10 ring-white/10"
            }`}
          >
            <div className="grid flex-1 min-w-0 relative items-center self-stretch">
              <div
                className="col-start-1 row-start-1 px-0 py-2 text-xl whitespace-pre-wrap break-words invisible-scrollbar pointer-events-none"
                aria-hidden="true"
              >
                <span
                  className={`transition-opacity duration-300 ${inputName ? "text-theme-text-main opacity-100" : `text-theme-text-muted ${isPlaceholderFading ? "opacity-0" : "opacity-100"}`}`}
                >
                  {inputName || placeholderText}
                </span>
                {showSuffixHint && (
                  <span className="text-theme-text-muted text-xl ml-0.5">什麼色？</span>
                )}
                <span className="inline-block w-0">&#8203;</span>
              </div>

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
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                enterKeyHint="send"
                className={`
                  col-start-1 row-start-1 w-full h-full
                  px-0 py-2 text-xl font-normal
                  bg-transparent border-none outline-none
                  resize-none overflow-hidden
                  text-transparent caret-white
                  whitespace-pre-wrap break-words
                `}
              />
            </div>

            <button
              type={hasContent ? "submit" : "button"}
              onClick={hasContent ? undefined : handleSkipClick}
              disabled={isSubmitting}
              className={`
                flex-none p-3 rounded-full
                flex items-center justify-center transition-[background-color,box-shadow,opacity] duration-300 ease-out
                ${hasContent ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]" : "bg-white/10 text-theme-text-soft hover:bg-white/20"}
                disabled:opacity-30 disabled:cursor-not-allowed
              `}
            >
              {isSubmitting ? (
                <svg
                  className="animate-spin w-5 h-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : hasContent ? (
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="5 11 12 4 19 11" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M 20 12 A 8 8 0 1 1 15.17718 4.65796 M 13 1.15 L 16 4.15 L 13 7.15" />
                  </svg>
                  <span
                    className={`
                       overflow-hidden whitespace-nowrap text-[0.9375rem]/4
                       transition-[max-width,opacity,margin-left] duration-500 ease-in-out
                       ${
                         showSkipHint && !inputName
                           ? "max-w-[4em] opacity-100 ml-0.5"
                           : "max-w-0 opacity-0 ml-0"
                       }
                     `}
                  >
                    略過
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


export default ColorTester;
