import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const body = await request.json();
    const { boxes } = body;

    if (!boxes || !Array.isArray(boxes) || boxes.length === 0) {
      return NextResponse.json({ error: "Invalid boxes payload" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch existing item to preserve confidence and matched tokens
    const { data: item, error: itemErr } = await supabase
      .from("items")
      .select("id, ocr_check")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();

    if (itemErr || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const currentCheck = item.ocr_check || {};
    const updatedCheck = {
      ...currentCheck,
      state: currentCheck.state === "disagree" ? "disagree" : "agree",
      bounding_boxes: boxes,
    };

    const { error: updateErr } = await supabase
      .from("items")
      .update({ ocr_check: updatedCheck })
      .eq("id", itemId)
      .eq("user_id", user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
