import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { createWorker, Worker } from "tesseract.js";

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

export interface OcrWord {
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
  words: OcrWord[];
}

export interface TesseractResult {
  text: string;
  words: OcrWord[];
  lines: OcrLine[];
  imageDimensions: { width: number; height: number };
  pageConfidence: number; // 0-100
}

export interface OcrOptions {
  useCache?: boolean;
  cacheDir?: string; // STRICT PRIVACY: Only supplied during evaluation benchmarks; omitted in production for memory-only operation
}

/**
 * PRIVACY GUARANTEE:
 * In-memory cache for page OCR results.
 * In the live application, cacheDir is omitted so OCR transcripts are NEVER
 * written to server storage or disk, ensuring zero persistent PHI leaks.
 */
const inMemoryCache = new Map<string, TesseractResult>();

// Reusable Tesseract worker singleton with queue serialization
let workerInstance: Worker | null = null;
let workerPromise: Promise<Worker> | null = null;
let queuePromise: Promise<any> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  if (workerInstance) return workerInstance;
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng");
      workerInstance = worker;
      return worker;
    })();
  }
  return workerPromise;
}

export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate();
    workerInstance = null;
    workerPromise = null;
  }
}

/**
 * Preprocess image buffer with sharp:
 * - Grayscale to eliminate color artifacts and background tints
 * - Linear normalization to enhance document contrast
 * - Upscale low-resolution images (< 1500px wide) up to 2000px wide for clear OCR
 */
export async function preprocessImage(imageBuffer: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const metadata = await sharp(imageBuffer).metadata();
  let pipeline = sharp(imageBuffer).grayscale().normalize();

  let targetWidth = metadata.width || 1000;
  let targetHeight = metadata.height || 1000;

  if (metadata.width && metadata.width < 1500) {
    pipeline = pipeline.resize({
      width: 2000,
      withoutEnlargement: false,
    });
    const ratio = 2000 / metadata.width;
    targetWidth = 2000;
    targetHeight = Math.round((metadata.height || 1000) * ratio);
  }

  const processedBuffer = await pipeline.png().toBuffer();
  const processedMeta = await sharp(processedBuffer).metadata();

  return {
    buffer: processedBuffer,
    width: processedMeta.width || targetWidth,
    height: processedMeta.height || targetHeight,
  };
}

/**
 * Run Tesseract second-reader OCR on a page image.
 * Returns text, segmented lines, words with bounding boxes, and normalized (0-1) coordinates.
 *
 * CACHE BEHAVIOR:
 * - In production: options.cacheDir is undefined -> results cached strictly in volatile memory.
 * - In evaluation benchmarks: options.cacheDir is provided to avoid re-running on known test files.
 */
export async function ocrPage(
  imageBuffer: Buffer,
  options: OcrOptions = { useCache: true }
): Promise<TesseractResult> {
  const hash = crypto.createHash("sha256").update(imageBuffer).digest("hex");

  // 1. Check in-memory cache
  if (options.useCache !== false && inMemoryCache.has(hash)) {
    return inMemoryCache.get(hash)!;
  }

  // 2. Check disk cache if explicitly configured (eval harness only)
  if (options.cacheDir && fs.existsSync(options.cacheDir)) {
    const diskPath = path.join(options.cacheDir, `${hash}.json`);
    if (fs.existsSync(diskPath)) {
      try {
        const cached: TesseractResult = JSON.parse(fs.readFileSync(diskPath, "utf8"));
        inMemoryCache.set(hash, cached);
        return cached;
      } catch {
        // Fall back to OCR if cache file is corrupted
      }
    }
  }

  // 3. Preprocess image
  const preprocessed = await preprocessImage(imageBuffer);
  const imgW = preprocessed.width;
  const imgH = preprocessed.height;

  // 4. Enqueue recognition sequentially to protect single worker instance
  const result: TesseractResult = await new Promise((resolve, reject) => {
    queuePromise = queuePromise.then(async () => {
      try {
        const worker = await getWorker();
        const ret = await worker.recognize(preprocessed.buffer, {}, { blocks: true });

        const words: OcrWord[] = [];
        const lines: OcrLine[] = [];
        let globalLineIdx = 0;

        for (const block of ret.data.blocks || []) {
          for (const para of block.paragraphs || []) {
            for (const line of para.lines || []) {
              const lineWords: OcrWord[] = [];
              const lineBox: BoundingBox = {
                x0: line.bbox.x0,
                y0: line.bbox.y0,
                x1: line.bbox.x1,
                y1: line.bbox.y1,
              };

              const normLineBox: NormalizedBox = {
                x: Math.max(0, Math.min(1, lineBox.x0 / imgW)),
                y: Math.max(0, Math.min(1, lineBox.y0 / imgH)),
                w: Math.max(0, Math.min(1, (lineBox.x1 - lineBox.x0) / imgW)),
                h: Math.max(0, Math.min(1, (lineBox.y1 - lineBox.y0) / imgH)),
              };

              for (const word of line.words || []) {
                const text = (word.text || "").trim();
                if (text) {
                  const wBox: BoundingBox = {
                    x0: word.bbox.x0,
                    y0: word.bbox.y0,
                    x1: word.bbox.x1,
                    y1: word.bbox.y1,
                  };
                  const normWBox: NormalizedBox = {
                    x: Math.max(0, Math.min(1, wBox.x0 / imgW)),
                    y: Math.max(0, Math.min(1, wBox.y0 / imgH)),
                    w: Math.max(0, Math.min(1, (wBox.x1 - wBox.x0) / imgW)),
                    h: Math.max(0, Math.min(1, (wBox.y1 - wBox.y0) / imgH)),
                  };

                  const wordObj: OcrWord = {
                    text,
                    bbox: wBox,
                    normalizedBbox: normWBox,
                    confidence: Math.round(word.confidence ?? 0),
                    lineIndex: globalLineIdx,
                  };
                  words.push(wordObj);
                  lineWords.push(wordObj);
                }
              }

              if (lineWords.length > 0) {
                lines.push({
                  text: line.text?.trim() || "",
                  lineIndex: globalLineIdx,
                  bbox: lineBox,
                  normalizedBbox: normLineBox,
                  words: lineWords,
                });
                globalLineIdx++;
              }
            }
          }
        }

        const out: TesseractResult = {
          text: ret.data.text || "",
          words,
          lines,
          imageDimensions: { width: imgW, height: imgH },
          pageConfidence: Math.round(ret.data.confidence ?? 0),
        };

        // Populate in-memory cache
        inMemoryCache.set(hash, out);

        // Populate disk cache only if explicitly requested (eval only)
        if (options.cacheDir && fs.existsSync(options.cacheDir)) {
          const diskPath = path.join(options.cacheDir, `${hash}.json`);
          try {
            fs.writeFileSync(diskPath, JSON.stringify(out));
          } catch {
            // Ignore disk write errors
          }
        }

        resolve(out);
      } catch (err) {
        reject(err);
      }
    });
  });

  return result;
}
