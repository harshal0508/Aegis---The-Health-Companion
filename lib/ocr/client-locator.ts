import { locateQuoteBoundingBoxes } from "@/lib/extraction/locator";
import type { NormalizedBox, TesseractResult, OcrWord } from "@/lib/ocr/tesseract";

declare global {
  interface Window {
    Tesseract?: any;
  }
}

// In-memory cache for page OCR results by image URL in the browser
const clientOcrCache = new Map<string, TesseractResult>();
let activeOcrPromise: Promise<TesseractResult | null> | null = null;
let activeOcrUrl: string | null = null;

/**
 * Dynamically loads Tesseract.js v5 from CDN in the browser if not already present.
 */
async function loadBrowserTesseract(): Promise<any> {
  if (typeof window === "undefined") return null;
  if (window.Tesseract) return window.Tesseract;

  return new Promise((resolve, reject) => {
    // Check if script tag is already in head
    const existing = document.querySelector<HTMLScriptElement>("script[data-tesseract-cdn]");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Tesseract));
      existing.addEventListener("error", () => reject(new Error("Failed to load Tesseract.js")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    script.async = true;
    script.setAttribute("data-tesseract-cdn", "true");
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error("Failed to load Tesseract.js from CDN"));
    setTimeout(() => reject(new Error("CDN load timeout")), 12000);
    document.head.appendChild(script);
  });
}

/**
 * Runs client-side OCR on an image scan in the browser and caches the result.
 */
export async function getClientPageOcr(imageUrl: string): Promise<TesseractResult | null> {
  if (typeof window === "undefined" || !imageUrl) return null;

  if (clientOcrCache.has(imageUrl)) {
    return clientOcrCache.get(imageUrl)!;
  }

  // De-duplicate concurrent OCR runs for the same image
  if (activeOcrPromise && activeOcrUrl === imageUrl) {
    return activeOcrPromise;
  }

  activeOcrUrl = imageUrl;
  activeOcrPromise = (async () => {
    try {
      const Tesseract = await loadBrowserTesseract();
      if (!Tesseract) return null;

      // In browser, createWorker loads web worker + WASM from CDN automatically
      const worker = await Tesseract.createWorker("eng", 1, {
        cacheMethod: "none",
      });

      const ret = await worker.recognize(imageUrl, {}, { text: true, blocks: true });
      await worker.terminate();

      // Determine natural image dimensions
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imageUrl;
      await new Promise<void>((res) => {
        img.onload = () => res();
        img.onerror = () => res();
      });

      const imgW = img.naturalWidth || 1000;
      const imgH = img.naturalHeight || 1000;

      const words: OcrWord[] = [];
      let globalLineIdx = 0;

      for (const block of ret.data.blocks || []) {
        for (const para of block.paragraphs || []) {
          for (const line of para.lines || []) {
            for (const word of line.words || []) {
              const text = (word.text || "").trim();
              if (text && word.bbox) {
                const normWBox: NormalizedBox = {
                  x: Math.max(0, Math.min(1, word.bbox.x0 / imgW)),
                  y: Math.max(0, Math.min(1, word.bbox.y0 / imgH)),
                  w: Math.max(0, Math.min(1, (word.bbox.x1 - word.bbox.x0) / imgW)),
                  h: Math.max(0, Math.min(1, (word.bbox.y1 - word.bbox.y0) / imgH)),
                };
                words.push({
                  text,
                  bbox: word.bbox,
                  normalizedBbox: normWBox,
                  confidence: Math.round(word.confidence ?? 0),
                  lineIndex: globalLineIdx,
                });
              }
            }
            globalLineIdx++;
          }
        }
      }

      const result: TesseractResult = {
        text: ret.data.text || "",
        words,
        lines: [],
        imageDimensions: { width: imgW, height: imgH },
        pageConfidence: Math.round(ret.data.confidence ?? 90),
      };

      clientOcrCache.set(imageUrl, result);
      return result;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn("[Client OCR Locator] Recognition skipped:", err?.message || err);
      return null;
    } finally {
      activeOcrPromise = null;
      activeOcrUrl = null;
    }
  })();

  return activeOcrPromise;
}

/**
 * Resolves bounding box coordinates for a quote or clinical value directly on the client.
 */
export async function resolveClientScanBoxes(
  imageUrl: string,
  quote: string | null,
  fallbackValue?: string | null
): Promise<NormalizedBox[] | null> {
  const ocrResult = await getClientPageOcr(imageUrl);
  if (!ocrResult || !ocrResult.words || ocrResult.words.length === 0) {
    return null;
  }

  let boxes: NormalizedBox[] | null = null;
  if (quote) {
    boxes = locateQuoteBoundingBoxes(quote, ocrResult);
  }
  if (!boxes && fallbackValue) {
    boxes = locateQuoteBoundingBoxes(fallbackValue, ocrResult);
  }

  return boxes;
}
