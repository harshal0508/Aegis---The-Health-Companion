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
    const { active, card_id, patient_id } = body;

    if (typeof active !== "boolean") {
      return NextResponse.json(
        { error: "Invalid active status. Expected boolean." },
        { status: 400 }
      );
    }

    let updateQuery = supabase
      .from("emergency_cards")
      .update({ active })
      .select("id, visible_categories, active, patient_id");

    if (card_id) {
      updateQuery = updateQuery.eq("id", card_id);
    } else if (patient_id) {
      updateQuery = updateQuery.eq("patient_id", patient_id);
    } else {
      updateQuery = updateQuery.eq("user_id", user.id);
    }

    const { data: updatedCard, error: updateErr } = await updateQuery.single();

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
