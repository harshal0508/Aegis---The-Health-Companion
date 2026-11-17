import { isTesseractWasmAvailable, ocrPage } from "./tesseract";

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface NormalizedBox {
  x: number; // 0 to 1
  y: number; // 0 to 1
  w: number; // 0 to 1
  h: number; // 0 to 1
}

export interface OcrWordBox {
  text: string;
  bbox: BoundingBox;
  normalizedBbox: NormalizedBox;
  confidence: number;
  lineIndex: number;
}

export interface OcrLine {
  text: string;
  lineIndex: number;
  bbox: BoundingBox;
  normalizedBbox: NormalizedBox;
  words: OcrWordBox[];
}

export interface OcrResult {
  text: string;
  words: OcrWordBox[];
  lines: OcrLine[];
  imageDimensions: { width: number; height: number };
  confidence: number; // 0 to 100
  readerName: string;
}

export interface OcrProvider {
  readonly name: string;
  isAvailable(): boolean | Promise<boolean>;
  recognize(imageBuffer: Buffer, mimeType?: string): Promise<OcrResult>;
}

/**
 * Tesseract OCR Provider
 * Operates as a local second-reader OCR engine when WASM binaries are available.
 */
export class TesseractOcrProvider implements OcrProvider {
  readonly name = "tesseract";

  isAvailable(): boolean {
    return isTesseractWasmAvailable();
  }

  async recognize(imageBuffer: Buffer): Promise<OcrResult> {
    const rawResult = await ocrPage(imageBuffer, { timeoutMs: 15000 });
    return {
      text: rawResult.text,
      words: rawResult.words,
      lines: rawResult.lines,
      imageDimensions: rawResult.imageDimensions,
      confidence: rawResult.pageConfidence,
      readerName: this.name,
    };
  }
}

/**
 * Azure Document Intelligence OCR Provider
 * Calls Azure AI Document Intelligence REST API (prebuilt-read model).
 * STRICT REQUIREMENT: Only enabled when user configures Azure credentials in environment.
 */
export class AzureDocumentIntelligenceOcrProvider implements OcrProvider {
  readonly name = "azure_document_intelligence";

  private endpoint: string;
  private apiKey: string;

  constructor() {
    this.endpoint = (process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "").trim().replace(/\/+$/, "");
    this.apiKey = (process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "").trim();
  }

  isAvailable(): boolean {
    return Boolean(this.endpoint && this.apiKey);
  }

  async recognize(imageBuffer: Buffer, mimeType = "image/jpeg"): Promise<OcrResult> {
    if (!this.isAvailable()) {
      throw new Error(
        "Azure Document Intelligence is not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY."
      );
    }

    const analyzeUrl = `${this.endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`;

    const analyzeRes = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": this.apiKey,
        "Content-Type": mimeType,
      },
      body: new Uint8Array(imageBuffer),
      signal: AbortSignal.timeout(30000),
    });

    if (!analyzeRes.ok) {
      const errText = await analyzeRes.text();
      throw new Error(`Azure Document Intelligence analyze failed (HTTP ${analyzeRes.status}): ${errText}`);
    }

    const operationLocation = analyzeRes.headers.get("operation-location");
    if (!operationLocation) {
      throw new Error("Azure Document Intelligence response missing operation-location header.");
    }

    // Poll the operation location until analysis succeeds (up to 30s)
    const startTime = Date.now();
    let resultPayload: any = null;

    while (Date.now() - startTime < 30000) {
      await new Promise((r) => setTimeout(r, 1000));

      const pollRes = await fetch(operationLocation, {
        headers: {
          "Ocp-Apim-Subscription-Key": this.apiKey,
        },
      });

      if (!pollRes.ok) {
        throw new Error(`Azure polling failed (HTTP ${pollRes.status})`);
      }

      const pollData = await pollRes.json();
      if (pollData.status === "succeeded") {
        resultPayload = pollData.analyzeResult;
        break;
      }
      if (pollData.status === "failed") {
        throw new Error(`Azure Document Intelligence analysis failed: ${pollData.error?.message || "Unknown error"}`);
      }
    }

    if (!resultPayload) {
      throw new Error("Azure Document Intelligence analysis timed out after 30 seconds.");
    }

    // Extract text, lines, and word bounding boxes from Azure analyze result
    const page = resultPayload.pages?.[0];
    const imgWidth = page?.width || 1000;
    const imgHeight = page?.height || 1000;

    const words: OcrWordBox[] = [];
    const lines: OcrLine[] = [];

    let lineIndex = 0;
    for (const rawLine of page?.lines || []) {
      const lineWords: OcrWordBox[] = [];
      const linePoly: number[] = rawLine.polygon || [];
      const lx0 = Math.min(linePoly[0] || 0, linePoly[6] || 0);
      const ly0 = Math.min(linePoly[1] || 0, linePoly[3] || 0);
      const lx1 = Math.max(linePoly[2] || 0, linePoly[4] || 0);
      const ly1 = Math.max(linePoly[5] || 0, linePoly[7] || 0);

      const normLineBox: NormalizedBox = {
        x: Math.max(0, Math.min(1, lx0 / imgWidth)),
        y: Math.max(0, Math.min(1, ly0 / imgHeight)),
        w: Math.max(0, Math.min(1, (lx1 - lx0) / imgWidth)),
        h: Math.max(0, Math.min(1, (ly1 - ly0) / imgHeight)),
      };

      for (const rawWord of rawLine.words || []) {
        const poly: number[] = rawWord.polygon || [];
        const x0 = Math.min(poly[0] || 0, poly[6] || 0);
        const y0 = Math.min(poly[1] || 0, poly[3] || 0);
        const x1 = Math.max(poly[2] || 0, poly[4] || 0);
        const y1 = Math.max(poly[5] || 0, poly[7] || 0);

        const wordBox: OcrWordBox = {
          text: rawWord.content || "",
          bbox: { x0, y0, x1, y1 },
          normalizedBbox: {
            x: Math.max(0, Math.min(1, x0 / imgWidth)),
            y: Math.max(0, Math.min(1, y0 / imgHeight)),
            w: Math.max(0, Math.min(1, (x1 - x0) / imgWidth)),
            h: Math.max(0, Math.min(1, (y1 - y0) / imgHeight)),
          },
          confidence: Math.round((rawWord.confidence ?? 0.9) * 100),
          lineIndex,
        };
        words.push(wordBox);
        lineWords.push(wordBox);
      }

      lines.push({
        text: rawLine.content || "",
        lineIndex,
        bbox: { x0: lx0, y0: ly0, x1: lx1, y1: ly1 },
        normalizedBbox: normLineBox,
        words: lineWords,
      });
      lineIndex++;
    }

    return {
      text: resultPayload.content || "",
      words,
      lines,
      imageDimensions: { width: imgWidth, height: imgHeight },
      confidence: 95,
      readerName: this.name,
    };
  }
}

/**
 * Returns the currently active OCR provider based on configuration.
 * Azure is only enabled if keys are provided; falls back to Tesseract if WASM available;
 * otherwise returns null (indicating second reader unavailable, without crashing).
 */
export function getActiveOcrProvider(): OcrProvider | null {
  const azure = new AzureDocumentIntelligenceOcrProvider();
  if (azure.isAvailable()) {
    return azure;
  }

  const tesseract = new TesseractOcrProvider();
  if (tesseract.isAvailable()) {
    return tesseract;
  }

  return null;
}
