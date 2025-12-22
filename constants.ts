
import { HueDefinition } from './types';

export const HUES: HueDefinition[] = [
  { angle: 5, id: 'rose', nameEN: 'Rose', nameZH: '玫瑰' },
  { angle: 25, id: 'red', nameEN: 'Red', nameZH: '紅' },
  { angle: 45, id: 'pumpkin', nameEN: 'Pumpkin', nameZH: '柿' },
  { angle: 65, id: 'orange', nameEN: 'Orange', nameZH: '橘' },
  { angle: 85, id: 'gold', nameEN: 'Gold', nameZH: '金' },
  { angle: 105, id: 'yellow', nameEN: 'Yellow', nameZH: '黃' },
  { angle: 125, id: 'lime', nameEN: 'Lime', nameZH: '檸' },
  { angle: 145, id: 'green', nameEN: 'Green', nameZH: '綠' },
  { angle: 165, id: 'mint', nameEN: 'Mint', nameZH: '薄荷' },
  { angle: 185, id: 'teal', nameEN: 'Teal', nameZH: '湖水' },
  { angle: 205, id: 'cyan', nameEN: 'Cyan', nameZH: '青' },
  { angle: 225, id: 'sky', nameEN: 'Sky', nameZH: '天藍' },
  { angle: 245, id: 'blue', nameEN: 'Blue', nameZH: '藍' },
  { angle: 265, id: 'sapphire', nameEN: 'Sapphire', nameZH: '寶藍' },
  { angle: 285, id: 'indigo', nameEN: 'Indigo', nameZH: '靛' },
  { angle: 305, id: 'purple', nameEN: 'Purple', nameZH: '紫' },
  { angle: 325, id: 'magenta', nameEN: 'Magenta', nameZH: '洋紅' },
  { angle: 345, id: 'pink', nameEN: 'Pink', nameZH: '桃' },
];

export const MAX_CHROMA = 0.32; // Visual limit for the chart scaling

// Seed data to populate the map initially (simulating a DB)
export const SEED_DATA_POINTS = 144;

/**
 * SEMANTIC SPECIFICATIONS (Centralized Color Palette)
 * ---------------------------------------------------
 * Define the ideal "Centroids" for each semantic term in OKLch space.
 * 
 * L (Lightness): 0.0 (Black) to 1.0 (White)
 * C (Chroma):    0.0 (Gray)  to ~0.32 (Neon/Max)
 * 
 * Adjust these values to change how the system categorizes colors.
 */
export const SEMANTIC_SPECS = [
  // --- Grayscale / Neutral (Low Chroma) ---
  { prefix: '白', l: 0.96, c: 0.01, desc: 'White' },
  { prefix: '淺灰', l: 0.85, c: 0.015, desc: 'Light Gray' },
  { prefix: '灰', l: 0.60, c: 0.015, desc: 'Gray' },
  { prefix: '深灰', l: 0.35, c: 0.015, desc: 'Dark Gray' },
  { prefix: '暗灰', l: 0.22, c: 0.015, desc: 'Dim Gray' },
  { prefix: '黑', l: 0.10, c: 0.01, desc: 'Black' },

  // --- Low Saturation / Foggy (Chroma 0.02 - 0.08) ---
  { prefix: '淺霧', l: 0.75, c: 0.04, desc: 'Pale Foggy' },
  { prefix: '霧', l: 0.55, c: 0.05, desc: 'Foggy/Muted' },
  { prefix: '深霧', l: 0.35, c: 0.05, desc: 'Deep Foggy' },
  { prefix: '墨', l: 0.15, c: 0.06, desc: 'Ink (Dark & slightly colored)' },

  // --- High Lightness (L > 0.7) ---
  { prefix: '淡', l: 0.90, c: 0.05, desc: 'Pale (P)' },
  { prefix: '淺', l: 0.82, c: 0.10, desc: 'Light (L)' },
  { prefix: '亮', l: 0.85, c: 0.16, desc: 'Bright (B)' },
  { prefix: '螢光', l: 0.88, c: 0.26, desc: 'Fluorescent/Neon' },

  // --- Mid Lightness (L 0.4 - 0.7) ---
  { prefix: '明', l: 0.65, c: 0.12, desc: 'Luminous/Clear' },
  { prefix: '鮮', l: 0.65, c: 0.22, desc: 'Strong (S)' },
  { prefix: '豔', l: 0.60, c: 0.28, desc: 'Vivid (V)' },
  { prefix: '純', l: 0.50, c: 0.30, desc: 'Pure' },
  { prefix: '正', l: 0.50, c: 0.28, desc: 'Standard/Base' },

  // --- Low Lightness (L < 0.5) ---
  { prefix: '濃', l: 0.45, c: 0.22, desc: 'Deep/Rich' },
  { prefix: '深', l: 0.35, c: 0.15, desc: 'Deep (D)' },
  { prefix: '暗', l: 0.25, c: 0.10, desc: 'Dark' },
];

// Automatically extract the list of prefixes from the specs above
export const PREFIXES = SEMANTIC_SPECS.map(s => s.prefix);
