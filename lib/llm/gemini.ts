import { ExtractedItem, LLMProvider, PageExtractionResult } from "./provider";

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
  items: Array<{
    category: "allergy" | "medication" | "condition" | "surgery" | "lab" | "implant";
    value: string;
    quote: string;
    confidence: number;
  }>;
}

export class GeminiProvider implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    this.model = model || process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!this.apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in your environment or .env.local file."
      );
    }
  }

  async extractPage(
    imageBase64: string,
    mimeType = "image/jpeg",
    pageNo = 1
  ): Promise<PageExtractionResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

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
- "surgery": Operations, procedures, interventions (e.g., "Intra-articular injection", "Appendectomy")
- "lab": Laboratory test results, diagnostic investigations, vital signs
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

CRITICAL RULES:
1. For every item, provide "quote": the EXACT verbatim snippet as it appears in the document. The quote MUST be present word-for-word in the "ocr_text".
2. Set "confidence": between 0.0 and 1.0 based on visual clarity and certainty.
3. Do not invent, infer, or hallucinate any medications or diagnoses that are not explicitly stated on this page.
4. Return strictly valid JSON adhering to the specified schema.
`;

    // Response schema for structured output
    const responseSchema = {
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

    // Remove data URL prefix if provided
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
        responseSchema,
        temperature: 0.1,
      },
    };

    let response: Response | null = null;
    let attempts = 0;
    const maxAttempts = 3; // 1 initial attempt + max 2 retries on 503/500
    let delayMs = 2000;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (response.ok) {
          break;
        }

        // Do NOT retry on 429 (rate limit / quota exceeded) — abort immediately so we don't burn requests
        if (response.status === 429) {
          const errText = await response.text();
          let errMsg = `Gemini API request failed with status 429 (Quota Exceeded)`;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error?.message) errMsg += `: ${parsed.error.message}`;
          } catch {
            errMsg += `: ${errText}`;
          }
          throw new Error(errMsg);
        }

        // Retry ONLY on transient 503 (high demand) or >= 500 server error, at most 2 retries
        if (
          (response.status === 503 || response.status >= 500) &&
          attempts < maxAttempts
        ) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
          continue;
        }

        const errText = await response.text();
        let errMsg = `Gemini API request failed with status ${response.status}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.error?.message) errMsg += `: ${parsed.error.message}`;
        } catch {
          errMsg += `: ${errText}`;
        }
        throw new Error(errMsg);
      } catch (err: any) {
        if (attempts >= maxAttempts) throw err;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs *= 2;
      }
    }

    if (!response || !response.ok) {
      throw new Error("Failed to receive a valid response from Gemini after retries.");
    }

    const json: GeminiApiResponse = await response.json();
    const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error("Gemini API returned an empty response.");
    }

    let parsedResult: ExtractionPayload;
    try {
      parsedResult = JSON.parse(candidateText);
    } catch (e: any) {
      throw new Error(`Failed to parse extraction JSON response: ${e.message}`);
    }

    const items: ExtractedItem[] = (parsedResult.items || []).map((item) => ({
      category: item.category,
      value: item.value,
      page_no: pageNo,
      quote: item.quote,
      confidence: Math.min(1, Math.max(0, item.confidence ?? 0.8)),
      normalization_source: "none",
    }));

    // Rule 7: Never log OCR text or extracted values!
    // We only log sanitized summary statistics
    return {
      ocr_text: parsedResult.ocr_text || "",
      doc_date: parsedResult.doc_date || null,
      doc_date_type: parsedResult.doc_date_type || null,
      doc_date_raw: parsedResult.doc_date_raw || null,
      items,
      model_version: json.modelVersion || this.model,
    };
  }
}
