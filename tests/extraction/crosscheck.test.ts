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
      lineIndex: 0,
      bbox: { x0: 10, y0: 10, x1: 50, y1: 50 },
      normalizedBbox: { x: 0.01, y: 0.01, w: 0.04, h: 0.04 },
    }));

  const highConfidenceTesseract: TesseractResult = {
    text: sampleOcrText,
    words: sampleWords,
    lines: [],
    imageDimensions: { width: 1000, height: 1000 },
    pageConfidence: 92,
  };

  const lowConfidenceTesseract: TesseractResult = {
    text: "blurry noisy illegible scan",
    words: [
      {
        text: "blurry",
        confidence: 35,
        lineIndex: 0,
        bbox: { x0: 0, y0: 0, x1: 10, y1: 10 },
        normalizedBbox: { x: 0, y: 0, w: 0.01, h: 0.01 },
      },
    ],
    lines: [],
    imageDimensions: { width: 1000, height: 1000 },
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

  describe("6. Position-Aware Verification (Multi-Drug Spatial Isolation)", () => {
    // Document with two different drugs on two separate lines
    const multiDrugOcr: TesseractResult = {
      text: "Line 1: Metformin 500mg PO Daily\nLine 2: Atenolol 50mg PO Daily",
      lines: [
        {
          text: "Metformin 500mg PO Daily",
          lineIndex: 0,
          bbox: { x0: 10, y0: 10, x1: 200, y1: 30 },
          normalizedBbox: { x: 0.01, y: 0.01, w: 0.2, h: 0.03 },
          words: [
            { text: "Metformin", lineIndex: 0, confidence: 95, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 }, normalizedBbox: { x: 0.01, y: 0.01, w: 0.05, h: 0.03 } },
            { text: "500mg", lineIndex: 0, confidence: 95, bbox: { x0: 65, y0: 10, x1: 100, y1: 30 }, normalizedBbox: { x: 0.065, y: 0.01, w: 0.035, h: 0.03 } },
            { text: "PO", lineIndex: 0, confidence: 95, bbox: { x0: 105, y0: 10, x1: 120, y1: 30 }, normalizedBbox: { x: 0.105, y: 0.01, w: 0.015, h: 0.03 } },
            { text: "Daily", lineIndex: 0, confidence: 95, bbox: { x0: 125, y0: 10, x1: 160, y1: 30 }, normalizedBbox: { x: 0.125, y: 0.01, w: 0.035, h: 0.03 } },
          ],
        },
        {
          text: "Atenolol 50mg PO Daily",
          lineIndex: 1,
          bbox: { x0: 10, y0: 40, x1: 200, y1: 60 },
          normalizedBbox: { x: 0.01, y: 0.04, w: 0.2, h: 0.03 },
          words: [
            { text: "Atenolol", lineIndex: 1, confidence: 95, bbox: { x0: 10, y0: 40, x1: 60, y1: 60 }, normalizedBbox: { x: 0.01, y: 0.04, w: 0.05, h: 0.03 } },
            { text: "50mg", lineIndex: 1, confidence: 95, bbox: { x0: 65, y0: 40, x1: 95, y1: 60 }, normalizedBbox: { x: 0.065, y: 0.04, w: 0.03, h: 0.03 } },
            { text: "PO", lineIndex: 1, confidence: 95, bbox: { x0: 100, y0: 40, x1: 115, y1: 60 }, normalizedBbox: { x: 0.1, y: 0.04, w: 0.015, h: 0.03 } },
            { text: "Daily", lineIndex: 1, confidence: 95, bbox: { x0: 120, y0: 40, x1: 155, y1: 60 }, normalizedBbox: { x: 0.12, y: 0.04, w: 0.035, h: 0.03 } },
          ],
        },
      ],
      words: [
        { text: "Metformin", lineIndex: 0, confidence: 95, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 }, normalizedBbox: { x: 0.01, y: 0.01, w: 0.05, h: 0.03 } },
        { text: "500mg", lineIndex: 0, confidence: 95, bbox: { x0: 65, y0: 10, x1: 100, y1: 30 }, normalizedBbox: { x: 0.065, y: 0.01, w: 0.035, h: 0.03 } },
        { text: "PO", lineIndex: 0, confidence: 95, bbox: { x0: 105, y0: 10, x1: 120, y1: 30 }, normalizedBbox: { x: 0.105, y: 0.01, w: 0.015, h: 0.03 } },
        { text: "Daily", lineIndex: 0, confidence: 95, bbox: { x0: 125, y0: 10, x1: 160, y1: 30 }, normalizedBbox: { x: 0.125, y: 0.01, w: 0.035, h: 0.03 } },
        { text: "Atenolol", lineIndex: 1, confidence: 95, bbox: { x0: 10, y0: 40, x1: 60, y1: 60 }, normalizedBbox: { x: 0.01, y: 0.04, w: 0.05, h: 0.03 } },
        { text: "50mg", lineIndex: 1, confidence: 95, bbox: { x0: 65, y0: 40, x1: 95, y1: 60 }, normalizedBbox: { x: 0.065, y: 0.04, w: 0.03, h: 0.03 } },
        { text: "PO", lineIndex: 1, confidence: 95, bbox: { x0: 100, y0: 40, x1: 115, y1: 60 }, normalizedBbox: { x: 0.1, y: 0.04, w: 0.015, h: 0.03 } },
        { text: "Daily", lineIndex: 1, confidence: 95, bbox: { x0: 120, y0: 40, x1: 155, y1: 60 }, normalizedBbox: { x: 0.12, y: 0.04, w: 0.035, h: 0.03 } },
      ],
      imageDimensions: { width: 1000, height: 1000 },
      pageConfidence: 95,
    };

    it("position-aware: flags 'disagree' when dose belongs to another line next to a different drug", () => {
      // Metformin is on line 1 with 500mg.
      // Atenolol is on line 2 with 50mg.
      // Gemini erroneously extracts 'Metformin 50mg' (50 is on the page, but belongs to Atenolol).
      const wrongDoseItem = {
        category: "medication",
        value: "Metformin 50mg PO Daily",
        quote: "Metformin 50mg PO Daily",
      };

      const result = crossCheckItem(wrongDoseItem, multiDrugOcr);
      expect(result.state).toBe("disagree");
      expect(result.missingTokens).toContain("50");
      expect(result.reviewReason).toContain("OCR disagreement: 50");
    });

    it("position-aware: confirms 'agree' when correct dose matches on the same line", () => {
      const correctItem = {
        category: "medication",
        value: "Metformin 500mg PO Daily",
        quote: "Metformin 500mg PO Daily",
      };

      const result = crossCheckItem(correctItem, multiDrugOcr);
      expect(result.state).toBe("agree");
      expect(result.matchedTokens).toContain("500");
    });
  });

  describe("7. Bounding Box Locator", () => {
    const ocrWithBoxes: TesseractResult = {
      text: "Osteoarthritis of Knee\nMeloxicam 15mg PO Daily",
      lines: [
        {
          text: "Osteoarthritis of Knee",
          lineIndex: 0,
          bbox: { x0: 100, y0: 100, x1: 300, y1: 140 },
          normalizedBbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.04 },
          words: [
            { text: "Osteoarthritis", lineIndex: 0, confidence: 95, bbox: { x0: 100, y0: 100, x1: 200, y1: 140 }, normalizedBbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.04 } },
            { text: "of", lineIndex: 0, confidence: 95, bbox: { x0: 205, y0: 100, x1: 225, y1: 140 }, normalizedBbox: { x: 0.205, y: 0.1, w: 0.02, h: 0.04 } },
            { text: "Knee", lineIndex: 0, confidence: 95, bbox: { x0: 230, y0: 100, x1: 290, y1: 140 }, normalizedBbox: { x: 0.23, y: 0.1, w: 0.06, h: 0.04 } },
          ],
        },
      ],
      words: [
        { text: "Osteoarthritis", lineIndex: 0, confidence: 95, bbox: { x0: 100, y0: 100, x1: 200, y1: 140 }, normalizedBbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.04 } },
        { text: "of", lineIndex: 0, confidence: 95, bbox: { x0: 205, y0: 100, x1: 225, y1: 140 }, normalizedBbox: { x: 0.205, y: 0.1, w: 0.02, h: 0.04 } },
        { text: "Knee", lineIndex: 0, confidence: 95, bbox: { x0: 230, y0: 100, x1: 290, y1: 140 }, normalizedBbox: { x: 0.23, y: 0.1, w: 0.06, h: 0.04 } },
      ],
      imageDimensions: { width: 1000, height: 1000 },
      pageConfidence: 95,
    };

    it("locates bounding box for verbatim quote and returns normalized 0-1 coordinates", () => {
      const item = {
        category: "condition",
        value: "Osteoarthritis of Knee",
        quote: "Osteoarthritis of Knee",
      };

      const result = crossCheckItem(item, ocrWithBoxes);
      expect(result.boundingBoxes).not.toBeNull();
      expect(result.boundingBoxes).toHaveLength(1);

      const box = result.boundingBoxes![0];
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x).toBeLessThan(1);
      expect(box.w).toBeGreaterThan(0);
      expect(box.w).toBeLessThan(1);
    });

    it("returns null when quote text does not exist on page (never guesses)", () => {
      const item = {
        category: "condition",
        value: "Rheumatoid Arthritis",
        quote: "Rheumatoid Arthritis with severe joint deformity",
      };

      const result = crossCheckItem(item, ocrWithBoxes);
      expect(result.boundingBoxes).toBeNull();
    });
  });

  describe("8. Route-Level Pipeline Fault Injection", () => {
    it("simulates full extraction pipeline: verifies item arrives with status 'needs_review' and review_reason", () => {
      // Simulating a real Gemini page extraction with an injected dose error
      const mockExtraction = {
        items: [
          {
            category: "medication" as const,
            value: "Meloxicam 150mg PO Daily", // FAULT INJECTED: 15mg -> 150mg
            quote: "Meloxicam 150mg PO Daily",
            confidence: 0.95,
            page_no: 1,
            normalization_source: "none" as const,
          },
        ],
        ocr_text: "Meloxicam 150mg PO Daily",
      };

      // Tesseract second reading of the actual physical document: reads 15mg
      const mockTesseract: TesseractResult = {
        text: "Christian Medical College (CMC)\nDischarge Medications:\nMeloxicam 15mg PO Daily",
        lines: [
          {
            text: "Meloxicam 15mg PO Daily",
            lineIndex: 0,
            bbox: { x0: 10, y0: 10, x1: 200, y1: 30 },
            normalizedBbox: { x: 0.01, y: 0.01, w: 0.2, h: 0.03 },
            words: [
              { text: "Meloxicam", lineIndex: 0, confidence: 95, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 }, normalizedBbox: { x: 0.01, y: 0.01, w: 0.05, h: 0.03 } },
              { text: "15mg", lineIndex: 0, confidence: 95, bbox: { x0: 65, y0: 10, x1: 100, y1: 30 }, normalizedBbox: { x: 0.065, y: 0.01, w: 0.035, h: 0.03 } },
            ],
          },
        ],
        words: [
          { text: "Meloxicam", lineIndex: 0, confidence: 95, bbox: { x0: 10, y0: 10, x1: 60, y1: 30 }, normalizedBbox: { x: 0.01, y: 0.01, w: 0.05, h: 0.03 } },
          { text: "15mg", lineIndex: 0, confidence: 95, bbox: { x0: 65, y0: 10, x1: 100, y1: 30 }, normalizedBbox: { x: 0.065, y: 0.01, w: 0.035, h: 0.03 } },
        ],
        imageDimensions: { width: 1000, height: 1000 },
        pageConfidence: 94,
      };

      // Pipeline execution:
      const check = crossCheckItem(mockExtraction.items[0], mockTesseract);

      // Verify pipeline flags the fault
      expect(check.state).toBe("disagree");
      expect(check.missingTokens).toContain("150");

      // Verify the row payload formatted for database insert
      const itemStatus = check.state === "disagree" ? "needs_review" : "extracted";
      const reviewReason = check.reviewReason;

      expect(itemStatus).toBe("needs_review");
      expect(reviewReason).toBe("OCR disagreement: 150");
      expect(check.ocrCheckPayload.state).toBe("disagree");
    });
  });
});
