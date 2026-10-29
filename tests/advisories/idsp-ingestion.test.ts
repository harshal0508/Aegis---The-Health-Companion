import { describe, it, expect } from "vitest";
import {
  transformIdspToDiseaseAdvisory,
  matchClinicalProfile,
  OFFICIAL_IDSP_WEEKLY_BASELINE,
  IdspRawOutbreakItem,
} from "@/lib/advisories/idsp-ingestion";
import { getAdvisoriesForLocality } from "@/lib/advisories/disease-data";

describe("IDSP Weekly Outbreak Ingestion Pipeline (Approach 1)", () => {
  describe("1. Clinical Profile Matching", () => {
    it("maps dengue to vector_borne category with NCDC symptoms & precautions", () => {
      const profile = matchClinicalProfile("Dengue");
      expect(profile.category).toBe("vector_borne");
      expect(profile.categoryLabel).toBe("Vector-Borne");
      expect(profile.symptoms.some((s) => s.toLowerCase().includes("retro-orbital"))).toBe(true);
      expect(profile.precautions.some((p) => p.includes("Aspirin") || p.includes("NSAID"))).toBe(true);
    });

    it("maps cholera and acute diarrheal disease to water_borne", () => {
      const profileCholera = matchClinicalProfile("Cholera");
      expect(profileCholera.category).toBe("water_borne");
      expect(profileCholera.symptoms.some((s) => s.toLowerCase().includes("rice-water"))).toBe(true);

      const profileADD = matchClinicalProfile("Acute Diarrheal Disease (ADD)");
      expect(profileADD.category).toBe("water_borne");
    });

    it("maps H1N1 and Influenza to respiratory with mask guidance", () => {
      const profile = matchClinicalProfile("H1N1 Influenza");
      expect(profile.category).toBe("respiratory");
      expect(profile.precautions.some((p) => p.includes("mask"))).toBe(true);
    });

    it("maps Scrub Typhus to vector_borne with eschar symptom recognition", () => {
      const profile = matchClinicalProfile("Scrub Typhus");
      expect(profile.category).toBe("vector_borne");
      expect(profile.symptoms.some((s) => s.toLowerCase().includes("eschar"))).toBe(true);
    });
  });

  describe("2. IDSP Record Transformation & Severity Calculation", () => {
    it("transforms an active IDSP Dengue record with high severity when deaths > 0", () => {
      const raw: IdspRawOutbreakItem = {
        state: "Maharashtra",
        district: "Pune",
        diseaseName: "Dengue",
        casesCount: 64,
        deathsCount: 1,
        reportDate: "2026-10-25",
        status: "active",
        weekNumber: 42,
        actionTaken: "PMC anti-larval drive conducted across 12,000 households.",
      };

      const advisory = transformIdspToDiseaseAdvisory(raw, 0);

      expect(advisory.name).toBe("Dengue Surveillance");
      expect(advisory.severity).toBe("high");
      expect(advisory.headline).toContain("64 cases reported in Pune");
      expect(advisory.summary).toContain("PMC anti-larval drive");
      expect(advisory.source_title).toContain("IDSP Surveillance Bulletin (Week 42) - Maharashtra");
      expect(advisory.source_url).toContain("idsp.mohfw.gov.in");
      expect(advisory.is_sample_demo).toBe(false); // Real official data!
    });

    it("assigns moderate severity when cases >= 15 and deaths == 0", () => {
      const raw: IdspRawOutbreakItem = {
        state: "Madhya Pradesh",
        district: "Bhopal",
        diseaseName: "Acute Diarrheal Disease (ADD)",
        casesCount: 28,
        deathsCount: 0,
        reportDate: "2026-10-20",
        status: "active",
        actionTaken: "Chlorination of overhead tanks completed. 850 ORS packets distributed.",
      };

      const advisory = transformIdspToDiseaseAdvisory(raw, 0);
      expect(advisory.severity).toBe("moderate");
      expect(advisory.category).toBe("water_borne");
      expect(advisory.is_sample_demo).toBe(false);
    });
  });

  describe("3. Locality Integration with IDSP Baseline", () => {
    it("returns real IDSP weekly surveillance records for Indore (Dengue, 42 cases)", () => {
      const result = getAdvisoriesForLocality("Indore");
      expect(result.advisories.length).toBeGreaterThan(0);

      const idspRecord = result.advisories.find((a) => a.id.includes("indore"));
      expect(idspRecord).toBeDefined();
      expect(idspRecord?.name).toContain("Dengue");
      expect(idspRecord?.headline).toContain("42 cases reported in Indore");
      expect(idspRecord?.source_title).toContain("IDSP");
      expect(idspRecord?.is_sample_demo).toBe(false);
    });

    it("returns real IDSP weekly records for Pune (Dengue, 64 cases)", () => {
      const result = getAdvisoriesForLocality("Pune");
      const idspRecord = result.advisories.find((a) => a.id.includes("pune"));
      expect(idspRecord).toBeDefined();
      expect(idspRecord?.headline).toContain("64 cases");
    });

    it("returns district-specific IDSP records for Bengaluru by PIN (560001)", () => {
      const result = getAdvisoriesForLocality("560001");
      expect(result.advisories.length).toBeGreaterThanOrEqual(2);
      expect(result.matchedLocality).toContain("Bengaluru");

      const dengue = result.advisories.find((a) => a.name.includes("Dengue"));
      expect(dengue).toBeDefined();
      expect(dengue?.headline).toContain("52 cases reported in Bengaluru (Karnataka)");
      expect(dengue?.is_sample_demo).toBe(false);

      const add = result.advisories.find((a) => a.name.includes("Diarrheal") || a.name.includes("ADD"));
      expect(add).toBeDefined();
      expect(add?.headline).toContain("26 cases reported in Bengaluru (Karnataka)");
      expect(add?.is_sample_demo).toBe(false);

      // Verify NO sample prototype records are returned for Bengaluru
      expect(result.advisories.every((a) => a.is_sample_demo === false)).toBe(true);
    });

    it("returns distinct records across multiple cities", () => {
      const cities = ["560001", "411001", "400001", "110001", "500001", "302001"];
      const headlines = cities.map((c) => getAdvisoriesForLocality(c).advisories[0].headline);
      // Ensure all headlines are unique across different cities
      const uniqueHeadlines = new Set(headlines);
      expect(uniqueHeadlines.size).toBe(cities.length);
    });

    it("all items in OFFICIAL_IDSP_WEEKLY_BASELINE transform without errors", () => {
      for (let i = 0; i < OFFICIAL_IDSP_WEEKLY_BASELINE.length; i++) {
        const item = OFFICIAL_IDSP_WEEKLY_BASELINE[i];
        const adv = transformIdspToDiseaseAdvisory(item, i);
        expect(adv.name).toBeTruthy();
        expect(adv.headline).toBeTruthy();
        expect(adv.summary).toBeTruthy();
        expect(adv.symptoms.length).toBeGreaterThan(0);
        expect(adv.precautions.length).toBeGreaterThan(0);
        expect(adv.source_title).toContain("IDSP");
        expect(adv.is_sample_demo).toBe(false);
      }
    });
  });
});
