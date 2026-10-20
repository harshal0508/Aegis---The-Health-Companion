import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

// Root middleware — runs on every request matching the config below.
// Delegates session refresh to the Supabase helper so this file stays minimal.
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets.
    // The negative lookahead prevents infinite loops on _next requests.
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-.*\\.js).*)",
  ],
};
