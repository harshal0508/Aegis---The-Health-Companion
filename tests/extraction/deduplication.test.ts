import { describe, it, expect } from "vitest";
import {
  deduplicateExtractedItems,
  extractDoseSignature,
  getItemDeduplicationKey,
  verifyQuotesAgainstOcr,
  VerifiedItem,
} from "../../lib/extraction/verify";

describe("Extraction Deduplication & Verbatim Quote Provenance", () => {
  const sampleOcrText = `
Apollo Health City
Patient: Karan Malhotra
1. CHIEF COMPLAINT
Patient presented with worsening symptoms consistent with Type 2 Diabetes Mellitus.
2. ADMISSION DIAGNOSIS
Type 2 Diabetes Mellitus (ICD-10: E11.9)
5. DISCHARGE MEDICATIONS
• Metformin 500mg PO BID
• Metformin 1000mg PO Extended Release
• Sitagliptin 100mg PO Daily
7. ALLERGIES
Allergies: No Known Drug Allergies (NKDA).
  `.trim();

  it("keeps different medication doses separate (500mg vs 1000mg)", () => {
    const rawItems: VerifiedItem[] = [
      {
        category: "medication",
        value: "Metformin 500mg PO BID",
        quote: "Metformin 500mg PO BID",
        page_no: 1,
        confidence: 0.99,
        status: "extracted",
        verified: true,
      },
      {
        category: "medication",
        value: "Metformin 1000mg PO Extended Release",
        quote: "Metformin 1000mg PO Extended Release",
        page_no: 1,
        confidence: 0.98,
        status: "extracted",
        verified: true,
      },
    ];

    expect(extractDoseSignature("Metformin 500mg PO BID")).toBe("500mg");
    expect(extractDoseSignature("Metformin 1000mg PO Extended Release")).toBe("1000mg");

    const key1 = getItemDeduplicationKey("medication", rawItems[0].value);
    const key2 = getItemDeduplicationKey("medication", rawItems[1].value);
    expect(key1).not.toBe(key2);

    const deduplicated = deduplicateExtractedItems(rawItems);
    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0].value).toBe("Metformin 500mg PO BID");
    expect(deduplicated[1].value).toBe("Metformin 1000mg PO Extended Release");
  });

  it("merges condition variants (ICD-10 coded vs plain) with distinct verbatim quotes in sources", () => {
    const rawItems: VerifiedItem[] = [
      {
        category: "condition",
        value: "Type 2 Diabetes Mellitus",
        quote: "Type 2 Diabetes Mellitus.",
        page_no: 1,
        confidence: 0.95,
        status: "extracted",
        verified: true,
      },
      {
        category: "condition",
        value: "Type 2 Diabetes Mellitus (ICD-10: E11.9)",
        quote: "Type 2 Diabetes Mellitus (ICD-10: E11.9)",
        page_no: 1,
        confidence: 0.99,
        status: "extracted",
        verified: true,
      },
    ];

    const deduplicated = deduplicateExtractedItems(rawItems);
    expect(deduplicated).toHaveLength(1);

    const merged = deduplicated[0];
    // Rule: Never join quotes with " | "
    expect(merged.quote).not.toContain(" | ");
    // Quote is a single verbatim quote
    expect(sampleOcrText).toContain(merged.quote);

    // Rule: Store merged items with a sources list (page, quote)
    expect(merged.sources).toBeDefined();
    expect(merged.sources).toHaveLength(2);

    // Every quote in sources is verbatim on the page and highlightable
    for (const source of merged.sources) {
      expect(source.quote).not.toContain(" | ");
      expect(sampleOcrText.toLowerCase()).toContain(source.quote.toLowerCase());
      expect(source.page_no).toBe(1);
    }

    // Highest confidence is preserved
    expect(merged.confidence).toBe(0.99);
  });

  it("proves a merged item still verifies against OCR without failing", () => {
    const verifiedResult = verifyQuotesAgainstOcr(
      [
        {
          category: "condition",
          value: "Type 2 Diabetes Mellitus",
          quote: "Type 2 Diabetes Mellitus.",
          page_no: 1,
          confidence: 0.95,
        },
        {
          category: "condition",
          value: "Type 2 Diabetes Mellitus",
          quote: "Type 2 Diabetes Mellitus (ICD-10: E11.9)",
          page_no: 1,
          confidence: 0.99,
        },
      ],
      sampleOcrText
    );

    // Both were verified
    expect(verifiedResult.items).toHaveLength(2);
    expect(verifiedResult.items.every((i) => i.verified)).toBe(true);

    // Deduplicate
    const deduplicated = deduplicateExtractedItems(verifiedResult.items);
    expect(deduplicated).toHaveLength(1);

    // Verify that the merged item's primary quote and all sources remain verified
    const reVerify = verifyQuotesAgainstOcr([deduplicated[0]], sampleOcrText);
    expect(reVerify.items[0].verified).toBe(true);
    expect(reVerify.items[0].status).toBe("extracted");
  });

  it("fails over to needs_review if any duplicate instance was unverified", () => {
    const rawItems: VerifiedItem[] = [
      {
        category: "condition",
        value: "Type 2 Diabetes Mellitus",
        quote: "Type 2 Diabetes Mellitus.",
        page_no: 1,
        confidence: 0.95,
        status: "extracted",
        verified: true,
      },
      {
        category: "condition",
        value: "Type 2 Diabetes Mellitus",
        quote: "Fabricated Quote That Does Not Exist In OCR",
        page_no: 1,
        confidence: 0.4,
        status: "needs_review",
        verified: false,
      },
    ];

    const deduplicated = deduplicateExtractedItems(rawItems);
    expect(deduplicated).toHaveLength(1);
    // Conservative safety gate: unverified instance taints merged record to needs_review
    expect(deduplicated[0].status).toBe("needs_review");
    expect(deduplicated[0].verified).toBe(false);
  });
});
