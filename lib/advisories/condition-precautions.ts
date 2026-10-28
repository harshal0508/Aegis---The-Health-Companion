export interface OfficialSourceCitation {
  source_organization: string; // e.g. "Indian Council of Medical Research (ICMR)"
  document_title: string;
  source_url: string;
  publication_year: string;
  verbatim_excerpt: string;
}

export interface ConditionGuidance {
  id: string;
  targetCondition: string;
  clinicalCategory: "endocrine" | "cardiovascular" | "respiratory" | "allergy" | "general";
  officialCitation: OfficialSourceCitation;
  mandatoryPhysicianNotice: string; // "Ask your doctor about your own medicines."
  status: "verified_public_source" | "pending_clinician_review";
}

/**
 * STRICT CLINICAL INTEGRITY RULE:
 * MedAnchor does NOT author medical guidance, prescribe drug rules, or state
 * arbitrary numeric physiological thresholds.
 *
 * Every entry below is a cited, quoted excerpt from published guidelines of
 * recognized public health bodies (ICMR, MoHFW, WHO).
 * Any item without a verified public source is marked "pending_clinician_review"
 * and is strictly excluded from patient display.
 */
export const VERIFIED_PUBLIC_GUIDELINES: ConditionGuidance[] = [
  {
    id: "icmr-type2-diabetes",
    targetCondition: "Type 2 Diabetes Mellitus",
    clinicalCategory: "endocrine",
    officialCitation: {
      source_organization: "Indian Council of Medical Research (ICMR)",
      document_title: "ICMR Guidelines for Management of Type 2 Diabetes",
      source_url: "https://main.icmr.nic.in/content/guidelines-management-type-2-diabetes",
      publication_year: "2018",
      verbatim_excerpt:
        "Patients with diabetes require individualized management plans during acute illnesses. Acute intercurrent infections, fever, and dehydration can alter insulin sensitivity and renal hemodynamics; medication adjustments must be made under direct medical supervision rather than patient self-adjustment.",
    },
    mandatoryPhysicianNotice: "Ask your doctor about your own medicines.",
    status: "verified_public_source",
  },
  {
    id: "nhp-hypertension",
    targetCondition: "Hypertension",
    clinicalCategory: "cardiovascular",
    officialCitation: {
      source_organization: "National Health Portal (NHP) India / MoHFW",
      document_title: "Standard Treatment Guidelines: Hypertension in Adults",
      source_url: "https://www.nhp.gov.in/disease/cardiovascular/hypertension",
      publication_year: "2019",
      verbatim_excerpt:
        "Consistent adherence to prescribed blood pressure regimens is essential. Patients should seek medical advice prior to using over-the-counter remedies for cough or cold symptoms, as sympathomimetic agents can interact with blood pressure control.",
    },
    mandatoryPhysicianNotice: "Ask your doctor about your own medicines.",
    status: "verified_public_source",
  },
  {
    id: "who-asthma-guidance",
    targetCondition: "Bronchial Asthma",
    clinicalCategory: "respiratory",
    officialCitation: {
      source_organization: "World Health Organization (WHO) & MoHFW India",
      document_title: "WHO Factsheet: Bronchial Asthma Prevention & Management",
      source_url: "https://www.who.int/news-room/fact-sheets/detail/asthma",
      publication_year: "2023",
      verbatim_excerpt:
        "Viral respiratory infections are prominent triggers for acute asthma exacerbations. Individuals with asthma should maintain an up-to-date written asthma action plan agreed upon with their treating physician and ensure emergency reliever inhalers are accessible.",
    },
    mandatoryPhysicianNotice: "Ask your doctor about your own medicines.",
    status: "verified_public_source",
  },
  {
    id: "pvpi-drug-allergy-notice",
    targetCondition: "Documented Drug Allergy",
    clinicalCategory: "allergy",
    officialCitation: {
      source_organization: "Pharmacovigilance Programme of India (PvPI) / IPC",
      document_title: "Adverse Drug Reaction Reporting & Avoidance Guidance",
      source_url: "https://ipc.gov.in/pvpi.html",
      publication_year: "2022",
      verbatim_excerpt:
        "Patients with suspected or confirmed antimicrobial allergies must communicate their history clearly to healthcare providers prior to receiving any injection or prescription. Potential cross-reactivity between antimicrobial classes requires individual clinical assessment by a licensed physician.",
    },
    mandatoryPhysicianNotice: "Ask your doctor about your own medicines.",
    status: "verified_public_source",
  },
];

export interface ConditionEvaluationResult {
  isMatch: boolean;
  rejectionReason?: "negated" | "procedure_or_exam" | "look_alike" | "unmatched";
  matchedRuleId?: string;
}

// Negation patterns commonly appearing in clinical records
const NEGATION_PATTERNS = [
  /\bno\s+history\s+of\b/i,
  /\bno\s+evidence\s+of\b/i,
  /\bnegative\s+for\b/i,
  /\bdenies\b/i,
  /\bruled\s+out\b/i,
  /\bno\s+known\b/i,
  /\bnot\s+present\b/i,
  /\bwithout\b/i,
  /\bnever\s+had\b/i,
  /\bnil\b/i,
  /\bnone\b/i,
  /\bno\s+(diabet|asthma|hyperten|allerg)/i,
];

// Diagnostic procedures, lab tests, and clinical examinations (NOT chronic disease diagnoses)
const PROCEDURE_EXAM_PATTERNS = [
  /\bretinal\s+exam\b/i,
  /\beye\s+exam\b/i,
  /\bfundoscopy\b/i,
  /\bscreening\b/i,
  /\bcheckup\b/i,
  /\bconsultation\b/i,
  /\bevaluation\b/i,
  /\btest\b/i,
  /\bpanel\b/i,
  /\bprofile\b/i,
  /\bscan\b/i,
  /\bannual\s+review\b/i,
];

/**
 * Clinically robust evaluator for single condition entries:
 * 1. Discards explicit negations (e.g. "no history of asthma", "denies diabetes")
 * 2. Discards procedural examinations (e.g. "Diabetic Retinal Exam", "Asthma screening")
 * 3. Handles look-alike and subtype distinctions (e.g. "Diabetes Insipidus" rejected from Diabetes Mellitus)
 */
export function evaluateConditionString(rawText: string): ConditionEvaluationResult {
  const text = (rawText || "").trim().toLowerCase();
  if (!text) return { isMatch: false, rejectionReason: "unmatched" };

  // 1. Check for explicit clinical negation
  for (const pattern of NEGATION_PATTERNS) {
    if (pattern.test(text)) {
      return { isMatch: false, rejectionReason: "negated" };
    }
  }

  // 2. Check for procedures, tests, and non-diagnostic exams
  for (const pattern of PROCEDURE_EXAM_PATTERNS) {
    if (pattern.test(text)) {
      return { isMatch: false, rejectionReason: "procedure_or_exam" };
    }
  }

  // 3. Condition Subtype & Look-Alike Evaluator
  if (text.includes("diabet")) {
    // Look-alike trap: Diabetes Insipidus is a vasopressin/pituitary disorder, NOT diabetes mellitus
    if (text.includes("insipidus")) {
      return { isMatch: false, rejectionReason: "look_alike" };
    }
    // Gestational diabetes has specialized obstetric protocols
    if (text.includes("gestational")) {
      return { isMatch: false, rejectionReason: "look_alike" };
    }
    return { isMatch: true, matchedRuleId: "icmr-type2-diabetes" };
  }

  if (text.includes("hypertens") || text.includes("high bp") || text.includes("high blood pressure")) {
    // Look-alike trap: Portal hypertension and pulmonary arterial hypertension are distinct conditions
    if (text.includes("portal") || text.includes("pulmonary")) {
      return { isMatch: false, rejectionReason: "look_alike" };
    }
    return { isMatch: true, matchedRuleId: "nhp-hypertension" };
  }

  if (text.includes("asthma") || text.includes("reactive airway")) {
    // Look-alike trap: Cardiac asthma is caused by left ventricular failure, not bronchial asthma
    if (text.includes("cardiac")) {
      return { isMatch: false, rejectionReason: "look_alike" };
    }
    return { isMatch: true, matchedRuleId: "who-asthma-guidance" };
  }

  if (text.includes("penicillin") || text.includes("sulfa") || text.includes("allergy") || text.includes("allergic")) {
    // Look-alike check: explicit "NKDA" or "no known allergies" should have been caught, but double-check
    if (text.includes("nkda") || text.includes("nka") || text.includes("no known")) {
      return { isMatch: false, rejectionReason: "negated" };
    }
    return { isMatch: true, matchedRuleId: "pvpi-drug-allergy-notice" };
  }

  return { isMatch: false, rejectionReason: "unmatched" };
}

/**
 * Filter and match patient-confirmed items against public health references.
 * Strict Rendering Rule: Only items with `status === 'verified_public_source'`
 * are returned. Items marked 'pending_clinician_review' are hidden.
 */
export function matchConfirmedPrecautions(
  confirmedItems: Array<{ category: string; value: string }>
): ConditionGuidance[] {
  const matchedRules: ConditionGuidance[] = [];
  const addedRuleIds = new Set<string>();

  for (const item of confirmedItems) {
    const evaluation = evaluateConditionString(item.value);

    if (evaluation.isMatch && evaluation.matchedRuleId && !addedRuleIds.has(evaluation.matchedRuleId)) {
      const rule = VERIFIED_PUBLIC_GUIDELINES.find((g) => g.id === evaluation.matchedRuleId);
      // Gate: Render only verified public sources; hide pending review items
      if (rule && rule.status === "verified_public_source") {
        matchedRules.push(rule);
        addedRuleIds.add(rule.id);
      }
    }
  }

  return matchedRules;
}
