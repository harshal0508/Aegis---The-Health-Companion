import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    const { active } = body;

    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "Invalid active status. Expected boolean." },
        { status: 400 }
      );
    }

    const { data: updatedCard, error: updateErr } = await supabase
      .from("emergency_cards")
      .update({ active })
      .eq("user_id", user.id)
      .select("id, visible_categories, active")
      .single();

    if (updateErr || !updatedCard) {
      return NextResponse.json(
        { error: updateErr?.message || "Card not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      card: updatedCard,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
