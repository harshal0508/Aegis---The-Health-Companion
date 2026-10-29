import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateEmergencyToken, hashEmergencyToken } from "@/lib/emergency/token";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch user's emergency card
    const { data: card } = await supabase
      .from("emergency_cards")
      .select("id, visible_categories, active, created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    // 2. Fetch user's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, blood_group, emergency_contact_name, emergency_contact_phone")
      .eq("id", user.id)
      .single();

    // 3. Fetch count of CONFIRMED items per category (Rule 4: items from documents with unresolved mismatch or no attestation never appear)
    const { data: rawConfirmedItems } = await supabase
      .from("items")
      .select("id, category, value, page_id")
      .eq("user_id", user.id)
      .eq("status", "confirmed");

    const pageIds = Array.from(
      new Set((rawConfirmedItems || []).map((i) => i.page_id).filter(Boolean))
    );
    const invalidPageIds = new Set<string>();

    if (pageIds.length > 0) {
      const { data: pageRows } = await supabase
        .from("pages")
        .select("id, document_id")
        .in("id", pageIds);

      const docIds = Array.from(new Set((pageRows || []).map((p) => p.document_id)));
      if (docIds.length > 0) {
        const { data: docRows } = await supabase
          .from("documents")
          .select("id, identity_status, attestation_timestamp, attestation_type")
          .in("id", docIds);

        const invalidDocIds = new Set(
          (docRows || [])
            .filter((d) => {
              if (
                d.identity_status === "mismatch" &&
                d.attestation_type !== "same_person_override"
              )
                return true;
              if (d.identity_status === "name_not_found" && !d.attestation_timestamp)
                return true;
              return false;
            })
            .map((d) => d.id)
        );

        (pageRows || []).forEach((p) => {
          if (invalidDocIds.has(p.document_id)) {
            invalidPageIds.add(p.id);
          }
        });
      }
    }

    const confirmedItems = (rawConfirmedItems || []).filter(
      (item) => !item.page_id || !invalidPageIds.has(item.page_id)
    );

    const confirmedCounts: Record<string, number> = {
      allergy: 0,
      medication: 0,
      condition: 0,
      surgery: 0,
      implant: 0,
      lab: 0,
    };

    (confirmedItems || []).forEach((item) => {
      if (confirmedCounts[item.category] !== undefined) {
        confirmedCounts[item.category]++;
      }
    });

    // 4. Fetch recent access logs for this card
    let accessLogs: Array<{ accessed_at: string; ip_hash: string; user_agent?: string }> = [];
    if (card) {
      const { data: logs } = await supabase
        .from("access_log")
        .select("accessed_at, ip_hash, user_agent")
        .eq("card_id", card.id)
        .order("accessed_at", { ascending: false })
        .limit(20);

      accessLogs = logs || [];
    }

    return NextResponse.json({
      card: card || null,
      profile: profile || null,
      confirmedCounts,
      confirmedItems: confirmedItems || [],
      accessLogs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

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
    const visibleCategories = Array.isArray(body.visible_categories)
      ? body.visible_categories
      : [];

    // Generate 128-bit random token
    const token = generateEmergencyToken();
    const tokenHash = hashEmergencyToken(token);

    // Check if user already has a card
    const { data: existingCard } = await supabase
      .from("emergency_cards")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let cardRecord;
    if (existingCard) {
      const { data: updated, error: updateErr } = await supabase
        .from("emergency_cards")
        .update({
          token_hash: tokenHash,
          visible_categories: visibleCategories,
          active: true,
        })
        .eq("id", existingCard.id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateErr) throw new Error(updateErr.message);
      cardRecord = updated;
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("emergency_cards")
        .insert({
          user_id: user.id,
          token_hash: tokenHash,
          visible_categories: visibleCategories,
          active: true,
        })
        .select()
        .single();

      if (insertErr) throw new Error(insertErr.message);
      cardRecord = inserted;
    }

    // Determine host URL
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const shareUrl = `${protocol}://${host}/e/${token}`;

    return NextResponse.json({
      success: true,
      token,
      shareUrl,
      card: {
        id: cardRecord.id,
        visible_categories: cardRecord.visible_categories,
        active: cardRecord.active,
        created_at: cardRecord.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
