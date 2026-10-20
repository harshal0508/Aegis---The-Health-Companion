import fs from "fs";
import path from "path";

const csvPath = path.resolve(process.cwd(), "test-files", "ground_truth", "discharge_summaries_ground_truth.csv");
const content = fs.readFileSync(csvPath, "utf8");
const regex = /(med_doc_discharge_summary_\d+_noisy\.jpg),discharge_summary,"(\{[\s\S]*?\})"\r?\n/g;

let m;
let count = 0;
console.log("=== INSPECTING KAGGLE GROUND TRUTH FOR DOCS 1-10 ===");
while ((m = regex.exec(content)) !== null && count < 10) {
  count++;
  const filename = m[1];
  const data = JSON.parse(m[2].replace(/""/g, '"'));
  console.log(`\nDoc ${count}: ${filename}`);
  console.log(`Keys:`, Object.keys(data).join(", "));
  console.log(`Diagnosis:`, data.diagnosis);
  console.log(`Medications (${data.medications?.length || 0}):`, data.medications);
  console.log(`Allergies:`, data.allergies !== undefined ? data.allergies : "[FIELD ABSENT IN JSON]");
}
