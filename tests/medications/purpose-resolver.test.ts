import { describe, it, expect } from "vitest";
import { getMedicationPurpose } from "@/lib/medications/purpose-resolver";

describe("Medication Purpose Resolver", () => {
  it("resolves common blood pressure medications", () => {
    expect(getMedicationPurpose("Tab Telmisartan 40mg OD")).toBe("Blood pressure management");
    expect(getMedicationPurpose("Amlodipine 5mg")).toBe("Blood pressure management");
    expect(getMedicationPurpose("Amlong 2.5")).toBe("Blood pressure management");
    expect(getMedicationPurpose("Losar 50mg")).toBe("Blood pressure management");
  });

  it("resolves common diabetes medications", () => {
    expect(getMedicationPurpose("Metformin 500mg (1-0-1)")).toBe("Blood sugar control (Type-2 Diabetes)");
    expect(getMedicationPurpose("Glycomet GP 1")).toBe("Blood sugar control (Type-2 Diabetes)");
    expect(getMedicationPurpose("Vildagliptin 50mg")).toBe("Blood sugar control (Type-2 Diabetes)");
    expect(getMedicationPurpose("Januvia 100mg")).toBe("Blood sugar control (Type-2 Diabetes)");
  });

  it("resolves antibiotics and antipyretics", () => {
    expect(getMedicationPurpose("Augmentin 625mg")).toBe("Bacterial infection treatment (Antibiotic)");
    expect(getMedicationPurpose("Azee 500")).toBe("Bacterial infection treatment (Antibiotic)");
    expect(getMedicationPurpose("Dolo 650mg SOS")).toBe("Fever reduction & pain relief");
    expect(getMedicationPurpose("Calpol 500")).toBe("Fever reduction & pain relief");
  });

  it("resolves gastric & acid reflux medications", () => {
    expect(getMedicationPurpose("Pan-D 1 Cap Before Breakfast")).toBe("Acidity, nausea & acid reflux relief");
    expect(getMedicationPurpose("Omez 20mg")).toBe("Acidity & gastric acid reduction");
    expect(getMedicationPurpose("Rabeprazole 20mg")).toBe("Acidity & acid reflux relief");
  });

  it("resolves statins & cardioprotective agents", () => {
    expect(getMedicationPurpose("Atorva 20mg HS")).toBe("Cholesterol reduction & cardiovascular protection");
    expect(getMedicationPurpose("Rosuvastatin 10mg")).toBe("Cholesterol reduction & cardiovascular protection");
    expect(getMedicationPurpose("Ecosprin 75mg")).toBe("Blood clot prevention & cardiovascular support");
  });

  it("resolves via pharmacological suffix fallback", () => {
    expect(getMedicationPurpose("Pitavastatin 2mg")).toBe("Cholesterol reduction & cardiovascular protection");
    expect(getMedicationPurpose("Cande-sartan 8mg")).toBe("Blood pressure management");
    expect(getMedicationPurpose("Ceftriaxone")).toBe("Bacterial infection treatment (Antibiotic)");
  });

  it("returns null for unknown/empty strings without hallucinations", () => {
    expect(getMedicationPurpose("")).toBeNull();
    expect(getMedicationPurpose("RandomNonMedicationStringXYZ")).toBeNull();
  });
});
