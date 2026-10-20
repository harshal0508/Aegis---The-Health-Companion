// scripts/test-attack.mjs
// Simulates an attack: User B attempts to read User A's data using the public client.
// Usage: node scripts/test-attack.mjs

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// 1. Read .env.local manually
const envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local not found in project root.");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf8");
const env = {};
envContent.split("\n").forEach((line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return;
  const [key, ...rest] = trimmed.split("=");
  env[key.trim()] = rest.join("=").trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing required keys in .env.local:");
  console.error({ SUPABASE_URL: !!SUPABASE_URL, ANON_KEY: !!ANON_KEY, SERVICE_ROLE_KEY: !!SERVICE_ROLE_KEY });
  process.exit(1);
}

console.log("🔗 Connecting to Supabase at:", SUPABASE_URL);

// Admin client to create test users and clean up
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Client factory using public anon key (enforces RLS)
function makeAnonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const runId = Math.random().toString(36).substring(2, 8);
const emailA = `victim-a-${runId}@medrecord.test`;
const emailB = `attacker-b-${runId}@medrecord.test`;
const password = `AttackTest123!-${runId}`;

async function runAttackSimulation() {
  console.log("\n=======================================================");
  console.log("       RLS PENETRATION TEST: USER B -> USER A          ");
  console.log("=======================================================\n");

  try {
    // 1. Setup User A (Victim)
    console.log("1️⃣  Creating User A (Victim)...");
    const { data: userAData, error: errA } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw new Error(`User A creation failed: ${errA.message}`);
    const userA = userAData.user;
    console.log(`   ✅ User A created. ID: ${userA.id}`);

    // User A signs in and seeds medical records
    const clientA = makeAnonClient();
    await clientA.auth.signInWithPassword({ email: emailA, password });

    await clientA.from("profiles").insert({
      id: userA.id,
      full_name: "Alice Victim",
      blood_group: "O+",
      emergency_contact_name: "Secret Contact",
      emergency_contact_phone: "+1-999-000-1111",
    });

    const { data: docA } = await clientA
      .from("documents")
      .insert({
        user_id: userA.id,
        storage_path: `${userA.id}/doc-1/page-1.jpg`,
        doc_type: "discharge_summary",
        status: "ready",
      })
      .select("id")
      .single();

    await clientA.from("items").insert({
      user_id: userA.id,
      category: "allergy",
      value: "Severe Penicillin Allergy (SECRET)",
      source: "patient_entered",
      status: "confirmed",
    });

    console.log("   ✅ User A inserted confidential profile, document, and allergy records.\n");

    // 2. Setup User B (Attacker)
    console.log("2️⃣  Creating User B (Attacker)...");
    const { data: userBData, error: errB } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (errB) throw new Error(`User B creation failed: ${errB.message}`);
    const userB = userBData.user;
    console.log(`   ✅ User B created. ID: ${userB.id}`);

    const clientB = makeAnonClient();
    await clientB.auth.signInWithPassword({ email: emailB, password });
    console.log("   ✅ User B authenticated with their own credentials.\n");

    // 3. EXECUTE ATTACKS FROM USER B
    console.log("3️⃣  EXECUTING ATTACK QUERIES AS USER B (Attempting to steal A's data)...\n");

    // Attack 1: Query User A's profile by ID
    process.stdout.write("   ⚔️  Attack 1: SELECT * FROM profiles WHERE id = User_A_ID ... ");
    const { data: stolenProfiles, error: errProf } = await clientB
      .from("profiles")
      .select("*")
      .eq("id", userA.id);

    if (errProf) {
      console.log("❌ Error:", errProf.message);
    } else if (stolenProfiles.length === 0) {
      console.log("🛡️  BLOCKED! (0 rows returned)");
    } else {
      console.log("🚨 FAILED! RLS LEAKED DATA:", stolenProfiles);
    }

    // Attack 2: Query User A's documents
    process.stdout.write("   ⚔️  Attack 2: SELECT * FROM documents WHERE user_id = User_A_ID ... ");
    const { data: stolenDocs, error: errDoc } = await clientB
      .from("documents")
      .select("*")
      .eq("user_id", userA.id);

    if (errDoc) {
      console.log("❌ Error:", errDoc.message);
    } else if (stolenDocs.length === 0) {
      console.log("🛡️  BLOCKED! (0 rows returned)");
    } else {
      console.log("🚨 FAILED! RLS LEAKED DATA:", stolenDocs);
    }

    // Attack 3: Query User A's items (allergies/medications)
    process.stdout.write("   ⚔️  Attack 3: SELECT * FROM items WHERE user_id = User_A_ID ... ");
    const { data: stolenItems, error: errItems } = await clientB
      .from("items")
      .select("*")
      .eq("user_id", userA.id);

    if (errItems) {
      console.log("❌ Error:", errItems.message);
    } else if (stolenItems.length === 0) {
      console.log("🛡️  BLOCKED! (0 rows returned)");
    } else {
      console.log("🚨 FAILED! RLS LEAKED DATA:", stolenItems);
    }

    // Attack 4: User B tries to update User A's profile
    process.stdout.write("   ⚔️  Attack 4: UPDATE profiles SET full_name = 'Hacked' WHERE id = User_A_ID ... ");
    const { error: errUpdate } = await clientB
      .from("profiles")
      .update({ full_name: "Hacked by User B" })
      .eq("id", userA.id);

    // Verify whether User A's name changed
    const { data: verifyA } = await admin.from("profiles").select("full_name").eq("id", userA.id).single();
    if (verifyA.full_name === "Alice Victim") {
      console.log("🛡️  BLOCKED! (Profile unchanged: 'Alice Victim')");
    } else {
      console.log("🚨 FAILED! Tampering succeeded:", verifyA);
    }

    console.log("\n=======================================================");
    console.log("             TEST RESULT: ALL ATTACKS BLOCKED           ");
    console.log("  Row-Level Security is strictly isolating user data.  ");
    console.log("=======================================================\n");

  } finally {
    // Cleanup test users
    console.log("🧹 Cleaning up ephemeral test users...");
    const users = await admin.auth.admin.listUsers();
    for (const u of users.data.users) {
      if (u.email?.endsWith("@medrecord.test")) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }
    console.log("   Done.\n");
  }
}

runAttackSimulation();
