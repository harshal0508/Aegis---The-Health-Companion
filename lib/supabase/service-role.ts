import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service Role Supabase Client.
 *
 * STRICT SECURITY BOUNDARIES:
 * 1. Marked with `server-only`: Next.js build immediately fails if imported in any client component.
 * 2. ZERO COOKIES: Does NOT read or set cookies. Completely decoupled from Next.js cookie store.
 * 3. EXCLUSIVE USE: Only called for unauthenticated public emergency lookups (/e/[token])
 *    where the first responder has no auth session.
 * 4. NEVER use in routes serving logged-in users (those must use `createClient()` to enforce RLS).
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for service role client"
    );
  }

  // Defensive check: Verify that SUPABASE_SERVICE_ROLE_KEY is actually a service_role key, not the anon key
  try {
    const parts = serviceKey.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
      if (payload.role === "anon") {
        console.error(
          "\n⚠️ [CONFIGURATION WARNING] SUPABASE_SERVICE_ROLE_KEY is currently set to your 'anon' key!\n" +
            "Because emergency cards are protected by Row Level Security (RLS), the 'anon' key cannot read them without a logged-in session.\n" +
            "To fix this, copy the 'service_role' key from Supabase Dashboard -> Project Settings -> API and set it in .env.local.\n"
        );
      }
    }
  } catch {
    // Ignore JWT parsing errors
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
