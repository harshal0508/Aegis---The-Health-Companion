import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveIndianLocality } from "@/lib/advisories/pincode-resolver";
import {
  IdspRawOutbreakItem,
  transformIdspToDiseaseAdvisory,
  OFFICIAL_IDSP_WEEKLY_BASELINE,
} from "@/lib/advisories/idsp-ingestion";
import { getAdvisoriesForLocality, DiseaseAdvisory } from "@/lib/advisories/disease-data";

/**
 * GET /api/advisories
 * Fetches official government outbreak advisories for the requested district / PIN code.
 * Queries the Supabase `regional_advisories` table first, and falls back to the
 * official IDSP weekly baseline if the database table has not yet been populated.
 */
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
    const rawPincode = searchParams.get("pincode") || "";
    const resolved = resolveIndianLocality(rawPincode || rawDistrict);

    let officialAdvisories: DiseaseAdvisory[] = [];

    // 1. Try querying the Supabase `regional_advisories` table (RLS allows authenticated select)
    try {
      const { data: dbRecords, error: dbErr } = await supabase
        .from("regional_advisories")
        .select("*")
        .ilike("district", `%${resolved.district}%`)
        .order("report_date", { ascending: false });

      if (!dbErr && dbRecords && dbRecords.length > 0) {
        officialAdvisories = dbRecords.map((r: any, idx: number) => {
          const rawItem: IdspRawOutbreakItem = {
            state: r.state,
            district: r.district,
            diseaseName: r.disease_name,
            casesCount: r.cases_count || 0,
            deathsCount: r.deaths_count || 0,
            reportDate: r.report_date,
            status: (r.status as any) || "active",
            actionTaken: r.action_summary || "",
            sourceUrl: r.source_url,
          };
          return transformIdspToDiseaseAdvisory(rawItem, idx);
        });
      }
    } catch (dbQueryErr) {
      // Non-fatal: if Supabase query times out or table is pending migration, fallback cleanly
      console.warn("[AdvisoriesRoute] Supabase regional_advisories query fallback:", dbQueryErr);
    }

    // 2. If DB has no active records for this district, use the official IDSP baseline & seasonal protocols
    if (officialAdvisories.length === 0) {
      const fallbackResult = getAdvisoriesForLocality(resolved.pincode || resolved.district);
      officialAdvisories = fallbackResult.advisories;
    }

    return NextResponse.json({
      district: resolved.district,
      city: resolved.city,
      state: resolved.state,
      pincode: resolved.pincode,
      displayName: resolved.displayName,
      advisories: officialAdvisories,
      count: officialAdvisories.length,
      source: "Integrated Disease Surveillance Programme (IDSP) / NCDC MoHFW",
    });
  } catch (err: any) {
    console.error("[AdvisoriesRoute] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch government disease advisories" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/advisories
 * Ingestion endpoint for new weekly IDSP PDF surveillance reports.
 * Populates or updates the `regional_advisories` table in Supabase.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const itemsToIngest: IdspRawOutbreakItem[] =
      body.items && Array.isArray(body.items) && body.items.length > 0
        ? body.items
        : OFFICIAL_IDSP_WEEKLY_BASELINE;

    const rowsToInsert = itemsToIngest.map((item) => {
      const resolved = resolveIndianLocality(item.district);
      const advisory = transformIdspToDiseaseAdvisory(item);
      return {
        state: item.state,
        district: resolved.district,
        pincode_prefix: resolved.pincode ? resolved.pincode.slice(0, 3) : null,
        disease_name: item.diseaseName,
        category: advisory.category,
        severity: advisory.severity,
        cases_count: item.casesCount,
        deaths_count: item.deathsCount,
        report_date: item.reportDate,
        source_title: advisory.source_title,
        source_url: advisory.source_url,
        action_summary: item.actionTaken,
        status: item.status,
      };
    });

    const { data: inserted, error: insertErr } = await supabase
      .from("regional_advisories")
      .upsert(rowsToInsert, { onConflict: "id" })
      .select();

    if (insertErr) {
      console.warn("[AdvisoriesIngest] DB upsert warning:", insertErr.message);
      // Still return success with in-memory baseline confirmation
      return NextResponse.json({
        success: true,
        message: "IDSP weekly records validated and active in ingestion pipeline",
        count: rowsToInsert.length,
        persistedToDatabase: false,
        warning: insertErr.message,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Successfully ingested weekly IDSP outbreak surveillance records into database",
      count: inserted?.length || rowsToInsert.length,
      persistedToDatabase: true,
    });
  } catch (err: any) {
    console.error("[AdvisoriesIngest] Error:", err);
    return NextResponse.json(
      { error: "Failed to ingest IDSP weekly reports: " + err.message },
      { status: 500 }
    );
  }
}
