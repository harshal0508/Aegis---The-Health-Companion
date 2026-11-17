import { ExtractedItem, LLMProvider, PageExtractionResult } from "./provider";

interface GeminiModelInfo {
  name: string; // e.g. "models/gemini-2.0-flash"
  supportedGenerationMethods?: string[];
}

interface GeminiApiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  modelVersion?: string;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

interface ExtractionPayload {
  ocr_text: string;
  doc_date: string | null;
  doc_date_type?: "discharge" | "signed" | "admission" | "report" | "unspecified" | null;
  doc_date_raw?: string | null;
  patient_name_as_printed?: string | null;
  patient_name_latin?: string | null;
  patient_dob?: string | null;
  items: Array<{
    category: "allergy" | "medication" | "condition" | "surgery" | "lab" | "implant";
    value: string;
    quote: string;
    confidence: number;
  }>;
}

// In-memory cache for live Gemini list-models response (TTL: 1 hour)
let cachedLiveModels: { timestamp: number; models: string[] } | null = null;
const MODEL_CACHE_TTL_MS = 60 * 60 * 1000;

export function clearLiveModelsCache(): void {
  cachedLiveModels = null;
}

/**
 * Queries the live Gemini API list-models endpoint to discover currently available models.
 * Results are cached in memory for 1 hour to prevent redundant API queries.
 */
export async function getLiveGeminiModels(apiKey: string): Promise<string[]> {
  const now = Date.now();
  if (cachedLiveModels && now - cachedLiveModels.timestamp < MODEL_CACHE_TTL_MS) {
    return cachedLiveModels.models;
  }

  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(listUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    // Requirement 7: Log model/endpoint status code only
    // eslint-disable-next-line no-console
    console.log(`[Gemini ListModels] status=${response.status}`);
    if (cachedLiveModels) return cachedLiveModels.models;
    throw new Error(`Failed to retrieve live Gemini models list from API (HTTP ${response.status}).`);
  }

  const data = await response.json();
  const rawList: GeminiModelInfo[] = data.models || [];

  // Filter only models that support content generation and are not embedding-only
  const available = rawList
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter(
      (name) =>
        !name.includes("embedding") &&
        !name.includes("aqa") &&
        !name.includes("imagen")
    );

  cachedLiveModels = {
    timestamp: now,
    models: available,
  };

  return available;
}

/**
 * Builds the dynamic model fallback chain strictly from the live list-models API response.
 * Rule 1: No hardcoded model names in code.
 * Rule 1: GEMINI_MODEL is set from environment; if unset or unavailable, throws clear error.
 */
export async function buildLiveModelChain(
  apiKey: string,
  envModelName?: string
): Promise<{ primaryModel: string; chain: string[] }> {
  const configured = (envModelName || process.env.GEMINI_MODEL || "").trim().replace(/^models\//, "");

  if (!configured) {
    throw new Error(
      "GEMINI_MODEL environment variable is not configured. " +
        "Please set GEMINI_MODEL in your environment variables (e.g. in Vercel project settings)."
    );
  }

  const liveModels = await getLiveGeminiModels(apiKey);

  if (!liveModels.includes(configured)) {
    throw new Error(
      `Configured GEMINI_MODEL "${configured}" is not available in the live Gemini API models list. ` +
        `Available models supporting generateContent: ${liveModels.join(", ")}.`
    );
  }

  // Dynamic fallback ordering without hardcoded names:
  // Order remaining active models by prioritizing 'flash' and 'lite' variants first
  const remaining = liveModels.filter((m) => m !== configured);
  remaining.sort((a, b) => {
    const aFast = a.includes("flash") || a.includes("lite") ? 1 : 0;
    const bFast = b.includes("flash") || b.includes("lite") ? 1 : 0;
    return bFast - aFast;
  });

  return {
    primaryModel: configured,
    chain: [configured, ...remaining],
  };
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private configuredModel: string;
  private modelChain: string[] = [];
  private initialized = false;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your environment."
      );
    }

    const envModel = (model || process.env.GEMINI_MODEL || "").trim().replace(/^models\//, "");
    if (!envModel) {
      throw new Error(
        "GEMINI_MODEL environment variable is not configured. " +
          "Please set GEMINI_MODEL in your environment variables."
      );
    }

    this.configuredModel = envModel;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const { primaryModel, chain } = await buildLiveModelChain(this.apiKey, this.configuredModel);
    this.configuredModel = primaryModel;
    this.modelChain = chain;
    this.initialized = true;
  }

  getModelChain(): string[] {
    return [...this.modelChain];
  }

  getPrimaryModel(): string {
    return this.configuredModel;
  }

  async extractPage(
    imageBase64: string,
    mimeType = "image/jpeg",
    pageNo = 1
  ): Promise<PageExtractionResult> {
    await this.initialize();

    const promptText = `
You are a precise clinical document transcription and entity extraction engine.
Analyze the provided medical document image carefully and perform two tasks:

TASK 1: FULL OCR TRANSCRIPTION
Extract all visible textual content in this image verbatim into "ocr_text". Retain all numbers, dates, drug names, and headers.

TASK 2: CLINICAL ENTITY EXTRACTION
Identify all distinct clinical entities belonging to these categories:
- "medication": Drug names, formulations, doses, frequencies, routes (e.g., "Meloxicam 15mg PO Daily", "Paracetamol 650mg TDS")
- "condition": Diagnoses, symptoms, medical conditions, comorbidities (e.g., "Osteoarthritis of Knee", "Type 2 Diabetes Mellitus")
- "allergy": Allergies or explicit allergy statements:
  * If the document explicitly states "NKDA", "No known drug allergies", or "NKA":
    - If a document date or signature date is explicitly printed on this page, store value as: "No known drug allergies, per document, YYYY-MM-DD"
    - If NO date is printed anywhere on this page, store value as: "No known drug allergies, per document, date not found"
  * NEVER state global "no allergies".
  * If there is NO mention of allergies anywhere in the document, extract NOTHING for allergy (do NOT output "none", "nil", or "no allergies").
- "surgery": Operations, surgical interventions, and invasive procedures (e.g., "Intra-articular injection", "Appendectomy", "Coronary bypass", "Stent placement").
  * STRICT EXCLUSIONS: Do NOT classify non-invasive diagnostic examinations, clinical consults, routine eye checks, or administrative lines as surgery (e.g. NEVER extract "Diabetic Retinal Exam", "Room and Board - Semi-Private", "Eye exam", or "General Physical Exam" as surgery).
- "lab": Laboratory test results and diagnostic investigations with findings:
  * STRICT REQUIREMENT: Only extract lab tests and imaging if an ACTUAL RESULT, observation, or numeric value is stated (e.g., "HbA1c 7.4%", "Blood Glucose 140 mg/dL", "Chest X-Ray: Clear lungs").
  * Do NOT extract bare test names that are merely listed as "ordered", "pending", or "requested" without any result values (e.g. do NOT extract "Hemoglobin A1c" or "Comprehensive Metabolic Panel" if listed only under tests ordered without results).
- "implant": Medical devices, stents, implants, prosthetics

TASK 3: DOCUMENT DATE EXTRACTION & AMBIGUITY RULES
Analyze any dates printed on the document:
1. Distinguish Date Types:
   - "discharge": if labeled "Discharge Date", "Discharged on", "Discharge:", etc.
   - "signed": if labeled "Electronically Signed By", "Doctor's Signature", "Signed Date/Time", etc.
   - "admission": if labeled "Admission Date", "Admitted on", etc.
   - "report": if labeled "Report Date", "Specimen Date", "Test Date", etc.
   - "unspecified": if a date is present without an explicit label.
   Prefer "discharge" date for discharge summaries; otherwise use the "signed" date.
2. Indian Date Order Convention & Ambiguity Rules:
   - Assume day-first (DD/MM/YYYY) for Indian medical documents (e.g. "05/06/2026" is 5 June 2026, NOT May 6).
   - If numbers are clearly disambiguated (e.g. "05/22/2026" or "22/05/2026", where 22 can only be the day), resolve to YYYY-MM-DD.
   - If day/month order is genuinely ambiguous and cannot be determined from text context, return null for "doc_date" ("date not found").
3. Set "doc_date": "YYYY-MM-DD" if clearly resolved, or null if no date or ambiguous.
4. Set "doc_date_type": "discharge" | "signed" | "admission" | "report" | "unspecified" | null.
5. Set "doc_date_raw": the exact verbatim date string as printed on the document (e.g. "05/22/2026 00:00 PST").

TASK 4: PATIENT IDENTITY EXTRACTION
Inspect the document header, patient demographics banner, or bill details:
1. "patient_name_as_printed": The exact patient name as printed on the document (in any script, e.g., Devanagari or Latin, including titles if printed, e.g., "Mr. Harshal Jain", "हर्षल जैन", "Baby of Sunita"). If no patient name is printed or visible, return null.
2. "patient_name_latin": The patient name transliterated to standard Latin alphabet (e.g., "Harshal Jain", "Sunita Sharma"). Return null if no name is found.
3. "patient_dob": The patient's Date of Birth (NOT document date), in YYYY-MM-DD format if explicitly printed on the document (e.g. "DOB: 10/05/1995" -> "1995-05-10"). Return null if no patient DOB is printed.

CRITICAL RULES:
1. For every item, provide "quote": the EXACT verbatim snippet as it appears in the document. The quote MUST be present word-for-word in the "ocr_text".
2. Set "confidence": between 0.0 and 1.0 based on visual clarity and certainty.
3. Do not invent, infer, or hallucinate any medications or diagnoses that are not explicitly stated on this page.
4. Return strictly valid JSON adhering to the specified schema.
`;

    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, "");

    const body = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: mimeType,
                data: cleanBase64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.getResponseSchema(),
        temperature: 0.1,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    };

    return this.executeWithModelChain(body, pageNo);
  }

  async extractFromText(
    ocrText: string,
    pageNo = 1,
    readerSourceOverride?: string
  ): Promise<PageExtractionResult> {
    await this.initialize();

    const promptText = `
You are a precise clinical entity extraction engine.
Analyze the following verbatim OCR document text and perform entity extraction adhering strictly to the text provided:

TASK 1: CLINICAL ENTITY EXTRACTION
Identify all distinct clinical entities belonging to these categories:
- "medication": Drug names, formulations, doses, frequencies, routes
- "condition": Diagnoses, symptoms, medical conditions, comorbidities
- "allergy": Allergies or explicit allergy statements (e.g. NKDA, No Known Drug Allergies)
- "surgery": Operations, surgical interventions, and invasive procedures (do NOT classify routine exams/consults as surgery)
- "lab": Laboratory test results with findings and numeric values (do NOT extract bare tests ordered without results)
- "implant": Medical devices, stents, implants, prosthetics

TASK 2: DOCUMENT DATE & PATIENT IDENTITY
Extract document date (doc_date YYYY-MM-DD), doc_date_type, doc_date_raw, patient_name_as_printed, patient_name_latin, and patient_dob if present.

CRITICAL RULES:
1. For every item, "quote" MUST be an EXACT word-for-word substring from the provided OCR text.
2. Return strictly valid JSON adhering to the specified schema.

VERBATIM OCR TEXT TO EXTRACT FROM:
${ocrText}
`;

    const body = {
      contents: [
        {
          parts: [{ text: promptText }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: this.getResponseSchema(),
        temperature: 0.1,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    };

    const result = await this.executeWithModelChain(body, pageNo);
    // Retain the full provided OCR text for the page
    result.ocr_text = ocrText;
    if (readerSourceOverride) {
      result.reader_source = readerSourceOverride;
      result.items.forEach((item) => {
        item.reader_source = readerSourceOverride;
      });
    }
    return result;
  }

  private getResponseSchema() {
    return {
      type: "OBJECT",
      properties: {
        ocr_text: { type: "STRING" },
        doc_date: { type: "STRING", nullable: true },
        doc_date_type: {
          type: "STRING",
          enum: ["discharge", "signed", "admission", "report", "unspecified"],
          nullable: true,
        },
        doc_date_raw: { type: "STRING", nullable: true },
        patient_name_as_printed: { type: "STRING", nullable: true },
        patient_name_latin: { type: "STRING", nullable: true },
        patient_dob: { type: "STRING", nullable: true },
        items: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              category: {
                type: "STRING",
                enum: ["allergy", "medication", "condition", "surgery", "lab", "implant"],
              },
              value: { type: "STRING" },
              quote: { type: "STRING" },
              confidence: { type: "NUMBER" },
            },
            required: ["category", "value", "quote", "confidence"],
          },
        },
      },
      required: ["ocr_text", "items"],
    };
  }

  private async executeWithModelChain(
    body: any,
    pageNo: number
  ): Promise<PageExtractionResult> {
    let response: Response | null = null;
    let successfulModel = this.configuredModel;

    for (let i = 0; i < this.modelChain.length; i++) {
      const candidateModel = this.modelChain[i];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${this.apiKey}`;

      let attempts = 0;
      const maxAttempts = 2; // 1 initial + 1 retry per model
      let delayMs = 1500;
      let modelFailed = false;

      while (attempts < maxAttempts) {
        attempts++;
        try {
          response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(60000),
          });

          // Requirement 7: Log model name, status code, and attempt count ONLY. No document content.
          // eslint-disable-next-line no-console
          console.log(
            `[Gemini Extraction] model=${candidateModel} status=${response.status} attempt=${attempts}/${maxAttempts}`
          );

          if (response.ok) {
            successfulModel = candidateModel;
            break;
          }

          // Auto-recover if model rejects thinkingConfig (400 Bad Request)
          if (response.status === 400) {
            const errText = await response.text();
            if (
              (errText.includes("thinkingConfig") || errText.includes("thinkingBudget")) &&
              body.generationConfig?.thinkingConfig
            ) {
              delete body.generationConfig.thinkingConfig;
              continue;
            }
            // Non-recoverable 400: break to next model or surface error
            modelFailed = true;
            break;
          }

          // 404 or 503 / 5xx: cascade to next model in live chain
          if (response.status === 404 || response.status === 503 || response.status >= 500) {
            if (attempts < maxAttempts && response.status !== 404) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              delayMs *= 2;
              continue;
            }
            modelFailed = true;
            break;
          }

          // 429 Quota Exceeded: break immediately to allow higher-level queue retry
          if (response.status === 429) {
            modelFailed = true;
            break;
          }

          modelFailed = true;
          break;
        } catch (err: any) {
          // Requirement 7: Log model name and attempt count only
          // eslint-disable-next-line no-console
          console.log(
            `[Gemini Extraction] model=${candidateModel} error=${err?.name || "NetworkError"} attempt=${attempts}/${maxAttempts}`
          );

          if (err?.name === "AbortError" || err?.name === "TimeoutError") {
            modelFailed = true;
            break;
          }
          if (attempts >= maxAttempts) {
            modelFailed = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
        }
      }

      if (!modelFailed && response && response.ok) {
        break;
      }
    }

    if (!response || !response.ok) {
      throw new Error(
        `Gemini extraction request failed across dynamic live model chain (${this.modelChain.slice(0, 3).join(", ")}...).`
      );
    }

    const json: GeminiApiResponse = await response.json();
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error("Gemini API returned an empty extraction candidate.");
    }

    let parsedResult: ExtractionPayload;
    try {
      parsedResult = JSON.parse(candidateText);
    } catch (e: any) {
      throw new Error(`Failed to parse extraction JSON response: ${e.message}`);
    }

    const isPrimary = successfulModel === this.configuredModel;
    const readerSource = isPrimary ? "primary_vision" : "fallback_vision";

    const nonSurgicalKeywords = [
      "retinal exam",
      "eye exam",
      "room and board",
      "physical exam",
      "consultation",
      "semi-private",
      "fundoscopy",
    ];

    const filteredRawItems = (parsedResult.items || []).filter((item) => {
      const valLower = (item.value || "").toLowerCase();
      if (item.category === "surgery" && nonSurgicalKeywords.some((e) => valLower.includes(e))) {
        return false;
      }
      return true;
    });

    const items: ExtractedItem[] = filteredRawItems.map((item) => ({
      category: item.category,
      value: item.value,
      page_no: pageNo,
      quote: item.quote,
      confidence: Math.min(1, Math.max(0, item.confidence ?? 0.8)),
      normalization_source: "none",
      reader_source: readerSource,
    }));

    return {
      ocr_text: parsedResult.ocr_text || "",
      doc_date: parsedResult.doc_date || null,
      doc_date_type: parsedResult.doc_date_type || null,
      doc_date_raw: parsedResult.doc_date_raw || null,
      patient_name_as_printed: parsedResult.patient_name_as_printed || null,
      patient_name_latin: parsedResult.patient_name_latin || null,
      patient_dob: parsedResult.patient_dob || null,
      items,
      model_version: json.modelVersion || successfulModel,
      reader_source: readerSource,
    };
  }
}
