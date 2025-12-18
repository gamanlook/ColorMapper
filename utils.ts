import { HUES, MAX_CHROMA, PREFIXES, SEMANTIC_SPECS } from './constants';
import { ColorEntry, OklchColor } from './types';

// Generate a CSS string
export const toCss = (color: OklchColor): string => {
  // Use percentage for Lightness, number for Chroma, deg for Hue
  return `oklch(${color.l * 100}% ${color.c} ${color.h})`;
};

// --- GAMUT & CONVERSION LOGIC ---

// Convert OKLch -> OKLab -> Linear sRGB to check gamut
// Formulas based on CSS Color Module Level 4 / OKLab specification
export const oklchToLinearSrgb = (l: number, c: number, h: number): [number, number, number] => {
  // 1. OKLch to OKLab
  // h is in degrees
  const hRad = h * (Math.PI / 180);
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // 2. OKLab to Linear sRGB
  // First convert to Linear LMS
  // l_ = L + 0.3963377774 * a + 0.2158037573 * b
  // m_ = L - 0.1055613458 * a - 0.0638541728 * b
  // s_ = L - 0.0894841775 * a - 1.2914855480 * b
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  // Cube the LMS coordinates to get linear LMS
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  // Linear LMS to Linear sRGB
  const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const blue = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  return [r, g, blue];
};

// Check if an OKLch color is within the sRGB gamut
export const inGamut = (l: number, c: number, h: number): boolean => {
  // We use a small epsilon tolerance
  const EPS = -0.0001;
  const MAX = 1.0001;
  const [r, g, b] = oklchToLinearSrgb(l, c, h);
  return r >= EPS && r <= MAX && g >= EPS && g <= MAX && b >= EPS && b <= MAX;
};

// Binary search to find the maximum Chroma for a given Lightness and Hue within sRGB
export const findMaxChroma = (l: number, h: number): number => {
  if (l <= 0.001 || l >= 0.999) return 0;
  
  let low = 0;
  let high = 0.4; // OKLch chroma rarely exceeds 0.33 for sRGB
  let mid = 0;

  // 10 iterations is usually enough precision for visual plotting
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

// Helper to find the Lightness that allows the absolute maximum chroma for a hue (The "Elbow")
export const findPeakLightnessForHue = (h: number): { l: number, maxC: number } => {
  let peakL = 0.5;
  let absMaxC = 0;
  // Scan L from 0.1 to 0.9
  for (let l = 0.1; l <= 0.95; l += 0.05) {
    const c = findMaxChroma(l, h);
    if (c > absMaxC) {
      absMaxC = c;
      peakL = l;
    }
  }
  return { l: peakL, maxC: absMaxC };
}

// Generate a random valid OKLch color within a specific hue slice, strictly inside sRGB
export const generateRandomColor = (hueAngle: number): OklchColor => {
  const mode = Math.random();
  let l: number, c: number;

  // --- MODE 1: PALE / WHITE / HIGH KEY (12% chance) ---
  if (mode < 0.12) {
    // Range: 0.80 ~ 0.99
    l = 0.80 + Math.random() * 0.19; 
    const maxC = findMaxChroma(l, hueAngle);
    // Bias towards very low chroma for "Pastel/White" feel
    c = Math.random() * maxC * 0.8; 
  } 
  
  // --- MODE 2: DARK / BLACK / LOW KEY (8% chance) ---
  // Threshold: 0.12 -> 0.20 (Width: 0.08)
  else if (mode < 0.20) {
     // Range: 0.08 ~ 0.30
     l = 0.08 + Math.random() * 0.22;
     const maxC = findMaxChroma(l, hueAngle);
     c = Math.random() * maxC;
  }

  // --- MODE 3: GRAY / MUTED (20% chance) ---
  // Threshold: 0.20 -> 0.40 (Width: 0.20)
  else if (mode < 0.40) {
    l = 0.20 + Math.random() * 0.70; // 0.20 to 0.90
    
    // Range: 0.01 ~ 0.12 (Morandi/Dusty colors)
    const maxC = findMaxChroma(l, hueAngle);
    // 0.01 + 0.11 = 0.12 max
    const targetC = 0.01 + Math.random() * 0.11; 
    
    // Clamp to ensure it's in gamut (though 0.12 is usually safe)
    c = Math.min(targetC, maxC);
  }

  // --- MODE 4: STANDARD / VIVID (60% chance) ---
  // Threshold: 0.40 -> 1.00 (Width: 0.60)
  // This covers the main body of the color space (L: 0.20 ~ 0.90)
  else {
    // 1. Pick a random Lightness (bias slightly towards middle-ish)
    l = 0.20 + Math.random() * 0.70; 
    
    // 2. Find accurate max Chroma for this L and H
    const maxC = findMaxChroma(l, hueAngle);
    
    // 3. Pick random Chroma
    // - Uses uniform distribution to allow equal probability of medium vs high saturation.
    // - Safe Floor of 0.12 to avoid overlap with Muted/Gray mode.
    const minSafeC = 0.12;

    if (maxC < minSafeC) {
      // If the max possible chroma is already very low (rare, e.g. extremely dark/light), just take the max
      c = maxC * 0.95; 
    } else {
      // Uniformly distribute between [0.12] and [Max]
      c = minSafeC + Math.random() * (maxC - minSafeC);
    }
  }

  return { l, c, h: hueAngle };
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
// Target: ~4 clusters per hue, ~2 seeds per cluster.
export const generateSeedData = (): ColorEntry[] => {
  const entries: ColorEntry[] = [];
  
  HUES.forEach(hue => {
    // 1. Analyze the Gamut Shape for this Hue
    const { l: peakL, maxC: peakMaxC } = findPeakLightnessForHue(hue.angle);

    // Helper to add points relative to the Hue's specific geometry
    // relativeL: 0=Black, 0.5=Peak, 1.0=White (Mapped non-linearly to fit the shape)
    // chromaFactor: percentage of the Max Chroma *at that specific generated L*
    const addRelativeCluster = (count: number, targetL: number, lSpread: number, chromaFactor: number, cSpread: number, prefix: string) => {
      for(let i=0; i<count; i++) {
        
        // Jitter L
        let l = targetL + (Math.random() - 0.5) * lSpread;
        // Clamp L to safe visible range
        l = Math.max(0.05, Math.min(0.95, l));

        // Find visual boundary for this specific L
        const boundaryC = findMaxChroma(l, hue.angle);
        
        // Calculate Target Chroma based on the boundary
        // If chromaFactor is 0.9, we want 90% of the way to the edge
        let targetC = boundaryC * chromaFactor;
        
        // Jitter C (but don't exceed boundary)
        let finalC = targetC + (Math.random() - 0.5) * (boundaryC * cSpread);
        
        // Safety clamp: Ensure we are strictly inside, but allow getting close to edge
        finalC = Math.max(0, Math.min(boundaryC - 0.001, finalC));

        const name = `${prefix}${hue.nameZH}`;
        entries.push(createFakeEntry(hue.angle, l, finalC, name, prefix));
      }
    };

    // --- STRATEGY: 4 Specific Clusters ---

    // 1. PEAK / TIP CLUSTER (Variable Prefix)
    // Determine prefix based on the actual L and C capability of this hue
    let tipPrefix = '正';
    if (peakL >= 0.88) tipPrefix = '螢光'; // Very high L (like Yellow)
    else if (peakL >= 0.80) tipPrefix = '亮'; // High L
    else if (peakL <= 0.35) tipPrefix = '濃'; // Low L (like Blue)
    else if (peakMaxC > 0.28) tipPrefix = '艷'; // Very high C
    else if (peakMaxC > 0.22) tipPrefix = '鮮'; // High C
    else tipPrefix = '正'; // Standard
    
    // Place at the Peak Lightness, High Saturation (90% of max)
    addRelativeCluster(2, peakL, 0.05, 0.9, 0.05, tipPrefix);

    // 2. LIGHT (淺)
    // Place roughly halfway between Peak and White
    const lightL = peakL + (0.98 - peakL) * 0.5;
    addRelativeCluster(2, lightL, 0.05, 0.4, 0.1, '淺');

    // 3. DEEP (深)
    // Place roughly halfway between Peak and Black
    const deepL = peakL * 0.5; 
    addRelativeCluster(2, deepL, 0.05, 0.5, 0.1, '深');

    // 4. MIST (霧)
    // Place at Peak Lightness but Low Chroma (20% of max)
    addRelativeCluster(2, peakL, 0.1, 0.20, 0.05, '霧');

  });

  return entries;
};

const createFakeEntry = (h: number, l: number, c: number, name: string, prefix: string): ColorEntry => {
  return {
    id: Math.random().toString(36).substr(2, 9),
    color: { h, l, c },
    name,
    prefix,
    votes: 1,
    isSuspicious: false,
    timestamp: Date.now(),
    isSeed: true // Mark as seed
  }
}