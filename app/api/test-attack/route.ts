import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Test endpoint to verify RLS enforcement between users.
// Call as: /api/test-attack?targetId=<USER_A_UUID>
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("targetId");

  if (!targetId) {
    return NextResponse.json({
      error: "Missing ?targetId parameter. Provide the target user's UUID to test.",
      howToUse: "Visit /api/test-attack?targetId=<USER_A_UUID>",
    }, { status: 400 });
  }

  // Use the authenticated client of whoever is currently logged into the browser
  const supabase = await createClient();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (!currentUser) {
    return NextResponse.json({
      error: "You must be logged in to test. Please log in first.",
    }, { status: 401 });
  }

  // Attempt Attack 1: Fetch target user's profile
  const { data: stolenProfiles, error: profileErr } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetId);

  // Attempt Attack 2: Fetch target user's documents
  const { data: stolenDocuments, error: docErr } = await supabase
    .from("documents")
    .select("*")
    .eq("user_id", targetId);

  // Attempt Attack 3: Fetch target user's health items
  const { data: stolenItems, error: itemsErr } = await supabase
    .from("items")
    .select("*")
    .eq("user_id", targetId);

  const isBlocked =
    (stolenProfiles?.length ?? 0) === 0 &&
    (stolenDocuments?.length ?? 0) === 0 &&
    (stolenItems?.length ?? 0) === 0;

  return NextResponse.json({
    caller: {
      id: currentUser.id,
      email: currentUser.email,
    },
    targetId,
    results: {
      profiles: stolenProfiles ?? [],
      documents: stolenDocuments ?? [],
      items: stolenItems ?? [],
    },
    securityCheck: {
      isTargetSelf: currentUser.id === targetId,
      verdict: isBlocked
        ? "🛡️ RLS SECURE: Target data is completely invisible (0 rows returned)."
        : currentUser.id === targetId
        ? "ℹ️ You queried your own ID, so your own data is returned as expected."
        : "🚨 BREACH: Unauthorized rows returned!",
    },
  });
}
