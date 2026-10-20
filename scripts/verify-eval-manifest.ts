// scripts/verify-eval-manifest.ts
//
// Verification safeguard:
// Refuses to allow evaluation scoring on incomplete or placeholder datasets.
// Ensures that every harder test case:
// 1. Physically exists on disk in test-files/
// 2. Contains non-empty, validated clinical ground-truth labels
// 3. Has explicit allergy rules (NKDA, real allergens, or verified no-allergy-section)
// 4. Contains dose signatures for medication error verification

import fs from "fs";
import path from "path";

interface AllergenSpec {
  substance: string;
  reaction?: string | null;
  severity?: string | null;
}

interface MedicationSpec {
  name: string;
  generic_name?: string | null;
  dose: string;
  route: string;
  frequency: string;
  is_indian_brand?: boolean;
}

interface ConditionSpec {
  name: string;
  is_primary?: boolean;
  is_secondary_or_symptom?: boolean;
}

interface HarderTestCase {
  id: string;
  filename: string;
  document_type: string;
  difficulty_tags: string[];
  expected: {
    doc_date: string | null;
    allergies: {
      has_allergy_section: boolean;
      is_nkda: boolean;
      allergens: AllergenSpec[];
      has_contradiction?: boolean;
      contradiction_notes?: string;
    };
    medications: MedicationSpec[];
    conditions: ConditionSpec[];
  };
}

interface ManifestFile {
  version: string;
  description: string;
  documents: HarderTestCase[];
}

export function verifyManifest(manifestPath?: string): {
  valid: boolean;
  totalDocs: number;
  availableOnDisk: number;
  errors: string[];
  warnings: string[];
} {
  const targetPath =
    manifestPath ||
    path.resolve(process.cwd(), "test-files", "ground_truth", "harder_cases_manifest.json");

  if (!fs.existsSync(targetPath)) {
    return {
      valid: false,
      totalDocs: 0,
      availableOnDisk: 0,
      errors: [`Manifest file not found at: ${targetPath}`],
      warnings: [],
    };
  }

  let manifest: ManifestFile;
  try {
    manifest = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (err: any) {
    return {
      valid: false,
      totalDocs: 0,
      availableOnDisk: 0,
      errors: [`Failed to parse JSON manifest: ${err.message}`],
      warnings: [],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const testFilesDir = path.resolve(process.cwd(), "test-files");

  if (!manifest.documents || !Array.isArray(manifest.documents) || manifest.documents.length === 0) {
    errors.push("Manifest contains zero document specifications.");
    return { valid: false, totalDocs: 0, availableOnDisk: 0, errors, warnings };
  }

  let onDiskCount = 0;

  for (let idx = 0; idx < manifest.documents.length; idx++) {
    const doc = manifest.documents[idx];
    const prefix = `[Doc #${idx + 1} (${doc.id || "unnamed"})]`;

    if (!doc.filename) {
      errors.push(`${prefix} Missing required 'filename' property.`);
      continue;
    }

    const filePath = path.join(testFilesDir, doc.filename);
    const exists = fs.existsSync(filePath);

    if (!exists) {
      errors.push(`${prefix} File does not exist on disk: test-files/${doc.filename}`);
    } else {
      onDiskCount++;
    }

    // Check Expected Block
    if (!doc.expected) {
      errors.push(`${prefix} Missing 'expected' ground-truth object.`);
      continue;
    }

    // Check Allergies
    const alg = doc.expected.allergies;
    if (!alg) {
      errors.push(`${prefix} Missing 'expected.allergies' block.`);
    } else {
      if (typeof alg.has_allergy_section !== "boolean") {
        errors.push(`${prefix} 'has_allergy_section' must be an explicit boolean.`);
      }
      if (typeof alg.is_nkda !== "boolean") {
        errors.push(`${prefix} 'is_nkda' must be an explicit boolean.`);
      }
      if (alg.has_allergy_section === false && (alg.is_nkda || (alg.allergens && alg.allergens.length > 0))) {
        errors.push(`${prefix} When 'has_allergy_section' is false, 'is_nkda' must be false and 'allergens' must be empty.`);
      }
      if (alg.is_nkda && alg.allergens && alg.allergens.length > 0) {
        errors.push(`${prefix} Cannot have both 'is_nkda: true' and non-empty allergens list.`);
      }
      if (alg.has_contradiction && (!alg.contradiction_notes || alg.contradiction_notes.trim() === "")) {
        errors.push(`${prefix} 'has_contradiction: true' requires non-empty 'contradiction_notes'.`);
      }
    }

    // Check Medications
    if (!doc.expected.medications || !Array.isArray(doc.expected.medications)) {
      errors.push(`${prefix} Missing 'expected.medications' array.`);
    } else {
      for (let mIdx = 0; mIdx < doc.expected.medications.length; mIdx++) {
        const med = doc.expected.medications[mIdx];
        if (!med.name || med.name.trim() === "") {
          errors.push(`${prefix} Medication #${mIdx + 1} is missing required 'name'.`);
        }
        if (!med.dose || med.dose.trim() === "") {
          errors.push(`${prefix} Medication "${med.name || mIdx + 1}" is missing required 'dose'.`);
        }
      }
    }

    // Check Conditions
    if (!doc.expected.conditions || !Array.isArray(doc.expected.conditions)) {
      errors.push(`${prefix} Missing 'expected.conditions' array.`);
    } else {
      for (let cIdx = 0; cIdx < doc.expected.conditions.length; cIdx++) {
        const cond = doc.expected.conditions[cIdx];
        if (!cond.name || cond.name.trim() === "") {
          errors.push(`${prefix} Condition #${cIdx + 1} is missing required 'name'.`);
        }
      }
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    totalDocs: manifest.documents.length,
    availableOnDisk: onDiskCount,
    errors,
    warnings,
  };
}

// CLI Execution
if (require.main === module || process.argv[1]?.includes("verify-eval-manifest")) {
  console.log("==================================================================");
  console.log("       HARDER EVALUATION DATASET MANIFEST VERIFICATION GATE       ");
  console.log("==================================================================");

  const result = verifyManifest();

  console.log(`Total Defined Manifest Cases: ${result.totalDocs}`);
  console.log(`Available Physical Files:     ${result.availableOnDisk} of ${result.totalDocs}`);

  if (result.errors.length > 0) {
    console.log("\n❌ MANIFEST VERIFICATION FAILED (Refusing to report incomplete evaluation):");
    result.errors.forEach((e) => console.log(`  • ${e}`));
    console.log("\nAction required: Add physical test images and complete ground-truth labels before evaluating.\n");
    process.exit(1);
  } else {
    console.log("\n✅ MANIFEST VERIFICATION PASSED: All document images exist and ground truth labels are complete.\n");
    process.exit(0);
  }
}
