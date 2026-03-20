/**
 * Client-side multi-crop image processing for AI grading.
 *
 * Takes a card image + bounding box data and generates six crops:
 *   1. Full card view (the detected card area)
 *   2. Four corner crops (15% of card dimensions, at 2x resolution)
 *   3. Surface center crop (center 50%, at 2x resolution)
 *
 * All crops are returned as base64 JPEG strings (no data: prefix).
 */

export interface GradingCrops {
  fullImage: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  surfaceCenter: string;
}

export interface CropBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Load a base64-encoded image into an HTMLImageElement.
 */
function loadImage(base64: string, mimeType: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

/**
 * Extract a region from the source image onto a canvas and return base64 JPEG.
 * outputWidth / outputHeight control the canvas size (for 2x resolution, pass 2x the crop size).
 */
function extractCrop(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  outputWidth: number,
  outputHeight: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

  // toDataURL returns "data:image/jpeg;base64,..." — strip the prefix
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
}

/**
 * Generate all six grading crops from a card image.
 *
 * @param imageBase64 - The raw base64 image data (no data: prefix)
 * @param mimeType    - e.g. "image/jpeg"
 * @param bounds      - Bounding box from detectCardBounds(), or null to use full image
 */
export async function generateGradingCrops(
  imageBase64: string,
  mimeType: string,
  bounds: CropBounds | null,
): Promise<GradingCrops> {
  const img = await loadImage(imageBase64, mimeType);

  // Card region in pixel coordinates
  const cardX = bounds ? Math.round(bounds.x * img.naturalWidth) : 0;
  const cardY = bounds ? Math.round(bounds.y * img.naturalHeight) : 0;
  const cardW = bounds ? Math.round(bounds.width * img.naturalWidth) : img.naturalWidth;
  const cardH = bounds ? Math.round(bounds.height * img.naturalHeight) : img.naturalHeight;

  // Corner crop size: 15% of card dimensions
  const cornerW = Math.round(cardW * 0.15);
  const cornerH = Math.round(cardH * 0.15);

  // Surface center crop: 50% of card dimensions
  const surfaceW = Math.round(cardW * 0.5);
  const surfaceH = Math.round(cardH * 0.5);
  const surfaceX = cardX + Math.round((cardW - surfaceW) / 2);
  const surfaceY = cardY + Math.round((cardH - surfaceH) / 2);

  // Full card (1x resolution, capped at reasonable size)
  const fullMaxDim = 1200;
  const fullScale = Math.min(1, fullMaxDim / Math.max(cardW, cardH));
  const fullOutW = Math.round(cardW * fullScale);
  const fullOutH = Math.round(cardH * fullScale);

  const fullImage = extractCrop(img, cardX, cardY, cardW, cardH, fullOutW, fullOutH);

  // Corner crops at 2x resolution for detail
  const topLeft = extractCrop(img, cardX, cardY, cornerW, cornerH, cornerW * 2, cornerH * 2);
  const topRight = extractCrop(img, cardX + cardW - cornerW, cardY, cornerW, cornerH, cornerW * 2, cornerH * 2);
  const bottomLeft = extractCrop(img, cardX, cardY + cardH - cornerH, cornerW, cornerH, cornerW * 2, cornerH * 2);
  const bottomRight = extractCrop(img, cardX + cardW - cornerW, cardY + cardH - cornerH, cornerW, cornerH, cornerW * 2, cornerH * 2);

  // Surface center at 2x
  const surfaceCenter = extractCrop(img, surfaceX, surfaceY, surfaceW, surfaceH, surfaceW * 2, surfaceH * 2);

  return { fullImage, topLeft, topRight, bottomLeft, bottomRight, surfaceCenter };
}
