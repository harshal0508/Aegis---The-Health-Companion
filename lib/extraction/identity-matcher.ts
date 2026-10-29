/**
 * Document Identity Verification Engine
 * Strictly compares document identity (patient_name_as_printed, patient_name_latin, patient_dob)
 * against active patient profile (full_name, dob).
 *
 * Rules:
 * 1. Tokens are compared order-insensitively, tolerating titles and initials.
 * 2. Given name MUST match.
 * 3. Surname alone NEVER matches.
 * 4. ZERO edit-distance matching (exact token equality only, preventing Rajesh/Rakesh or Sunita/Sunil false matches).
 * 5. DOB mismatch is a HARD mismatch flag when both document and profile DOBs are present.
 * 6. Outcomes: "match" | "mismatch" | "name_not_found".
 */

export type IdentityMatchOutcome = "match" | "mismatch" | "name_not_found";

export interface PatientProfileIdentity {
  full_name: string;
  dob?: string | null;
}

export interface DocumentExtractedIdentity {
  patient_name_as_printed?: string | null;
  patient_name_latin?: string | null;
  patient_dob?: string | null;
}

export interface IdentityMatchResult {
  outcome: IdentityMatchOutcome;
  reason: string;
  matchedTokens: string[];
  mismatchedTokens: string[];
  details: {
    extractedName: string | null;
    profileName: string;
    extractedDob: string | null;
    profileDob: string | null;
    isPediatricDependent?: boolean;
  };
}

// Common honorifics and clinical title prefixes in Latin and Devanagari
const TITLES_TO_STRIP = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "master",
  "dr",
  "doctor",
  "prof",
  "professor",
  "smt",
  "shri",
  "shree",
  "sri",
  "kumari",
  "km",
  "late",
  "patient",
  "pt",
  "sh",
  "md",
  "mbbs",
  // Devanagari titles
  "श्री",
  "श्रीमती",
  "सुश्री",
  "डॉ",
  "डॉक्टर",
  "कु",
  "कुमारी",
]);

// Relationship prefixes like "S/O", "D/O", "W/O", "C/O"
const RELATION_PREFIXES = new Set(["so", "do", "wo", "co", "so/", "do/", "wo/", "co/"]);

/**
 * Basic Indic transliteration dictionary for common Hindi/Devanagari characters
 * to ensure robust matching even when compared directly.
 */
function normalizeDevanagariToLatin(text: string): string {
  const map: Record<string, string> = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ऋ": "ri",
    "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "an", "क": "k", "ख": "kh",
    "ग": "g", "घ": "gh", "ङ": "ng", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh",
    "ञ": "ny", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t",
    "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b",
    "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gy",
    "ा": "a", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "ृ": "ri", "े": "e",
    "ै": "ai", "ो": "o", "ौ": "au", "्": "", "ं": "n", "ः": "h",
  };

  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += map[ch] !== undefined ? map[ch] : ch;
  }
  return out;
}

/**
 * Clean and tokenize a raw name string.
 * Strips punctuation, titles, extra spaces, and returns tokens.
 */
export function tokenizeName(rawName: string | null | undefined): {
  tokens: string[];
  isBabyOf: boolean;
  guardianName?: string;
} {
  if (!rawName || typeof rawName !== "string") {
    return { tokens: [], isBabyOf: false };
  }

  let cleaned = rawName.trim().toLowerCase();

  // Check for "Baby of" / "B/O"
  let isBabyOf = false;
  let guardianName: string | undefined;

  const babyOfPattern = /^(?:baby\s+of|b\/o|infant\s+of)\s+(.+)$/i;
  const babyMatch = cleaned.match(babyOfPattern);
  if (babyMatch) {
    isBabyOf = true;
    guardianName = babyMatch[1].trim();
    cleaned = guardianName;
  }

  // Handle Devanagari transliteration if present
  if (/[\u0900-\u097F]/.test(cleaned)) {
    cleaned = normalizeDevanagariToLatin(cleaned);
  }

  // Replace punctuation with spaces, but keep letters and numbers
  cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ");

  const rawTokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  // Filter out titles and relation prefixes
  const tokens = rawTokens.filter((token) => {
    if (TITLES_TO_STRIP.has(token)) return false;
    if (RELATION_PREFIXES.has(token)) return false;
    return true;
  });

  return { tokens, isBabyOf, guardianName };
}

/**
 * Normalize Date string to YYYY-MM-DD
 */
export function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Direct ISO YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, "0");
    const d = isoMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Indian format DD-MM-YYYY or DD/MM/YYYY
  const inMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (inMatch) {
    const d = inMatch[1].padStart(2, "0");
    const m = inMatch[2].padStart(2, "0");
    const y = inMatch[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

/**
 * Checks if a token is an initial (1 single letter).
 */
function isInitial(token: string): boolean {
  return token.length === 1 && /^[a-z]$/i.test(token);
}

/**
 * Matches an initial token against a full name token.
 * e.g., 'h' matches 'harshal', but 'r' DOES NOT match 'harshal'.
 */
function initialMatches(initial: string, fullToken: string): boolean {
  return fullToken.toLowerCase().startsWith(initial.toLowerCase());
}

/**
 * Core Identity Verification Gate
 */
export function matchPatientIdentity(
  profile: PatientProfileIdentity,
  document: DocumentExtractedIdentity
): IdentityMatchResult {
  const profileName = (profile?.full_name || "").trim();
  const profileDob = normalizeDate(profile?.dob);

  // Extracted name: try latin first, fallback to printed
  const extractedName =
    (document?.patient_name_latin || "").trim() ||
    (document?.patient_name_as_printed || "").trim() ||
    null;

  const extractedDob = normalizeDate(document?.patient_dob);

  // 1. Outcome: name_not_found
  if (!extractedName) {
    return {
      outcome: "name_not_found",
      reason: "No patient name could be identified on this document.",
      matchedTokens: [],
      mismatchedTokens: [],
      details: {
        extractedName: null,
        profileName,
        extractedDob,
        profileDob,
      },
    };
  }

  // 2. HARD FLAG: Check DOB mismatch if both are present
  if (profileDob && extractedDob) {
    if (profileDob !== extractedDob) {
      return {
        outcome: "mismatch",
        reason: `Date of birth mismatch: report states ${extractedDob}, but profile date of birth is ${profileDob}.`,
        matchedTokens: [],
        mismatchedTokens: [`DOB: ${extractedDob} != ${profileDob}`],
        details: {
          extractedName,
          profileName,
          extractedDob,
          profileDob,
        },
      };
    }
  }

  // 3. Tokenize names
  const profileTokenized = tokenizeName(profileName);
  const docTokenized = tokenizeName(extractedName);

  const profileTokens = profileTokenized.tokens;
  const docTokens = docTokenized.tokens;

  if (profileTokens.length === 0) {
    return {
      outcome: "name_not_found",
      reason: "Patient profile does not have a valid name to compare against.",
      matchedTokens: [],
      mismatchedTokens: [],
      details: {
        extractedName,
        profileName,
        extractedDob,
        profileDob,
      },
    };
  }

  if (docTokens.length === 0) {
    return {
      outcome: "name_not_found",
      reason: "Document contains only titles without a recognized name.",
      matchedTokens: [],
      mismatchedTokens: [],
      details: {
        extractedName,
        profileName,
        extractedDob,
        profileDob,
      },
    };
  }

  // Determine Given Name and Surname tokens for profile
  // In single-token profile (e.g. "Harshal"): given = ["harshal"], surname = null
  // In multi-token profile (e.g. "Harshal Ramesh Jain"): given = ["harshal", "ramesh"], surname = "jain"
  let profileGivenTokens: string[] = [];
  let profileSurname: string | null = null;

  if (profileTokens.length === 1) {
    profileGivenTokens = [profileTokens[0]];
    profileSurname = null;
  } else {
    profileGivenTokens = profileTokens.slice(0, profileTokens.length - 1);
    profileSurname = profileTokens[profileTokens.length - 1];
  }

  // Determine Given Name and Surname tokens for document
  let docGivenTokens: string[] = [];
  let docSurname: string | null = null;

  if (docTokens.length === 1) {
    docGivenTokens = [docTokens[0]];
    docSurname = null;
  } else {
    docGivenTokens = docTokens.slice(0, docTokens.length - 1);
    docSurname = docTokens[docTokens.length - 1];
  }

  // RULE: "The given name must match. Surname alone never matches. No edit-distance matching."
  // Check if doc is ONLY the surname (or only matches the surname)
  const allDocTokensSet = new Set(docTokens);
  const allProfileTokensSet = new Set(profileTokens);

  // Exact token intersections
  const matchedTokens: string[] = [];
  const mismatchedTokens: string[] = [];

  for (const dt of docTokens) {
    if (allProfileTokensSet.has(dt)) {
      matchedTokens.push(dt);
    } else {
      mismatchedTokens.push(dt);
    }
  }

  // Special Case: "Baby of ..."
  if (docTokenized.isBabyOf) {
    // If the document states "Baby of Sunita Jain" and profile is Sunita Jain:
    // The mother matches. We flag this as a pediatric mismatch for the adult's own emergency card,
    // because an adult cannot have infant records in their emergency card.
    return {
      outcome: "mismatch",
      reason: `Report appears to be for a pediatric dependent ("Baby of ${docTokenized.guardianName}"), not this profile.`,
      matchedTokens,
      mismatchedTokens: ["Baby of"],
      details: {
        extractedName,
        profileName,
        extractedDob,
        profileDob,
        isPediatricDependent: true,
      },
    };
  }

  // Check Given Name Match
  // Given name must match at least one profile given name (exact string match OR initial match).
  // Note: NO edit-distance matching allowed!
  let givenNameMatched = false;
  let surnameMatched = false;

  // 1. Check if profile given name matches any doc token (exact or initial)
  for (const dt of docTokens) {
    for (const pg of profileGivenTokens) {
      if (dt === pg) {
        givenNameMatched = true;
        break;
      }
      if (isInitial(dt) && initialMatches(dt, pg)) {
        givenNameMatched = true;
        break;
      }
      if (isInitial(pg) && initialMatches(pg, dt)) {
        givenNameMatched = true;
        break;
      }
    }
    if (givenNameMatched) break;
  }

  // 2. Check if profile surname matches any doc token
  if (profileSurname) {
    for (const dt of docTokens) {
      if (dt === profileSurname) {
        surnameMatched = true;
        break;
      }
      if (isInitial(dt) && initialMatches(dt, profileSurname)) {
        surnameMatched = true;
        break;
      }
    }
  }

  // RULE: "Surname alone never matches."
  if (surnameMatched && !givenNameMatched) {
    return {
      outcome: "mismatch",
      reason: `Report appears to be for someone else (shared surname "${profileSurname}", but given name does not match).`,
      matchedTokens,
      mismatchedTokens,
      details: {
        extractedName,
        profileName,
        extractedDob,
        profileDob,
      },
    };
  }

  // RULE: "The given name must match."
  if (!givenNameMatched) {
    return {
      outcome: "mismatch",
      reason: `Report appears to be for someone else (name on report is "${extractedName}", profile name is "${profileName}").`,
      matchedTokens,
      mismatchedTokens,
      details: {
        extractedName,
        profileName,
        extractedDob,
        profileDob,
      },
    };
  }

  // If given name matched, check for conflicting surname:
  // If the profile has a surname, but the document has a completely different surname (and profile's surname is NOT present)
  if (profileSurname && !surnameMatched) {
    // If doc has multiple tokens (e.g. "Harshal Sharma" vs "Harshal Jain"), the other token is a conflicting surname
    const nonGivenDocTokens = docTokens.filter((dt) => !profileGivenTokens.includes(dt));
    const conflictingSurnames = nonGivenDocTokens.filter(
      (dt) => !isInitial(dt) && dt !== profileSurname
    );

    if (conflictingSurnames.length > 0) {
      return {
        outcome: "mismatch",
        reason: `Report appears to be for someone else (given name matches, but surname differs: "${conflictingSurnames.join(" ")}" vs "${profileSurname}").`,
        matchedTokens,
        mismatchedTokens: conflictingSurnames,
        details: {
          extractedName,
          profileName,
          extractedDob,
          profileDob,
        },
      };
    }
  }

  // All checks passed!
  return {
    outcome: "match",
    reason: `Document identity verified for ${profileName}.`,
    matchedTokens,
    mismatchedTokens,
    details: {
      extractedName,
      profileName,
      extractedDob,
      profileDob,
    },
  };
}
