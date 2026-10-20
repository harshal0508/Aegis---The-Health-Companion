import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { value, category } = body;

    const updateData: Record<string, any> = {
      // Editing an item marks it confirmed by the patient
      source: "patient_entered",
      status: "confirmed",
      last_confirmed_at: new Date().toISOString(),
    };

    if (value && typeof value === "string" && value.trim() !== "") {
      updateData.value = value.trim();
    }

    if (category && typeof category === "string") {
      updateData.category = category.trim();
    }

    const { data: item, error: updateErr } = await supabase
      .from("items")
      .update(updateData)
      .eq("id", itemId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateErr || !item) {
      return NextResponse.json(
        { error: updateErr?.message || "Failed to update record" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: deleteErr } = await supabase
      .from("items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", user.id);

    if (deleteErr) {
      return NextResponse.json(
        { error: deleteErr.message || "Failed to delete record" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
