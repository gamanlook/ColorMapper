
import { HUES, MAX_CHROMA, PREFIXES, SEMANTIC_SPECS } from './constants';
import { ColorEntry, OklchColor } from './types';

// Generate a CSS string
export const toCss = (color: OklchColor): string => {
  return `oklch(${color.l * 100}% ${color.c} ${color.h})`;
};

// --- GAMUT & CONVERSION LOGIC ---

// Convert OKLch -> OKLab -> Linear sRGB to check gamut
export const oklchToLinearSrgb = (l: number, c: number, h: number): [number, number, number] => {
  const hRad = h * (Math.PI / 180);
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const blue = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  return [r, g, blue];
};

// Convert OKLch to Hex string (for AI reference & UI Display)
// NOTE: This uses "Clipping" method (maintains Hue/Chroma numbers but clips RGB).
// Good for text, but can cause hue shifts or posterization in gradients.
export const oklchToHex = (l: number, c: number, h: number): string => {
  const [rLin, gLin, bLin] = oklchToLinearSrgb(l, c, h);

  // Helper: Gamma correction for sRGB (Linear -> sRGB)
  const toSrgb = (val: number) => {
    const x = Math.max(0, Math.min(1, val)); // Clamp 0-1
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  };

  const r = Math.round(toSrgb(rLin) * 255);
  const g = Math.round(toSrgb(gLin) * 255);
  const b = Math.round(toSrgb(bLin) * 255);

  const toHex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Check if an OKLch color is within the sRGB gamut
export const inGamut = (l: number, c: number, h: number): boolean => {
  const EPS = -0.0001;
  const MAX = 1.0001;
  const [r, g, b] = oklchToLinearSrgb(l, c, h);
  return r >= EPS && r <= MAX && g >= EPS && g <= MAX && b >= EPS && b <= MAX;
};

// Binary search to find the maximum Chroma for a given Lightness and Hue
export const findMaxChroma = (l: number, h: number): number => {
  if (l <= 0.001 || l >= 0.999) return 0;
  let low = 0;
  let high = 0.4;
  let mid = 0;

  for (let i = 0; i < 15; i++) {
    mid = (low + high) / 2;
    if (inGamut(l, mid, h)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
};

// ✨ NEW: Convert OKLch to Hex using Gamut Mapping (Chroma Reduction)
// This preserves Lightness and Hue by reducing Chroma until it fits sRGB.
// Essential for Shaders/Gradients to prevent clipping artifacts (posterization).
export const oklchToGamutHex = (l: number, c: number, h: number): string => {
  // 1. Check if valid
  if (inGamut(l, c, h)) {
    return oklchToHex(l, c, h);
  }
  // 2. If out of gamut, find the limitC (max chroma) for this L/H
  const limitC = findMaxChroma(l, h);
  // 3. Use the safe chroma to generate Hex
  return oklchToHex(l, limitC, h);
};

// Helper to find the Lightness that allows the absolute maximum chroma for a hue
export const findPeakLightnessForHue = (h: number): { l: number, maxC: number } => {
  let peakL = 0.5;
  let absMaxC = 0;
  for (let l = 0.1; l <= 0.95; l += 0.05) {
    const c = findMaxChroma(l, h);
    if (c > absMaxC) {
      absMaxC = c;
      peakL = l;
    }
  }
  return { l: peakL, maxC: absMaxC };
}

// 全面採用「投點法 (Rejection Sampling)」
// 讓所有區域的顏色分佈都符合面積比例，避免「卡在邊緣」或「奇怪的髒色」。
export const generateRandomColor = (hueAngle: number): OklchColor => {
  const mode = Math.random();
  let l: number, c: number;
  let isValid = false;
  let tryCount = 0;
  const MAX_TRIES = 200;

  // 輔助函式：投點邏輯
  const trySample = (minL: number, maxL: number, minC: number, maxC: number) => {
    // 1. 在矩形範圍內隨機投點
    const randL = minL + Math.random() * (maxL - minL);
    const randC = minC + Math.random() * (maxC - minC);
    // 2. 檢查是否落在 sRGB 形狀內
    const limitC = findMaxChroma(randL, hueAngle);
    if (randC <= limitC) {
      return { l: randL, c: randC, success: true };
    }
    return { l: randL, c: randC, success: false }; // 失敗，重投
  };

  // --- MODE 1: PALE / WHITE / HIGH KEY ---
  // 亮色區：想稍微多一點 (14%)
  // L: 0.85 ~ 0.99 (很亮)
  // C: 0.00 ~ 0.27 (極限)
  if (mode < 0.14) {
    while (!isValid && tryCount < MAX_TRIES) {
      const res = trySample(0.85, 0.99, 0.00, 0.27);
      if (res.success) { l = res.l; c = res.c; isValid = true; }
      tryCount++;
    }
    if (!isValid) { l = 0.95; c = 0.02; } // Fallback
  }
  // --- MODE 2: DARK / SHADOWS ---
  // 深色區：想稍微少一點，避免一直出髒色 (6%)
  // L: 0.05 ~ 0.30 (很暗)
  // C: 0.00 ~ 0.18 (極限)
  else if (mode < 0.20) {
    while (!isValid && tryCount < MAX_TRIES) {
      const res = trySample(0.05, 0.30, 0.00, 0.18);
      if (res.success) { l = res.l; c = res.c; isValid = true; }
      tryCount++;
    }
    if (!isValid) { l = 0.15; c = 0.02; } // Fallback
  }

  // --- MODE 3: GRAY / MUTED ---
  // 灰色區：中等機率 (35%)
  // L: 0.22 ~ 0.92 (深到亮)
  // C: 0.00 ~ 0.15 (灰到霧)
  else if (mode < 0.55) {
    while (!isValid && tryCount < MAX_TRIES) {
      const res = trySample(0.22, 0.92, 0.00, 0.15);
      if (res.success) { l = res.l; c = res.c; isValid = true; }
      tryCount++;
    }
    if (!isValid) { l = 0.60; c = 0.06; } // Fallback
  }

  // --- MODE 4: STANDARD / VIVID ---
  // 鮮豔/一般區：主力題目 (45%)
  // L: 0.20 ~ 0.98 (避開極暗，因會出現高亮且飽和的黃綠，需拉到0.98)
  // C: 0.06 ~ 0.32 (避開灰，往高飽和投)
  else {
    while (!isValid && tryCount < MAX_TRIES) {
      // 這裡 Chroma 上限給到 0.32 其實很大(超出 sRGB 很多)，
      // 但透過投點法，它會自動貼合 sRGB 的邊緣形狀，而不會死死卡在邊緣。
      const res = trySample(0.20, 0.98, 0.06, 0.32);
      if (res.success) { l = res.l; c = res.c; isValid = true; }
      tryCount++;
    }
    if (!isValid) { l = 0.60; c = 0.10; } // Fallback
  }

  // 回傳結果
  return { l: l!, c: c!, h: hueAngle };
};

// --- SEMANTIC PREFIX LOGIC ---

export const suggestPrefixes = (color: OklchColor): string[] => {
  const { l, c } = color;

  // Use the centralized SEMANTIC_SPECS from constants.ts
  const weightedResults = SEMANTIC_SPECS.map(item => {
    const dL = item.l - l;
    const dC = (item.c - c) * 2.5; // Weight chroma differences more heavily
    const distance = Math.sqrt(dL * dL + dC * dC);
    return { ...item, distance };
  });

  // Sort by nearest distance
  weightedResults.sort((a, b) => a.distance - b.distance);

  // Return top 6 distinct prefixes
  return weightedResults.slice(0, 6).map(item => item.prefix);
};

// Generate seed data with strictly in-gamut colors and GEOMETRY-AWARE distribution
export const generateSeedData = (): ColorEntry[] => {
  const entries: ColorEntry[] = [];
  HUES.forEach(hue => {
    const { l: peakL, maxC: peakMaxC } = findPeakLightnessForHue(hue.angle);

    const addRelativeCluster = (count: number, targetL: number, lSpread: number, chromaFactor: number, cSpread: number, prefix: string) => {
      for(let i=0; i<count; i++) {
        let l = targetL + (Math.random() - 0.5) * lSpread;
        l = Math.max(0.05, Math.min(0.95, l));

        const boundaryC = findMaxChroma(l, hue.angle);
        let targetC = boundaryC * chromaFactor;
        let finalC = targetC + (Math.random() - 0.5) * (boundaryC * cSpread);
        finalC = Math.max(0, Math.min(boundaryC - 0.001, finalC));

        const name = `${prefix}${hue.nameZH}`;
        entries.push(createFakeEntry(hue.angle, l, finalC, name, prefix));
      }
    };

    // 1. PEAK / TIP CLUSTER
    let tipPrefix = '正';
    if (peakL >= 0.88) tipPrefix = '螢光';
    else if (peakL >= 0.80) tipPrefix = '亮';
    else if (peakL <= 0.35) tipPrefix = '濃';
    else if (peakMaxC > 0.28) tipPrefix = '豔';
    else if (peakMaxC > 0.22) tipPrefix = '鮮';
    else tipPrefix = '正';
    addRelativeCluster(2, peakL, 0.05, 0.9, 0.05, tipPrefix);

    // 2. LIGHT (淺)
    const lightL = peakL + (0.98 - peakL) * 0.5;
    addRelativeCluster(2, lightL, 0.05, 0.4, 0.1, '淺');

    // 3. DEEP (深)
    const deepL = peakL * 0.5;
    addRelativeCluster(2, deepL, 0.05, 0.5, 0.1, '深');

    // 4. MIST (霧)
    addRelativeCluster(2, peakL, 0.1, 0.20, 0.05, '霧');

  });

  return entries;
};

const createFakeEntry = (h: number, l: number, c: number, name: string, prefix: string): ColorEntry => {
  return {
    id: Math.random().toString(36).substr(2, 9),
    color: { h, l, c },
    name,
    votes: 1,
    isSuspicious: false,
    timestamp: Date.now(),
    isSeed: true
  }
}

// Helper: Linear Map (Clamped)
const mapRange = (value: number, inMin: number, inMax: number, outMin: number, outMax: number) => {
  if (value <= inMin) return outMin;
  if (value >= inMax) return outMax;
  const percentage = (value - inMin) / (inMax - inMin);
  return outMin + percentage * (outMax - outMin);
};

// 產生 Shader Palette 需要的顏色組
// 使用ToGamut，不使用clip，而是用同亮度的極限C取代
// 使用動態亮度，越亮的題目不需要太大的對比，越暗的題目需要強化對比
export const generateShaderPalette = (color: OklchColor): { shaderColors: string[], shaderBack: string } => {
  
  // Dynamic Contrast Configuration
  const SHADER_PARAMS = {
    LOW_L_LIMIT: 0.05,
    HIGH_L_LIMIT: 0.88,
    // Darker: 深色題目(L5%)要更多加深、更多反光，淺色題目(L88%)要更少陰影感、更少提亮
    DARKER_OFFSET: { MAX: 0.0385, MIN: 0.014 },
    LIGHTER_OFFSET: { MAX: 0.0375, MIN: 0.012 }
  };

  // 計算動態 Offset
  const dynamicDarkerOffset = mapRange(
    color.l, 
    SHADER_PARAMS.LOW_L_LIMIT, 
    SHADER_PARAMS.HIGH_L_LIMIT, 
    SHADER_PARAMS.DARKER_OFFSET.MAX, 
    SHADER_PARAMS.DARKER_OFFSET.MIN
  );

  const dynamicLighterOffset = mapRange(
    color.l, 
    SHADER_PARAMS.LOW_L_LIMIT, 
    SHADER_PARAMS.HIGH_L_LIMIT, 
    SHADER_PARAMS.LIGHTER_OFFSET.MAX, 
    SHADER_PARAMS.LIGHTER_OFFSET.MIN
  );

  // 基礎色 (baseHex)
  const baseHex = oklchToGamutHex(color.l, color.c, color.h);

  // 最暗 (darkestHex) - 使用 Offset * 2
  const darkestL = Math.max(0, Math.min(0.9999, color.l - dynamicDarkerOffset * 2));
  const darkestC = Math.max(0, color.c + 0.0056);
  const darkestHex = oklchToGamutHex(darkestL, darkestC, color.h);

  // 暗一點、濃一點 (darkerHex) - 使用 Offset * 1
  const darkerL = Math.max(0, Math.min(0.9999, color.l - dynamicDarkerOffset));
  const darkerC = Math.max(0, color.c + 0.0028);
  const darkerHex = oklchToGamutHex(darkerL, darkerC, color.h);

  // 亮一點 (lighterHex) - 使用 Offset * 1
  const lighterL = Math.max(0, Math.min(0.9999, color.l + dynamicLighterOffset));
  const lighterC = Math.max(0, color.c - 0.0012);
  const lighterHex = oklchToGamutHex(lighterL, lighterC, color.h);

  // 最亮 (lightestHex) - 使用 Offset * 2
  const lightestL = Math.max(0, Math.min(0.9999, color.l + dynamicLighterOffset * 2));
  const lightestC = Math.max(0, color.c - 0.0032);
  const lightestHex = oklchToGamutHex(lightestL, lightestC, color.h);

  return {
    // 順序: 亮到暗，背景是最上方的顏色 (lightestHex)
    shaderColors: [lighterHex, baseHex, darkerHex, darkestHex],
    shaderBack: lightestHex
  };
};
