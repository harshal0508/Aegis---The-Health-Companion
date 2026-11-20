import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { downloadPageImageBuffer } from "@/lib/ocr/page-storage";
import { ocrPage, type NormalizedBox } from "@/lib/ocr/tesseract";
import { locateQuoteBoundingBoxes } from "@/lib/extraction/locator";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * On-demand bounding box locator for a single item.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch item
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("id, category, value, quote, page_id, ocr_check")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // If item already has bounding boxes, return immediately
    const existingBoxes = item.ocr_check?.bounding_boxes;
    if (existingBoxes && existingBoxes.length > 0) {
      return NextResponse.json({ success: true, boxes: existingBoxes });
    }

    // 2. Fetch page and document
    const { data: page, error: pageError } = await supabase
      .from("pages")
      .select("id, page_no, document_id, ocr_text_secondary")
      .eq("id", item.page_id)
      .single();

    if (pageError || !page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, patient_id, storage_path")
      .eq("id", page.document_id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const imageResult = await downloadPageImageBuffer(supabase, user.id, document, page.page_no);
    if (!imageResult || imageResult.mimeType === "application/pdf") {
      return NextResponse.json({ success: false, boxes: null });
    }

    const ocrResult = await ocrPage(imageResult.buffer, { timeoutMs: 35000 });
    if (!ocrResult || !ocrResult.words || ocrResult.words.length === 0) {
      return NextResponse.json({ success: false, boxes: null });
    }

    let boxes: NormalizedBox[] | null = null;
    if (item.quote) {
      boxes = locateQuoteBoundingBoxes(item.quote, ocrResult);
    }
    if (!boxes && item.value) {
      boxes = locateQuoteBoundingBoxes(item.value, ocrResult);
    }

    if (boxes && boxes.length > 0) {
      const currentCheck = item.ocr_check || {};
      const updatedCheck = {
        ...currentCheck,
        page_confidence: currentCheck.page_confidence || ocrResult.pageConfidence || 90,
        state: currentCheck.state === "disagree" ? "disagree" : "agree",
        bounding_boxes: boxes,
      };

      await supabase
        .from("items")
        .update({ ocr_check: updatedCheck })
        .eq("id", item.id);

      return NextResponse.json({ success: true, boxes });
    }

    return NextResponse.json({ success: false, boxes: null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to locate item" }, { status: 500 });
  }
}
