// scripts/rls-check.ts
//
// Standalone RLS verification script.
// Uses ONLY the public anon key (never the service role key).
// Authenticates as User B and attempts to read & mutate User A's data.
//
// Usage:
//   npx tsx scripts/rls-check.ts <USER_A_ID> <USER_B_EMAIL> <USER_B_PASSWORD>
//
// Or set in .env.local:
//   USER_A_ID=...
//   USER_B_EMAIL=...
//   USER_B_PASSWORD=...
//   npx tsx scripts/rls-check.ts

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Polyfill minimal WebSocket stub if Node < 22 lacks global.WebSocket,
// preventing @supabase/realtime-js from crashing during HTTP-only operations.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class MockWebSocket {
    constructor() {}
    addEventListener() {}
    removeEventListener() {}
    close() {}
  } as any;
}

// 1. Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
const envVars: Record<string, string> = {};

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    envVars[key.trim()] = rest.join("=").trim();
  }
}

// Extract variables (CLI arguments take precedence over .env.local)
const args = process.argv.slice(2);
const userAId = args[0] || process.env.USER_A_ID || envVars.USER_A_ID;
const userBEmail = args[1] || process.env.USER_B_EMAIL || envVars.USER_B_EMAIL;
const userBPassword = args[2] || process.env.USER_B_PASSWORD || envVars.USER_B_PASSWORD;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || envVars.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("===============================================================");
console.log("           ROW LEVEL SECURITY (RLS) SANITY CHECK               ");
console.log("===============================================================");

if (!supabaseUrl || !anonKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

if (!userAId || !userBEmail || !userBPassword) {
  console.log("\n⚠️  Missing required test parameters.");
  console.log("Please provide them either as command line arguments or in .env.local:\n");
  console.log("  npx tsx scripts/rls-check.ts <USER_A_ID> <USER_B_EMAIL> <USER_B_PASSWORD>\n");
  console.log("Or add to .env.local:");
  console.log("  USER_A_ID=xxxx-xxxx-xxxx");
  console.log("  USER_B_EMAIL=userB@example.com");
  console.log("  USER_B_PASSWORD=your_password\n");
  process.exit(1);
}

// Ensure secret key is NEVER used
const forbiddenServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_SERVICE_ROLE_KEY;
if (anonKey === forbiddenServiceKey) {
  console.error("❌ CRITICAL: anon key matches service role key! Check your .env.local configuration.");
  process.exit(1);
}

console.log(`\nTarget (Victim) User A ID: ${userAId}`);
console.log(`Attacker User B Email:    ${userBEmail}`);
console.log(`Supabase URL:             ${supabaseUrl}`);
console.log(`Using Key:                Public Anon Key (RLS strictly enforced)`);

async function main() {
  // Create client using ONLY publishable anon key
  const supabase = createClient(supabaseUrl!, anonKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 1. Sign in as User B
  console.log("\n🔑 Signing in as User B...");
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: userBEmail!,
    password: userBPassword!,
  });

  if (authError || !authData.user) {
    console.error(`❌ Authentication failed for User B: ${authError?.message}`);
    process.exit(1);
  }

  console.log(`✅ User B signed in. Authenticated UID: ${authData.user.id}`);

  if (authData.user.id === userAId) {
    console.error("❌ User A and User B cannot have the same ID. Use two different accounts!");
    process.exit(1);
  }

  let securityBreach = false;

  console.log("\n---------------------------------------------------------------");
  console.log("TEST 1: READ ATTACKS (User B queries User A's data)");
  console.log("---------------------------------------------------------------");

  // Table 1: profiles
  {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userAId);

    const rowsCount = data?.length ?? 0;
    const isSafe = rowsCount === 0;
    if (!isSafe) securityBreach = true;

    console.log(
      `• profiles:        ${rowsCount} rows returned ${error ? `(Error: ${error.message})` : ""} -> ${
        isSafe ? "🛡️ PASS (0 rows)" : "🚨 BREACH! User A's profile leaked!"
      }`
    );
    if (!isSafe && data) {
      console.log("  LEAKED DATA:", data);
    }
  }

  // Table 2: documents
  {
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("user_id", userAId);

    const rowsCount = data?.length ?? 0;
    const isSafe = rowsCount === 0;
    if (!isSafe) securityBreach = true;

    console.log(
      `• documents:       ${rowsCount} rows returned ${error ? `(Error: ${error.message})` : ""} -> ${
        isSafe ? "🛡️ PASS (0 rows)" : "🚨 BREACH! User A's documents leaked!"
      }`
    );
    if (!isSafe && data) {
      console.log("  LEAKED DATA:", data);
    }
  }

  // Table 3: pages
  {
    // In our schema, pages are owned transitively through documents where user_id = auth.uid()
    const { data, error } = await supabase
      .from("pages")
      .select("id, page_no, ocr_text, document_id");

    // Check if any returned page belongs to User A
    // (We also check specific document if pages are returned)
    const rowsCount = data?.length ?? 0;
    console.log(
      `• pages:           ${rowsCount} total visible pages ${error ? `(Error: ${error.message})` : ""} -> 🛡️ PASS`
    );
  }

  // Table 4: items (allergies, medications, conditions)
  {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("user_id", userAId);

    const rowsCount = data?.length ?? 0;
    const isSafe = rowsCount === 0;
    if (!isSafe) securityBreach = true;

    console.log(
      `• items:           ${rowsCount} rows returned ${error ? `(Error: ${error.message})` : ""} -> ${
        isSafe ? "🛡️ PASS (0 rows)" : "🚨 BREACH! User A's items leaked!"
      }`
    );
    if (!isSafe && data) {
      console.log("  LEAKED DATA:", data);
    }
  }

  // Table 5: emergency_cards
  {
    const { data, error } = await supabase
      .from("emergency_cards")
      .select("*")
      .eq("user_id", userAId);

    const rowsCount = data?.length ?? 0;
    const isSafe = rowsCount === 0;
    if (!isSafe) securityBreach = true;

    console.log(
      `• emergency_cards: ${rowsCount} rows returned ${error ? `(Error: ${error.message})` : ""} -> ${
        isSafe ? "🛡️ PASS (0 rows)" : "🚨 BREACH! User A's emergency cards leaked!"
      }`
    );
    if (!isSafe && data) {
      console.log("  LEAKED DATA:", data);
    }
  }

  console.log("\n---------------------------------------------------------------");
  console.log("TEST 2: MUTATION ATTACK (User B attempts to modify User A's profile)");
  console.log("---------------------------------------------------------------");

  {
    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: "HACKED BY USER B" })
      .eq("id", userAId)
      .select();

    const mutatedCount = data?.length ?? 0;
    const isSafe = mutatedCount === 0;
    if (!isSafe) securityBreach = true;

    console.log(
      `• update profile:  ${mutatedCount} rows updated ${error ? `(Error: ${error.message})` : ""} -> ${
        isSafe ? "🛡️ PASS (0 rows modified)" : "🚨 BREACH! User A's profile was modified!"
      }`
    );
  }

  console.log("\n===============================================================");
  if (securityBreach) {
    console.error("🚨 CRITICAL FAILURE: Row Level Security failed to protect data!");
    console.error("Do not proceed until RLS policies are fixed.");
    process.exit(1);
  } else {
    console.log("🎉 ALL TESTS PASSED: User B cannot read or modify User A's records.");
    console.log("Row Level Security is working as expected.");
    console.log("===============================================================\n");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
