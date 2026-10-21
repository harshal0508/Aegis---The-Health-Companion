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

  return createSupabaseClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
