import React, { useEffect, useRef, useState, useCallback } from "react";
import { GrainGradient } from "@paper-design/shaders-react";
import { OklchColor } from "../types";
import { generateShaderPalette } from "../utils";

interface AnimatedBackgroundProps {
  targetColor: OklchColor;
  width?: number | string;
  height?: number | string;
}

// Helper to lerp between two numbers
const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

// Helper to lerp between two OKLCH colors
const lerpColor = (start: OklchColor, end: OklchColor, t: number): OklchColor => {
  // Handle hue interpolation (shortest path around the color wheel)
  let dH = end.h - start.h;
  if (dH > 180) dH -= 360;
  if (dH < -180) dH += 360;
  
  return {
    l: lerp(start.l, end.l, t),
    c: lerp(start.c, end.c, t),
    h: (start.h + dH * t + 360) % 360
  };
};

// Easing function for smoother animation (easeOutCubic)
const easeOutCubic = (x: number): number => {
  return 1 - Math.pow(1 - x, 3);
};

// Animation config
const ANIMATION_CONFIG = {
  WASH_DURATION: 150, // ms
  HOLD_DURATION_INITIAL: 1000, // ms (剛進站時 State B 維持的時間)
  HOLD_DURATION_NORMAL: 50, // ms (後續換顏色時 State B 幾乎不停留，馬上進入餘波)
  SETTLE_DURATION: 1600, // ms
  SPEED_NORMAL: 3,
  SPEED_FAST: 12,
  SPREAD_NORMAL: 1,
  SPREAD_FAST: 3.6, // State B 要誇張對比
  SOFTNESS_NORMAL: 0.05,
  SOFTNESS_FAST: 0.5, // State B 拉高 softness 消除色階斷層
};

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  targetColor,
  width,
  height
}) => {
  // We store the actual color and spread being rendered
  const [renderColor, setRenderColor] = useState<OklchColor>(targetColor);
  const [speed, setSpeed] = useState<number>(ANIMATION_CONFIG.SPEED_FAST);
  const [spread, setSpread] = useState<number>(ANIMATION_CONFIG.SPREAD_FAST);
  const [softness, setSoftness] = useState<number>(ANIMATION_CONFIG.SOFTNESS_FAST);
  
  // For WebGL Context Loss recovery
  const [shaderKey, setShaderKey] = useState(0);
  const lastHiddenTimeRef = useRef(0);

  // Refs to keep track of animation state without triggering re-renders
  const animationRef = useRef<number>();
  const currentColorRef = useRef<OklchColor>(targetColor);
  const currentSpeedRef = useRef<number>(ANIMATION_CONFIG.SPEED_FAST);
  const currentSpreadRef = useRef<number>(ANIMATION_CONFIG.SPREAD_FAST);
  const currentSoftnessRef = useRef<number>(ANIMATION_CONFIG.SOFTNESS_FAST);
  
  const targetColorRef = useRef<OklchColor>(targetColor);
  
  const phaseRef = useRef<'idle' | 'washing' | 'holding' | 'settling'>('idle');
  const phaseStartTimeRef = useRef<number>(0);
  const phaseStartColorRef = useRef<OklchColor>(targetColor);
  const phaseStartSpeedRef = useRef<number>(ANIMATION_CONFIG.SPEED_FAST);
  const phaseStartSpreadRef = useRef<number>(ANIMATION_CONFIG.SPREAD_FAST);
  const phaseStartSoftnessRef = useRef<number>(ANIMATION_CONFIG.SOFTNESS_FAST);
  const currentHoldDurationRef = useRef<number>(ANIMATION_CONFIG.HOLD_DURATION_INITIAL);
  
  const gameLoop = useCallback((timestamp: number) => {
    let isAnimating = false;
    
    if (phaseRef.current === 'washing') {
      isAnimating = true;
      if (phaseStartTimeRef.current === 0) phaseStartTimeRef.current = timestamp;
      
      const elapsed = timestamp - phaseStartTimeRef.current;
      const progress = Math.min(elapsed / ANIMATION_CONFIG.WASH_DURATION, 1);
      const eased = easeOutCubic(progress);
      
      currentColorRef.current = lerpColor(phaseStartColorRef.current, targetColorRef.current, eased);
      currentSpeedRef.current = lerp(phaseStartSpeedRef.current, ANIMATION_CONFIG.SPEED_FAST, eased);
      currentSpreadRef.current = lerp(phaseStartSpreadRef.current, ANIMATION_CONFIG.SPREAD_FAST, eased);
      currentSoftnessRef.current = lerp(phaseStartSoftnessRef.current, ANIMATION_CONFIG.SOFTNESS_FAST, eased);
      
      if (progress >= 1) {
        phaseRef.current = 'holding';
        phaseStartTimeRef.current = timestamp;
        phaseStartColorRef.current = { ...currentColorRef.current };
        phaseStartSpeedRef.current = currentSpeedRef.current;
        phaseStartSpreadRef.current = currentSpreadRef.current;
        phaseStartSoftnessRef.current = currentSoftnessRef.current;
      }
    } else if (phaseRef.current === 'holding') {
      isAnimating = true;
      if (phaseStartTimeRef.current === 0) phaseStartTimeRef.current = timestamp;
      
      const elapsed = timestamp - phaseStartTimeRef.current;
      
      // 在 holding 階段，我們確保顏色和速度維持在 State B 的巔峰狀態
      currentColorRef.current = targetColorRef.current;
      currentSpeedRef.current = ANIMATION_CONFIG.SPEED_FAST;
      currentSpreadRef.current = ANIMATION_CONFIG.SPREAD_FAST;
      currentSoftnessRef.current = ANIMATION_CONFIG.SOFTNESS_FAST;
      
      if (elapsed >= currentHoldDurationRef.current) {
        phaseRef.current = 'settling';
        phaseStartTimeRef.current = timestamp;
        phaseStartColorRef.current = { ...currentColorRef.current };
        phaseStartSpeedRef.current = currentSpeedRef.current;
        phaseStartSpreadRef.current = currentSpreadRef.current;
        phaseStartSoftnessRef.current = currentSoftnessRef.current;
      }
    } else if (phaseRef.current === 'settling') {
      isAnimating = true;
      if (phaseStartTimeRef.current === 0) phaseStartTimeRef.current = timestamp;
      
      const elapsed = timestamp - phaseStartTimeRef.current;
      const progress = Math.min(elapsed / ANIMATION_CONFIG.SETTLE_DURATION, 1);
      const eased = easeOutCubic(progress);
      
      currentColorRef.current = lerpColor(phaseStartColorRef.current, targetColorRef.current, eased);
      currentSpeedRef.current = lerp(phaseStartSpeedRef.current, ANIMATION_CONFIG.SPEED_NORMAL, eased);
      currentSpreadRef.current = lerp(phaseStartSpreadRef.current, ANIMATION_CONFIG.SPREAD_NORMAL, eased);
      currentSoftnessRef.current = lerp(phaseStartSoftnessRef.current, ANIMATION_CONFIG.SOFTNESS_NORMAL, eased);
      
      if (progress >= 1) {
        phaseRef.current = 'idle';
      }
    }
    
    // Update React state
    setRenderColor(currentColorRef.current);
    setSpeed(currentSpeedRef.current);
    setSpread(currentSpreadRef.current);
    setSoftness(currentSoftnessRef.current);
    
    if (isAnimating) {
      animationRef.current = requestAnimationFrame(gameLoop);
    } else {
      animationRef.current = undefined; // Sleep
    }
  }, []);

  // 1. Initial Mount Animation (State B -> State C)
  // This runs once on mount (and remount in Strict Mode), guaranteeing the settling animation plays.
  useEffect(() => {
    currentHoldDurationRef.current = ANIMATION_CONFIG.HOLD_DURATION_INITIAL;
    phaseRef.current = 'holding'; // 一進站先進入 holding 階段，維持 State B 一陣子
    phaseStartTimeRef.current = 0;
    
    phaseStartColorRef.current = { ...targetColorRef.current };
    phaseStartSpeedRef.current = ANIMATION_CONFIG.SPEED_FAST;
    phaseStartSpreadRef.current = ANIMATION_CONFIG.SPREAD_FAST;
    phaseStartSoftnessRef.current = ANIMATION_CONFIG.SOFTNESS_FAST;
    
    currentColorRef.current = { ...targetColorRef.current };
    currentSpeedRef.current = ANIMATION_CONFIG.SPEED_FAST;
    currentSpreadRef.current = ANIMATION_CONFIG.SPREAD_FAST;
    currentSoftnessRef.current = ANIMATION_CONFIG.SOFTNESS_FAST;
    
    if (!animationRef.current) {
      animationRef.current = requestAnimationFrame(gameLoop);
    }
  }, [gameLoop]);

  // 2. Color Change Animation (State A -> State B -> State C)
  // This ONLY cares about targetColor changing.
  useEffect(() => {
    if (
      targetColorRef.current.l === targetColor.l &&
      targetColorRef.current.c === targetColor.c &&
      targetColorRef.current.h === targetColor.h
    ) {
      return;
    }

    targetColorRef.current = targetColor;
    currentHoldDurationRef.current = ANIMATION_CONFIG.HOLD_DURATION_NORMAL;
    
    // Start WASH phase
    phaseRef.current = 'washing';
    phaseStartTimeRef.current = 0;
    
    phaseStartColorRef.current = { ...currentColorRef.current };
    phaseStartSpeedRef.current = currentSpeedRef.current;
    phaseStartSpreadRef.current = currentSpreadRef.current;
    phaseStartSoftnessRef.current = currentSoftnessRef.current;
    
    // Wake up the loop if it's sleeping
    if (!animationRef.current) {
      animationRef.current = requestAnimationFrame(gameLoop);
    }
  }, [targetColor, gameLoop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, []);

  // WebGL Context Loss Recovery & Background Pause
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenTimeRef.current = Date.now();
        // Pause animation to save battery
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = undefined;
        }
      } else if (document.visibilityState === "visible") {
        const timeGone = Date.now() - lastHiddenTimeRef.current;
        
        // If hidden for more than 5 seconds, force recreate the WebGL context
        // This prevents the "white screen" issue on mobile browsers
        if (timeGone > 5000) {
          setShaderKey(k => k + 1);
        }
        
        // Wake up the animation loop if it was animating
        if (phaseRef.current !== 'idle' && !animationRef.current) {
          phaseStartTimeRef.current = 0; // Reset start time to continue smoothly
          animationRef.current = requestAnimationFrame(gameLoop);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [gameLoop]);

  // Generate the 5 hex colors for the current renderColor and spread
  const { shaderColors, shaderBack } = generateShaderPalette(renderColor, spread);

  return (
    <GrainGradient
      key={shaderKey}
      width={width ?? "100%"}
      height={height ?? "100%"}
      fit="cover"
      colors={shaderColors}
      colorBack={shaderBack}
      softness={softness}
      intensity={2}
      noise={0}
      shape="wave"
      speed={speed}
      scale={1}
      offsetX={0}
      offsetY={0}
    />
  );
};
