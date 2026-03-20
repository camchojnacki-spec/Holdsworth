export interface PhotoQualityResult {
  overall: "good" | "acceptable" | "poor";
  brightness: { score: number; label: string };
  blur: { score: number; label: string };
  framing: { score: number; label: string };
  suggestions: string[];
}

/**
 * Analyze photo quality entirely client-side using Canvas.
 * Returns brightness, blur, and framing scores with actionable suggestions.
 */
export async function assessPhotoQuality(
  imageDataUrl: string
): Promise<PhotoQualityResult> {
  const img = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  // Work at a smaller size for speed — 400px wide is plenty for quality analysis
  const scale = Math.min(1, 400 / img.width);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  const brightness = analyzeBrightness(pixels);
  const blur = analyzeBlur(pixels, w, h);
  const framing = analyzeFraming(pixels, w, h);

  const suggestions: string[] = [];

  if (brightness.score < 30) {
    suggestions.push("Image is too dark — try better lighting");
  } else if (brightness.score < 50) {
    suggestions.push("Image is a bit dark — more light would help");
  } else if (brightness.score > 90) {
    suggestions.push("Image is overexposed — reduce lighting or avoid flash");
  }

  if (blur.score < 30) {
    suggestions.push("Image appears blurry — hold your phone steady");
  } else if (blur.score < 50) {
    suggestions.push("Image could be sharper — try holding steadier");
  }

  if (framing.score < 30) {
    suggestions.push(
      "Card may not fill enough of the frame — move closer"
    );
  } else if (framing.score < 50) {
    suggestions.push("Try to center the card and fill more of the frame");
  }

  // Determine overall rating
  const scores = [brightness.score, blur.score, framing.score];
  const minScore = Math.min(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  let overall: PhotoQualityResult["overall"];
  if (minScore < 30 || avgScore < 40) {
    overall = "poor";
  } else if (minScore < 50 || avgScore < 60) {
    overall = "acceptable";
  } else {
    overall = "good";
  }

  if (suggestions.length === 0) {
    suggestions.push("Looking good!");
  }

  return { overall, brightness, blur, framing, suggestions };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Convert pixel to grayscale using luminosity formula */
function toGray(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Brightness analysis: compute mean grayscale value.
 * Map to 0-100 score where the ideal range (~100-180 out of 255) scores highest.
 */
function analyzeBrightness(
  pixels: Uint8ClampedArray
): PhotoQualityResult["brightness"] {
  let sum = 0;
  const count = pixels.length / 4;
  for (let i = 0; i < pixels.length; i += 4) {
    sum += toGray(pixels[i], pixels[i + 1], pixels[i + 2]);
  }
  const mean = sum / count; // 0-255

  // Score: peaks around 130, drops at extremes
  let score: number;
  if (mean < 50) {
    score = (mean / 50) * 30; // 0-30 for very dark
  } else if (mean < 80) {
    score = 30 + ((mean - 50) / 30) * 30; // 30-60
  } else if (mean <= 200) {
    score = 60 + ((1 - Math.abs(mean - 140) / 60) * 40); // 60-100 in sweet spot
  } else {
    score = Math.max(10, 60 - ((mean - 200) / 55) * 50); // drops for overexposed
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label: string;
  if (score >= 70) label = "Good";
  else if (score >= 45) label = "Acceptable";
  else label = "Poor";

  return { score, label };
}

/**
 * Blur detection via Laplacian variance approximation.
 * Compute the variance of second-order differences in grayscale.
 * Higher variance = sharper image.
 */
function analyzeBlur(
  pixels: Uint8ClampedArray,
  w: number,
  h: number
): PhotoQualityResult["blur"] {
  // Build grayscale array
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const pi = i * 4;
    gray[i] = toGray(pixels[pi], pixels[pi + 1], pixels[pi + 2]);
  }

  // Laplacian: for each interior pixel, compute L = 4*center - top - bottom - left - right
  let sumLap = 0;
  let sumLap2 = 0;
  let count = 0;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const lap =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - w] -
        gray[idx + w];
      sumLap += lap;
      sumLap2 += lap * lap;
      count++;
    }
  }

  const meanLap = sumLap / count;
  const variance = sumLap2 / count - meanLap * meanLap;

  // Typical variance ranges: <100 = very blurry, 100-500 = okay, >500 = sharp
  // Map to 0-100 score
  let score: number;
  if (variance < 50) {
    score = (variance / 50) * 20;
  } else if (variance < 150) {
    score = 20 + ((variance - 50) / 100) * 30;
  } else if (variance < 500) {
    score = 50 + ((variance - 150) / 350) * 30;
  } else {
    score = 80 + Math.min(20, ((variance - 500) / 1000) * 20);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label: string;
  if (score >= 70) label = "Sharp";
  else if (score >= 45) label = "Acceptable";
  else label = "Blurry";

  return { score, label };
}

/**
 * Framing analysis: check if a card-like object fills a good portion of the image.
 * Heuristic: compare average brightness/color of center 60% vs outer 20% border.
 * A framed card should show a clear difference between the card area and background.
 */
function analyzeFraming(
  pixels: Uint8ClampedArray,
  w: number,
  h: number
): PhotoQualityResult["framing"] {
  let centerSum = 0;
  let centerCount = 0;
  let outerSum = 0;
  let outerCount = 0;

  // Also track color variance in center vs outer to detect edge contrast
  let centerSumSq = 0;
  let outerSumSq = 0;

  const cx1 = Math.round(w * 0.2);
  const cx2 = Math.round(w * 0.8);
  const cy1 = Math.round(h * 0.2);
  const cy2 = Math.round(h * 0.8);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const g = toGray(pixels[idx], pixels[idx + 1], pixels[idx + 2]);

      if (x >= cx1 && x < cx2 && y >= cy1 && y < cy2) {
        centerSum += g;
        centerSumSq += g * g;
        centerCount++;
      } else {
        outerSum += g;
        outerSumSq += g * g;
        outerCount++;
      }
    }
  }

  const centerMean = centerSum / (centerCount || 1);
  const outerMean = outerSum / (outerCount || 1);
  const centerVar = centerSumSq / (centerCount || 1) - centerMean * centerMean;
  const outerVar = outerSumSq / (outerCount || 1) - outerMean * outerMean;

  // Good framing: distinct difference between center and outer regions
  const brightnessDiff = Math.abs(centerMean - outerMean);
  // Also: center should have more detail (higher variance) than background
  const varianceDiff = centerVar - outerVar;

  // Score based on how "distinct" the center is from the border
  let score: number;
  if (brightnessDiff > 40) {
    score = 80 + Math.min(20, brightnessDiff / 5);
  } else if (brightnessDiff > 20) {
    score = 50 + ((brightnessDiff - 20) / 20) * 30;
  } else if (brightnessDiff > 10) {
    score = 30 + ((brightnessDiff - 10) / 10) * 20;
  } else {
    score = (brightnessDiff / 10) * 30;
  }

  // Boost score if center has noticeably more detail
  if (varianceDiff > 200) {
    score = Math.min(100, score + 15);
  } else if (varianceDiff > 50) {
    score = Math.min(100, score + 8);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let label: string;
  if (score >= 70) label = "Good";
  else if (score >= 45) label = "Acceptable";
  else label = "Poor";

  return { score, label };
}
