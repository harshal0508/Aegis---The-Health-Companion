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
  lastUpdated: string;
}

export interface LocalityInfo {
  city: string;
  state: string;
  pincode: string;
}

export const SUPPORTED_LOCALITIES: LocalityInfo[] = [
  { city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  { city: "Indore", state: "Madhya Pradesh", pincode: "452001" },
  { city: "Delhi / NCR", state: "Delhi", pincode: "110001" },
  { city: "Mumbai", state: "Maharashtra", pincode: "400001" },
  { city: "Bengaluru", state: "Karnataka", pincode: "560001" },
  { city: "Pune", state: "Maharashtra", pincode: "411001" },
  { city: "Hyderabad", state: "Telangana", pincode: "500001" },
  { city: "Jaipur", state: "Rajasthan", pincode: "302001" },
];

export const REGIONAL_DISEASE_ADVISORIES: DiseaseAdvisory[] = [
  {
    id: "dengue-surge",
    name: "Dengue & Vector-Borne Fever",
    category: "vector_borne",
    categoryLabel: "Vector-Borne",
    severity: "high",
    headline: "Seasonal Dengue Spike Reported Across Urban Areas",
    summary:
      "Public health surveillance indicates elevated Aedes mosquito breeding and clustered dengue cases in urban residential wards.",
    transmission: "Transmitted via day-biting Aedes aegypti mosquitoes breeding in clear stagnant water containers.",
    symptoms: [
      "High sudden fever with retro-orbital (behind eye) pain",
      "Severe musculoskeletal ache ('breakbone fever')",
      "Fatigue, nausea, and rash",
      "Red flag: Persistent vomiting, abdominal pain, or gum bleeding",
    ],
    precautions: [
      "Empty, scrub, and dry all water coolers, plant trays, and overhead tanks weekly ('Dry Day' initiative).",
      "Apply DEET or picaridin-based mosquito repellent, especially during early morning and late afternoon hours.",
      "Install window mesh and wear full-sleeve light-colored clothing.",
      "CRITICAL: Do NOT self-medicate with NSAIDs (Ibuprofen, Aspirin, Diclofenac) for fever as they increase bleeding risks; use Paracetamol strictly as advised.",
    ],
    affectedLocalities: ["Bhopal", "Indore", "Delhi / NCR", "Bengaluru", "Mumbai", "Pune"],
    pincodePrefixes: ["462", "452", "110", "560", "400", "411"],
    reportedTrend: "increasing",
    lastUpdated: "2026-10-25",
  },
  {
    id: "viral-influenza-h3n2",
    name: "Seasonal Influenza (H3N2 / Flu)",
    category: "respiratory",
    categoryLabel: "Respiratory",
    severity: "moderate",
    headline: "Cluster of Prolonged Cough & Viral Respiratory Infections",
    summary:
      "Outpatient clinics report widespread seasonal influenza with persistent dry cough and body ache lasting 7–10 days.",
    transmission: "Airborne respiratory droplets from coughing, sneezing, and close indoor contact.",
    symptoms: [
      "Persistent dry cough and sore throat",
      "Fever with chills and extreme fatigue",
      "Headache, body aches, and nasal congestion",
      "Red flag: Breathlessness or oxygen saturation dropping below 94%",
    ],
    precautions: [
      "Wear well-fitting masks in crowded transit and poorly ventilated indoor settings.",
      "Practice frequent 20-second hand hygiene with soap and water or alcohol hand rub.",
      "Maintain adequate hydration with warm fluids, soups, and oral fluids.",
      "High-risk patients (elderly, asthmatic, diabetic) should seek prompt medical consult if fever persists beyond 3 days.",
    ],
    affectedLocalities: ["Bhopal", "Indore", "Delhi / NCR", "Pune", "Hyderabad", "Jaipur"],
    pincodePrefixes: ["462", "452", "110", "411", "500", "302"],
    reportedTrend: "stable",
    lastUpdated: "2026-10-24",
  },
  {
    id: "acute-gastroenteritis",
    name: "Acute Gastroenteritis & Waterborne Infection",
    category: "water_borne",
    categoryLabel: "Waterborne",
    severity: "moderate",
    headline: "Spot Cases of Water-Contamination Related Gastric Illness",
    summary:
      "Municipal health advisories urge boiling drinking water due to localized pipeline repair disruptions and intermittent contamination.",
    transmission: "Consumption of contaminated municipal water, unhygienic ice, or exposed street food.",
    symptoms: [
      "Watery diarrhea and abdominal cramps",
      "Low-grade fever and nausea/vomiting",
      "Signs of dehydration: dry mouth, decreased urination, dizziness",
    ],
    precautions: [
      "Drink only boiled, filtered, or certified RO-treated water.",
      "Avoid raw salads, roadside cut fruits, and untreated ice cubes.",
      "Start Oral Rehydration Salts (ORS) immediately at the onset of loose stools.",
      "Wash hands thoroughly before handling food and after restroom use.",
    ],
    affectedLocalities: ["Bhopal", "Indore", "Mumbai", "Hyderabad"],
    pincodePrefixes: ["462", "452", "400", "500"],
    reportedTrend: "decreasing",
    lastUpdated: "2026-10-22",
  },
  {
    id: "viral-conjunctivitis",
    name: "Viral Conjunctivitis ('Eye Flu')",
    category: "viral_contact",
    categoryLabel: "Contact Viral",
    severity: "low",
    headline: "Mild Outbreak of Highly Contagious Eye Infection",
    summary:
      "School and workplace clusters of adenoviral conjunctivitis noted. Rapid spread through direct contact and shared personal items.",
    transmission: "Hand-to-eye contact after touching contaminated surfaces, towels, or optical gear.",
    symptoms: [
      "Redness, itching, and gritty sensation in one or both eyes",
      "Watery or sticky eyelid discharge, especially upon waking",
      "Swollen eyelids and mild photophobia",
    ],
    precautions: [
      "Never rub the eyes; use sterile wipes or clean wet cotton to cleanse discharge.",
      "Do not share towels, pillows, handkerchiefs, or eye makeup with family members.",
      "Wash hands thoroughly with soap before and after instilling prescribed eye drops.",
      "Avoid wearing contact lenses until complete recovery and ophthalmologist clearance.",
    ],
    affectedLocalities: ["Bhopal", "Indore", "Delhi / NCR", "Bengaluru"],
    pincodePrefixes: ["462", "452", "110", "560"],
    reportedTrend: "decreasing",
    lastUpdated: "2026-10-20",
  },
  {
    id: "chikungunya-surveillance",
    name: "Chikungunya Joint-Pain Alert",
    category: "vector_borne",
    categoryLabel: "Vector-Borne",
    severity: "low",
    headline: "Post-Monsoon Vector Surveillance for Prolonged Arthralgia",
    summary:
      "Isolated cases reported in suburban localities. Characterized by debilitating joint pain that can linger for weeks.",
    transmission: "Aedes mosquito vector.",
    symptoms: [
      "Sudden onset high fever",
      "Severe bilateral joint pain (wrists, ankles, knees)",
      "Maculopapular rash and joint swelling",
    ],
    precautions: [
      "Active daytime mosquito barrier protection.",
      "Rest and gentle mobilization; avoid heavy weight-bearing during acute flare.",
      "Consult physician for safe anti-inflammatory management.",
    ],
    affectedLocalities: ["Bhopal", "Indore", "Pune", "Bengaluru"],
    pincodePrefixes: ["462", "452", "411", "560"],
    reportedTrend: "stable",
    lastUpdated: "2026-10-18",
  },
];

/**
 * Filter advisories based on city name or 6-digit Indian PIN code.
 */
export function getAdvisoriesForLocality(
  cityOrPincode: string
): { advisories: DiseaseAdvisory[]; matchedLocality: string } {
  const query = cityOrPincode.trim().toLowerCase();
  if (!query) {
    // Default to Bhopal / MP
    return {
      advisories: REGIONAL_DISEASE_ADVISORIES.filter((a) =>
        a.affectedLocalities.includes("Bhopal")
      ),
      matchedLocality: "Bhopal (462001)",
    };
  }

  // Check if query matches 3-digit prefix of a pincode
  const pinPrefix = query.slice(0, 3);
  const byPin = REGIONAL_DISEASE_ADVISORIES.filter((a) =>
    a.pincodePrefixes.includes(pinPrefix)
  );

  if (byPin.length > 0) {
    const known = SUPPORTED_LOCALITIES.find((l) => l.pincode.startsWith(pinPrefix));
    return {
      advisories: byPin,
      matchedLocality: known ? `${known.city} (${cityOrPincode})` : `Pincode ${cityOrPincode}`,
    };
  }

  // Check by city name match
  const byCity = REGIONAL_DISEASE_ADVISORIES.filter((a) =>
    a.affectedLocalities.some((loc) => loc.toLowerCase().includes(query))
  );

  if (byCity.length > 0) {
    const known = SUPPORTED_LOCALITIES.find((l) =>
      l.city.toLowerCase().includes(query)
    );
    return {
      advisories: byCity,
      matchedLocality: known ? `${known.city} (${known.pincode})` : cityOrPincode,
    };
  }

  // Fallback: return national priority advisories (Dengue & Flu)
  return {
    advisories: REGIONAL_DISEASE_ADVISORIES.slice(0, 2),
    matchedLocality: `${cityOrPincode} (Regional General Advisory)`,
  };
}
