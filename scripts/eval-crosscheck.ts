import fs from "fs";
import path from "path";
import { ocrPage, terminateOcrWorker } from "../lib/ocr/tesseract";
import { crossCheckItem, extractCriticalTokens } from "../lib/extraction/crosscheck";

interface Item {
  category: string;
  value: string;
  quote?: string;
}

interface CachedExtraction {
  ocr_text: string;
  doc_date?: string | null;
  items: Item[];
}

interface DisagreementRecord {
  filename: string;
  category: string;
  value: string;
  missingTokens: string[];
  matchedTokens: string[];
  pageConfidence: number;
}

async function runCrossCheckEval() {
  const testFilesDir = path.resolve(process.cwd(), "test-files");
  const cacheDir = path.resolve(testFilesDir, "cache");
  const tesseractCacheDir = path.resolve(cacheDir, "tesseract");

  if (!fs.existsSync(tesseractCacheDir)) {
    fs.mkdirSync(tesseractCacheDir, { recursive: true });
  }

  const imageFiles = fs
    .readdirSync(testFilesDir)
    .filter(
      (f) =>
        f.startsWith("med_doc_discharge_summary_") && f.endsWith("_noisy.jpg")
    )
    .sort()
    .slice(0, 10);

  console.log("==================================================================");
  console.log("        PHASE 3 SECOND-READER (TESSERACT.JS) EVALUATION HARNESS   ");
  console.log("==================================================================");
  console.log(`Document Set:       ${imageFiles.length} synthetic discharge summaries`);
  console.log(`Tesseract Cache:    ${tesseractCacheDir}`);
  console.log("------------------------------------------------------------------\n");

  let totalGeminiItems = 0;
  let totalCriticalTokens = 0;
  let tesseractFoundTokens = 0;

  let totalAgree = 0;
  let totalDisagree = 0;
  let totalUnavailable = 0;

  const disagreements: DisagreementRecord[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i];
    const imagePath = path.join(testFilesDir, filename);
    const geminiCachePath = path.join(cacheDir, `${filename}.json`);

    if (!fs.existsSync(geminiCachePath)) {
      console.warn(`[Skip] No Gemini cache for ${filename}`);
      continue;
    }

    const geminiData: CachedExtraction = JSON.parse(
      fs.readFileSync(geminiCachePath, "utf8")
    );
    const imageBuffer = fs.readFileSync(imagePath);

    // 1. Run / load Tesseract OCR
    process.stdout.write(`[${i + 1}/${imageFiles.length}] Processing ${filename} ... `);
    const tesseractResult = await ocrPage(imageBuffer, {
      useCache: true,
      cacheDir: tesseractCacheDir,
    });
    console.log(`Done (Conf: ${tesseractResult.pageConfidence}%)`);

    // 2. Token-level baseline & item-level cross-check
    for (const item of geminiData.items) {
      totalGeminiItems++;
      const tokens = extractCriticalTokens(item);
      totalCriticalTokens += tokens.length;

      const check = crossCheckItem(item, tesseractResult);

      tesseractFoundTokens += check.matchedTokens.length;

      if (check.state === "agree") {
        totalAgree++;
      } else if (check.state === "disagree") {
        totalDisagree++;
        disagreements.push({
          filename,
          category: item.category,
          value: item.value,
          missingTokens: check.missingTokens,
          matchedTokens: check.matchedTokens,
          pageConfidence: tesseractResult.pageConfidence,
        });
      } else if (check.state === "unavailable") {
        totalUnavailable++;
      }
    }
  }

  await terminateOcrWorker();

  // Print Summary
  console.log("\n==================================================================");
  console.log("                     EVALUATION REPORT SUMMARY                    ");
  console.log("==================================================================");

  const tokenRecallRate =
    totalCriticalTokens > 0
      ? ((tesseractFoundTokens / totalCriticalTokens) * 100).toFixed(1)
      : "0";

  console.log("\n--- PART 1: TESSERACT TOKEN RECALL BASELINE ---");
  console.log(`Total Clinical Items (Gemini):      ${totalGeminiItems}`);
  console.log(`Total Critical Tokens Extracted:    ${totalCriticalTokens}`);
  console.log(
    `Critical Tokens Found by Tesseract: ${tesseractFoundTokens} / ${totalCriticalTokens} (${tokenRecallRate}%)`
  );

  console.log("\n--- PART 2: SECOND-READER CROSS-CHECK OUTCOMES ---");
  console.log(`Agree:       ${totalAgree} items (${((totalAgree / totalGeminiItems) * 100).toFixed(1)}%)`);
  console.log(`Disagree:    ${totalDisagree} items (${((totalDisagree / totalGeminiItems) * 100).toFixed(1)}%)`);
  console.log(`Unavailable: ${totalUnavailable} items (${((totalUnavailable / totalGeminiItems) * 100).toFixed(1)}%)`);

  console.log("\n--- PART 3: DISAGREEMENT INVESTIGATION ---");
  if (disagreements.length === 0) {
    console.log("Zero disagreements detected across all 10 synthetic documents.");
    console.log("Tesseract and Gemini agreed on all critical clinical tokens.");
  } else {
    console.log(`Found ${disagreements.length} disagreements:`);
    disagreements.forEach((d, idx) => {
      console.log(`\nDisagreement #${idx + 1}:`);
      console.log(`  File:        ${d.filename}`);
      console.log(`  Category:    ${d.category}`);
      console.log(`  Item Value:  ${d.value}`);
      console.log(`  Missing:     ${d.missingTokens.join(", ")}`);
      console.log(`  Matched:     ${d.matchedTokens.join(", ")}`);
      console.log(`  Page Conf:   ${d.pageConfidence}%`);
    });
  }

  console.log("\n==================================================================\n");
}

runCrossCheckEval().catch((err) => {
  console.error("Evaluation script failed:", err);
  process.exit(1);
});
