// This file defines the extraction interface and provider registry.
// Phase 3 adds Gemini vision extraction with quote verification and doc_date detection.

export type ExtractionCategory =
  | "allergy"
  | "medication"
  | "condition"
  | "surgery"
  | "lab"
  | "implant";

export interface ExtractedItem {
  category: ExtractionCategory;
  value: string;
  page_no: number;
  quote: string; // exact text from the page — verified against OCR before saving
  confidence: number; // 0–1
  normalization_source?: "none" | "brand_table" | "rxnorm" | "llm_inferred";
  normalized_value?: string; // only present if normalization_source !== 'none'
}

export interface PageExtractionResult {
  ocr_text: string;
  doc_date?: string | null;
  doc_date_type?: "discharge" | "signed" | "admission" | "report" | "unspecified" | null;
  doc_date_raw?: string | null;
  items: ExtractedItem[];
  model_version?: string;
}

export interface LLMProvider {
  /**
   * Given a page image (as a base64 string), return OCR text, document date (if found),
   * and extracted medical items. Items whose quote is not found in ocr_text
   * must be verified and marked needs_review by the verification gate.
   */
  extractPage(
    imageBase64: string,
    mimeType?: string,
    pageNo?: number
  ): Promise<PageExtractionResult>;
}

// Provider registry
const PROVIDERS: Record<string, () => Promise<LLMProvider>> = {
  gemini: async () => {
    const { GeminiProvider } = await import("./gemini");
    return new GeminiProvider();
  },
};

export async function getProvider(): Promise<LLMProvider> {
  const name = process.env.EXTRACTION_PROVIDER ?? "gemini";
  const loader = PROVIDERS[name];
  if (!loader) {
    throw new Error(
      `Extraction provider "${name}" is not registered. ` +
        `Set EXTRACTION_PROVIDER to one of: ${Object.keys(PROVIDERS).join(", ")}.`
    );
  }
  return loader();
}
