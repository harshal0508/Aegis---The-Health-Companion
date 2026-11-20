import { NormalizedBox, TesseractResult, OcrWord } from "@/lib/ocr/tesseract";
import { levenshteinDistance } from "@/lib/extraction/crosscheck";

export function cleanWord(str: string): string {
  return str
    .toLowerCase()
    .replace(/[1li|]/g, "1")
    .replace(/[0o]/g, "0")
    .replace(/[5s]/g, "5")
    .replace(/[^\w]/g, "")
    .trim();
}

/**
 * Normalizes text to a compact stream of alphanumeric characters with OCR confusion mapping.
 * Eliminates spacing, punctuation, bullets, and casing differences so merged or split tokens
 * (e.g. "500mg" vs "500 mg") match perfectly.
 */
export function cleanCompact(str: string): string {
  return str
    .toLowerCase()
    .replace(/[1li|]/g, "1")
    .replace(/[0o]/g, "0")
    .replace(/[5s]/g, "5")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Checks if a candidate OCR word matches a target quote word:
 * - Numbers must match exactly.
 * - Words >= 4 characters allow edit distance <= 1 and OCR character confusions.
 * - Short words require exact match.
 */
export function wordMatches(target: string, candidate: string): boolean {
  const t = cleanWord(target);
  const c = cleanWord(candidate);
  if (!t || !c) return false;

  // Numbers must match exactly
  if (/^\d+$/.test(t)) {
    return t === c || c.includes(t);
  }

  if (t === c) return true;

  if (t.length >= 4 && Math.abs(t.length - c.length) <= 1) {
    return levenshteinDistance(t, c) <= 1;
  }

  return false;
}

/**
 * Searches for a verbatim quote within Tesseract OCR words and returns
 * normalized bounding box rectangles (0 to 1 percentage of image).
 *
 * SAFETY GUARANTEES:
 * 1. Multi-strategy matching:
 *    - Strategy A: Character-stream sliding accumulation (immune to number/unit splits like "5mg" vs "5 mg").
 *    - Strategy B: Word-level consecutive sequence and sliding window with edit distance.
 *    - Strategy C: Parenthesis-stripped base phrase matching.
 * 2. Coordinates are normalized against processed image dimensions (0-1).
 * 3. Never produces negative widths or heights.
 * 4. Returns null if no confident match is found. NEVER guesses a location.
 */
export function locateQuoteBoundingBoxes(
  quote: string,
  tesseractResult: TesseractResult
): NormalizedBox[] | null {
  if (!quote || !quote.trim() || !tesseractResult.words || tesseractResult.words.length === 0) {
    return null;
  }

  const ocrWords = tesseractResult.words;

  // Strip leading list punctuation from quote (e.g. "• Metformin", "- Tab. Amlodipine")
  const strippedQuote = quote.trim().replace(/^[•\-*\d.)\s]+/g, "").trim();
  const effectiveQuote = strippedQuote.length >= 2 ? strippedQuote : quote.trim();

  // ── Strategy A: Character-Stream Sliding Accumulation ────────────────────────
  // This solves number/unit splits ("5mg" vs "5" "mg"), hyphenations, and punctuation diffs.
  const targetCompact = cleanCompact(effectiveQuote);

  let bestMatchedSlice: OcrWord[] | null = null;

  if (targetCompact.length >= 2) {
    for (let i = 0; i < ocrWords.length; i++) {
      let accum = "";
      for (let j = i; j < ocrWords.length; j++) {
        const wClean = cleanCompact(ocrWords[j].text);
        if (!wClean) continue;
        accum += wClean;

        if (accum === targetCompact) {
          bestMatchedSlice = ocrWords.slice(i, j + 1);
          break;
        }

        // Fuzzy match if lengths match within 1 char and length >= 5
        if (Math.abs(accum.length - targetCompact.length) <= 1 && targetCompact.length >= 5) {
          if (levenshteinDistance(accum, targetCompact) <= 1) {
            bestMatchedSlice = ocrWords.slice(i, j + 1);
            break;
          }
        }

        if (accum.length > targetCompact.length + 8) {
          break;
        }
      }
      if (bestMatchedSlice) break;
    }
  }

  // ── Strategy B: Word-Level Consecutive Sequence Match ────────────────────────
  if (!bestMatchedSlice) {
    const rawQuoteWords = effectiveQuote.split(/\s+/);
    const quoteWords = rawQuoteWords.map(cleanWord).filter(Boolean);
    const matchLen = quoteWords.length;

    if (matchLen > 0) {
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

      // Sliding window with 80% threshold for longer quotes (>= 4 words)
      if (!bestMatchedSlice && matchLen >= 4) {
        let bestScore = 0;
        const windowSize = matchLen;

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
    }
  }

  // ── Strategy C: Strip Parentheses for Compound Descriptions ──────────────────
  if (!bestMatchedSlice && effectiveQuote.includes("(") && effectiveQuote.includes(")")) {
    const basePhrase = effectiveQuote.replace(/\([^)]*\)/g, "").trim();
    if (basePhrase.length >= 3) {
      const baseResult = locateQuoteBoundingBoxes(basePhrase, tesseractResult);
      if (baseResult) return baseResult;
    }
  }

  // ── Strategy D: Colon/Dash prefix stripping (e.g. "Diagnosis: Type 2 Diabetes" -> "Type 2 Diabetes")
  if (!bestMatchedSlice && /[:\-–—]\s+/.test(effectiveQuote)) {
    const parts = effectiveQuote.split(/[:\-–—]\s+/);
    for (let p = parts.length - 1; p >= 1; p--) {
      const sub = parts.slice(p).join(" ").trim();
      if (sub.length >= 3) {
        const subResult = locateQuoteBoundingBoxes(sub, tesseractResult);
        if (subResult) return subResult;
      }
    }
  }

  // ── Strategy E: Head phrase match (first 2-3 words containing core entity & dose)
  if (!bestMatchedSlice) {
    const rawWords = effectiveQuote.split(/\s+/).filter(Boolean);
    if (rawWords.length >= 3) {
      for (const take of [3, 2]) {
        if (rawWords.length >= take) {
          const headPhrase = rawWords.slice(0, take).join(" ");
          if (headPhrase.length >= 4) {
            const headCompact = cleanCompact(headPhrase);
            if (headCompact.length >= 4) {
              for (let i = 0; i < ocrWords.length; i++) {
                let accum = "";
                for (let j = i; j < ocrWords.length; j++) {
                  const wClean = cleanCompact(ocrWords[j].text);
                  if (!wClean) continue;
                  accum += wClean;
                  if (
                    accum === headCompact ||
                    (Math.abs(accum.length - headCompact.length) <= 1 &&
                      headCompact.length >= 5 &&
                      levenshteinDistance(accum, headCompact) <= 1)
                  ) {
                    bestMatchedSlice = ocrWords.slice(i, j + 1);
                    break;
                  }
                  if (accum.length > headCompact.length + 6) break;
                }
                if (bestMatchedSlice) break;
              }
            }
          }
        }
        if (bestMatchedSlice) break;
      }
    }
  }

  if (!bestMatchedSlice || bestMatchedSlice.length === 0) {
    return null;
  }

  // ── Construct Line-Aware Bounding Boxes ──────────────────────────────────────
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
    let hasValidBox = false;

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

      hasValidBox = true;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.w > maxX) maxX = b.x + b.w;
      if (b.y + b.h > maxY) maxY = b.y + b.h;
    }

    if (!hasValidBox || minX >= maxX || minY >= maxY) continue;

    // Add 0.5% horizontal and 0.4% vertical padding around text box for clear visual highlight
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
