import { describe, it, expect } from "vitest";
import { locateQuoteBoundingBoxes } from "@/lib/extraction/locator";
import type { TesseractResult } from "@/lib/ocr/tesseract";

describe("locateQuoteBoundingBoxes", () => {
  const dummyResult: TesseractResult = {
    text: "Fortis Escorts Heart Institute\nDISCHARGE SUMMARY\nPatient presented with Acute Bronchitis.\nPrescribed Tab. Amoxicillin 500mg TDS.",
    words: [
      {
        text: "Fortis",
        bbox: { x0: 50, y0: 50, x1: 150, y1: 80 },
        normalizedBbox: { x: 0.05, y: 0.05, w: 0.1, h: 0.03 },
        confidence: 95,
        lineIndex: 0,
      },
      {
        text: "Escorts",
        bbox: { x0: 160, y0: 50, x1: 260, y1: 80 },
        normalizedBbox: { x: 0.16, y: 0.05, w: 0.1, h: 0.03 },
        confidence: 95,
        lineIndex: 0,
      },
      {
        text: "Patient",
        bbox: { x0: 50, y0: 100, x1: 120, y1: 130 },
        normalizedBbox: { x: 0.05, y: 0.1, w: 0.07, h: 0.03 },
        confidence: 95,
        lineIndex: 1,
      },
      {
        text: "presented",
        bbox: { x0: 130, y0: 100, x1: 220, y1: 130 },
        normalizedBbox: { x: 0.13, y: 0.1, w: 0.09, h: 0.03 },
        confidence: 95,
        lineIndex: 1,
      },
      {
        text: "with",
        bbox: { x0: 230, y0: 100, x1: 270, y1: 130 },
        normalizedBbox: { x: 0.23, y: 0.1, w: 0.04, h: 0.03 },
        confidence: 95,
        lineIndex: 1,
      },
      {
        text: "Acute",
        bbox: { x0: 280, y0: 100, x1: 340, y1: 130 },
        normalizedBbox: { x: 0.28, y: 0.1, w: 0.06, h: 0.03 },
        confidence: 95,
        lineIndex: 1,
      },
      {
        text: "Bronchitis.",
        bbox: { x0: 350, y0: 100, x1: 460, y1: 130 },
        normalizedBbox: { x: 0.35, y: 0.1, w: 0.11, h: 0.03 },
        confidence: 95,
        lineIndex: 1,
      },
      {
        text: "Prescribed",
        bbox: { x0: 50, y0: 150, x1: 150, y1: 180 },
        normalizedBbox: { x: 0.05, y: 0.15, w: 0.1, h: 0.03 },
        confidence: 95,
        lineIndex: 2,
      },
      {
        text: "Tab.",
        bbox: { x0: 160, y0: 150, x1: 200, y1: 180 },
        normalizedBbox: { x: 0.16, y: 0.15, w: 0.04, h: 0.03 },
        confidence: 95,
        lineIndex: 2,
      },
      {
        text: "Amoxicillin",
        bbox: { x0: 210, y0: 150, x1: 320, y1: 180 },
        normalizedBbox: { x: 0.21, y: 0.15, w: 0.11, h: 0.03 },
        confidence: 95,
        lineIndex: 2,
      },
      {
        text: "500",
        bbox: { x0: 330, y0: 150, x1: 370, y1: 180 },
        normalizedBbox: { x: 0.33, y: 0.15, w: 0.04, h: 0.03 },
        confidence: 95,
        lineIndex: 2,
      },
      {
        text: "mg",
        bbox: { x0: 375, y0: 150, x1: 400, y1: 180 },
        normalizedBbox: { x: 0.375, y: 0.15, w: 0.025, h: 0.03 },
        confidence: 95,
        lineIndex: 2,
      },
    ],
    lines: [],
    imageDimensions: { width: 1000, height: 1000 },
    pageConfidence: 95,
  };

  it("locates exact quote 'Acute Bronchitis'", () => {
    const boxes = locateQuoteBoundingBoxes("Acute Bronchitis", dummyResult);
    expect(boxes).not.toBeNull();
    expect(boxes!.length).toBeGreaterThan(0);
    // Should cover from ~0.275 to ~0.465 horizontally
    expect(boxes![0].x).toBeLessThan(0.3);
    expect(boxes![0].w).toBeGreaterThan(0.15);
  });

  it("locates quote enclosed in quotes '\"Acute Bronchitis\"'", () => {
    const boxes = locateQuoteBoundingBoxes('"Acute Bronchitis"', dummyResult);
    expect(boxes).not.toBeNull();
    expect(boxes!.length).toBeGreaterThan(0);
  });

  it("locates quote when target quote has split or merged unit '500mg'", () => {
    const boxes = locateQuoteBoundingBoxes("Amoxicillin 500mg", dummyResult);
    expect(boxes).not.toBeNull();
    expect(boxes!.length).toBeGreaterThan(0);
  });

  it("locates quote when quote has list prefix '- Tab. Amoxicillin'", () => {
    const boxes = locateQuoteBoundingBoxes("- Tab. Amoxicillin", dummyResult);
    expect(boxes).not.toBeNull();
  });

  it("locates 'Acute Bronchitis' even when OCR word has slight typo 'Acut Bronchitis'", () => {
    const noisyResult: TesseractResult = {
      ...dummyResult,
      words: dummyResult.words.map((w) =>
        w.text === "Acute" ? { ...w, text: "Acut" } : w
      ),
    };
    const boxes = locateQuoteBoundingBoxes("Acute Bronchitis", noisyResult);
    expect(boxes).not.toBeNull();
  });

  it("locates 'Acute Bronchitis' when first word is garbled but key clinical noun 'Bronchitis' is present", () => {
    const noisyResult: TesseractResult = {
      ...dummyResult,
      words: dummyResult.words.map((w) =>
        w.text === "Acute" ? { ...w, text: "Ace" } : w
      ),
    };
    const boxes = locateQuoteBoundingBoxes("Acute Bronchitis", noisyResult);
    expect(boxes).not.toBeNull();
  });
});
