import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getProvider } from "@/lib/llm/provider";
import { verifyQuotesAgainstOcr, deduplicateExtractedItems } from "@/lib/extraction/verify";
import { ocrPage, type TesseractResult } from "@/lib/ocr/tesseract";
import { crossCheckItem } from "@/lib/extraction/crosscheck";
import { locateQuoteBoundingBoxes } from "@/lib/extraction/locator";

// Daily extraction page cap per user (configurable via DAILY_PAGE_CAP).
// NOTE: Google API free tier is strictly for development and testing (some models cap the entire project at 20 req/day).
// For multi-user production, a commercial/paid plan with per-account quotas is required.
const DAILY_PAGE_CAP = parseInt(process.env.DAILY_PAGE_CAP || "10", 10);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const supabase = await createClient();

    // 1. Verify User Authentication
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: "Unauthorized. Please log in first." },
        { status: 401 }
      );
    }

    // 2. Fetch Document owned by user
    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id, storage_path, doc_date, doc_type, status")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docErr || !document) {
      return NextResponse.json(
        { error: "Document not found or access denied." },
        { status: 404 }
      );
    }

    // 3. Fetch Pages of the document
    const { data: pages, error: pagesErr } = await supabase
      .from("pages")
      .select("id, page_no, ocr_text")
      .eq("document_id", documentId)
      .order("page_no", { ascending: true });

    if (pagesErr || !pages || pages.length === 0) {
      return NextResponse.json(
        { error: "No document pages found to extract." },
        { status: 400 }
      );
    }

    // 4. Rate Limiting: Daily page extraction cap (Rule 5)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: extractedTodayCount, error: countErr } = await supabase
      .from("pages")
      .select("id", { count: "exact", head: true })
      .not("ocr_text", "is", null)
      .gte("created_at", today.toISOString());

    if (!countErr && (extractedTodayCount ?? 0) >= DAILY_PAGE_CAP) {
      return NextResponse.json(
        {
          error: `Daily page extraction cap reached (${DAILY_PAGE_CAP} pages/day). To keep this service free, please continue tomorrow.`,
        },
        { status: 429 }
      );
    }

    // 5. Update document status to 'processing'
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // 6. Initialize Extraction Provider
    let provider;
    try {
      provider = await getProvider();
    } catch (err: any) {
      await supabase
        .from("documents")
        .update({ status: "uploaded" })
        .eq("id", documentId);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }

    let detectedDocDate: string | null = null;
    let detectedDocDateType: string | null = null;
    let totalItemsCreated = 0;
    let verifiedItemsCount = 0;

    const pageIds = pages.map((p) => p.id);

    // Clean up previous unconfirmed extracted items for this document's pages to avoid duplicate entries on re-run
    await supabase
      .from("items")
      .delete()
      .eq("user_id", user.id)
      .in("page_id", pageIds)
      .eq("source", "extracted")
      .neq("status", "confirmed");

    // Fetch all existing items for this document's pages to update bounding boxes
    const { data: existingDocItems } = await supabase
      .from("items")
      .select("id, category, value, quote, page_id, ocr_check")
      .eq("user_id", user.id)
      .in("page_id", pageIds);

    // Check existing confirmed items to avoid duplicating already-confirmed patient records
    const { data: existingConfirmed } = await supabase
      .from("items")
      .select("id, category, value")
      .eq("user_id", user.id)
      .eq("status", "confirmed");

    const confirmedMap = new Map<string, string>(
      (existingConfirmed || []).map(
        (i) => [`${i.category}:${i.value.toLowerCase().replace(/[^\w]/g, "")}`, i.id]
      )
    );

    // 7. Process each page
    for (const page of pages) {

      // Download page file from Supabase private storage
      const ext = document.storage_path.endsWith(".pdf") ? "pdf" : "jpg";
      const pageStoragePath = `${user.id}/${documentId}/page-${page.page_no}.${ext}`;

      const { data: fileBlob, error: downloadErr } = await supabase.storage
        .from("medical-records")
        .download(pageStoragePath);

      if (downloadErr || !fileBlob) {
        // Fallback: Try downloading document's primary storage_path if single page
        const { data: fallbackBlob, error: fbErr } = await supabase.storage
          .from("medical-records")
          .download(document.storage_path);

        if (fbErr || !fallbackBlob) {
          throw new Error(`Failed to load page image for page ${page.page_no}`);
        }
      }

      const activeBlob = fileBlob || (await supabase.storage.from("medical-records").download(document.storage_path)).data;
      if (!activeBlob) continue;

      const arrayBuffer = await activeBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const imageBuffer = Buffer.from(arrayBuffer);
      const mimeType = activeBlob.type || (ext === "pdf" ? "application/pdf" : "image/jpeg");

      // 1. Extract entities via Vision LLM (Primary perception)
      const extractionResult = await provider.extractPage(
        base64,
        mimeType,
        page.page_no
      );

      // 2. Run independent Second-Reader OCR (Tesseract.js)
      let secondaryOcrResult: TesseractResult | null = null;
      try {
        secondaryOcrResult = await ocrPage(imageBuffer);
      } catch (ocrErr: any) {
        // Non-blocking: If secondary reader fails, keep primary extraction
        console.warn("[ExtractRoute] Second-reader OCR notice:", ocrErr.message);
      }

      if (secondaryOcrResult) {
        // Update bounding boxes for all existing items on this page (even if confirmed or omitted by Gemini)
        const itemsToUpdate = (existingDocItems || []).filter(
          (item) => item.page_id === page.id || (!item.page_id && item.quote)
        );

        for (const existingItem of itemsToUpdate) {
          if (existingItem.quote) {
            const boxes = locateQuoteBoundingBoxes(existingItem.quote, secondaryOcrResult);
            if (boxes && boxes.length > 0) {
              const currentPayload = (existingItem.ocr_check as any) || { state: "agree" };
              await supabase
                .from("items")
                .update({
                  page_id: page.id,
                  ocr_check: {
                    ...currentPayload,
                    bounding_boxes: boxes,
                  },
                })
                .eq("id", existingItem.id);
            }
          }
        }
      }

      // Rule 4: Extract document date when present (distinguishing discharge vs signed date)
      if (!detectedDocDate && extractionResult.doc_date) {
        detectedDocDate = extractionResult.doc_date;
        detectedDocDateType = extractionResult.doc_date_type || "unspecified";
      }

      // Rule 1: Quote Verification Gate (verifies quote appears in primary transcript)
      const verification = verifyQuotesAgainstOcr(
        extractionResult.items,
        extractionResult.ocr_text
      );

      // Save OCR texts to page
      const pageUpdateData: Record<string, any> = {
        ocr_text: extractionResult.ocr_text,
      };
      if (secondaryOcrResult?.text) {
        pageUpdateData.ocr_text_secondary = secondaryOcrResult.text;
      }

      try {
        await supabase
          .from("pages")
          .update(pageUpdateData)
          .eq("id", page.id);
      } catch {
        // Fallback if ocr_text_secondary column migration is pending
        delete pageUpdateData.ocr_text_secondary;
        await supabase
          .from("pages")
          .update(pageUpdateData)
          .eq("id", page.id);
      }

      // Insert verified / needs_review items into database (deduplicated by category + normalized value)
      const deduplicatedItems = deduplicateExtractedItems(verification.items);

      if (deduplicatedItems.length > 0) {
        const rowsToInsert = deduplicatedItems.map((item) => {
          let itemStatus: "extracted" | "needs_review" = item.status;
          let ocrCheckPayload: any = null;
          let reviewReason: string | null = null;

          // 3. Second-Reader Cross-Check Gate
          if (secondaryOcrResult) {
            const check = crossCheckItem(item, secondaryOcrResult);
            ocrCheckPayload = check.ocrCheckPayload;

            if (check.state === "disagree") {
              // Mark needs_review with specific token disagreement reason; never delete the item
              itemStatus = "needs_review";
              reviewReason = check.reviewReason || "OCR disagreement";
            }
          }

          return {
            user_id: user.id,
            page_id: page.id,
            category: item.category,
            value: item.value,
            quote: item.quote,
            confidence: item.confidence,
            source: "extracted" as const,
            // Rule 1 & 2: status is 'extracted' (if verified) or 'needs_review' (if quote unverified or OCR disagrees)
            status: itemStatus,
            normalization_source: item.normalization_source || "none",
            ocr_check: ocrCheckPayload,
            review_reason: reviewReason,
          };
        });

        // Update existing confirmed items so they receive the newly computed OCR check and bounding boxes
        for (const row of rowsToInsert) {
          const key = `${row.category}:${row.value.toLowerCase().replace(/[^\w]/g, "")}`;
          const confirmedId = confirmedMap.get(key);
          if (confirmedId) {
            try {
              await supabase
                .from("items")
                .update({
                  ocr_check: row.ocr_check,
                  quote: row.quote,
                  page_id: row.page_id,
                })
                .eq("id", confirmedId);
            } catch {
              // Silently ignore if column update fails
            }
          }
        }

        const nonDuplicateRows = rowsToInsert.filter((r) => {
          const key = `${r.category}:${r.value.toLowerCase().replace(/[^\w]/g, "")}`;
          return !confirmedMap.has(key);
        });

        if (nonDuplicateRows.length > 0) {
          const { error: insertErr } = await supabase
            .from("items")
            .insert(nonDuplicateRows);

          if (insertErr) {
            // Fallback if ocr_check / review_reason columns are not yet applied in remote Supabase
            const strippedRows = nonDuplicateRows.map((r) => {
              const { ocr_check, review_reason, ...rest } = r;
              return rest;
            });
            await supabase.from("items").insert(strippedRows);
          }

          totalItemsCreated += nonDuplicateRows.length;
        }
        verifiedItemsCount += deduplicatedItems.filter((i) => i.verified).length;
      }
    }

    // 8. Update Document: mark ready, set doc_date if detected and not already set
    const updateDocData: Record<string, any> = {
      status: "ready",
    };

    if (detectedDocDate && !document.doc_date) {
      updateDocData.doc_date = detectedDocDate;
    }

    try {
      if (detectedDocDateType) {
        updateDocData.doc_date_type = detectedDocDateType;
      }
      await supabase
        .from("documents")
        .update(updateDocData)
        .eq("id", documentId);
    } catch {
      // Fallback if doc_date_type column is not yet migrated in DB
      delete updateDocData.doc_date_type;
      await supabase
        .from("documents")
        .update(updateDocData)
        .eq("id", documentId);
    }

    // Rule 7: Never log OCR text or extracted values!
    return NextResponse.json({
      success: true,
      documentId,
      status: "ready",
      summary: {
        totalItems: totalItemsCreated,
        verifiedItems: verifiedItemsCount,
        docDateDetected: detectedDocDate,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Extraction process failed" },
      { status: 500 }
    );
  }
}
