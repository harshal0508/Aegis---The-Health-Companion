export type AlertSeverity = "high" | "moderate" | "low";

export type DiseaseCategory =
  | "vector_borne"
  | "respiratory"
  | "water_borne"
  | "viral_contact"
  | "general";

export interface DiseaseAdvisory {
  id: string;
  name: string;
  category: DiseaseCategory;
  categoryLabel: string;
  severity: AlertSeverity;
  headline: string;
  summary: string;
  transmission: string;
  symptoms: string[];
  precautions: string[];
  affectedLocalities: string[]; // City names
  pincodePrefixes: string[]; // First 3 digits of PIN
  reportedTrend: "increasing" | "stable" | "decreasing";
  source_title: string;
  source_url: string;
  report_date: string;
  retrieved_at: string;
  is_sample_demo: boolean;
}

export interface LocalityInfo {
  city: string;
  state: string;
  pincode: string;
}

export const SUPPORTED_LOCALITIES: LocalityInfo[] = [
  { city: "Indore", state: "Madhya Pradesh", pincode: "452001" },
  { city: "Pune", state: "Maharashtra", pincode: "411001" },
  { city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  { city: "Mumbai", state: "Maharashtra", pincode: "400001" },
  { city: "Delhi / NCR", state: "Delhi", pincode: "110001" },
  { city: "Bengaluru", state: "Karnataka", pincode: "560001" },
  { city: "Hyderabad", state: "Telangana", pincode: "500001" },
  { city: "Jaipur", state: "Rajasthan", pincode: "302001" },
  { city: "Chennai", state: "Tamil Nadu", pincode: "600001" },
  { city: "Kolkata", state: "West Bengal", pincode: "700001" },
  { city: "Lucknow", state: "Uttar Pradesh", pincode: "226001" },
  { city: "Ahmedabad", state: "Gujarat", pincode: "380001" },
];

/**
 * SAMPLE / DEMONSTRATION ENTRIES
 * ------------------------------
 * TRANSPARENCY DISCLOSURE:
 * The entries below represent typical seasonal patterns in Indian urban centres,
 * compiled for prototype demonstration purposes. They are NOT from an active real-time API.
 * In a production deployment, these records must be populated directly from official
 * public reports published by the Integrated Disease Surveillance Programme (IDSP) /
 * National Centre for Disease Control (NCDC), Ministry of Health and Family Welfare (MoHFW).
 *
 * Any entry rendered in the application must carry its source document title, URL,
 * report date, and retrieval timestamp. All demonstration records are explicitly tagged
 * with `is_sample_demo: true` and rendered with a visible demonstration badge.
 */
export const REGIONAL_DISEASE_ADVISORIES: DiseaseAdvisory[] = [
  {
    id: "dengue-surge",
    name: "Dengue & Vector-Borne Illness",
    category: "vector_borne",
    categoryLabel: "Vector-Borne",
    severity: "high",
    headline: "Seasonal Dengue Advisory (Sample Prototype Record)",
    summary:
      "Public health surveillance advisories outline vector-control guidelines during post-monsoon mosquito breeding periods.",
    transmission: "Aedes aegypti mosquitoes breeding in stagnant water containers.",
    symptoms: [
      "Sudden high fever with headache and pain behind the eyes",
      "Severe muscle and joint aches",
      "Nausea and skin rash",
      "Signs requiring urgent clinical review: persistent vomiting, abdominal pain, or bleeding",
    ],
    precautions: [
      "Eliminate stagnant water from domestic containers and coolers weekly.",
      "Use mosquito repellents and wear full-sleeve protective clothing.",
      "Public health notice: Avoid self-administering non-steroidal anti-inflammatory drugs (NSAIDs) for suspected dengue without medical guidance.",
      "Consult a qualified doctor for persistent fever or platelet monitoring.",
    ],
    affectedLocalities: [
      "Bhopal",
      "Indore",
      "Delhi / NCR",
      "Bengaluru",
      "Mumbai",
      "Pune",
      "Chennai",
      "Kolkata",
      "Hyderabad",
      "Ahmedabad",
    ],
    pincodePrefixes: ["462", "452", "110", "560", "400", "411", "600", "700", "500", "380"],
    reportedTrend: "increasing",
    source_title: "National Centre for Disease Control (NCDC) - National Dengue Guidelines",
    source_url: "https://nvbdcp.gov.in/index4.php?lang=1&level=0&linkid=431&lid=3715",
    report_date: "2024-09-15",
    retrieved_at: "2026-10-28",
    is_sample_demo: true,
  },
  {
    id: "viral-influenza-h3n2",
    name: "Seasonal Influenza (Flu / H1N1)",
    category: "respiratory",
    categoryLabel: "Respiratory",
    severity: "moderate",
    headline: "Seasonal Influenza Guidance (Sample Prototype Record)",
    summary:
      "Seasonal increase in viral respiratory illnesses with fever and prolonged cough.",
    transmission: "Airborne droplets from coughing, sneezing, and close contact.",
    symptoms: [
      "Fever, sore throat, and persistent dry cough",
      "Body ache and fatigue",
      "Signs requiring urgent clinical review: breathlessness or difficulty breathing",
    ],
    precautions: [
      "Practice respiratory etiquette (cover coughs and sneezes) and frequent hand washing.",
      "Wear masks in crowded indoor public spaces during seasonal surges.",
      "Maintain adequate oral hydration.",
      "Individuals with underlying chronic conditions should consult their physician early upon onset of flu symptoms.",
    ],
    affectedLocalities: [
      "Bhopal",
      "Indore",
      "Delhi / NCR",
      "Pune",
      "Hyderabad",
      "Jaipur",
      "Lucknow",
      "Bengaluru",
      "Mumbai",
      "Ahmedabad",
    ],
    pincodePrefixes: ["462", "452", "110", "411", "500", "302", "226", "560", "400", "380"],
    reportedTrend: "stable",
    source_title: "Ministry of Health & Family Welfare (MoHFW) - Seasonal Influenza Guidance",
    source_url: "https://www.mohfw.gov.in/",
    report_date: "2024-03-10",
    retrieved_at: "2026-10-28",
    is_sample_demo: true,
  },
  {
    id: "acute-gastroenteritis",
    name: "Acute Waterborne Diarrheal Illness",
    category: "water_borne",
    categoryLabel: "Waterborne",
    severity: "moderate",
    headline: "Drinking Water Safety Advisory (Sample Prototype Record)",
    summary:
      "Public health advisory on water sanitation and food hygiene during municipal infrastructure maintenance.",
    transmission: "Consumption of contaminated water or unhygienic food.",
    symptoms: [
      "Watery stools, nausea, and abdominal discomfort",
      "Signs of dehydration: dry mouth, reduced urine output, or dizziness",
    ],
    precautions: [
      "Drink boiled or certified treated drinking water.",
      "Use Oral Rehydration Salts (ORS) at the onset of diarrheal episodes.",
      "Wash hands thoroughly before handling food.",
      "Seek medical evaluation if dehydration signs develop or vomiting prevents liquid intake.",
    ],
    affectedLocalities: [
      "Bhopal",
      "Indore",
      "Mumbai",
      "Hyderabad",
      "Kolkata",
      "Chennai",
      "Pune",
      "Lucknow",
    ],
    pincodePrefixes: ["462", "452", "400", "500", "700", "600", "411", "226"],
    reportedTrend: "decreasing",
    source_title: "Integrated Disease Surveillance Programme (IDSP) - Waterborne Disease Weekly Protocol",
    source_url: "https://idsp.mohfw.gov.in/",
    report_date: "2024-07-20",
    retrieved_at: "2026-10-28",
    is_sample_demo: true,
  },
  {
    id: "viral-conjunctivitis",
    name: "Viral Conjunctivitis",
    category: "viral_contact",
    categoryLabel: "Contact Viral",
    severity: "low",
    headline: "Conjunctivitis Hygiene Advisory (Sample Prototype Record)",
    summary:
      "Advisory on contact-transmitted eye redness and discharge.",
    transmission: "Direct contact with eye secretions or contaminated personal surfaces.",
    symptoms: [
      "Eye redness, itching, and watery/sticky discharge",
      "Eyelid swelling",
    ],
    precautions: [
      "Avoid touching or rubbing the eyes.",
      "Do not share personal towels, pillows, or optical items.",
      "Wash hands with soap frequently.",
      "Consult an eye care professional for prescribed drops; avoid self-medicating with steroid eye drops.",
    ],
    affectedLocalities: [
      "Bhopal",
      "Indore",
      "Delhi / NCR",
      "Bengaluru",
      "Ahmedabad",
      "Jaipur",
      "Chennai",
    ],
    pincodePrefixes: ["462", "452", "110", "560", "380", "302", "600"],
    reportedTrend: "decreasing",
    source_title: "National Health Portal (NHP) India - Conjunctivitis Care Guidelines",
    source_url: "https://www.nhp.gov.in/disease/eye-and-ear/conjunctivitis",
    report_date: "2023-08-01",
    retrieved_at: "2026-10-28",
    is_sample_demo: true,
  },
];

/**
 * Filter advisories based on city name or 6-digit Indian PIN code.
 * Strict Rendering Rule: Only entries with complete source metadata or
 * explicitly tagged as sample demonstration data are returned.
 */
import {
  OFFICIAL_IDSP_WEEKLY_BASELINE,
  transformIdspToDiseaseAdvisory,
} from "./idsp-ingestion";
import { resolveIndianLocality } from "./pincode-resolver";

/**
 * Retrieves official government disease advisories and weekly IDSP outbreak reports for a given locality.
 * Prioritizes active weekly IDSP (Integrated Disease Surveillance Programme) outbreak bulletins.
 */
export function getAdvisoriesForLocality(
  cityOrPincode: string
): { advisories: DiseaseAdvisory[]; matchedLocality: string } {
  const query = (cityOrPincode || "").trim();
  const resolved = resolveIndianLocality(query || "Indore");

  const targetDistrict = resolved.district.toLowerCase();
  const targetCity = resolved.city.toLowerCase();
  const targetState = resolved.state.toLowerCase();
  const rawLower = query.toLowerCase();

  // 1. Check for official IDSP weekly outbreak reports matching this locality
  const matchedIdspItems = OFFICIAL_IDSP_WEEKLY_BASELINE.filter((item) => {
    const itemDist = item.district.toLowerCase();
    const itemState = item.state.toLowerCase();

    // Check district match (exact, substring, or within target city/raw input)
    if (
      itemDist === targetDistrict ||
      targetDistrict.includes(itemDist) ||
      itemDist.includes(targetDistrict) ||
      targetCity.includes(itemDist) ||
      rawLower.includes(itemDist)
    ) {
      return true;
    }

    return false;
  });

  if (matchedIdspItems.length > 0) {
    const idspAdvisories = matchedIdspItems.map((item, idx) =>
      transformIdspToDiseaseAdvisory(item, idx)
    );
    return {
      advisories: idspAdvisories,
      matchedLocality: resolved.displayName || `${resolved.district} (${resolved.pincode})`,
    };
  }

  // 2. If no district-specific item matched, check if an item matches the state
  const stateMatchedItems = OFFICIAL_IDSP_WEEKLY_BASELINE.filter(
    (item) => item.state.toLowerCase() === targetState
  );

  if (stateMatchedItems.length > 0) {
    const stateAdvisories = stateMatchedItems.slice(0, 2).map((item, idx) => {
      const adv = transformIdspToDiseaseAdvisory(item, idx);
      return {
        ...adv,
        id: `idsp-${resolved.district.toLowerCase().replace(/\s+/g, "-")}-state-${idx}`,
        headline: `${item.casesCount} cases reported in ${item.district} (${item.state}) • Regional Surveillance`,
        summary: `Surveillance notice active across ${resolved.district} and neighbouring districts by the ${item.state} Directorate of Health Services. ${adv.summary}`,
        affectedLocalities: [resolved.district, item.state],
      };
    });
    return {
      advisories: stateAdvisories,
      matchedLocality: resolved.displayName || `${resolved.district} (${resolved.pincode})`,
    };
  }

  // 3. Fallback: return sample regional digest for completely unmapped locations
  const validAdvisories = REGIONAL_DISEASE_ADVISORIES.filter((a) => {
    const hasSource = Boolean(
      a.source_title && a.source_url && a.report_date && a.retrieved_at
    );
    return hasSource || a.is_sample_demo;
  });

  return {
    advisories: validAdvisories.slice(0, 2),
    matchedLocality: `${cityOrPincode} (Sample Regional Digest)`,
  };
}
