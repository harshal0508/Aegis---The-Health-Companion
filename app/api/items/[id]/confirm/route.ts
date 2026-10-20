import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: item, error } = await supabase
      .from("items")
      .update({
        status: "confirmed",
        last_confirmed_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !item) {
      return NextResponse.json(
        { error: error?.message || "Failed to confirm record" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
