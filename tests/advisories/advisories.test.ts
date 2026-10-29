import { describe, it, expect } from "vitest";
import {
  getAdvisoriesForLocality,
  REGIONAL_DISEASE_ADVISORIES,
} from "@/lib/advisories/disease-data";
import {
  evaluateConditionString,
  matchConfirmedPrecautions,
  VERIFIED_PUBLIC_GUIDELINES,
} from "@/lib/advisories/condition-precautions";

describe("Aegis · Health Advisories & Official Reference Invariants", () => {
  describe("Locality Advisory Data & Sourcing Invariants", () => {
    it("every advisory entry has non-empty source_title, source_url, report_date, and retrieved_at", () => {
      expect(REGIONAL_DISEASE_ADVISORIES.length).toBeGreaterThan(0);
      for (const adv of REGIONAL_DISEASE_ADVISORIES) {
        expect(adv.source_title).toBeTruthy();
        expect(adv.source_url).toMatch(/^https?:\/\//);
        expect(adv.report_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(adv.retrieved_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(adv.is_sample_demo).toBe(true);
      }
    });

    it("returns sample demonstration advisories for Bhopal", () => {
      const result = getAdvisoriesForLocality("Bhopal");
      expect(result.advisories.length).toBeGreaterThan(0);
      expect(result.matchedLocality).toContain("Bhopal");

      const dengue = result.advisories.find((a) => a.id === "dengue-surge");
      expect(dengue).toBeDefined();
      expect(dengue?.source_title).toContain("National Centre for Disease Control");
      expect(dengue?.is_sample_demo).toBe(true);
    });

    it("resolves Indian 6-digit Pincodes to region (462001 -> Bhopal)", () => {
      const result = getAdvisoriesForLocality("462001");
      expect(result.advisories.length).toBeGreaterThan(0);
      expect(result.matchedLocality).toContain("Bhopal");
    });

    it("resolves Delhi by PIN prefix (110001 -> Delhi)", () => {
      const result = getAdvisoriesForLocality("110001");
      expect(result.advisories.length).toBeGreaterThan(0);
      expect(result.matchedLocality).toContain("Delhi");
    });

    it("gracefully falls back to sample regional digest for unmapped PIN (799001)", () => {
      const result = getAdvisoriesForLocality("799001");
      expect(result.advisories.length).toBe(2);
      expect(result.matchedLocality).toContain("Sample Regional Digest");
    });
  });

  describe("Condition Evaluator: Negation Handling", () => {
    it("rejects 'no history of asthma'", () => {
      const res = evaluateConditionString("no history of asthma");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("negated");
    });

    it("rejects 'denies diabetes'", () => {
      const res = evaluateConditionString("denies diabetes");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("negated");
    });

    it("rejects 'no hypertension'", () => {
      const res = evaluateConditionString("no hypertension");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("negated");
    });

    it("rejects 'negative for diabetes'", () => {
      const res = evaluateConditionString("negative for diabetes");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("negated");
    });

    it("rejects 'no known drug allergies' and 'NKDA'", () => {
      expect(evaluateConditionString("no known drug allergies").isMatch).toBe(false);
      expect(evaluateConditionString("NKDA").isMatch).toBe(false);
    });
  });

  describe("Condition Evaluator: Procedure & Examination Exclusions", () => {
    it("rejects 'Diabetic Retinal Exam' (procedure, not chronic diagnosis)", () => {
      const res = evaluateConditionString("Diabetic Retinal Exam");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("procedure_or_exam");
    });

    it("rejects 'Asthma screening test'", () => {
      const res = evaluateConditionString("Asthma screening test");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("procedure_or_exam");
    });

    it("rejects 'Hypertension annual review'", () => {
      const res = evaluateConditionString("Hypertension annual review");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("procedure_or_exam");
    });

    it("rejects 'Eye exam for diabetes'", () => {
      const res = evaluateConditionString("Eye exam for diabetes");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("procedure_or_exam");
    });
  });

  describe("Condition Evaluator: Look-Alikes & Subtype Safety", () => {
    it("rejects 'Diabetes Insipidus' from matching Diabetes Mellitus guidelines", () => {
      const res = evaluateConditionString("Diabetes Insipidus");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("look_alike");
    });

    it("rejects 'Gestational diabetes' from standard adult diabetes guidelines", () => {
      const res = evaluateConditionString("Gestational diabetes mellitus");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("look_alike");
    });

    it("rejects 'Portal hypertension' from systemic hypertension guidelines", () => {
      const res = evaluateConditionString("Portal hypertension secondary to cirrhosis");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("look_alike");
    });

    it("rejects 'Cardiac asthma' from bronchial asthma guidelines", () => {
      const res = evaluateConditionString("Cardiac asthma due to heart failure");
      expect(res.isMatch).toBe(false);
      expect(res.rejectionReason).toBe("look_alike");
    });
  });

  describe("Clinical Guidelines & Physician Notice Invariants", () => {
    it("every verified guideline contains mandatory 'Ask your doctor about your own medicines.'", () => {
      for (const guide of VERIFIED_PUBLIC_GUIDELINES) {
        expect(guide.mandatoryPhysicianNotice).toBe("Ask your doctor about your own medicines.");
        expect(guide.officialCitation.source_organization).toBeTruthy();
        expect(guide.officialCitation.document_title).toBeTruthy();
        expect(guide.officialCitation.source_url).toMatch(/^https?:\/\//);
        expect(guide.officialCitation.verbatim_excerpt.length).toBeGreaterThan(20);
      }
    });

    it("matches Type 2 Diabetes Mellitus to ICMR guidelines with verbatim quote", () => {
      const matches = matchConfirmedPrecautions([
        { category: "condition", value: "Type 2 Diabetes Mellitus" },
      ]);
      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe("icmr-type2-diabetes");
      expect(matches[0].officialCitation.source_organization).toContain("Indian Council of Medical Research");
      expect(matches[0].mandatoryPhysicianNotice).toBe("Ask your doctor about your own medicines.");
    });

    it("matches Essential Hypertension to NHP guidelines with verbatim quote", () => {
      const matches = matchConfirmedPrecautions([
        { category: "condition", value: "Essential Hypertension" },
      ]);
      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe("nhp-hypertension");
      expect(matches[0].officialCitation.source_organization).toContain("National Health Portal");
      expect(matches[0].mandatoryPhysicianNotice).toBe("Ask your doctor about your own medicines.");
    });

    it("matches Bronchial Asthma to WHO guidance with verbatim quote", () => {
      const matches = matchConfirmedPrecautions([
        { category: "condition", value: "Bronchial Asthma (Moderate Persistent)" },
      ]);
      expect(matches.length).toBe(1);
      expect(matches[0].id).toBe("who-asthma-guidance");
      expect(matches[0].officialCitation.source_organization).toContain("World Health Organization");
    });

    it("returns empty array when list contains only negations or procedures", () => {
      const matches = matchConfirmedPrecautions([
        { category: "condition", value: "no history of asthma" },
        { category: "condition", value: "Diabetic Retinal Exam" },
        { category: "condition", value: "denies diabetes" },
      ]);
      expect(matches.length).toBe(0);
    });
  });
});
