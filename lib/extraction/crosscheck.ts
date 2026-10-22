import { TesseractResult, NormalizedBox } from "@/lib/ocr/tesseract";
import { locateQuoteBoundingBoxes } from "@/lib/extraction/locator";

export type OcrCrossCheckState = "agree" | "disagree" | "unavailable";

export interface CriticalToken {
  token: string;
  isNumber: boolean;
  type: "dose_number" | "dose_unit" | "drug_name" | "allergen" | "condition" | "general";
}

export interface OcrCheckPayload {
  state: OcrCrossCheckState;
  page_confidence: number;
  matched_tokens: string[];
  missing_tokens: string[];
  review_reason?: string;
  bounding_boxes?: NormalizedBox[] | null;
}

export interface CrossCheckResult {
  state: OcrCrossCheckState;
  pageConfidence: number;
  criticalTokens: CriticalToken[];
  matchedTokens: string[];
  missingTokens: string[];
  reviewReason?: string;
  boundingBoxes?: NormalizedBox[] | null;
  ocrCheckPayload: OcrCheckPayload;
}

export interface CrossCheckOptions {
  confidenceThreshold?: number; // Default 60. Below this, state is 'unavailable'
}

/**
 * Common OCR character confusion substitution mappings.
 * Applied symmetrically when evaluating character similarity.
 */
const OCR_CONFUSIONS: Record<string, string[]> = {
  "0": ["o"],
  "o": ["0"],
  "1": ["l", "i", "|"],
  "l": ["1", "i", "|"],
  "i": ["1", "l"],
  "5": ["s"],
  "s": ["5"],
  "8": ["b"],
  "b": ["8"],
};

/**
 * Calculates Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[m][n];
}

/**
 * Normalizes text: lowercase, punctuation removed.
 */
export function cleanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks if two non-numeric tokens match allowing common OCR character substitutions.
 */
function matchesWithOcrConfusions(tokenA: string, tokenB: string): boolean {
  if (tokenA === tokenB) return true;
  if (tokenA.length !== tokenB.length) return false;

  for (let i = 0; i < tokenA.length; i++) {
    const charA = tokenA[i];
    const charB = tokenB[i];
    if (charA === charB) continue;

    const allowed = OCR_CONFUSIONS[charA] || [];
    if (!allowed.includes(charB)) {
      return false;
    }
  }

  return true;
}

/**
 * Pulls critical tokens from an extracted item based on its clinical category.
 */
export function extractCriticalTokens(item: {
  category: string;
  value: string;
  quote?: string;
}): CriticalToken[] {
  const tokens: CriticalToken[] = [];
  const textToScan = item.value || item.quote || "";
  const clean = cleanText(textToScan);

  if (item.category === "medication") {
    // 1. Extract numeric doses and units: e.g. "500 mg", "15mg", "800mg"
    const doseRegex = /\b(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|puffs?|tabs?|caps?|drops?|meq|iu|%)\b/gi;
    let match: RegExpExecArray | null;

    const foundDoseStrings: string[] = [];
    while ((match = doseRegex.exec(textToScan)) !== null) {
      foundDoseStrings.push(match[0]);
      // Numbers must match exactly: isNumber = true
      tokens.push({
        token: match[1].toLowerCase(),
        isNumber: true,
        type: "dose_number",
      });
      tokens.push({
        token: match[2].toLowerCase(),
        isNumber: false,
        type: "dose_unit",
      });
    }

    // 2. Extract drug name tokens (strip doses and route/frequency stopwords)
    let drugString = textToScan;
    for (const d of foundDoseStrings) {
      drugString = drugString.replace(d, " ");
    }

    const stopWords = new Set([
      "po", "daily", "bid", "tid", "qid", "prn", "oral", "tablet", "tablets",
      "capsule", "capsules", "injection", "iv", "im", "subcutaneous", "topical",
      "intra", "articular", "intravenous", "suspension", "solution", "syrup",
      "per", "day", "at", "bedtime", "every", "hours", "hrs", "mg", "ml"
    ]);

    const words = cleanText(drugString).split(/\s+/);
    for (const w of words) {
      if (w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w)) {
        tokens.push({
          token: w,
          isNumber: false,
          type: "drug_name",
        });
      }
    }
  } else if (item.category === "allergy") {
    const isNkda =
      clean.includes("no known drug allergies") ||
      clean.includes("no known allergies") ||
      clean.includes("nkda") ||
      clean.includes("nka") ||
      clean.includes("no allergies");

    if (isNkda) {
      // NKDA token concept
      tokens.push({
        token: "nkda",
        isNumber: false,
        type: "allergen",
      });
    } else {
      // Specific allergen tokens (e.g. "Penicillin", "Sulfa", "Aspirin")
      const words = clean.split(/\s+/).filter(
        (w) => w.length >= 3 && !["allergy", "allergies", "adverse", "reaction", "history", "patient"].includes(w)
      );
      for (const w of words) {
        tokens.push({
          token: w,
          isNumber: false,
          type: "allergen",
        });
      }
    }
  } else if (item.category === "condition") {
    // Strip ICD codes
    const noIcd = clean.replace(/\bicd\s*\d*[^)]*\b/gi, "");
    const words = noIcd.split(/\s+/).filter((w) => w.length >= 4);
    for (const w of words) {
      tokens.push({
        token: w,
        isNumber: false,
        type: "condition",
      });
    }
  } else {
    // General categories (surgery, lab, implant)
    const words = clean.split(/\s+/).filter((w) => w.length >= 4);
    for (const w of words.slice(0, 3)) {
      tokens.push({
        token: w,
        isNumber: false,
        type: "general",
      });
    }
  }

  // Deduplicate tokens by token string
  const seen = new Set<string>();
  return tokens.filter((t) => {
    if (seen.has(t.token)) return false;
    seen.add(t.token);
    return true;
  });
}

/**
 * Position-Aware Dose Checking:
 * Verifies that a dose number appears in the local spatial/line window of the drug name.
 * Prevents false-positive agreement when a dose number exists elsewhere on the page
 * next to a completely different drug.
 */
export function isDoseNearDrug(
  doseNumber: string,
  drugTokens: string[],
  tesseractResult: TesseractResult
): boolean {
  const normDose = doseNumber.toLowerCase();

  // 1. Line-Aware Check: Check lines containing the drug name
  if (tesseractResult.lines && tesseractResult.lines.length > 0) {
    let drugFoundInAnyLine = false;

    for (const line of tesseractResult.lines) {
      const cleanLine = cleanText(line.text);
      const hasDrug = drugTokens.some((d) => cleanLine.includes(d));
      if (hasDrug) {
        drugFoundInAnyLine = true;
        // Check if dose number appears as standalone number on this specific line
        const numberRegex = new RegExp(`(?:^|[^0-9.])${normDose}(?:$|[^0-9.])`);
        if (numberRegex.test(cleanLine)) {
          return true;
        }
      }
    }

    // If drug was found on lines, but none of those lines contained this dose number:
    if (drugFoundInAnyLine) {
      return false;
    }
  }

  // 2. Sliding Window Fallback: Check within +/- 8 words of any drug occurrence
  const words = (tesseractResult.words || []).map((w) => cleanText(w.text));
  const drugIndices: number[] = [];

  for (let i = 0; i < words.length; i++) {
    if (drugTokens.some((d) => words[i] === d || words[i].includes(d))) {
      drugIndices.push(i);
    }
  }

  if (drugIndices.length === 0) {
    return false;
  }

  const numberRegex = new RegExp(`(?:^|[^0-9.])${normDose}(?:$|[^0-9.])`);
  for (const idx of drugIndices) {
    const start = Math.max(0, idx - 8);
    const end = Math.min(words.length, idx + 8);
    const windowText = words.slice(start, end).join(" ");
    if (numberRegex.test(windowText)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a specific critical token is supported by Tesseract OCR output.
 *
 * CRITICAL CLINICAL RULES:
 * 1. NUMBERS MUST MATCH EXACTLY.
 *    "500" vs "50" must NEVER pass. Numbers are verified as distinct word tokens or exact numeric substrings.
 * 2. EDIT DISTANCE ON WORDS:
 *    Allow Levenshtein distance <= 1 only on non-numeric words longer than 5 characters.
 * 3. COMMON OCR CONFUSIONS:
 *    Check 0/O, 1/l/I, 5/S for non-numeric words.
 */
export function isTokenInOcr(
  token: CriticalToken,
  ocrWords: string[],
  normalizedOcrText: string
): boolean {
  const target = token.token.toLowerCase();

  // Special NKDA handling: matches either "nkda", "nka", or the phrase "no known ... allerg..."
  if (token.type === "allergen" && target === "nkda") {
    if (normalizedOcrText.includes("nkda") || normalizedOcrText.includes("nka")) {
      return true;
    }
    if (
      normalizedOcrText.includes("no known") &&
      (normalizedOcrText.includes("allerg") || normalizedOcrText.includes("allergy"))
    ) {
      return true;
    }
    if (normalizedOcrText.includes("no allerg")) {
      return true;
    }
    return false;
  }

  // RULE 1: NUMBERS MUST MATCH EXACTLY
  if (token.isNumber) {
    // Regex ensuring exact standalone numeric match surrounded by word boundaries or punctuation
    const numberRegex = new RegExp(`(?:^|[^0-9.])${target}(?:$|[^0-9.])`);
    return numberRegex.test(normalizedOcrText);
  }

  // RULE 2: NON-NUMERIC TOKENS
  // A. Exact substring in normalized text
  if (normalizedOcrText.includes(target)) {
    return true;
  }

  // B. Exact match in word list
  if (ocrWords.includes(target)) {
    return true;
  }

  // C. OCR character confusion match (e.g. "metform1n" -> "metformin")
  for (const word of ocrWords) {
    if (matchesWithOcrConfusions(target, word)) {
      return true;
    }
  }

  // D. Levenshtein edit distance <= 1 for tokens longer than 5 characters
  if (target.length > 5) {
    for (const word of ocrWords) {
      // Fast check: length difference cannot exceed 1
      if (Math.abs(word.length - target.length) <= 1) {
        if (levenshteinDistance(target, word) <= 1) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Cross-checks an extracted clinical item against the independent Tesseract OCR reading.
 * Returns one of:
 * - "agree": all critical tokens verified in second reading (with position-awareness for doses)
 * - "disagree": page confidence adequate, but critical token(s) absent (e.g. dose mismatch)
 * - "unavailable": page confidence below threshold (blur/messy scan); does NOT flag disagreement
 *
 * Also computes normalized bounding boxes (0-1) for UI highlighting.
 */
export function crossCheckItem(
  item: {
    category: string;
    value: string;
    quote?: string;
  },
  tesseractResult: TesseractResult,
  options: CrossCheckOptions = {}
): CrossCheckResult {
  const confidenceThreshold = options.confidenceThreshold ?? 60;
  const pageConfidence = tesseractResult.pageConfidence;

  // 1. Compute bounding boxes for the quote (if quote is present)
  const boundingBoxes = item.quote
    ? locateQuoteBoundingBoxes(item.quote, tesseractResult)
    : null;

  const criticalTokens = extractCriticalTokens(item);

  // State: UNAVAILABLE
  // When Tesseract confidence is low (messy scan, dark photo, handwriting),
  // never penalize with disagreement.
  if (pageConfidence < confidenceThreshold) {
    return {
      state: "unavailable",
      pageConfidence,
      criticalTokens,
      matchedTokens: [],
      missingTokens: [],
      reviewReason: undefined,
      boundingBoxes,
      ocrCheckPayload: {
        state: "unavailable",
        page_confidence: pageConfidence,
        matched_tokens: [],
        missing_tokens: [],
        bounding_boxes: boundingBoxes,
      },
    };
  }

  // If no critical tokens could be identified, default to agree with note
  if (criticalTokens.length === 0) {
    return {
      state: "agree",
      pageConfidence,
      criticalTokens: [],
      matchedTokens: [],
      missingTokens: [],
      boundingBoxes,
      ocrCheckPayload: {
        state: "agree",
        page_confidence: pageConfidence,
        matched_tokens: [],
        missing_tokens: [],
        bounding_boxes: boundingBoxes,
      },
    };
  }

  const normalizedOcrText = cleanText(tesseractResult.text);
  const ocrWords = (tesseractResult.words || []).map((w) => cleanText(w.text)).filter(Boolean);

  const matchedTokens: string[] = [];
  const missingTokens: string[] = [];

  // Extract drug name tokens for position-aware medication checking
  const drugTokens = criticalTokens
    .filter((t) => t.type === "drug_name")
    .map((t) => t.token);

  for (const tokenObj of criticalTokens) {
    // Position-Aware check for medication dose numbers:
    // Must appear on the same line or in the immediate word window of the drug name!
    if (tokenObj.type === "dose_number" && item.category === "medication" && drugTokens.length > 0) {
      const near = isDoseNearDrug(tokenObj.token, drugTokens, tesseractResult);
      if (near) {
        matchedTokens.push(tokenObj.token);
      } else {
        missingTokens.push(tokenObj.token);
      }
      continue;
    }

    if (isTokenInOcr(tokenObj, ocrWords, normalizedOcrText)) {
      matchedTokens.push(tokenObj.token);
    } else {
      missingTokens.push(tokenObj.token);
    }
  }

  if (missingTokens.length === 0) {
    return {
      state: "agree",
      pageConfidence,
      criticalTokens,
      matchedTokens,
      missingTokens: [],
      boundingBoxes,
      ocrCheckPayload: {
        state: "agree",
        page_confidence: pageConfidence,
        matched_tokens: matchedTokens,
        missing_tokens: [],
        bounding_boxes: boundingBoxes,
      },
    };
  }

  // State: DISAGREE
  const reason = `OCR disagreement: ${missingTokens.join(", ")}`;
  return {
    state: "disagree",
    pageConfidence,
    criticalTokens,
    matchedTokens,
    missingTokens,
    reviewReason: reason,
    boundingBoxes,
    ocrCheckPayload: {
      state: "disagree",
      page_confidence: pageConfidence,
      matched_tokens: matchedTokens,
      missing_tokens: missingTokens,
      review_reason: reason,
      bounding_boxes: boundingBoxes,
    },
  };
}
