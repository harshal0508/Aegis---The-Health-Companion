import { NextResponse } from "next/server";

// News scanner is intentionally disabled per user instructions.
export async function GET() {
  return NextResponse.json({
    articles: [],
    count: 0,
    disabled: true,
    message: "Live news scanner is currently disabled.",
  });
}
