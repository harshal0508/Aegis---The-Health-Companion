import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client for use in Server Components and Route Handlers.
// Uses the anon key by default so RLS is still enforced.
// Pass serviceRole=true ONLY for admin operations that must bypass RLS.
export async function createClient(serviceRole = false) {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = serviceRole
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-key")
    : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key");

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
          // Safe to ignore — the middleware handles session refresh instead.
        }
      },
    },
  });
}
