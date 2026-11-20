import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { downloadPageImageBuffer } from "@/lib/ocr/page-storage";
import { ocrPage, type NormalizedBox } from "@/lib/ocr/tesseract";
import { locateQuoteBoundingBoxes } from "@/lib/extraction/locator";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * On-demand bounding box locator for document items.
 * Allows existing documents (where second-reader OCR was unavailable during initial extraction)
 * to resolve scan coordinates on-the-fly and persist them permanently in Supabase.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    let targetItemId: string | null = null;

    try {
      const body = await request.json();
      if (body && typeof body.itemId === "string") {
        targetItemId = body.itemId;
      }
    } catch {
      // Body is optional
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch document record
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, patient_id, storage_path, doc_type")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    // 2. Fetch pages
    const { data: pages, error: pagesError } = await supabase
      .from("pages")
      .select("id, page_no, ocr_text, ocr_text_secondary")
      .eq("document_id", documentId)
      .order("page_no", { ascending: true });

    if (pagesError || !pages || pages.length === 0) {
      return NextResponse.json({ error: "No pages found for document" }, { status: 404 });
    }

    const pageIds = pages.map((p) => p.id);

    // 3. Fetch items
    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select("id, category, value, quote, page_id, ocr_check")
      .in("page_id", pageIds);

    if (itemsError || !items || items.length === 0) {
      return NextResponse.json({ success: true, located: {} });
    }

    // Fast-path: If single item requested and it already has bounding boxes, return immediately
    if (targetItemId) {
      const targetItem = items.find((i) => i.id === targetItemId);
      const existingBoxes = targetItem?.ocr_check?.bounding_boxes;
      if (existingBoxes && existingBoxes.length > 0) {
        return NextResponse.json({
          success: true,
          located: { [targetItemId]: existingBoxes },
        });
      }
    }

    // Filter items needing bounding boxes
    const unlocatedItems = items.filter((item) => {
      if (targetItemId && item.id !== targetItemId) {
        // Still allow locating items on the same page as targetItem
        const target = items.find((i) => i.id === targetItemId);
        if (target && item.page_id !== target.page_id) return false;
      }
      const boxes = item.ocr_check?.bounding_boxes;
      return !boxes || boxes.length === 0;
    });

    if (unlocatedItems.length === 0) {
      const existingLocated: Record<string, NormalizedBox[]> = {};
      for (const item of items) {
        if (item.ocr_check?.bounding_boxes) {
          existingLocated[item.id] = item.ocr_check.bounding_boxes;
        }
      }
      return NextResponse.json({ success: true, located: existingLocated });
    }

    // Group unlocated items by page
    const itemsByPageId = new Map<string, typeof unlocatedItems>();
    for (const item of unlocatedItems) {
      const pageId = item.page_id || pages[0].id;
      if (!itemsByPageId.has(pageId)) itemsByPageId.set(pageId, []);
      itemsByPageId.get(pageId)!.push(item);
    }

    const locatedMap: Record<string, NormalizedBox[]> = {};

    for (const [pageId, pageItems] of itemsByPageId.entries()) {
      const page = pages.find((p) => p.id === pageId);
      if (!page) continue;

      const imageResult = await downloadPageImageBuffer(supabase, user.id, document, page.page_no);
      if (!imageResult || imageResult.mimeType === "application/pdf") {
        continue;
      }

      let ocrResult: any = null;
      try {
        ocrResult = await ocrPage(imageResult.buffer, { timeoutMs: 35000 });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn(`[Locate Route] OCR failed for page ${page.page_no}:`, err?.message || err);
        continue;
      }

      if (!ocrResult || !ocrResult.words || ocrResult.words.length === 0) {
        continue;
      }

      // Save secondary OCR text if missing
      if (!page.ocr_text_secondary && ocrResult.text) {
        await supabase
          .from("pages")
          .update({ ocr_text_secondary: ocrResult.text })
          .eq("id", page.id);
      }

      // Locate coordinates for each item
      for (const item of pageItems) {
        let boxes: NormalizedBox[] | null = null;
        if (item.quote) {
          boxes = locateQuoteBoundingBoxes(item.quote, ocrResult);
        }
        if (!boxes && item.value) {
          boxes = locateQuoteBoundingBoxes(item.value, ocrResult);
        }

        if (boxes && boxes.length > 0) {
          locatedMap[item.id] = boxes;

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
        }
      }
    }

    return NextResponse.json({
      success: true,
      located: locatedMap,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to locate bounding boxes" },
      { status: 500 }
    );
  }
}
