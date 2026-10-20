import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getProvider } from "@/lib/llm/provider";
import { verifyQuotesAgainstOcr, deduplicateExtractedItems } from "@/lib/extraction/verify";

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

    // 7. Process each page
    for (const page of pages) {
      // Caching: Skip page if OCR and extraction was already completed
      if (page.ocr_text && page.ocr_text.trim().length > 0) {
        continue;
      }

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
      const mimeType = activeBlob.type || (ext === "pdf" ? "application/pdf" : "image/jpeg");

      // Extract entities via Vision LLM
      const extractionResult = await provider.extractPage(
        base64,
        mimeType,
        page.page_no
      );

      // Rule 4: Extract document date when present (distinguishing discharge vs signed date)
      if (!detectedDocDate && extractionResult.doc_date) {
        detectedDocDate = extractionResult.doc_date;
        detectedDocDateType = extractionResult.doc_date_type || "unspecified";
      }

      // Rule 1: Quote Verification Gate
      const verification = verifyQuotesAgainstOcr(
        extractionResult.items,
        extractionResult.ocr_text
      );

      // Save OCR text to page
      await supabase
        .from("pages")
        .update({ ocr_text: extractionResult.ocr_text })
        .eq("id", page.id);

      // Insert verified / needs_review items into database (deduplicated by category + normalized value)
      const deduplicatedItems = deduplicateExtractedItems(verification.items);

      if (deduplicatedItems.length > 0) {
        const rowsToInsert = deduplicatedItems.map((item) => ({
          user_id: user.id,
          page_id: page.id,
          category: item.category,
          value: item.value,
          quote: item.quote,
          confidence: item.confidence,
          source: "extracted" as const,
          // Rule 1 & 2: status is 'extracted' (if quote verified) or 'needs_review' (if quote unverified)
          status: item.status,
          normalization_source: item.normalization_source || "none",
        }));

        const { error: insertErr } = await supabase
          .from("items")
          .insert(rowsToInsert);

        if (!insertErr) {
          totalItemsCreated += rowsToInsert.length;
          verifiedItemsCount += deduplicatedItems.filter((i) => i.verified).length;
        }
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
