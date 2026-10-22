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

export interface OcrWord {
  text: string;
  bbox: BoundingBox;
  confidence: number;
}

export interface TesseractResult {
  text: string;
  words: OcrWord[];
  pageConfidence: number; // 0-100
}

export interface OcrOptions {
  useCache?: boolean;
  cacheDir?: string;
}

// In-memory cache for page OCR results
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
 * - Grayscale to eliminate color noise
 * - Normalization to boost document contrast
 * - Upscale low-resolution images (< 1500px wide) up to 2000px wide for clear OCR
 */
export async function preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  let pipeline = sharp(imageBuffer).grayscale().normalize();

  if (metadata.width && metadata.width < 1500) {
    pipeline = pipeline.resize({
      width: 2000,
      withoutEnlargement: false,
    });
  }

  return pipeline.png().toBuffer();
}

/**
 * Run Tesseract second-reader OCR on a page image.
 * Caches results by image SHA-256 hash to prevent redundant OCR work.
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

  // 2. Check disk cache if configured
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

  // 4. Enqueue recognition sequentially to protect single worker instance
  const result: TesseractResult = await new Promise((resolve, reject) => {
    queuePromise = queuePromise.then(async () => {
      try {
        const worker = await getWorker();
        const ret = await worker.recognize(preprocessed, {}, { blocks: true });

        const words: OcrWord[] = [];
        for (const block of ret.data.blocks || []) {
          for (const para of block.paragraphs || []) {
            for (const line of para.lines || []) {
              for (const word of line.words || []) {
                const text = (word.text || "").trim();
                if (text) {
                  words.push({
                    text,
                    bbox: {
                      x0: word.bbox.x0,
                      y0: word.bbox.y0,
                      x1: word.bbox.x1,
                      y1: word.bbox.y1,
                    },
                    confidence: Math.round(word.confidence ?? 0),
                  });
                }
              }
            }
          }
        }

        const out: TesseractResult = {
          text: ret.data.text || "",
          words,
          pageConfidence: Math.round(ret.data.confidence ?? 0),
        };

        // Populate in-memory cache
        inMemoryCache.set(hash, out);

        // Populate disk cache if configured
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
