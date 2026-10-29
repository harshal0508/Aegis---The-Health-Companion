import { describe, it, expect } from "vitest";
import {
  matchPatientIdentity,
  type PatientProfileIdentity,
  type DocumentExtractedIdentity,
} from "@/lib/extraction/identity-matcher";

describe("Document Identity Verification Gate (Task A)", () => {
  let falseFlagCount = 0; // True matches incorrectly flagged as mismatch/not_found
  let missCount = 0; // True mismatches incorrectly flagged as match

  interface TestCase {
    name: string;
    profile: PatientProfileIdentity;
    document: DocumentExtractedIdentity;
    expectedOutcome: "match" | "mismatch" | "name_not_found";
    description: string;
  }

  const testCases: TestCase[] = [
    // 1. Exact match
    {
      name: "Exact match with titles stripped",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "Mr. Harshal Jain",
        patient_name_latin: "Harshal Jain",
        patient_dob: "1995-05-10",
      },
      expectedOutcome: "match",
      description: "Direct match with title 'Mr.' stripped",
    },

    // 2. Name-order swaps (e.g. "Jain, Harshal" vs "Harshal Jain")
    {
      name: "Name-order swap (Surname First)",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "Jain, Harshal",
        patient_name_latin: "Jain, Harshal",
        patient_dob: "1995-05-10",
      },
      expectedOutcome: "match",
      description: "Order-insensitive comparison matches reversed surname/given name",
    },

    // 3. Initials (e.g. "H. Jain" vs "Harshal Jain", "K. R. Sharma" vs "Karan Ramesh Sharma")
    {
      name: "Initials in given name (H. Jain)",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "H. Jain",
        patient_name_latin: "H. Jain",
        patient_dob: null,
      },
      expectedOutcome: "match",
      description: "Initial 'H' matches 'Harshal' with matching surname",
    },
    {
      name: "Multiple initials (K. R. Sharma)",
      profile: { full_name: "Karan Ramesh Sharma", dob: "1992-08-15" },
      document: {
        patient_name_as_printed: "K. R. Sharma",
        patient_name_latin: "K. R. Sharma",
        patient_dob: "1992-08-15",
      },
      expectedOutcome: "match",
      description: "Initials K. R. match Karan Ramesh",
    },

    // 4. Devanagari script support
    {
      name: "Devanagari script matching",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "हर्षल जैन",
        patient_name_latin: "Harshal Jain",
        patient_dob: "1995-05-10",
      },
      expectedOutcome: "match",
      description: "Devanagari name with Latin transliteration matches profile",
    },

    // 5. Rajesh vs Rakesh (NO edit-distance matching allowed!)
    {
      name: "Rajesh vs Rakesh (Edit distance 1 - MUST mismatch)",
      profile: { full_name: "Rajesh Jain", dob: "1965-03-20" },
      document: {
        patient_name_as_printed: "Rakesh Jain",
        patient_name_latin: "Rakesh Jain",
        patient_dob: "1965-03-20",
      },
      expectedOutcome: "mismatch",
      description: "Rajesh and Rakesh differ by 1 letter; zero edit-distance ensures hard mismatch",
    },

    // 6. Sunita vs Sunil (NO edit-distance matching allowed!)
    {
      name: "Sunita vs Sunil (Spelling similarity - MUST mismatch)",
      profile: { full_name: "Sunita Sharma", dob: "1970-11-12" },
      document: {
        patient_name_as_printed: "Sunil Sharma",
        patient_name_latin: "Sunil Sharma",
        patient_dob: "1970-11-12",
      },
      expectedOutcome: "mismatch",
      description: "Sunita and Sunil differ by 2 letters; zero edit-distance ensures hard mismatch",
    },

    // 7. Shared surname with a different given name (Surname alone never matches!)
    {
      name: "Shared surname, different given name (Karan Jain vs Harshal Jain)",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "Karan Jain",
        patient_name_latin: "Karan Jain",
        patient_dob: null,
      },
      expectedOutcome: "mismatch",
      description: "Surname 'Jain' matches but given name 'Karan' != 'Harshal'; surname alone NEVER matches",
    },
    {
      name: "Surname alone on report (Dr. Jain)",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "Dr. Jain",
        patient_name_latin: "Dr. Jain",
        patient_dob: null,
      },
      expectedOutcome: "mismatch",
      description: "Only surname is on document; surname alone never matches",
    },

    // 8. Same name with a different DOB (DOB mismatch is a hard flag)
    {
      name: "Same name with different DOB (Hard flag)",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "Harshal Jain",
        patient_name_latin: "Harshal Jain",
        patient_dob: "1990-01-01",
      },
      expectedOutcome: "mismatch",
      description: "Same name but document DOB 1990-01-01 != profile DOB 1995-05-10; hard mismatch flag",
    },

    // 9. "Baby of ..." pediatric records
    {
      name: "Baby of Sunita Jain",
      profile: { full_name: "Sunita Jain", dob: "1970-11-12" },
      document: {
        patient_name_as_printed: "Baby of Sunita Jain",
        patient_name_latin: "Baby of Sunita Jain",
        patient_dob: "2024-01-01",
      },
      expectedOutcome: "mismatch",
      description: "Pediatric record for dependent cannot be merged into mother's own record",
    },

    // 10. No name found on document
    {
      name: "No name found on document",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: null,
        patient_name_latin: null,
        patient_dob: null,
      },
      expectedOutcome: "name_not_found",
      description: "Missing patient name on document returns name_not_found requiring attestation",
    },
    {
      name: "Empty / blank name string on document",
      profile: { full_name: "Harshal Jain", dob: "1995-05-10" },
      document: {
        patient_name_as_printed: "   ",
        patient_name_latin: "",
        patient_dob: null,
      },
      expectedOutcome: "name_not_found",
      description: "Whitespace name treated as name_not_found",
    },
  ];

  testCases.forEach((tc, idx) => {
    it(`Case ${idx + 1}: ${tc.name}`, () => {
      const result = matchPatientIdentity(tc.profile, tc.document);

      // Track false flags and misses
      if (tc.expectedOutcome === "match" && result.outcome !== "match") {
        falseFlagCount++;
      } else if (tc.expectedOutcome === "mismatch" && result.outcome === "match") {
        missCount++;
      }

      expect(
        result.outcome,
        `Expected ${tc.expectedOutcome} but got ${result.outcome} (${result.reason})`
      ).toBe(tc.expectedOutcome);
    });
  });

  it("Reports false-flag and miss counts accurately", () => {
    // Both false-flag and miss counts must be exactly 0
    console.log(`[Identity Verification Benchmark] Total cases: ${testCases.length}`);
    console.log(`[Identity Verification Benchmark] False-Flag Count: ${falseFlagCount}`);
    console.log(`[Identity Verification Benchmark] Miss Count: ${missCount}`);

    expect(falseFlagCount).toBe(0);
    expect(missCount).toBe(0);
  });
});
