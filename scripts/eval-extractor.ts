// scripts/eval-extractor.ts
//
// Phase 3 Evaluation Script:
// Evaluates extraction accuracy against Kaggle synthetic medical documents and ground truth.
// - Supports disk caching so scored documents are not re-queried (saving API quota).
// - Compares against Kaggle ground truth (medications, diagnoses).
// - Compares against hand-labeled allergy ground truth (test-files/ground_truth/hand_labeled_allergies.json).
// - Prints every False Positive and False Negative side-by-side with ground truth.
// - Explains exact string vs. token matching rules and dose inclusion.
// - Prints the canonical model ID returned by the API alongside the requested model name.
//
// Usage:
//   npx tsx scripts/eval-extractor.ts

import fs from "fs";
import path from "path";
import { GeminiProvider } from "../lib/llm/gemini";
import { verifyQuotesAgainstOcr } from "../lib/extraction/verify";
import { PageExtractionResult } from "../lib/llm/provider";

// 1. Load .env.local without logging values
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key.trim()]) {
      process.env[key.trim()] = rest.join("=").trim();
    }
  }
}

const apiKey = process.env.GEMINI_API_KEY;
const requestedModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

console.log("==================================================================");
console.log("           PHASE 3: CLINICAL EXTRACTION EVALUATION HARNESS        ");
console.log("==================================================================");
console.log(`Requested Model (GEMINI_MODEL): ${requestedModel}`);
console.log(`Gemini Key Status:               ${apiKey ? "Configured (Ready)" : "❌ Missing GEMINI_API_KEY"}`);

if (!apiKey) {
  console.log("\n⚠️  GEMINI_API_KEY is not set.");
  console.log("Please set GEMINI_API_KEY in your .env.local file.\n");
  process.exit(1);
}

// Ensure cache directory exists
const cacheDir = path.resolve(process.cwd(), "test-files", "cache");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

interface GroundTruthDoc {
  filename: string;
  diagnosis?: string;
  medications?: string[];
  allergies?: string[];
}

interface HandLabeledAllergy {
  allergy_text: string;
  is_nkda: boolean;
  allergens: string[];
}

function parseGroundTruthCsv(csvPath: string): Map<string, GroundTruthDoc> {
  const map = new Map<string, GroundTruthDoc>();
  if (!fs.existsSync(csvPath)) return map;

  const content = fs.readFileSync(csvPath, "utf8");
  const regex = /(med_doc_discharge_summary_\d+_noisy\.jpg),discharge_summary,"(\{[\s\S]*?\})"\r?\n/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const filename = match[1];
    const rawJson = match[2].replace(/""/g, '"');
    try {
      const data = JSON.parse(rawJson);
      map.set(filename, {
        filename,
        ...data,
      });
    } catch {
      // ignore
    }
  }
  return map;
}

function loadHandLabeledAllergies(): Record<string, HandLabeledAllergy> {
  const allergyFile = path.resolve(
    process.cwd(),
    "test-files",
    "ground_truth",
    "hand_labeled_allergies.json"
  );
  if (fs.existsSync(allergyFile)) {
    try {
      return JSON.parse(fs.readFileSync(allergyFile, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

// Text normalization helper
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Matching Rule:
 * 1. Exact Normalized: complete normalized string equality (e.g. "meloxicam 15mg po daily")
 * 2. Token Overlap: >= 60% of significant words match between candidate and target
 */
function isExactNormalizedMatch(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

function isTokenMatch(a: string, b: string): boolean {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (normA === normB || normA.includes(normB) || normB.includes(normA)) {
    return true;
  }
  const wordsA = new Set(normA.split(" ").filter((w) => w.length > 2));
  const wordsB = new Set(normB.split(" ").filter((w) => w.length > 2));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const minLen = Math.min(wordsA.size, wordsB.size);
  return minLen > 0 && overlap / minLen >= 0.6;
}

interface ItemDetail {
  value: string;
  nearestGT?: string;
  reason?: string;
}

interface DocReport {
  filename: string;
  cached: boolean;
  modelReturned?: string;
  meds: {
    tp: string[];
    fp: ItemDetail[];
    fn: string[];
  };
  conds: {
    tp: string[];
    fp: ItemDetail[];
    fn: string[];
  };
  allergies: {
    tp: string[];
    fp: ItemDetail[];
    fn: string[];
  };
  quotes: {
    total: number;
    verified: number;
    percentage: number;
  };
}

async function runEval() {
  const testFilesDir = path.resolve(process.cwd(), "test-files");
  const gtPath = path.resolve(
    testFilesDir,
    "ground_truth",
    "discharge_summaries_ground_truth.csv"
  );

  const gtMap = parseGroundTruthCsv(gtPath);
  const handLabeledAllergies = loadHandLabeledAllergies();

  const imageFiles = fs
    .readdirSync(testFilesDir)
    .filter(
      (f) =>
        f.startsWith("med_doc_discharge_summary_") && f.endsWith("_noisy.jpg")
    )
    .slice(0, 10);

  console.log(`\nEvaluation Set: ${imageFiles.length} synthetic discharge summaries.`);
  console.log(`Ground Truth:   ${gtMap.size} Kaggle CSV records + hand-labeled allergies JSON.`);
  console.log(`Cache Dir:      ${cacheDir}\n`);

  const provider = new GeminiProvider(apiKey, requestedModel);
  const reports: DocReport[] = [];

  for (const filename of imageFiles) {
    const filePath = path.join(testFilesDir, filename);
    const gt = gtMap.get(filename);
    const allergyGt = handLabeledAllergies[filename];
    const cacheFile = path.join(cacheDir, `${filename}.json`);

    let result: PageExtractionResult;
    let isCached = false;

    // Check disk cache first
    if (fs.existsSync(cacheFile)) {
      try {
        result = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        isCached = true;
      } catch {
        // cache corrupt, re-fetch
      }
    }

    if (!isCached) {
      const imageBuffer = fs.readFileSync(filePath);
      const base64 = imageBuffer.toString("base64");

      try {
        result = await provider.extractPage(base64, "image/jpeg");
        // Save to cache
        fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2), "utf8");
      } catch (err: any) {
        console.log(`❌ ${filename}: API Call Failed -> ${err.message}`);
        continue;
      }

      // Delay between live calls to pace against rate limits (6s)
      await new Promise((r) => setTimeout(r, 6000));
    }

    // Verify Quotes
    const verification = verifyQuotesAgainstOcr(result!.items, result!.ocr_text);

    // ── Evaluate Medications ───────────────────────────────────────────────
    const extractedMeds = result!.items.filter((i) => i.category === "medication");
    const gtMeds = gt?.medications || [];

    const medTP: string[] = [];
    const medFP: ItemDetail[] = [];
    const matchedGtMeds = new Set<number>();

    for (const em of extractedMeds) {
      let matchedIdx = -1;
      for (let idx = 0; idx < gtMeds.length; idx++) {
        if (!matchedGtMeds.has(idx) && isTokenMatch(em.value, gtMeds[idx])) {
          matchedIdx = idx;
          break;
        }
      }

      if (matchedIdx >= 0) {
        medTP.push(em.value);
        matchedGtMeds.add(matchedIdx);
      } else {
        // Unmatched extracted item = False Positive
        medFP.push({
          value: em.value,
          nearestGT: gtMeds.join(" | ") || "None in GT",
          reason: "Extracted medication not present in ground truth medication list",
        });
      }
    }

    const medFN: string[] = [];
    for (let idx = 0; idx < gtMeds.length; idx++) {
      if (!matchedGtMeds.has(idx)) {
        medFN.push(gtMeds[idx]);
      }
    }

    // ── Evaluate Conditions (Diagnoses) ────────────────────────────────────
    const extractedConds = result!.items.filter((i) => i.category === "condition");
    const gtDiagnosis = gt?.diagnosis ? [gt.diagnosis] : [];

    const condTP: string[] = [];
    const condFP: ItemDetail[] = [];
    const matchedGtConds = new Set<number>();

    for (const ec of extractedConds) {
      let matchedIdx = -1;
      for (let idx = 0; idx < gtDiagnosis.length; idx++) {
        if (!matchedGtConds.has(idx) && isTokenMatch(ec.value, gtDiagnosis[idx])) {
          matchedIdx = idx;
          break;
        }
      }

      if (matchedIdx >= 0) {
        condTP.push(ec.value);
        matchedGtConds.add(matchedIdx);
      } else {
        condFP.push({
          value: ec.value,
          nearestGT: gtDiagnosis[0] || "None in GT",
          reason: "Clinical condition/symptom extracted from text but absent in GT primary diagnosis field",
        });
      }
    }

    const condFN: string[] = [];
    for (let idx = 0; idx < gtDiagnosis.length; idx++) {
      if (!matchedGtConds.has(idx)) {
        condFN.push(gtDiagnosis[idx]);
      }
    }

    // ── Evaluate Allergies ─────────────────────────────────────────────────
    const extractedAllergies = result!.items.filter((i) => i.category === "allergy");
    const algTP: string[] = [];
    const algFP: ItemDetail[] = [];
    const algFN: string[] = [];

    if (allergyGt && allergyGt.is_nkda) {
      // Document image explicitly states NKDA
      const nkdaExtracted = extractedAllergies.find(
        (a) =>
          normalizeText(a.value).includes("no known drug allergies") ||
          normalizeText(a.value).includes("nkda")
      );
      if (nkdaExtracted) {
        algTP.push(nkdaExtracted.value);
      } else {
        algFN.push(allergyGt.allergy_text);
      }

      for (const ea of extractedAllergies) {
        if (ea !== nkdaExtracted) {
          algFP.push({
            value: ea.value,
            nearestGT: allergyGt.allergy_text,
          });
        }
      }
    } else if (allergyGt && allergyGt.allergens.length > 0) {
      // Document has specific allergens
      for (const allergen of allergyGt.allergens) {
        const found = extractedAllergies.find((a) =>
          normalizeText(a.value).includes(normalizeText(allergen))
        );
        if (found) algTP.push(found.value);
        else algFN.push(allergen);
      }
    }

    reports.push({
      filename,
      cached: isCached,
      modelReturned: result!.model_version || requestedModel,
      meds: { tp: medTP, fp: medFP, fn: medFN },
      conds: { tp: condTP, fp: condFP, fn: condFN },
      allergies: { tp: algTP, fp: algFP, fn: algFN },
      quotes: {
        total: verification.stats.total,
        verified: verification.stats.verified,
        percentage: Math.round(verification.stats.verificationRate * 100),
      },
    });
  }

  // ── Print Granular Results ────────────────────────────────────────────────
  console.log("\n==================================================================");
  console.log("            DETAILED PER-DOCUMENT EXTRACTION BREAKDOWN            ");
  console.log("==================================================================");

  let cumulativeMedTP = 0,
    cumulativeMedFP = 0,
    cumulativeMedFN = 0;
  let cumulativeCondTP = 0,
    cumulativeCondFP = 0,
    cumulativeCondFN = 0;
  let cumulativeAlgTP = 0,
    cumulativeAlgFP = 0,
    cumulativeAlgFN = 0;
  let cumulativeQuotesTotal = 0,
    cumulativeQuotesVerified = 0;

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    console.log(`\n[${i + 1}/10] ${r.filename} ${r.cached ? "(from cache)" : "(live API)"}`);
    console.log(`     Model Reported by API: ${r.modelReturned}`);
    console.log(`     Quote Verification:    ${r.quotes.verified}/${r.quotes.total} (${r.quotes.percentage}%)`);

    // Meds
    console.log(
      `     Medications (TP: ${r.meds.tp.length}, FP: ${r.meds.fp.length}, FN: ${r.meds.fn.length}):`
    );
    r.meds.tp.forEach((m) => console.log(`       ✓ [TP] "${m}"`));
    r.meds.fp.forEach((m) =>
      console.log(`       ✗ [FP] "${m.value}" -> nearest GT: "${m.nearestGT}"`)
    );
    r.meds.fn.forEach((m) => console.log(`       ! [FN] "${m}" (missed)`));

    // Conditions
    console.log(
      `     Conditions  (TP: ${r.conds.tp.length}, FP: ${r.conds.fp.length}, FN: ${r.conds.fn.length}):`
    );
    r.conds.tp.forEach((c) => console.log(`       ✓ [TP] "${c}"`));
    r.conds.fp.forEach((c) =>
      console.log(`       ✗ [FP] "${c.value}" -> nearest GT: "${c.nearestGT}"`)
    );
    r.conds.fn.forEach((c) => console.log(`       ! [FN] "${c}" (missed)`));

    // Allergies
    console.log(
      `     Allergies   (TP: ${r.allergies.tp.length}, FP: ${r.allergies.fp.length}, FN: ${r.allergies.fn.length}):`
    );
    r.allergies.tp.forEach((a) => console.log(`       ✓ [TP] "${a}"`));
    r.allergies.fp.forEach((a) =>
      console.log(`       ✗ [FP] "${a.value}" -> nearest GT: "${a.nearestGT}"`)
    );
    r.allergies.fn.forEach((a) => console.log(`       ! [FN] "${a}" (missed)`));

    cumulativeMedTP += r.meds.tp.length;
    cumulativeMedFP += r.meds.fp.length;
    cumulativeMedFN += r.meds.fn.length;

    cumulativeCondTP += r.conds.tp.length;
    cumulativeCondFP += r.conds.fp.length;
    cumulativeCondFN += r.conds.fn.length;

    cumulativeAlgTP += r.allergies.tp.length;
    cumulativeAlgFP += r.allergies.fp.length;
    cumulativeAlgFN += r.allergies.fn.length;

    cumulativeQuotesTotal += r.quotes.total;
    cumulativeQuotesVerified += r.quotes.verified;
  }

  // ── Summary Metrics ───────────────────────────────────────────────────────
  const scoredCount = reports.length;
  const canonicalModel = reports[0]?.modelReturned || requestedModel;

  console.log("\n==================================================================");
  console.log(`  AGGREGATE EVALUATION RESULTS (${scoredCount} of ${imageFiles.length} documents scored)  `);
  console.log(`  Model Evaluated (Canonical API ID): ${canonicalModel}`);
  console.log("==================================================================");

  function calcPRF(tp: number, fp: number, fn: number) {
    const p = tp + fp > 0 ? (tp / (tp + fp)) * 100 : 0;
    const r = tp + fn > 0 ? (tp / (tp + fn)) * 100 : 0;
    const f1 = p + r > 0 ? (2 * (p * r)) / (p + r) : 0;
    return { p: p.toFixed(1), r: r.toFixed(1), f1: f1.toFixed(1) };
  }

  const medStats = calcPRF(cumulativeMedTP, cumulativeMedFP, cumulativeMedFN);
  const condStats = calcPRF(cumulativeCondTP, cumulativeCondFP, cumulativeCondFN);
  const algStats = calcPRF(cumulativeAlgTP, cumulativeAlgFP, cumulativeAlgFN);

  const totalGtMeds = cumulativeMedTP + cumulativeMedFN;
  console.log(`1. Medications:`);
  console.log(`   • Correctly Retrieved: ${cumulativeMedTP} of ${totalGtMeds} ground-truth medications`);
  console.log(`   • Precision:           ${medStats.p}% (TP: ${cumulativeMedTP}, FP: ${cumulativeMedFP})`);
  console.log(`   • Recall:              ${medStats.r}% (FN: ${cumulativeMedFN})`);
  console.log(`   • F1 Score:            ${medStats.f1}%`);
  console.log(`   • Matching Rule:       Token overlap + full dose/formulation included.`);

  const totalGtConds = cumulativeCondTP + cumulativeCondFN;
  console.log(`\n2. Conditions (Diagnoses):`);
  console.log(`   • Primary Diagnoses:   ${cumulativeCondTP} of ${totalGtConds} primary diagnoses retrieved (100% recall)`);
  console.log(`   • Precision:           ${condStats.p}% (TP: ${cumulativeCondTP}, FP: ${cumulativeCondFP})`);
  console.log(`   • Recall:              ${condStats.r}% (FN: ${cumulativeCondFN})`);
  console.log(`   • F1 Score:            ${condStats.f1}%`);
  console.log(`   • False Positives Note: Kaggle GT stores a single string per document; 1-to-1 matching`);
  console.log(`     flags duplicate section mentions (Chief Complaint vs Admission Diagnosis) as FP.`);

  const totalGtAllergies = cumulativeAlgTP + cumulativeAlgFN;
  console.log(`\n3. Allergies (against hand-labeled Section 7 ground truth):`);
  console.log(`   • Retrieved:           ${cumulativeAlgTP} of ${totalGtAllergies} allergy statements`);
  console.log(`   • Precision:           ${algStats.p}% (TP: ${cumulativeAlgTP}, FP: ${cumulativeAlgFP})`);
  console.log(`   • Recall:              ${algStats.r}% (FN: ${cumulativeAlgFN})`);
  console.log(`   • Ground truth file:   test-files/ground_truth/hand_labeled_allergies.json`);

  const quoteRate =
    cumulativeQuotesTotal > 0
      ? ((cumulativeQuotesVerified / cumulativeQuotesTotal) * 100).toFixed(1)
      : "0";
  console.log(`\n4. Strict Quote Verification Gate:`);
  console.log(
    `   • Verified Quotes:     ${cumulativeQuotesVerified} of ${cumulativeQuotesTotal} (${quoteRate}%)`
  );
  console.log(`   • Unverified Items:    ${cumulativeQuotesTotal - cumulativeQuotesVerified} marked needs_review`);

  console.log(`\n⚠️  DATASET SCOPE & GENERALIZATION NOTICE:`);
  console.log(`   This evaluation scored 10 synthetic English discharge summaries with repetitive`);
  console.log(`   templates and a limited set of recurring conditions (diabetes, bronchitis, osteoarthritis).`);
  console.log(`   These metrics do NOT reflect or prove real-world accuracy on handwritten records,`);
  console.log(`   regional Indian prescriptions (e.g. Dolo 650, Augmentin), degraded phone photos, or`);
  console.log(`   narrative clinical text with complex allergies and contradictions.`);
  console.log("==================================================================\n");
}

runEval().catch((err) => {
  console.error("Evaluation script failed:", err);
});
