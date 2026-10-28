import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchLiveDistrictHealthNews } from "@/lib/advisories/news-scanner";
import { resolveIndianLocality } from "@/lib/advisories/pincode-resolver";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawDistrict = searchParams.get("district") || "Indore";
    const resolved = resolveIndianLocality(rawDistrict);

    const articles = await fetchLiveDistrictHealthNews(resolved.district || rawDistrict);

    return NextResponse.json({
      district: resolved.district,
      city: resolved.city,
      state: resolved.state,
      pincode: resolved.pincode,
      displayName: resolved.displayName,
      count: articles.length,
      articles,
      source: "Google News RSS / Regional Media Digest",
      disclaimer:
        "Media reports are unverified by clinical authorities. For official notifications, consult district health bulletins.",
    });
  } catch (err: any) {
    console.error("[AdvisoriesNewsRoute] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch district news feed" },
      { status: 500 }
    );
  }
}
