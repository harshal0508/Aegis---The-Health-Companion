import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildLiveModelChain,
  getLiveGeminiModels,
  clearLiveModelsCache,
  GeminiProvider,
} from "@/lib/llm/gemini";
import {
  TesseractOcrProvider,
  AzureDocumentIntelligenceOcrProvider,
  getActiveOcrProvider,
} from "@/lib/ocr/provider";

describe("Requirement 1: Dynamic Live Model Chain & Zero Hardcoded Names", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    clearLiveModelsCache();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws a clear error if GEMINI_MODEL is unset", async () => {
    delete process.env.GEMINI_MODEL;

    await expect(buildLiveModelChain("mock-api-key", "")).rejects.toThrow(
      "GEMINI_MODEL environment variable is not configured"
    );
  });

  it("throws a clear error if configured GEMINI_MODEL is not available in live models list", async () => {
    process.env.GEMINI_MODEL = "gemini-nonexistent-model";

    // Mock live list-models API response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
        ],
      }),
    } as any);

    await expect(
      buildLiveModelChain("mock-api-key", "gemini-nonexistent-model")
    ).rejects.toThrow(/is not available in the live Gemini API models list/);
  });

  it("builds the dynamic model chain from live API response with primary model first and zero hardcoded names", async () => {
    process.env.GEMINI_MODEL = "gemini-2.0-flash";

    // Mock live API returning active models (no retired models)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
          { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
        ],
      }),
    } as any);

    const { primaryModel, chain } = await buildLiveModelChain(
      "mock-api-key",
      "gemini-2.0-flash"
    );

    // Primary model is strictly the configured environment model
    expect(primaryModel).toBe("gemini-2.0-flash");
    expect(chain[0]).toBe("gemini-2.0-flash");

    // Fallbacks are derived dynamically from remaining live content generation models
    expect(chain).toContain("gemini-2.5-flash");
    expect(chain).toContain("gemini-3.5-flash-lite");

    // Non-content models (embeddings) are strictly filtered out
    expect(chain).not.toContain("gemini-embedding-001");

    // Retired models (like gemini-1.5-flash-002) are not present since they are not in the live response
    expect(chain).not.toContain("gemini-1.5-flash-002");
  });

  it("GeminiProvider constructor throws error if GEMINI_MODEL is not in environment", () => {
    delete process.env.GEMINI_MODEL;

    expect(() => new GeminiProvider("mock-key")).toThrow(
      "GEMINI_MODEL environment variable is not configured"
    );
  });
});

describe("Requirement 5: OcrProvider Interface & Implementation Guardrails", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("Azure Document Intelligence is strictly disabled until keys are configured", async () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

    const azureProvider = new AzureDocumentIntelligenceOcrProvider();
    expect(azureProvider.name).toBe("azure_document_intelligence");
    expect(azureProvider.isAvailable()).toBe(false);

    // Attempting recognize without keys throws immediately
    await expect(
      azureProvider.recognize(Buffer.from("dummy-scan"))
    ).rejects.toThrow(/Azure Document Intelligence is not configured/);
  });

  it("Azure Document Intelligence reports available when endpoint and key are set", () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://eastus.api.cognitive.microsoft.com";
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = "test-azure-key";

    const azureProvider = new AzureDocumentIntelligenceOcrProvider();
    expect(azureProvider.isAvailable()).toBe(true);
  });

  it("Tesseract provider gracefully reports availability without unhandled worker crashes", () => {
    const tesseractProvider = new TesseractOcrProvider();
    expect(tesseractProvider.name).toBe("tesseract");
    expect(typeof tesseractProvider.isAvailable()).toBe("boolean");
  });

  it("getActiveOcrProvider returns null or available provider without crashing when unconfigured", () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

    const active = getActiveOcrProvider();
    // Either Tesseract if local WASM exists or null if serverless/restricted
    if (active) {
      expect(["tesseract", "azure_document_intelligence"]).toContain(active.name);
    } else {
      expect(active).toBeNull();
    }
  });
});

describe("Requirement 5 & 6: Text-Only Clinical Extraction & Reader Source Tagging", () => {
  it("extractFromText extracts clinical entities with exact quotes and tags reader_source", async () => {
    process.env.GEMINI_MODEL = "gemini-2.0-flash";

    // Mock live list-models API
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/models?key=")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            models: [
              { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
            ],
          }),
        };
      }

      // Mock generateContent response for text-only extraction
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      ocr_text: "Patient has Hypertension. Prescribed Amlodipine 5mg OD.",
                      doc_date: "2026-05-10",
                      doc_date_type: "report",
                      doc_date_raw: "10/05/2026",
                      patient_name_as_printed: "Ramesh Kumar",
                      patient_name_latin: "Ramesh Kumar",
                      patient_dob: "1980-01-01",
                      items: [
                        {
                          category: "condition",
                          value: "Hypertension",
                          quote: "Hypertension",
                          confidence: 0.95,
                        },
                        {
                          category: "medication",
                          value: "Amlodipine 5mg OD",
                          quote: "Amlodipine 5mg OD",
                          confidence: 0.98,
                        },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      };
    });

    const provider = new GeminiProvider("mock-key", "gemini-2.0-flash");
    const rawOcrText = "Patient has Hypertension. Prescribed Amlodipine 5mg OD.";

    const result = await provider.extractFromText(rawOcrText, 1, "text_ocr_azure");

    expect(result.ocr_text).toBe(rawOcrText);
    expect(result.reader_source).toBe("text_ocr_azure");
    expect(result.items.length).toBe(2);
    expect(result.items[0].value).toBe("Hypertension");
    expect(result.items[0].reader_source).toBe("text_ocr_azure");
    expect(result.items[1].value).toBe("Amlodipine 5mg OD");
    expect(result.items[1].reader_source).toBe("text_ocr_azure");
  });
});
