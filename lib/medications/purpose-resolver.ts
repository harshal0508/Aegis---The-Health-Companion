/**
 * Medication Purpose Resolver
 * 
 * Provides clean, objective therapeutic indications ("What is this medication used for?").
 * Complies strictly with Indian healthcare regulations (NMC Telemedicine Guidelines):
 * - Delivers factual pharmacopoeial reference information only.
 * - Does NOT provide dosage, administration, or medical recommendations.
 */

// Common generic salts and Indian brand names mapped to objective therapeutic indications
const MEDICATION_PURPOSE_MAP: Record<string, string> = {
  // Blood Pressure & Cardiovascular
  telmisartan: "Blood pressure management",
  telma: "Blood pressure management",
  amlodipine: "Blood pressure management",
  amlong: "Blood pressure management",
  stamlo: "Blood pressure management",
  losartan: "Blood pressure management",
  losar: "Blood pressure management",
  olmesartan: "Blood pressure management",
  olvance: "Blood pressure management",
  enalapril: "Blood pressure management",
  ramipril: "Blood pressure management",
  cardace: "Blood pressure management",
  atenolol: "Blood pressure & heart rate regulation",
  aten: "Blood pressure & heart rate regulation",
  metoprolol: "Blood pressure & heart rate regulation",
  betaloc: "Blood pressure & heart rate regulation",
  metolar: "Blood pressure & heart rate regulation",
  bisoprolol: "Blood pressure & heart rate regulation",
  concor: "Blood pressure & heart rate regulation",
  nebivolol: "Blood pressure management",
  nebicard: "Blood pressure management",
  spironolactone: "Diuretic & fluid balance (blood pressure / heart)",
  aldactone: "Diuretic & fluid balance (blood pressure / heart)",
  chlorthalidone: "Diuretic (blood pressure management)",
  hydrochlorothiazide: "Diuretic (blood pressure management)",
  indapamide: "Diuretic (blood pressure management)",

  // Blood Sugar & Diabetes
  metformin: "Blood sugar control (Type-2 Diabetes)",
  glycomet: "Blood sugar control (Type-2 Diabetes)",
  gluconorm: "Blood sugar control (Type-2 Diabetes)",
  obimet: "Blood sugar control (Type-2 Diabetes)",
  glimepiride: "Blood sugar control (Type-2 Diabetes)",
  amaryl: "Blood sugar control (Type-2 Diabetes)",
  zoryl: "Blood sugar control (Type-2 Diabetes)",
  gliclazide: "Blood sugar control (Type-2 Diabetes)",
  diamicron: "Blood sugar control (Type-2 Diabetes)",
  vildagliptin: "Blood sugar control (Type-2 Diabetes)",
  galvus: "Blood sugar control (Type-2 Diabetes)",
  sitagliptin: "Blood sugar control (Type-2 Diabetes)",
  januvia: "Blood sugar control (Type-2 Diabetes)",
  teneligliptin: "Blood sugar control (Type-2 Diabetes)",
  tenalim: "Blood sugar control (Type-2 Diabetes)",
  linagliptin: "Blood sugar control (Type-2 Diabetes)",
  trajenta: "Blood sugar control (Type-2 Diabetes)",
  dapagliflozin: "Blood sugar control & renal/cardiac support",
  forxiga: "Blood sugar control & renal/cardiac support",
  dapanorm: "Blood sugar control & renal/cardiac support",
  empagliflozin: "Blood sugar control & cardiac support",
  jardiance: "Blood sugar control & cardiac support",
  pioglitazone: "Blood sugar control (Type-2 Diabetes)",
  pioz: "Blood sugar control (Type-2 Diabetes)",
  insulin: "Insulin hormone therapy (Diabetes management)",
  lantus: "Long-acting insulin (Diabetes management)",
  novorapid: "Rapid-acting insulin (Diabetes management)",
  humalog: "Rapid-acting insulin (Diabetes management)",

  // Cholesterol & Lipid Lowering
  atorvastatin: "Cholesterol reduction & cardiovascular protection",
  atorva: "Cholesterol reduction & cardiovascular protection",
  atorlip: "Cholesterol reduction & cardiovascular protection",
  rosuvastatin: "Cholesterol reduction & cardiovascular protection",
  rosuvas: "Cholesterol reduction & cardiovascular protection",
  rozavel: "Cholesterol reduction & cardiovascular protection",
  fenofibrate: "Triglyceride & lipid level regulation",
  lipicard: "Triglyceride & lipid level regulation",
  ezetimibe: "Cholesterol reduction",

  // Antibiotics & Antimicrobials
  amoxicillin: "Bacterial infection treatment (Antibiotic)",
  augmentin: "Bacterial infection treatment (Antibiotic)",
  moxikind: "Bacterial infection treatment (Antibiotic)",
  clavum: "Bacterial infection treatment (Antibiotic)",
  azithromycin: "Bacterial infection treatment (Antibiotic)",
  azee: "Bacterial infection treatment (Antibiotic)",
  zithrox: "Bacterial infection treatment (Antibiotic)",
  azithral: "Bacterial infection treatment (Antibiotic)",
  cefixime: "Bacterial infection treatment (Antibiotic)",
  taxim: "Bacterial infection treatment (Antibiotic)",
  zifi: "Bacterial infection treatment (Antibiotic)",
  mahacef: "Bacterial infection treatment (Antibiotic)",
  cefuroxime: "Bacterial infection treatment (Antibiotic)",
  ceftum: "Bacterial infection treatment (Antibiotic)",
  ciprofloxacin: "Bacterial infection treatment (Antibiotic)",
  ciplox: "Bacterial infection treatment (Antibiotic)",
  levofloxacin: "Bacterial infection treatment (Antibiotic)",
  levomac: "Bacterial infection treatment (Antibiotic)",
  ofloxacin: "Bacterial infection treatment (Antibiotic)",
  oflax: "Bacterial infection treatment (Antibiotic)",
  zenflox: "Bacterial infection treatment (Antibiotic)",
  doxycycline: "Bacterial infection treatment (Antibiotic)",
  doxypal: "Bacterial infection treatment (Antibiotic)",
  metronidazole: "Bacterial & parasitic infection treatment",
  flagyl: "Bacterial & parasitic infection treatment",
  ornidazole: "Bacterial & parasitic infection treatment",
  clarithromycin: "Bacterial infection treatment (Antibiotic)",
  clindamycin: "Bacterial infection treatment (Antibiotic)",

  // Fever, Pain & Inflammation
  paracetamol: "Fever reduction & pain relief",
  dolo: "Fever reduction & pain relief",
  calpol: "Fever reduction & pain relief",
  crocin: "Fever reduction & pain relief",
  combiflam: "Pain & inflammation relief with fever control",
  ibuprofen: "Pain & inflammation relief (NSAID)",
  brufen: "Pain & inflammation relief (NSAID)",
  aceclofenac: "Pain & inflammation relief (NSAID)",
  zerodol: "Pain & inflammation relief (NSAID)",
  hifenac: "Pain & inflammation relief (NSAID)",
  diclofenac: "Pain & inflammation relief (NSAID)",
  voveran: "Pain & inflammation relief (NSAID)",
  naproxen: "Pain & inflammation relief (NSAID)",
  etoricoxib: "Joint pain & inflammation relief (NSAID)",
  etoshine: "Joint pain & inflammation relief (NSAID)",
  tramadol: "Moderate to severe pain relief",
  ultracet: "Moderate to severe pain relief",
  mefenamic: "Pain & menstrual cramp relief",
  meftal: "Pain & menstrual cramp relief",

  // Acidity, Heartburn & Gastrointestinal
  pantoprazole: "Acidity, GERD & acid reflux relief",
  "pan d": "Acidity, nausea & acid reflux relief",
  "pan-d": "Acidity, nausea & acid reflux relief",
  pan: "Acidity, GERD & acid reflux relief",
  omeprazole: "Acidity & gastric acid reduction",
  omez: "Acidity & gastric acid reduction",
  rabeprazole: "Acidity & acid reflux relief",
  razo: "Acidity & acid reflux relief",
  happi: "Acidity & acid reflux relief",
  esomeprazole: "Acidity & acid reflux relief",
  nexpro: "Acidity & acid reflux relief",
  famotidine: "Acid reduction & heartburn relief",
  ranitidine: "Acid reduction & heartburn relief",
  sucralfate: "Stomach ulcer protection & mucosal coating",
  sucrafil: "Stomach ulcer protection & mucosal coating",
  gelusil: "Acidity & heartburn antacid relief",
  digene: "Acidity & heartburn antacid relief",

  // Thyroid
  levothyroxine: "Thyroid hormone balance (Hypothyroidism)",
  thyronorm: "Thyroid hormone balance (Hypothyroidism)",
  eltroxin: "Thyroid hormone balance (Hypothyroidism)",
  carbimazole: "Overactive thyroid regulation (Hyperthyroidism)",
  "neo-mercazole": "Overactive thyroid regulation (Hyperthyroidism)",

  // Allergies & Respiratory
  cetirizine: "Allergy symptoms & itch relief (Antihistamine)",
  cetzine: "Allergy symptoms & itch relief (Antihistamine)",
  okacet: "Allergy symptoms & itch relief (Antihistamine)",
  levocetirizine: "Allergy symptoms & runny nose relief",
  levocet: "Allergy symptoms & runny nose relief",
  vozet: "Allergy symptoms & runny nose relief",
  montelukast: "Allergy & asthma airway inflammation relief",
  montair: "Allergy & asthma airway inflammation relief",
  "montair-lc": "Allergy & respiratory symptom relief",
  bilastine: "Allergy symptoms & hives/itch relief",
  bilasure: "Allergy symptoms & hives/itch relief",
  fexofenadine: "Allergy symptoms & hay fever relief",
  allegra: "Allergy symptoms & hay fever relief",

  // Inhalers & Bronchodilators
  budesonide: "Airway inflammation control (Inhaled corticosteroid)",
  pulmicort: "Airway inflammation control (Inhaled corticosteroid)",
  budecort: "Airway inflammation control (Inhaled corticosteroid)",
  formoterol: "Airway bronchodilator (Asthma/COPD symptom relief)",
  foracort: "Asthma & COPD maintenance therapy",
  salbutamol: "Rapid airway bronchodilation (Asthma/wheezing relief)",
  asthalin: "Rapid airway bronchodilation (Asthma/wheezing relief)",
  ipratropium: "Airway dilation & respiratory ease",
  duolin: "Dual bronchodilator for respiratory relief",
  seroflo: "Asthma & COPD maintenance therapy",

  // Blood Thinners & Cardioprotective
  aspirin: "Blood clot prevention & cardiovascular support",
  ecosprin: "Blood clot prevention & cardiovascular support",
  clopidogrel: "Blood clot prevention & cardiovascular support",
  deplatt: "Blood clot prevention & cardiovascular support",
  clopilet: "Blood clot prevention & cardiovascular support",
  warfarin: "Anticoagulant (Blood clot prevention)",
  apixaban: "Anticoagulant (Blood clot prevention)",
  eliquis: "Anticoagulant (Blood clot prevention)",
  rivaroxaban: "Anticoagulant (Blood clot prevention)",
  xarelto: "Anticoagulant (Blood clot prevention)",
  ticagrelor: "Antiplatelet (Cardiovascular protection)",
  brilinta: "Antiplatelet (Cardiovascular protection)",

  // Vitamins, Minerals & Supplements
  cholecalciferol: "Vitamin D3 deficiency & bone health",
  "vitamin d3": "Vitamin D3 deficiency & bone health",
  calcirol: "Vitamin D3 deficiency & bone health",
  "d-rise": "Vitamin D3 deficiency & bone health",
  shelcal: "Calcium & Vitamin D supplement for bone strength",
  calcium: "Bone health & calcium supplementation",
  mecobalamin: "Vitamin B12 nerve health & red blood cell support",
  methylcobalamin: "Vitamin B12 nerve health & red blood cell support",
  "vitamin b12": "Vitamin B12 deficiency & nerve support",
  neurobion: "Vitamin B complex for nerve health & metabolism",
  folic: "Red blood cell production & pregnancy support",
  folvite: "Red blood cell production & pregnancy support",
  becosules: "Vitamin B complex & energy metabolism",
  zincovit: "Multivitamin & zinc immune support",
  ferrous: "Iron deficiency & hemoglobin support (Anemia)",
  orofer: "Iron deficiency & hemoglobin support (Anemia)",
  autrin: "Iron & folic acid supplementation",

  // Nausea & Vomiting
  ondansetron: "Nausea & vomiting prevention",
  emeset: "Nausea & vomiting prevention",
  vomikind: "Nausea & vomiting prevention",
  domperidone: "Nausea & gastric motility improvement",
  motilium: "Nausea & gastric motility improvement",
  metoclopramide: "Nausea & stomach emptying support",
  perinorm: "Nausea & stomach emptying support",

  // Cough & Cold
  ascoril: "Cough, mucus clearance & airway dilation",
  benadryl: "Cough suppression & throat irritation relief",
  chericof: "Dry cough relief",
  grilinctus: "Cough relief & airway clearing",
  ambroxol: "Mucus thinning & airway clearance",
  dextromethorphan: "Dry cough suppression",

  // Antifungals
  fluconazole: "Fungal infection treatment",
  forcan: "Fungal infection treatment",
  itraconazole: "Fungal infection treatment",
  itrasys: "Fungal infection treatment",
  terbinafine: "Skin & nail fungal infection treatment",
  clotrimazole: "Fungal infection treatment",
  candid: "Fungal infection treatment",

  // Neuropathic Pain & Mental Well-being
  escitalopram: "Anxiety & mood balance (SSRI)",
  nexito: "Anxiety & mood balance (SSRI)",
  sertraline: "Anxiety & mood balance (SSRI)",
  clonazepam: "Anxiety & seizure symptom management",
  clona: "Anxiety & seizure symptom management",
  alprazolam: "Short-term anxiety relief",
  restyl: "Short-term anxiety relief",
  gabapentin: "Nerve pain relief & seizure management",
  gabapin: "Nerve pain relief & seizure management",
  pregabalin: "Nerve pain & neuropathic discomfort relief",
  pregaba: "Nerve pain & neuropathic discomfort relief",

  // Eye & Ear Drops
  moxifloxacin: "Bacterial eye infection treatment",
  tobramycin: "Bacterial eye infection treatment",
  carboxymethylcellulose: "Dry eye relief & ocular lubrication",
  "refresh tears": "Dry eye relief & ocular lubrication",
  systane: "Dry eye relief & ocular lubrication",
};

// Common pharmacological suffix patterns for fallback resolution
const SUFFIX_PATTERNS: Array<{ suffix: RegExp; purpose: string }> = [
  { suffix: /statin\b/i, purpose: "Cholesterol reduction & cardiovascular protection" },
  { suffix: /sartan\b/i, purpose: "Blood pressure management" },
  { suffix: /pril\b/i, purpose: "Blood pressure management" },
  { suffix: /olol\b/i, purpose: "Blood pressure & heart rate regulation" },
  { suffix: /dipine\b/i, purpose: "Blood pressure management" },
  { suffix: /cillin\b/i, purpose: "Bacterial infection treatment (Antibiotic)" },
  { suffix: /^(cef|ceph)/i, purpose: "Bacterial infection treatment (Antibiotic)" },
  { suffix: /prazole\b/i, purpose: "Acidity, GERD & acid reflux relief" },
  { suffix: /gliptin\b/i, purpose: "Blood sugar control (Type-2 Diabetes)" },
  { suffix: /gliflozin\b/i, purpose: "Blood sugar control & organ protection" },
  { suffix: /tidine\b/i, purpose: "Acid reduction & heartburn relief" },
  { suffix: /(mycin|cycline|floxacin|xime|penem)\b/i, purpose: "Bacterial infection treatment (Antibiotic)" },
  { suffix: /nazole\b/i, purpose: "Fungal infection treatment" },
  { suffix: /lukast\b/i, purpose: "Allergy & respiratory symptom relief" },
  { suffix: /coxib\b/i, purpose: "Pain & inflammation relief (NSAID)" },
  { suffix: /zepam\b/i, purpose: "Anxiety & neurological symptom management" },
  { suffix: /zolam\b/i, purpose: "Short-term anxiety & sleep symptom relief" },
  { suffix: /mab\b/i, purpose: "Targeted biologic therapy" },
];

/**
 * Resolves a clean, factual indication of what a medication is used for.
 * Strips dosages, frequencies, routes, and brand packaging words.
 * 
 * @param medicationRawText Raw medication string, e.g. "Tab Telmisartan 40mg OD"
 * @returns Clean purpose string, or null if unmapped
 */
export function getMedicationPurpose(medicationRawText: string): string | null {
  if (!medicationRawText || typeof medicationRawText !== "string") {
    return null;
  }

  // Clean the text: remove numbers, units, dosages, routes, frequencies
  const cleaned = medicationRawText
    .toLowerCase()
    .replace(/\b(tab|tablet|cap|capsule|inj|injection|syp|syrup|drop|ointment|gel|cream)\b/gi, " ")
    .replace(/\b(\d+(\.\d+)?\s*(mg|mcg|gm|g|ml|iu|units|%))\b/gi, " ")
    .replace(/\b(od|bd|tds|qid|hs|sos|stat|prn|po|q\d+h|1-0-1|1-0-0|0-0-1|1-1-1)\b/gi, " ")
    .replace(/[()\-–—,.\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = cleaned.split(" ").filter((w) => w.length >= 3);

  // 1. Multi-word checks first (e.g. "pan d", "vitamin d3")
  for (const [key, purpose] of Object.entries(MEDICATION_PURPOSE_MAP)) {
    if (key.includes(" ") && cleaned.includes(key)) {
      return purpose;
    }
  }

  // 2. Direct dictionary match against individual cleaned words
  for (const word of words) {
    if (MEDICATION_PURPOSE_MAP[word]) {
      return MEDICATION_PURPOSE_MAP[word];
    }
  }

  // 3. Fallback to pharmacological prefix/suffix patterns
  for (const word of words) {
    for (const { suffix, purpose } of SUFFIX_PATTERNS) {
      if (suffix.test(word)) {
        return purpose;
      }
    }
  }

  return null;
}
