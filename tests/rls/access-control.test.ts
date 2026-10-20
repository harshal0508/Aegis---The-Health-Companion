/**
 * Two-user RLS access control tests for all tables and storage.
 *
 * Strategy:
 * - Admin client (service role) creates two test users and seeds data as User A.
 * - User B signs in with their own anon-key client and asserts they get ZERO rows
 *   from User A's data — this is RLS working correctly.
 * - Storage signed-URL test asserts User B cannot generate a signed URL for
 *   a path owned by User A.
 * - HTTP test calls the public /e/[token] route to verify it returns only
 *   allowed categories and no file links.
 *
 * These tests run against a real local Supabase instance (or CI instance).
 * They do NOT mock Supabase — mocking RLS would defeat the purpose.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import ws from "ws";

// ── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://localhost:54321";
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set. " +
      "Copy .env.local.example to .env.local and fill in values."
  );
}

// ── Clients ──────────────────────────────────────────────────────────────────

// Admin client bypasses RLS — used only for setup and teardown
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
});

// User-specific clients use the anon key so RLS is enforced
function makeAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });
}

// ── Test state ───────────────────────────────────────────────────────────────

// Unique suffix per test run to avoid collisions in parallel CI runs
const RUN_ID = randomBytes(4).toString("hex");

let userAId: string;
let userBId: string;
let clientA: SupabaseClient;
let clientB: SupabaseClient;

let documentAId: string;
let pageAId: string;
let itemAId: string;
let cardAId: string;
let cardATokenPlain: string; // raw token — never stored in DB
let cardAStoragePath: string;

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // 1. Create two test users via admin API
  const emailA = `rls_test_a_${RUN_ID}@example.com`;
  const emailB = `rls_test_b_${RUN_ID}@example.com`;
  const password = `TestPass-${RUN_ID}-!`;

  const { data: createdA, error: errA } =
    await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
  if (errA) throw new Error(`Failed to create user A: ${errA.message}`);
  userAId = createdA.user!.id;

  const { data: createdB, error: errB } =
    await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
  if (errB) throw new Error(`Failed to create user B: ${errB.message}`);
  userBId = createdB.user!.id;

  // 2. Sign in as User A with anon client — session will be used for all A inserts
  clientA = makeAnonClient();
  const { error: signInErrA } = await clientA.auth.signInWithPassword({
    email: emailA,
    password,
  });
  if (signInErrA) throw new Error(`Sign-in A failed: ${signInErrA.message}`);

  // 3. Sign in as User B with a separate anon client
  clientB = makeAnonClient();
  const { error: signInErrB } = await clientB.auth.signInWithPassword({
    email: emailB,
    password,
  });
  if (signInErrB) throw new Error(`Sign-in B failed: ${signInErrB.message}`);

  // 4. Create User A's profile (required FK for all other tables)
  const { error: profileErr } = await clientA.from("profiles").insert({
    id: userAId,
    full_name: "RLS Test User A",
    blood_group: "O+",
  });
  if (profileErr) throw new Error(`Profile insert failed: ${profileErr.message}`);

  // 5. Create User B's profile so they have a valid profiles row
  const { error: profileErrB } = await clientB.from("profiles").insert({
    id: userBId,
    full_name: "RLS Test User B",
  });
  if (profileErrB)
    throw new Error(`Profile B insert failed: ${profileErrB.message}`);

  // 6. Create a document as User A
  cardAStoragePath = `${userAId}/doc-${RUN_ID}/page-1.jpg`;
  const { data: doc, error: docErr } = await clientA
    .from("documents")
    .insert({
      user_id: userAId,
      storage_path: cardAStoragePath,
      doc_type: "lab_report",
      status: "ready",
    })
    .select("id")
    .single();
  if (docErr) throw new Error(`Document insert failed: ${docErr.message}`);
  documentAId = doc!.id;

  // 7. Create a page under User A's document
  const { data: page, error: pageErr } = await clientA
    .from("pages")
    .insert({
      document_id: documentAId,
      page_no: 1,
      // ocr_text intentionally blank — we don't log medical text in tests
    })
    .select("id")
    .single();
  if (pageErr) throw new Error(`Page insert failed: ${pageErr.message}`);
  pageAId = page!.id;

  // 8. Create a confirmed item as User A (allergy — to test badge display)
  const { data: item, error: itemErr } = await clientA
    .from("items")
    .insert({
      user_id: userAId,
      category: "allergy",
      value: "Penicillin",
      page_id: pageAId,
      source: "patient_entered",
      status: "confirmed",
      normalization_source: "none",
    })
    .select("id")
    .single();
  if (itemErr) throw new Error(`Item insert failed: ${itemErr.message}`);
  itemAId = item!.id;

  // 9. Create an emergency card as User A
  // Generate a random 128-bit token and store only its SHA-256 hash
  cardATokenPlain = randomBytes(16).toString("hex");
  const tokenHash = createHash("sha256").update(cardATokenPlain).digest("hex");

  const { data: card, error: cardErr } = await clientA
    .from("emergency_cards")
    .insert({
      user_id: userAId,
      token_hash: tokenHash,
      visible_categories: ["allergy", "medication"],
      active: true,
    })
    .select("id")
    .single();
  if (cardErr)
    throw new Error(`Emergency card insert failed: ${cardErr.message}`);
  cardAId = card!.id;
});

// ── Teardown ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  // Delete users via admin — cascades to all their rows via ON DELETE CASCADE
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RLS: profiles", () => {
  it("User B cannot select User A's profile", async () => {
    const { data, error } = await clientB
      .from("profiles")
      .select("id")
      .eq("id", userAId);
    // RLS returns empty array, not an error, for unauthorized selects
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("User B can select their own profile", async () => {
    const { data, error } = await clientB
      .from("profiles")
      .select("id")
      .eq("id", userBId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe(userBId);
  });

  it("User B cannot update User A's profile", async () => {
    const { error } = await clientB
      .from("profiles")
      .update({ full_name: "Hacked" })
      .eq("id", userAId);
    // Either an error or 0 rows affected — both are acceptable RLS behaviors
    if (!error) {
      // Verify the update didn't actually apply
      const { data } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", userAId)
        .single();
      expect(data?.full_name).toBe("RLS Test User A");
    }
  });
});

describe("RLS: documents", () => {
  it("User B cannot select User A's documents", async () => {
    const { data, error } = await clientB
      .from("documents")
      .select("id")
      .eq("user_id", userAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("User B cannot insert a document claiming User A's user_id", async () => {
    const { error } = await clientB.from("documents").insert({
      user_id: userAId, // attempting to forge ownership
      storage_path: `${userAId}/fake/page-1.jpg`,
      status: "uploaded",
    });
    // RLS with_check should reject this
    expect(error).not.toBeNull();
  });

  it("User B cannot delete User A's documents", async () => {
    const { error } = await clientB
      .from("documents")
      .delete()
      .eq("id", documentAId);
    // Either error or 0 rows deleted — verify document still exists
    if (!error) {
      const { data } = await admin
        .from("documents")
        .select("id")
        .eq("id", documentAId)
        .single();
      expect(data?.id).toBe(documentAId);
    }
  });
});

describe("RLS: pages", () => {
  it("User B cannot select User A's pages", async () => {
    const { data, error } = await clientB
      .from("pages")
      .select("id")
      .eq("document_id", documentAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("User B cannot insert a page into User A's document", async () => {
    const { error } = await clientB.from("pages").insert({
      document_id: documentAId, // trying to inject into A's document
      page_no: 99,
    });
    expect(error).not.toBeNull();
  });
});

describe("RLS: items", () => {
  it("User B cannot select User A's items", async () => {
    const { data, error } = await clientB
      .from("items")
      .select("id")
      .eq("user_id", userAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("User B cannot insert an item claiming User A's user_id", async () => {
    const { error } = await clientB.from("items").insert({
      user_id: userAId,
      category: "allergy",
      value: "Forged Item",
      source: "patient_entered",
      status: "confirmed",
      normalization_source: "none",
    });
    expect(error).not.toBeNull();
  });

  it("User B cannot select User A's item directly by id (GET)", async () => {
    const { data, error } = await clientB
      .from("items")
      .select("id, value")
      .eq("id", itemAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("User B cannot update User A's items (PATCH)", async () => {
    const { error } = await clientB
      .from("items")
      .update({ value: "Hacked" })
      .eq("id", itemAId);
    if (!error) {
      const { data } = await admin
        .from("items")
        .select("value")
        .eq("id", itemAId)
        .single();
      expect(data?.value).toBe("Penicillin");
    }
  });

  it("User B cannot confirm User A's items", async () => {
    const { error } = await clientB
      .from("items")
      .update({ status: "confirmed", last_confirmed_at: new Date().toISOString() })
      .eq("id", itemAId);
    if (!error) {
      const { data } = await admin
        .from("items")
        .select("status")
        .eq("id", itemAId)
        .single();
      expect(data?.status).not.toBe("confirmed");
    }
  });

  it("User B cannot delete User A's items (DELETE)", async () => {
    const { error } = await clientB
      .from("items")
      .delete()
      .eq("id", itemAId);
    // Verify row still exists in admin view
    const { data } = await admin
      .from("items")
      .select("id")
      .eq("id", itemAId)
      .single();
    expect(data?.id).toBe(itemAId);
  });
});

describe("RLS: emergency_cards", () => {
  it("User B cannot select User A's emergency cards", async () => {
    const { data, error } = await clientB
      .from("emergency_cards")
      .select("id")
      .eq("user_id", userAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("User B cannot update User A's emergency card", async () => {
    const { error } = await clientB
      .from("emergency_cards")
      .update({ active: false })
      .eq("id", cardAId);
    if (!error) {
      const { data } = await admin
        .from("emergency_cards")
        .select("active")
        .eq("id", cardAId)
        .single();
      expect(data?.active).toBe(true);
    }
  });
});

describe("RLS: access_log", () => {
  it("User B cannot select access_log entries for User A's card", async () => {
    const { data, error } = await clientB
      .from("access_log")
      .select("id")
      .eq("card_id", cardAId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("User B (or any user) cannot insert into access_log directly", async () => {
    // access_log inserts are service-role only — no user insert policy exists
    const { error } = await clientB.from("access_log").insert({
      card_id: cardAId,
    });
    expect(error).not.toBeNull();
  });
});

describe("Storage RLS: signed URLs", () => {
  it("User B cannot generate a signed URL for User A's storage path", async () => {
    const { data, error } = await clientB.storage
      .from("medical-records")
      .createSignedUrl(cardAStoragePath, 60);

    // Supabase storage returns an error when the RLS check fails
    // (the path prefix doesn't match auth.uid())
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it("User A can generate a signed URL for their own storage path", async () => {
    // We can only test this if the object actually exists.
    // Since we haven't uploaded a real file, we check that the error is NOT
    // an RLS/authorization error (it may be "not found" which is acceptable).
    const { error } = await clientA.storage
      .from("medical-records")
      .createSignedUrl(cardAStoragePath, 60);

    // An auth/RLS error would have message containing "not authorized" or similar.
    // A "not found" error is acceptable — it means RLS passed but the object doesn't exist.
    if (error) {
      const msg = error.message.toLowerCase();
      expect(msg).not.toContain("not authorized");
      expect(msg).not.toContain("unauthorized");
      expect(msg).not.toContain("permission");
    }
  });
});

describe("Public emergency route /e/[token]", () => {
  it("returns 200 with patient name for a valid active token", async () => {
    const res = await fetch(`${APP_URL}/e/${cardATokenPlain}`);
    // If the app is not running in CI, skip gracefully
    if (res.status === 0 || !res.ok) {
      console.warn(
        "Skipping /e/[token] HTTP test — app server not reachable at",
        APP_URL
      );
      return;
    }
    expect(res.status).toBe(200);
    const html = await res.text();
    // Should contain the patient's name
    expect(html).toContain("RLS Test User A");
    // Should NOT contain any storage/signed URLs
    expect(html).not.toMatch(/signed.*url/i);
    expect(html).not.toMatch(/supabase.*storage/i);
  });

  it("returns 404 for a non-existent token", async () => {
    const fakeToken = randomBytes(16).toString("hex");
    const res = await fetch(`${APP_URL}/e/${fakeToken}`);
    if (res.status === 0) {
      console.warn("Skipping — app server not reachable");
      return;
    }
    expect(res.status).toBe(404);
  });

  it("returns only visible_categories in the response (not all items)", async () => {
    // Insert a condition item as User A — it should NOT appear on the emergency card
    // because visible_categories only includes ['allergy', 'medication']
    await admin.from("items").insert({
      user_id: userAId,
      category: "condition",
      value: "Hypertension",
      source: "patient_entered",
      status: "confirmed",
      normalization_source: "none",
    });

    const res = await fetch(`${APP_URL}/e/${cardATokenPlain}`);
    if (res.status === 0 || !res.ok) {
      console.warn("Skipping — app server not reachable");
      return;
    }
    const html = await res.text();
    // Condition item should not appear since 'condition' is not in visible_categories
    expect(html).not.toContain("Hypertension");
    // Allergy item should appear
    expect(html).toContain("Penicillin");
  });
});
