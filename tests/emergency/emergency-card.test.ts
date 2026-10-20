import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";
import {
  generateEmergencyToken,
  hashEmergencyToken,
  hashIpAddress,
  checkEmergencyRateLimit,
} from "@/lib/emergency/token";
import {
  isValidEmergencyToken,
  formatAllergyItem,
  sanitizeResponderData,
  buildWalletCardPayload,
  type RawDbItem,
  type PageDocMeta,
} from "@/lib/emergency/sanitizer";

describe("Phase 5: Emergency Card System", () => {
  // ── 1. Cryptographic Token Generation & Hashing ─────────────────────────────
  describe("Token Generation and Hashing", () => {
    it("generates a 128-bit cryptographically secure base62 token (22 chars)", () => {
      const token = generateEmergencyToken();
      expect(token).toBeDefined();
      expect(token.length).toBe(22);
      expect(/^[0-9a-zA-Z]{22}$/.test(token)).toBe(true);
    });

    it("generates 100 unique, non-deterministic tokens without collisions", () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateEmergencyToken());
      }
      expect(tokens.size).toBe(100);
    });

    it("computes standard SHA-256 hash matching Node crypto", () => {
      const token = generateEmergencyToken();
      const expectedHash = crypto.createHash("sha256").update(token).digest("hex");
      const hash = hashEmergencyToken(token);

      expect(hash).toBe(expectedHash);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it("handles empty or missing tokens safely", () => {
      expect(hashEmergencyToken("")).toBe("");
      expect(hashEmergencyToken("   ")).toBe("");
    });

    it("validates emergency token format correctly", () => {
      const validToken = generateEmergencyToken();
      expect(isValidEmergencyToken(validToken)).toBe(true);

      // Invalid tokens
      expect(isValidEmergencyToken("")).toBe(false);
      expect(isValidEmergencyToken("short")).toBe(false);
      expect(isValidEmergencyToken("token-with-hyphens-and-bad-chars!")).toBe(false);
      expect(isValidEmergencyToken("   spaced token   ")).toBe(false);
      expect(isValidEmergencyToken(null as any)).toBe(false);
      expect(isValidEmergencyToken(undefined as any)).toBe(false);
    });
  });

  // ── 2. Client IP Anonymization & Rate Limiting ─────────────────────────────
  describe("IP Anonymization and Rate Limiting", () => {
    it("anonymizes IP addresses deterministically with salt", () => {
      const ip = "192.168.1.100";
      const hash1 = hashIpAddress(ip);
      const hash2 = hashIpAddress(ip);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
      expect(hash1).not.toContain(ip);
    });

    it("produces distinct hashes for different IPs", () => {
      const hashA = hashIpAddress("10.0.0.1");
      const hashB = hashIpAddress("10.0.0.2");
      expect(hashA).not.toBe(hashB);
    });

    it("enforces sliding rate limit of 30 requests per minute", () => {
      const testIpHash = "test_rate_limiter_" + Date.now();

      // First 30 requests must succeed
      for (let i = 1; i <= 30; i++) {
        const result = checkEmergencyRateLimit(testIpHash, 30, 60000);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(30 - i);
      }

      // 31st request must be blocked
      const blockedResult = checkEmergencyRateLimit(testIpHash, 30, 60000);
      expect(blockedResult.allowed).toBe(false);
      expect(blockedResult.remaining).toBe(0);

      // Separate IP should have its own quota unaffected
      const otherIpHash = "test_other_ip_" + Date.now();
      const otherResult = checkEmergencyRateLimit(otherIpHash, 30, 60000);
      expect(otherResult.allowed).toBe(true);
      expect(otherResult.remaining).toBe(29);
    });
  });

  // ── 3. Data Sanitization & Zero-Leakage Privacy Invariants ──────────────────
  describe("Data Sanitization & Privacy Guards", () => {
    const rawItems: RawDbItem[] = [
      {
        id: "item-1",
        user_id: "user-secret-12345",
        document_id: "doc-secret-67890",
        storage_path: "documents/user-secret-12345/discharge_summary.pdf",
        file_url: "https://supabase.co/storage/v1/object/signed/discharges/private.pdf",
        page_id: "page-1",
        category: "allergy",
        value: "Penicillin (anaphylaxis)",
        status: "confirmed",
      },
      {
        id: "item-2",
        user_id: "user-secret-12345",
        document_id: "doc-secret-67890",
        storage_path: "documents/user-secret-12345/discharge_summary.pdf",
        category: "allergy",
        value: "Sulfa drugs (rash)",
        status: "needs_review", // UNCONFIRMED
      },
      {
        id: "item-3",
        user_id: "user-secret-12345",
        document_id: "doc-secret-67890",
        category: "medication",
        value: "Metformin 500mg twice daily",
        status: "confirmed",
      },
      {
        id: "item-4",
        user_id: "user-secret-12345",
        category: "medication",
        value: "Atorvastatin 20mg",
        status: "extracted", // UNCONFIRMED
      },
      {
        id: "item-5",
        user_id: "user-secret-12345",
        category: "condition",
        value: "Type 2 Diabetes Mellitus",
        status: "confirmed",
      },
      {
        id: "item-6",
        user_id: "user-secret-12345",
        category: "implant",
        value: "St. Jude Medical Pacemaker (MRI incompatible)",
        status: "confirmed",
      },
    ];

    const metaMap = new Map<string, PageDocMeta>([
      [
        "page-1",
        {
          doc_type: "Discharge Summary",
          doc_date: "2026-05-15",
          doc_date_type: "signed",
        },
      ],
    ]);

    const profile = {
      full_name: "Rahul Sharma",
      blood_group: "O+",
      emergency_contact_name: "Priya Sharma",
      emergency_contact_phone: "+91 98765 43210",
    };

    it("strictly excludes unconfirmed ('extracted' and 'needs_review') items", () => {
      const result = sanitizeResponderData({
        rawItems,
        visibleCategories: ["allergy", "medication", "condition", "implant"],
        pageMetaMap: metaMap,
        profile,
      });

      const returnedIds = result.items.map((i) => i.id);
      expect(returnedIds).toContain("item-1"); // Confirmed allergy
      expect(returnedIds).not.toContain("item-2"); // Needs review allergy -> EXCLUDED
      expect(returnedIds).toContain("item-3"); // Confirmed medication
      expect(returnedIds).not.toContain("item-4"); // Extracted medication -> EXCLUDED
      expect(returnedIds).toContain("item-5"); // Confirmed condition
      expect(returnedIds).toContain("item-6"); // Confirmed implant
    });

    it("strictly excludes confirmed items whose category is disabled", () => {
      // User only enables 'allergy' and 'blood_group'
      const result = sanitizeResponderData({
        rawItems,
        visibleCategories: ["allergy", "blood_group"],
        pageMetaMap: metaMap,
        profile,
      });

      expect(result.grouped.allergy).toHaveLength(1);
      expect(result.grouped.medication).toHaveLength(0);
      expect(result.grouped.condition).toHaveLength(0);
      expect(result.grouped.implant).toHaveLength(0);
      expect(result.blood_group).toBe("O+");
      // Emergency contact is NOT enabled in visibleCategories
      expect(result.emergency_contact_phone).toBeNull();
      expect(result.emergency_contact_name).toBeNull();
    });

    it("guarantees zero leakage of internal IDs, document IDs, or storage URLs", () => {
      const result = sanitizeResponderData({
        rawItems,
        visibleCategories: ["allergy", "medication", "condition", "implant"],
        pageMetaMap: metaMap,
        profile,
      });

      result.items.forEach((item) => {
        expect((item as any).user_id).toBeUndefined();
        expect((item as any).document_id).toBeUndefined();
        expect((item as any).page_id).toBeUndefined();
        expect((item as any).storage_path).toBeUndefined();
        expect((item as any).file_url).toBeUndefined();
        expect((item as any).metadata).toBeUndefined();
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain("user-secret-12345");
      expect(serialized).not.toContain("doc-secret-67890");
      expect(serialized).not.toContain("discharge_summary.pdf");
      expect(serialized).not.toContain("supabase.co/storage");
    });
  });

  // ── 4. Clinical Display Rules & Fallbacks ───────────────────────────────────
  describe("Clinical Display Rules and Fallbacks", () => {
    it("falls back to 'No allergy information recorded' when allergy list is empty (never 'No allergies')", () => {
      const result = sanitizeResponderData({
        rawItems: [],
        visibleCategories: ["allergy"],
        profile: { full_name: "Test Patient" },
      });

      expect(result.grouped.allergy).toHaveLength(0);
      expect(result.allergy_display_fallback).toBe("No allergy information recorded");
      expect(result.allergy_display_fallback).not.toBe("No allergies");
    });

    it("formats NKDA with document type and signed date provenance", () => {
      const nkdaItem = {
        value: "No Known Drug Allergies (NKDA)",
        doc_type: "Discharge Summary",
        doc_date: "2026-01-10",
        doc_date_type: "signed",
      };

      const formatted = formatAllergyItem(nkdaItem);
      expect(formatted).toContain("No known drug allergies, per Discharge Summary, signed");
      expect(formatted).toContain("Jan 2026");
      expect(formatted).toContain("ago");
    });

    it("formats NKDA gracefully when document date is not found", () => {
      const nkdaNoDate = {
        value: "No known drug allergies",
        doc_type: "Discharge Summary",
        doc_date: null,
      };

      const formatted = formatAllergyItem(nkdaNoDate);
      expect(formatted).toBe("No known drug allergies, per Discharge Summary, date not found");
    });

    it("preserves positive allergy descriptions verbatim", () => {
      const allergen = {
        value: "Penicillin - Causes acute anaphylaxis and facial swelling",
        doc_type: "Inpatient Note",
        doc_date: "2026-03-01",
      };

      const formatted = formatAllergyItem(allergen);
      expect(formatted).toBe("Penicillin - Causes acute anaphylaxis and facial swelling");
    });
  });

  // ── 5. Printable Wallet Card Safety Rules ───────────────────────────────────
  describe("Printable Wallet Card Clinical Safety", () => {
    it("generates wallet card with only Name, Blood Group, ICE Contact, and QR code", () => {
      const payload = buildWalletCardPayload({
        fullName: "Aarav Patel",
        bloodGroup: "B-",
        emergencyContactName: "Meera Patel",
        emergencyContactPhone: "+91 91234 56789",
        qrUrl: "https://medrecord.in/e/k9X7w2M...test",
      });

      expect(payload.name).toBe("Aarav Patel");
      expect(payload.bloodGroup).toBe("B-");
      expect(payload.iceName).toBe("Meera Patel");
      expect(payload.icePhone).toBe("+91 91234 56789");
      expect(payload.qrUrl).toBe("https://medrecord.in/e/k9X7w2M...test");
      expect(payload.instruction).toContain("Scan QR code for real-time confirmed medications");

      // Invariant: Card payload must NEVER carry medications, allergies, or conditions
      expect((payload as any).medications).toBeUndefined();
      expect((payload as any).allergies).toBeUndefined();
      expect((payload as any).conditions).toBeUndefined();
    });
  });
});
