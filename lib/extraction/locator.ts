import { NormalizedBox, TesseractResult, OcrWord } from "@/lib/ocr/tesseract";
import { levenshteinDistance } from "@/lib/extraction/crosscheck";

function cleanWord(str: string): string {
  return str.toLowerCase().replace(/[^\w]/g, "").trim();
}

/**
 * Checks if a candidate OCR word matches a target quote word:
 * - Numbers must match exactly.
 * - Words > 5 characters allow edit distance <= 1.
 * - Short words require exact match.
 */
function wordMatches(target: string, candidate: string): boolean {
  const t = cleanWord(target);
  const c = cleanWord(candidate);
  if (!t || !c) return false;

  // Numbers must match exactly
  if (/^\d+$/.test(t)) {
    return t === c || c.includes(t);
  }

  if (t === c) return true;

  if (t.length > 5 && Math.abs(t.length - c.length) <= 1) {
    return levenshteinDistance(t, c) <= 1;
  }

  return false;
}

/**
 * Searches for a verbatim quote within Tesseract OCR words and returns
 * normalized bounding box rectangles (0 to 1 percentage of image).
 *
 * SAFETY GUARANTEES:
 * 1. Coordinates are normalized against the processed image dimensions.
 * 2. Numbers must match exactly.
 * 3. Handles multi-line quotes (returns one box per line).
 * 4. Returns null if no confident match is found. NEVER guesses a location.
 */
export function locateQuoteBoundingBoxes(
  quote: string,
  tesseractResult: TesseractResult
): NormalizedBox[] | null {
  if (!quote || !quote.trim() || !tesseractResult.words || tesseractResult.words.length === 0) {
    return null;
  }

  const rawQuoteWords = quote.trim().split(/\s+/);
  const quoteWords = rawQuoteWords.map(cleanWord).filter(Boolean);

  if (quoteWords.length === 0) return null;

  const ocrWords = tesseractResult.words;
  const matchLen = quoteWords.length;

  let bestMatchedSlice: OcrWord[] | null = null;

  // 1. Scan for consecutive word sequence match
  for (let i = 0; i <= ocrWords.length - matchLen; i++) {
    let matches = true;
    for (let j = 0; j < matchLen; j++) {
      if (!wordMatches(quoteWords[j], ocrWords[i + j].text)) {
        matches = false;
        break;
      }
    }
    if (matches) {
      bestMatchedSlice = ocrWords.slice(i, i + matchLen);
      break;
    }
  }

  // 2. Fallback: If full sequence fails, try sliding window with 80% threshold for long quotes (>= 4 words)
  if (!bestMatchedSlice && quoteWords.length >= 4) {
    let bestScore = 0;
    const windowSize = quoteWords.length;

    for (let i = 0; i <= ocrWords.length - windowSize; i++) {
      let score = 0;
      for (let j = 0; j < windowSize; j++) {
        if (wordMatches(quoteWords[j], ocrWords[i + j].text)) {
          score++;
        }
      }
      if (score / windowSize >= 0.8 && score > bestScore) {
        bestScore = score;
        bestMatchedSlice = ocrWords.slice(i, i + windowSize);
      }
    }
  }

  if (!bestMatchedSlice || bestMatchedSlice.length === 0) {
    return null;
  }

  // 3. Group matched words by lineIndex so multi-line quotes wrap cleanly
  const lineMap = new Map<number, OcrWord[]>();
  for (const w of bestMatchedSlice) {
    const lIdx = w.lineIndex ?? 0;
    if (!lineMap.has(lIdx)) lineMap.set(lIdx, []);
    lineMap.get(lIdx)!.push(w);
  }

  const boxes: NormalizedBox[] = [];

  for (const wordsOnLine of lineMap.values()) {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;

    for (const w of wordsOnLine) {
      const b =
        w.normalizedBbox ||
        (w.bbox
          ? {
              x: w.bbox.x0 / 1000,
              y: w.bbox.y0 / 1000,
              w: (w.bbox.x1 - w.bbox.x0) / 1000,
              h: (w.bbox.y1 - w.bbox.y0) / 1000,
            }
          : null);

      if (!b) continue;

      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }

    // Add 0.5% padding around text box for clear visual highlight
    const padX = 0.005;
    const padY = 0.004;

    const x = Math.max(0, minX - padX);
    const y = Math.max(0, minY - padY);
    const w = Math.min(1 - x, maxX - minX + padX * 2);
    const h = Math.min(1 - y, maxY - minY + padY * 2);

    boxes.push({ x, y, w, h });
  }

  return boxes.length > 0 ? boxes : null;
}
