import { NextResponse } from "next/server";

// Simple liveness probe used by CI and load balancers.
// Returns 200 with a timestamp — no auth, no DB queries.
export function GET() {
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
}
