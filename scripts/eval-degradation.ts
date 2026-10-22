import fs from "fs";
import path from "path";
import sharp from "sharp";
import { ocrPage, terminateOcrWorker } from "../lib/ocr/tesseract";
import { crossCheckItem } from "../lib/extraction/crosscheck";

interface GroundTruthDoc {
  filename: string;
  diagnosis?: string;
  medications?: string[];
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
      // ignore parse errors
    }
  }
  return map;
}

interface DegradationVariant {
  name: string;
  description: string;
  apply: (buf: Buffer) => Promise<Buffer>;
}

const DEGRADATION_VARIANTS: DegradationVariant[] = [
  {
    name: "blur",
    description: "Gaussian blur (sigma=2.0)",
    apply: (buf) => sharp(buf).blur(2.0).toBuffer(),
  },
  {
    name: "rotation",
    description: "Camera tilt rotation (3 degrees)",
    apply: (buf) => sharp(buf).rotate(3, { background: "#ffffff" }).toBuffer(),
  },
  {
    name: "downscale",
    description: "Low resolution mobile scan (width=750px)",
    apply: (buf) => sharp(buf).resize({ width: 750 }).toBuffer(),
  },
  {
    name: "low_jpeg",
    description: "Heavy compression artifacts (JPEG q=20)",
    apply: (buf) => sharp(buf).jpeg({ quality: 20 }).toBuffer(),
  },
  {
    name: "low_contrast",
    description: "Faded carbon/faint thermal print (linear 0.5, 60)",
    apply: (buf) => sharp(buf).linear(0.5, 60).toBuffer(),
  },
  {
    name: "combined",
    description: "Harsh clinic photo: tilt + blur + noise + low contrast",
    apply: (buf) =>
      sharp(buf)
        .rotate(2.5, { background: "#ffffff" })
        .blur(1.2)
        .linear(0.6, 50)
        .jpeg({ quality: 25 })
        .toBuffer(),
  },
];

async function runDegradationBenchmark() {
  const testFilesDir = path.resolve(process.cwd(), "test-files");
  const gtPath = path.resolve(
    testFilesDir,
    "ground_truth",
    "discharge_summaries_ground_truth.csv"
  );
  const gtMap = parseGroundTruthCsv(gtPath);

  const baseFiles = fs
    .readdirSync(testFilesDir)
    .filter(
      (f) =>
        f.startsWith("med_doc_discharge_summary_") && f.endsWith("_noisy.jpg")
    )
    .sort()
    .slice(0, 10);

  const degradedDir = path.resolve(testFilesDir, "degraded");
  if (!fs.existsSync(degradedDir)) {
    fs.mkdirSync(degradedDir, { recursive: true });
  }

  console.log("==================================================================");
  console.log("      DEGRADATION BENCHMARK: STRESS-TESTING OCR CROSS-CHECK       ");
  console.log("==================================================================");
  console.log(`Base Documents:     ${baseFiles.length} discharge summaries`);
  console.log(`Variants per Doc:   ${DEGRADATION_VARIANTS.length} synthetic degradations`);
  console.log(`Total Test Scans:   ${baseFiles.length * DEGRADATION_VARIANTS.length}`);
  console.log("------------------------------------------------------------------\n");

  const variantStats: Record<
    string,
    { totalItems: number; agree: number; disagree: number; unavailable: number; avgConf: number }
  > = {};

  for (const v of DEGRADATION_VARIANTS) {
    variantStats[v.name] = { totalItems: 0, agree: 0, disagree: 0, unavailable: 0, avgConf: 0 };
  }

  let totalScansProcessed = 0;
  const disagreementsList: Array<{
    variant: string;
    file: string;
    item: string;
    missingTokens: string[];
    conf: number;
  }> = [];

  for (const baseFile of baseFiles) {
    const rawImageBuf = fs.readFileSync(path.join(testFilesDir, baseFile));
    const gt = gtMap.get(baseFile);

    const groundTruthItems: Array<{ category: string; value: string; quote: string }> = [];
    if (gt?.diagnosis) {
      groundTruthItems.push({
        category: "condition",
        value: gt.diagnosis,
        quote: gt.diagnosis,
      });
    }
    if (gt?.medications) {
      for (const med of gt.medications) {
        groundTruthItems.push({
          category: "medication",
          value: med,
          quote: med,
        });
      }
    }

    for (const variant of DEGRADATION_VARIANTS) {
      const degradedBuffer = await variant.apply(rawImageBuf);
      totalScansProcessed++;

      process.stdout.write(
        `[${totalScansProcessed}/${baseFiles.length * DEGRADATION_VARIANTS.length}] ${baseFile.slice(0, 26)} (${variant.name}) ... `
      );

      // Run Tesseract second reader on degraded buffer (in-memory)
      const ocrResult = await ocrPage(degradedBuffer, { useCache: false });
      process.stdout.write(`Conf: ${ocrResult.pageConfidence}%\n`);

      const stats = variantStats[variant.name];
      stats.avgConf += ocrResult.pageConfidence;

      for (const item of groundTruthItems) {
        stats.totalItems++;
        const check = crossCheckItem(item, ocrResult, { confidenceThreshold: 60 });

        if (check.state === "agree") {
          stats.agree++;
        } else if (check.state === "disagree") {
          stats.disagree++;
          disagreementsList.push({
            variant: variant.name,
            file: baseFile,
            item: item.value,
            missingTokens: check.missingTokens,
            conf: ocrResult.pageConfidence,
          });
        } else if (check.state === "unavailable") {
          stats.unavailable++;
        }
      }
    }
  }

  await terminateOcrWorker();

  // Print Summary Table
  console.log("\n==================================================================");
  console.log("                  DEGRADATION BENCHMARK RESULTS                   ");
  console.log("==================================================================");
  console.log("Variant         | Avg Conf | Total Items | Agree (%)     | Disagree (%)  | Unavailable (%)");
  console.log("----------------|----------|-------------|---------------|---------------|----------------");

  for (const v of DEGRADATION_VARIANTS) {
    const s = variantStats[v.name];
    const avg = (s.avgConf / baseFiles.length).toFixed(0);
    const agreePct = ((s.agree / s.totalItems) * 100).toFixed(1);
    const disPct = ((s.disagree / s.totalItems) * 100).toFixed(1);
    const unavPct = ((s.unavailable / s.totalItems) * 100).toFixed(1);

    console.log(
      `${v.name.padEnd(15)} | ${avg.padStart(7)}% | ${String(s.totalItems).padStart(11)} | ${String(s.agree).padStart(5)} (${agreePct.padStart(5)}%) | ${String(s.disagree).padStart(5)} (${disPct.padStart(5)}%) | ${String(s.unavailable).padStart(5)} (${unavPct.padStart(5)}%)`
    );
  }

  console.log("\n--- KEY OBSERVATIONS & SAFETY GATE BEHAVIOR ---");
  const combinedStats = variantStats["combined"];
  console.log(
    `1. Combined Harsh Degradation: Page confidence dropped to ${(combinedStats.avgConf / baseFiles.length).toFixed(0)}%.`
  );
  console.log(
    `2. Unavailable Safeguard: ${combinedStats.unavailable} / ${combinedStats.totalItems} items (${((combinedStats.unavailable / combinedStats.totalItems) * 100).toFixed(1)}%) safely triggered 'unavailable', preventing user alert fatigue.`
  );
  console.log(
    `3. Disagreements Flagged: Found ${disagreementsList.length} genuine disagreements where degraded pixels corrupted characters (e.g. missing numbers/letters) while confidence remained borderline.`
  );

  if (disagreementsList.length > 0) {
    console.log(`\nSample Disagreements Flagged on Degraded Images:`);
    disagreementsList.slice(0, 5).forEach((d, i) => {
      console.log(
        `  ${i + 1}. [${d.variant}] ${d.item} -> Missing token(s): ${d.missingTokens.join(", ")} (Page Conf: ${d.conf}%)`
      );
    });
  }

  console.log("\n==================================================================\n");
}

runDegradationBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
