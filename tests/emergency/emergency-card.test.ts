import { describe, it, expect, vi, beforeEach } from "vitest";
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

// Mock next/navigation for route handler tests
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    const error = new Error("NEXT_NOT_FOUND");
    (error as any).digest = "NEXT_NOT_FOUND";
    throw error;
  }),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "x-forwarded-for") return "192.168.1.50";
      if (name === "user-agent") return "Vitest Test Runner";
      return null;
    },
  })),
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => {},
  })),
}));

let mockSupabaseInstance: any = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => mockSupabaseInstance),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => mockSupabaseInstance),
}));

import { getEmergencyResponderData } from "@/lib/emergency/responder";
import EmergencyCardPage from "@/app/e/[token]/page";
import { notFound } from "next/navigation";

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

    it("provides explicit unshared category notices when allergies or medications are toggled off", () => {
      const result = sanitizeResponderData({
        rawItems: [],
        visibleCategories: ["blood_group"], // allergies & medications off
        profile: { full_name: "Test Patient" },
      });

      expect(result.category_unshared_notices.allergy).toBe(
        "Allergies: not shared on this card. Ask the patient or family."
      );
      expect(result.category_unshared_notices.medication).toBe(
        "Medications: not shared on this card. Ask the patient or family."
      );
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

  // ── 6. Route Handler & Service-Role Query Tests (/e/[token]) ────────────────
  describe("Route Handler /e/[token] End-to-End Execution", () => {
    const validToken = generateEmergencyToken();
    const tokenHash = hashEmergencyToken(validToken);

    // Mock DB fixtures
    const mockCardActive = {
      id: "card-uuid-1",
      user_id: "user-uuid-999",
      visible_categories: ["condition", "blood_group"], // Note: allergy and medication are OFF
      active: true,
      token_hash: tokenHash,
      created_at: "2026-10-20T10:00:00Z",
    };

    const mockCardDisabled = {
      ...mockCardActive,
      active: false,
    };

    const mockProfile = {
      full_name: "Vikram Malhotra",
      blood_group: "AB+",
      emergency_contact_name: "Ananya Malhotra",
      emergency_contact_phone: "+91 98765 00000",
    };

    const mockDbItems = [
      {
        id: "item-conf-cond",
        user_id: "user-uuid-999",
        category: "condition",
        value: "Hypertension",
        status: "confirmed",
        page_id: "page-1",
      },
      {
        id: "item-unconf-cond",
        user_id: "user-uuid-999",
        category: "condition",
        value: "Unconfirmed Condition",
        status: "needs_review", // UNCONFIRMED
        page_id: "page-1",
      },
      {
        id: "item-conf-med",
        user_id: "user-uuid-999",
        category: "medication",
        value: "Amlodipine 5mg",
        status: "confirmed", // BUT category is not in visible_categories
        page_id: "page-1",
      },
    ];

    function createMockSupabase(cardRecord: any, profileRecord: any, itemRows: any[]) {
      return {
        from: (table: string) => {
          if (table === "emergency_cards") {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  maybeSingle: async () => ({
                    data: val === tokenHash ? cardRecord : null,
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "access_log") {
            return {
              insert: async () => ({ error: null }),
            };
          }
          if (table === "profiles") {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: profileRecord,
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === "items") {
            return {
              select: () => ({
                eq: (col1: string, val1: string) => ({
                  eq: (col2: string, val2: string) => ({
                    in: (col3: string, allowedCats: string[]) => ({
                      data: itemRows.filter(
                        (i) => i.status === "confirmed" && allowedCats.includes(i.category)
                      ),
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "pages") {
            return {
              select: () => ({
                in: async () => ({
                  data: [{ id: "page-1", document_id: "doc-1" }],
                  error: null,
                }),
              }),
            };
          }
          if (table === "documents") {
            return {
              select: () => ({
                in: async () => ({
                  data: [
                    {
                      id: "doc-1",
                      doc_type: "Discharge Summary",
                      doc_date: "2026-06-01",
                      doc_date_type: "signed",
                    },
                  ],
                  error: null,
                }),
              }),
            };
          }
          return { select: () => ({ eq: () => ({}) }) };
        },
      };
    }

    it("triggers notFound() when token format is invalid (<20 chars)", async () => {
      await expect(getEmergencyResponderData("invalid_short")).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("triggers notFound() when token does not exist in database", async () => {
      const mockSb = createMockSupabase(null, mockProfile, mockDbItems);
      const randomValidToken = generateEmergencyToken();
      await expect(
        getEmergencyResponderData(randomValidToken, "127.0.0.1", "test", mockSb)
      ).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("triggers notFound() when emergency card is disabled (active: false)", async () => {
      const mockSb = createMockSupabase(mockCardDisabled, mockProfile, mockDbItems);
      await expect(
        getEmergencyResponderData(validToken, "127.0.0.1", "test", mockSb)
      ).rejects.toThrow("NEXT_NOT_FOUND");
    });

    it("reads active card via service role, applies sanitizer, and drops unconfirmed/unselected items", async () => {
      const mockSb = createMockSupabase(mockCardActive, mockProfile, mockDbItems);
      const result = await getEmergencyResponderData(validToken, "10.10.10.10", "test", mockSb);

      expect(result.rateLimited).toBeUndefined();
      expect(result.data).toBeDefined();

      const payload = result.data!;
      expect(payload.full_name).toBe("Vikram Malhotra");
      expect(payload.blood_group).toBe("AB+"); // enabled in visible_categories

      // Condition was enabled -> Confirmed condition is present, unconfirmed is excluded
      expect(payload.grouped.condition).toHaveLength(1);
      expect(payload.grouped.condition[0].value).toBe("Hypertension");

      // Medication was confirmed in DB, BUT medication category was toggled OFF -> excluded
      expect(payload.grouped.medication).toHaveLength(0);

      // Allergies and Medications were toggled OFF -> explicit clinical notices present
      expect(payload.category_unshared_notices.allergy).toBe(
        "Allergies: not shared on this card. Ask the patient or family."
      );
      expect(payload.category_unshared_notices.medication).toBe(
        "Medications: not shared on this card. Ask the patient or family."
      );

      // Privacy: Zero internal ID leakage in payload
      const serialized = JSON.stringify(payload);
      expect(serialized).not.toContain("user-uuid-999");
      expect(serialized).not.toContain("card-uuid-1");
      expect(serialized).not.toContain("doc-1");
      expect(serialized).not.toContain("page-1");
    });

    it("renders EmergencyCardPage component cleanly with explicit unshared category banners", async () => {
      mockSupabaseInstance = createMockSupabase(mockCardActive, mockProfile, mockDbItems);

      const pageResult = await EmergencyCardPage({
        params: Promise.resolve({ token: validToken }),
      });

      // The returned JSX tree is a React component element
      expect(pageResult).toBeDefined();
      expect(pageResult.type).toBe("main");

      const seen = new WeakSet();
      const stringifiedTree = JSON.stringify(pageResult, (_key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return undefined;
          seen.add(value);
        }
        return value;
      });
      // Confirmed patient name rendered
      expect(stringifiedTree).toContain("Vikram Malhotra");
      // Explicit unshared category banner rendered because allergy was toggled off
      expect(stringifiedTree).toContain("Allergies: not shared on this card. Ask the patient or family.");
      // Explicit unshared category banner rendered because medication was toggled off
      expect(stringifiedTree).toContain("Medications: not shared on this card. Ask the patient or family.");
      // Confirms zero internal IDs leaked anywhere in React tree props
      expect(stringifiedTree).not.toContain("user-uuid-999");
      expect(stringifiedTree).not.toContain("card-uuid-1");
    });
  });

  // ── 7. Client Boundaries & Zero-Cookie Isolation Guards ─────────────────────
  describe("Security Boundaries & Cookie Isolation", () => {
    it("guarantees createServiceRoleClient does not import or use visitor cookies", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const serviceRoleSrc = fs.readFileSync(
        path.resolve(process.cwd(), "lib/supabase/service-role.ts"),
        "utf8"
      );
      const responderSrc = fs.readFileSync(
        path.resolve(process.cwd(), "lib/emergency/responder.ts"),
        "utf8"
      );

      // Must import 'server-only'
      expect(serviceRoleSrc).toContain('import "server-only"');

      // Neither file may import next/headers or invoke cookies()
      expect(serviceRoleSrc).not.toMatch(/from\s+["']next\/headers["']/);
      expect(responderSrc).not.toMatch(/from\s+["']next\/headers["']/);
      expect(serviceRoleSrc).not.toMatch(/\bcookies\s*\(/);
      expect(responderSrc).not.toMatch(/\bcookies\s*\(/);
    });

    it("verifies user-scoped createClient takes no arguments (cannot pass serviceRole=true)", async () => {
      const fs = await import("fs");
      const path = await import("path");

      const serverClientSrc = fs.readFileSync(
        path.resolve(process.cwd(), "lib/supabase/server.ts"),
        "utf8"
      );

      // Must strictly be parameter-less
      expect(serverClientSrc).toContain("export async function createClient()");
      expect(serverClientSrc).not.toContain("serviceRole = false");
    });

    it("ensures no logged-in routes or client components import createServiceRoleClient", async () => {
      const fs = await import("fs");
      const path = await import("path");

      function getFiles(dir: string, fileList: string[] = []): string[] {
        if (!fs.existsSync(dir)) return fileList;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith(".")) getFiles(fullPath, fileList);
          } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
            fileList.push(fullPath);
          }
        }
        return fileList;
      }

      const clientDirs = [
        path.resolve(process.cwd(), "app/(app)"),
        path.resolve(process.cwd(), "app/(auth)"),
        path.resolve(process.cwd(), "components"),
      ];

      for (const dir of clientDirs) {
        const files = getFiles(dir);
        for (const file of files) {
          const content = fs.readFileSync(file, "utf8");
          expect(
            content,
            `File ${file} must NOT import createServiceRoleClient or reference SUPABASE_SERVICE_ROLE_KEY`
          ).not.toContain("createServiceRoleClient");
          expect(
            content,
            `File ${file} must NOT reference SUPABASE_SERVICE_ROLE_KEY`
          ).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        }
      }
    });
  });
});
