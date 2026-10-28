import { describe, it, expect } from "vitest";
import {
  getAdvisoriesForLocality,
  REGIONAL_DISEASE_ADVISORIES,
} from "@/lib/advisories/disease-data";
import {
  matchConfirmedPrecautions,
  KNOWN_CONDITION_PRECAUTIONS,
} from "@/lib/advisories/condition-precautions";

describe("MedAnchor · Tier 04 Local Health Advisories & Precautions", () => {
  describe("Locality Disease Surveillance", () => {
    it("returns active advisories for Bhopal by city name", () => {
      const result = getAdvisoriesForLocality("Bhopal");
      expect(result.advisories.length).toBeGreaterThan(0);
      expect(result.matchedLocality).toContain("Bhopal");

      const dengue = result.advisories.find((a) => a.id === "dengue-surge");
      expect(dengue).toBeDefined();
      expect(dengue?.severity).toBe("high");
      expect(dengue?.precautions.some((p) => p.includes("NSAIDs"))).toBe(true);
    });

    it("matches advisories correctly by Indian 6-digit Pincode (462001)", () => {
      const result = getAdvisoriesForLocality("462001");
      expect(result.advisories.length).toBeGreaterThan(0);
      expect(result.matchedLocality).toContain("Bhopal");
    });

    it("matches Delhi / NCR by pincode prefix (110001)", () => {
      const result = getAdvisoriesForLocality("110001");
      expect(result.advisories.length).toBeGreaterThan(0);
      expect(result.matchedLocality).toContain("Delhi");
    });

    it("falls back to national priority advisories for unmapped remote pincode", () => {
      const result = getAdvisoriesForLocality("799001");
      expect(result.advisories.length).toBe(2);
      expect(result.matchedLocality).toContain("Regional General Advisory");
    });
  });

  describe("Personalized Condition Precautions", () => {
    it("matches diabetes precautions when Type 2 Diabetes is confirmed", () => {
      const confirmed = [
        { category: "condition", value: "Type 2 Diabetes Mellitus" },
      ];
      const precautions = matchConfirmedPrecautions(confirmed);
      expect(precautions.length).toBe(1);
      expect(precautions[0].matchedTitle).toContain("Diabetes");
      expect(precautions[0].dailyPrecautions.some((p) => p.includes("Sick-Day"))).toBe(true);
      expect(precautions[0].outbreakVulnerabilityNote).toContain("Elevated Vulnerability");
    });

    it("matches hypertension and cross-references pseudoephedrine cold medicine caution", () => {
      const confirmed = [
        { category: "condition", value: "Essential Hypertension" },
      ];
      const precautions = matchConfirmedPrecautions(confirmed);
      expect(precautions.length).toBe(1);
      expect(precautions[0].matchedTitle).toContain("Hypertension");
      expect(precautions[0].dailyPrecautions.some((p) => p.includes("decongestants"))).toBe(true);
    });

    it("matches asthma and highlights respiratory outbreak vulnerability", () => {
      const confirmed = [
        { category: "condition", value: "Bronchial Asthma (Moderate Persistent)" },
      ];
      const precautions = matchConfirmedPrecautions(confirmed);
      expect(precautions.length).toBe(1);
      expect(precautions[0].matchedTitle).toContain("Asthma");
      expect(precautions[0].outbreakVulnerabilityNote).toContain("Viral Respiratory");
    });

    it("matches penicillin allergy with cross-reactive guidance", () => {
      const confirmed = [
        { category: "allergy", value: "Penicillin (rash & hives)" },
      ];
      const precautions = matchConfirmedPrecautions(confirmed);
      expect(precautions.length).toBe(1);
      expect(precautions[0].matchedTitle).toContain("Penicillin");
      expect(precautions[0].dailyPrecautions.some((p) => p.includes("cephalosporins"))).toBe(true);
    });

    it("returns general healthy baseline when no specific chronic conditions exist", () => {
      const precautions = matchConfirmedPrecautions([]);
      expect(precautions.length).toBe(1);
      expect(precautions[0].matchedTitle).toBe("General Preventive Health Baseline");
      expect(precautions[0].dailyPrecautions.length).toBeGreaterThan(0);
    });
  });
});
