import { describe, it, expect } from "vitest";
import {
  crossCheckItem,
  extractCriticalTokens,
  isTokenInOcr,
  levenshteinDistance,
} from "@/lib/extraction/crosscheck";
import { TesseractResult } from "@/lib/ocr/tesseract";

describe("Phase 3 Second-Reader OCR Cross-Check", () => {
  const sampleOcrText = `
    Christian Medical College (CMC)
    DISCHARGE SUMMARY
    Patient: Vikram Reddy
    Diagnosis: Osteoarthritis of Knee (ICD-10: M17.9)
    Discharge Medications:
    • Meloxicam 15mg PO Daily
    • Metformin 500mg PO Daily
    • Ibuprofen 800mg PO TID PRN
    Allergies: No Known Drug Allergies (NKDA).
  `;

  const sampleWords = sampleOcrText
    .split(/\s+/)
    .map((w) => ({
      text: w,
      confidence: 90,
      bbox: { x0: 10, y0: 10, x1: 50, y1: 50 },
    }));

  const highConfidenceTesseract: TesseractResult = {
    text: sampleOcrText,
    words: sampleWords,
    pageConfidence: 92,
  };

  const lowConfidenceTesseract: TesseractResult = {
    text: "blurry noisy illegible scan",
    words: [{ text: "blurry", confidence: 35, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } }],
    pageConfidence: 42, // Below threshold 60
  };

  describe("1. Critical Token Extraction", () => {
    it("extracts exact dose numbers, units, and drug names from medication", () => {
      const tokens = extractCriticalTokens({
        category: "medication",
        value: "Metformin 500mg PO Daily",
      });

      const tokenStrings = tokens.map((t) => t.token);
      expect(tokenStrings).toContain("500");
      expect(tokenStrings).toContain("mg");
      expect(tokenStrings).toContain("metformin");

      const numToken = tokens.find((t) => t.token === "500");
      expect(numToken?.isNumber).toBe(true);

      const drugToken = tokens.find((t) => t.token === "metformin");
      expect(drugToken?.isNumber).toBe(false);
    });

    it("extracts NKDA allergen concept for negative allergy statements", () => {
      const tokens = extractCriticalTokens({
        category: "allergy",
        value: "No Known Drug Allergies (NKDA)",
      });
      expect(tokens.map((t) => t.token)).toContain("nkda");
    });

    it("extracts specific allergen name for true allergies", () => {
      const tokens = extractCriticalTokens({
        category: "allergy",
        value: "Penicillin allergy",
      });
      expect(tokens.map((t) => t.token)).toContain("penicillin");
    });
  });

  describe("2. Fault Injection Tests (Dose Mismatch Detection)", () => {
    it("returns 'agree' when Gemini extraction matches the independent OCR reading", () => {
      const correctItem = {
        category: "medication",
        value: "Metformin 500mg PO Daily",
        quote: "Metformin 500mg PO Daily",
      };

      const result = crossCheckItem(correctItem, highConfidenceTesseract);
      expect(result.state).toBe("agree");
      expect(result.missingTokens).toHaveLength(0);
      expect(result.matchedTokens).toContain("500");
      expect(result.matchedTokens).toContain("metformin");
    });

    it("fault injection: flags 'disagree' when a correct 500mg dose is deliberately mutated to 50mg", () => {
      const mutatedItem = {
        category: "medication",
        value: "Metformin 50mg PO Daily", // FAULT INJECTED: 500 -> 50
        quote: "Metformin 50mg PO Daily",
      };

      const result = crossCheckItem(mutatedItem, highConfidenceTesseract);
      expect(result.state).toBe("disagree");
      expect(result.missingTokens).toContain("50");
      expect(result.reviewReason).toContain("OCR disagreement: 50");
    });

    it("fault injection: flags 'disagree' when a correct 15mg dose is mutated to 150mg", () => {
      const mutatedItem = {
        category: "medication",
        value: "Meloxicam 150mg PO Daily", // FAULT INJECTED: 15 -> 150
        quote: "Meloxicam 150mg PO Daily",
      };

      const result = crossCheckItem(mutatedItem, highConfidenceTesseract);
      expect(result.state).toBe("disagree");
      expect(result.missingTokens).toContain("150");
      expect(result.reviewReason).toContain("OCR disagreement: 150");
    });
  });

  describe("3. Strict Number Matching vs. Word Fuzzy Matching", () => {
    it("prohibits fuzzy matching on numbers: '500' vs '50' has edit distance 1 but must NEVER match", () => {
      expect(levenshteinDistance("500", "50")).toBe(1);

      const ocrWords = ["metformin", "500mg", "500", "daily"];
      const ocrText = "metformin 500mg daily";

      const wrongToken = {
        token: "50",
        isNumber: true,
        type: "dose_number" as const,
      };

      const matches = isTokenInOcr(wrongToken, ocrWords, ocrText);
      expect(matches).toBe(false);
    });

    it("allows edit distance <= 1 on long non-numeric words (> 5 chars)", () => {
      const ocrWords = ["paracetamo1", "650mg"]; // OCR scan typo with 1
      const ocrText = "paracetamo1 650mg";

      const drugToken = {
        token: "paracetamol",
        isNumber: false,
        type: "drug_name" as const,
      };

      const matches = isTokenInOcr(drugToken, ocrWords, ocrText);
      expect(matches).toBe(true);
    });
  });

  describe("4. Low-Confidence / Unavailable State (Safety Guard)", () => {
    it("returns 'unavailable' when page confidence is below threshold, never 'disagree'", () => {
      const item = {
        category: "medication",
        value: "Metformin 500mg PO Daily",
      };

      const result = crossCheckItem(item, lowConfidenceTesseract, {
        confidenceThreshold: 60,
      });

      expect(result.state).toBe("unavailable");
      expect(result.pageConfidence).toBe(42);
      expect(result.reviewReason).toBeUndefined();
    });

    it("never flags an item as 'disagree' when the scan is blurry or illegible", () => {
      const unknownItem = {
        category: "medication",
        value: "Unobtainium 999mg PO Daily",
      };

      const result = crossCheckItem(unknownItem, lowConfidenceTesseract);
      expect(result.state).toBe("unavailable");
      expect(result.state).not.toBe("disagree");
    });
  });

  describe("5. Allergy Cross-Checking", () => {
    it("confirms NKDA when document contains NKDA", () => {
      const item = {
        category: "allergy",
        value: "No Known Drug Allergies, per document",
      };

      const result = crossCheckItem(item, highConfidenceTesseract);
      expect(result.state).toBe("agree");
    });

    it("flags disagreement when allergy is extracted but not on page", () => {
      const inventedAllergy = {
        category: "allergy",
        value: "Penicillin allergy",
      };

      const result = crossCheckItem(inventedAllergy, highConfidenceTesseract);
      expect(result.state).toBe("disagree");
      expect(result.missingTokens).toContain("penicillin");
    });
  });
});
