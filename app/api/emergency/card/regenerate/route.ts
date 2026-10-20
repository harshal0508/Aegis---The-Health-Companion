import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { generateEmergencyToken, hashEmergencyToken } from "@/lib/emergency/token";

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

    const token = generateEmergencyToken();
    const tokenHash = hashEmergencyToken(token);

    const { data: updatedCard, error: updateErr } = await supabase
      .from("emergency_cards")
      .update({
        token_hash: tokenHash,
        active: true,
      })
      .eq("user_id", user.id)
      .select("id, visible_categories, active")
      .single();

    if (updateErr || !updatedCard) {
      return NextResponse.json(
        { error: updateErr?.message || "Card not found" },
        { status: 404 }
      );
    }

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const shareUrl = `${protocol}://${host}/e/${token}`;

    return NextResponse.json({
      success: true,
      token,
      shareUrl,
      card: updatedCard,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
