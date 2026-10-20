import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client — uses the anon key only.
// The anon key is public; RLS enforces data isolation.
// Fallback values prevent build-time crashes during Next.js static analysis.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

  return createBrowserClient(url, anonKey);
}
