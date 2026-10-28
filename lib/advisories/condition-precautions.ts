export interface ConditionPrecaution {
  conditionKeyword: string;
  matchedTitle: string;
  category: "endocrine" | "cardiovascular" | "respiratory" | "allergy" | "musculoskeletal" | "renal" | "general";
  dailyPrecautions: string[];
  redFlags: string[];
  outbreakVulnerabilityNote?: string;
}

export const KNOWN_CONDITION_PRECAUTIONS: ConditionPrecaution[] = [
  {
    conditionKeyword: "diabet",
    matchedTitle: "Diabetes Mellitus (Type 1 / Type 2)",
    category: "endocrine",
    dailyPrecautions: [
      "Follow the 'Sick-Day Rules': Never stop basal insulin/medications during acute illness without doctor consultation, even if food intake decreases.",
      "Check daily foot health for blisters, cuts, or micro-cracks that might escalate into non-healing diabetic ulcers.",
      "Maintain active hydration; illness and fever trigger counter-regulatory hormones (cortisol, glucagon) raising blood glucose.",
      "Keep simple carbohydrates (glucose tablets, fruit juice) immediately accessible for rapid hypoglycemia rescue (Rule of 15).",
    ],
    redFlags: [
      "Persistent blood glucose above 250 mg/dL accompanied by nausea or heavy breathing.",
      "Fever over 101°F with chills or signs of urinary tract / foot infection.",
      "Inability to retain oral liquids for more than 4 hours.",
    ],
    outbreakVulnerabilityNote:
      "⚠️ Elevated Vulnerability: Diabetic patients face higher risk of severe complications and secondary bacterial pneumonia during seasonal viral influenza surges. Seek medical attention early.",
  },
  {
    conditionKeyword: "hypertens",
    matchedTitle: "Hypertension / Elevated Blood Pressure",
    category: "cardiovascular",
    dailyPrecautions: [
      "Maintain low-sodium dietary habits (< 2g sodium/day) and avoid excessive processed or preserved foods.",
      "Record resting blood pressure at the same time each morning before morning doses.",
      "CAUTION DURING FLU: Many over-the-counter cold decongestants (e.g., pseudoephedrine, phenylephrine) cause acute vasoconstriction and sharp blood pressure spikes. Verify safety before taking.",
      "Do not abruptly stop antihypertensive medications due to mild stomach upset without consulting your physician.",
    ],
    redFlags: [
      "Sudden severe headache accompanied by blurred vision or dizziness.",
      "Chest pressure, shortness of breath, or palpitations.",
      "Systolic blood pressure exceeding 180 mmHg or diastolic exceeding 110 mmHg.",
    ],
    outbreakVulnerabilityNote:
      "⚠️ Precaution: If taking ACE inhibitors or ARBs, severe dehydration from seasonal viral gastroenteritis can trigger acute kidney strain. Ensure adequate oral rehydration.",
  },
  {
    conditionKeyword: "asthma",
    matchedTitle: "Bronchial Asthma / Reactive Airway",
    category: "respiratory",
    dailyPrecautions: [
      "Ensure reliever inhaler (e.g., Salbutamol) is verified unexpired and kept immediately accessible at all times.",
      "Avoid early-morning outdoor exertion when air quality (AQI) or particulate matter index is elevated.",
      "Rinse mouth thoroughly with water after using inhaled corticosteroid preventer inhalers.",
      "Monitor peak expiratory flow (PEF) if available during seasonal weather transitions.",
    ],
    redFlags: [
      "Inability to complete full sentences in a single breath due to breathlessness.",
      "Reliever inhaler providing relief for less than 2–3 hours.",
      "Noticeable chest retractions or bluish tint on lips or fingernails.",
    ],
    outbreakVulnerabilityNote:
      "⚠️ High Risk during Viral Respiratory Spikes: Viral infections are the #1 trigger for severe asthma exacerbations. Wear a mask in crowded environments and seek prompt medical attention if wheezing increases.",
  },
  {
    conditionKeyword: "osteoarthr",
    matchedTitle: "Osteoarthritis / Chronic Joint Disease",
    category: "musculoskeletal",
    dailyPrecautions: [
      "Engage in low-impact joint mobilization (swimming, stationary cycling, gentle walking) rather than prolonged immobilization.",
      "Avoid unmonitored chronic self-medication with NSAIDs (e.g., Diclofenac, Naproxen); chronic use risks gastric ulcers and renal strain.",
      "Use warm compresses for chronic morning stiffness and cold compresses for acute joint heat or swelling.",
    ],
    redFlags: [
      "Sudden hot, red, severely swollen single joint with fever (requires urgent exclusion of septic arthritis).",
      "Inability to bear any weight on the affected limb.",
    ],
    outbreakVulnerabilityNote:
      "⚠️ Distinguish Symptoms: Active Chikungunya or Dengue outbreaks cause acute severe joint pain. If sudden multi-joint pain is accompanied by high fever and rash, request vector-borne testing.",
  },
  {
    conditionKeyword: "penicillin",
    matchedTitle: "Penicillin / Beta-Lactam Allergy",
    category: "allergy",
    dailyPrecautions: [
      "Always inform any treating physician, dentist, and pharmacist before any new antibiotic prescription is dispensed.",
      "Be cautious of cross-reactive antibiotic classes (e.g., first-generation cephalosporins) unless specifically cleared by an allergist.",
      "Ensure your MedAnchor emergency card has the Allergy category enabled on your wallet QR.",
    ],
    redFlags: [
      "Hives (urticaria), facial swelling, lip swelling, or tightness in the throat after any medication intake.",
      "Dizziness, lightheadedness, or sudden drop in blood pressure (immediate Anaphylaxis emergency).",
    ],
    outbreakVulnerabilityNote:
      "⚠️ Precaution during Seasonal Illness: Avoid accepting broad-spectrum antibiotic shots from informal dispensaries during flu seasons without confirming the formulation name.",
  },
  {
    conditionKeyword: "sulfa",
    matchedTitle: "Sulfa / Sulfonamide Allergy",
    category: "allergy",
    dailyPrecautions: [
      "Avoid sulfonamide antibacterial combinations (e.g., Co-trimoxazole, Bactrim/Septran).",
      "Carry medical alert identification and verify that treating emergency teams are informed.",
    ],
    redFlags: [
      "Severe skin rash, blistering, or mucosal peeling (requires emergency medical evaluation).",
      "Facial edema or breathing difficulty.",
    ],
  },
];

/**
 * Match patient confirmed condition/allergy strings against known clinical precaution rules.
 */
export function matchConfirmedPrecautions(
  confirmedItems: Array<{ category: string; value: string }>
): ConditionPrecaution[] {
  const matches: ConditionPrecaution[] = [];
  const addedKeys = new Set<string>();

  for (const item of confirmedItems) {
    const valLower = item.value.toLowerCase();

    for (const rule of KNOWN_CONDITION_PRECAUTIONS) {
      if (valLower.includes(rule.conditionKeyword) && !addedKeys.has(rule.conditionKeyword)) {
        matches.push(rule);
        addedKeys.add(rule.conditionKeyword);
      }
    }
  }

  // If no specific conditions matched, return a general healthy baseline
  if (matches.length === 0) {
    matches.push({
      conditionKeyword: "general_baseline",
      matchedTitle: "General Preventive Health Baseline",
      category: "general",
      dailyPrecautions: [
        "Maintain routine hydration (2–2.5L clean water daily) and a balanced whole-food diet.",
        "Store your prescriptions and discharge notes in MedAnchor to keep an auditable health history.",
        "Verify seasonal vaccinations (annual influenza, vector barrier measures) with your general physician.",
      ],
      redFlags: [
        "Unexplained high fever persisting beyond 3 days.",
        "Sudden chest pain, unilateral limb weakness, or acute breathing difficulty.",
      ],
    });
  }

  return matches;
}
