import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * User-scoped Supabase client for Server Components, Server Actions, and Route Handlers.
 * Enforces RLS using the public anon key and the user's active session cookie.
 * Does NOT accept a serviceRole parameter — preventing accidental privilege escalation.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll is called from a Server Component where cookies are read-only.
          // Safe to ignore — middleware handles session refresh instead.
        }
      },
    },
  });
}
