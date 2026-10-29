import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getProvider } from "@/lib/llm/provider";
import { verifyQuotesAgainstOcr, deduplicateExtractedItems } from "@/lib/extraction/verify";
import { ocrPage, type TesseractResult } from "@/lib/ocr/tesseract";
import { crossCheckItem } from "@/lib/extraction/crosscheck";
import { locateQuoteBoundingBoxes } from "@/lib/extraction/locator";
import { matchPatientIdentity } from "@/lib/extraction/identity-matcher";

// Daily extraction page cap per user (configurable via DAILY_PAGE_CAP).
// In development, default to generous cap (500 pages) so testing is never blocked.
const DAILY_PAGE_CAP =
  process.env.NODE_ENV !== "production"
    ? 500
    : parseInt(process.env.DAILY_PAGE_CAP || "50", 10);

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
      .select("id, user_id, patient_id, storage_path, doc_date, doc_type, status")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docErr || !document) {
      return NextResponse.json(
        { error: "Document not found or access denied." },
        { status: 404 }
      );
    }

    // 2.1 Fetch patient profile for identity matching (check patients table first, fallback to profiles)
    let profile: any = null;
    if (document.patient_id) {
      const { data: patientRow } = await supabase
        .from("patients")
        .select("full_name, dob")
        .eq("id", document.patient_id)
        .maybeSingle();
      profile = patientRow;
    }

    if (!profile) {
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("full_name, dob")
        .eq("id", user.id)
        .single();
      profile = userProfile;
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
    let detectedPatientNamePrinted: string | null = null;
    let detectedPatientNameLatin: string | null = null;
    let detectedPatientDob: string | null = null;
    let totalItemsCreated = 0;
    let verifiedItemsCount = 0;
    let primaryError: string | null = null;

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
      // Supports both {account_id}/{patient_id}/{doc_id}/page-n and legacy {user_id}/{doc_id}/page-n
      const ext = document.storage_path.endsWith(".pdf") ? "pdf" : "jpg";
      const candidatePaths = [
        document.storage_path && !document.storage_path.endsWith(".pdf") && !document.storage_path.endsWith(".jpg")
          ? `${document.storage_path}/page-${page.page_no}.${ext}`
          : null,
        `${user.id}/${document.patient_id || user.id}/${documentId}/page-${page.page_no}.${ext}`,
        `${user.id}/${documentId}/page-${page.page_no}.${ext}`,
        document.storage_path,
      ].filter(Boolean) as string[];

      let activeBlob: any = null;
      for (const p of candidatePaths) {
        const { data: b } = await supabase.storage.from("medical-records").download(p);
        if (b) {
          activeBlob = b;
          break;
        }
      }

      if (!activeBlob) {
        throw new Error(`Failed to load page image for page ${page.page_no}`);
      }
      if (!activeBlob) continue;

      const arrayBuffer = await activeBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const imageBuffer = Buffer.from(arrayBuffer);
      const mimeType = activeBlob.type || (ext === "pdf" ? "application/pdf" : "image/jpeg");

      // Run Primary Vision Perception (Gemini) and Secondary OCR (Tesseract) concurrently
      let extractionResult: any = null;
      let secondaryOcrResult: TesseractResult | null = null;

      const [geminiSettled, ocrSettled] = await Promise.allSettled([
        provider.extractPage(base64, mimeType, page.page_no),
        ocrPage(imageBuffer),
      ]);

      if (geminiSettled.status === "fulfilled") {
        extractionResult = geminiSettled.value;
      } else {
        primaryError = geminiSettled.reason?.message || "Vision extraction failed";
        console.warn("[ExtractRoute] Primary Gemini perception warning:", primaryError);
      }

      if (ocrSettled.status === "fulfilled") {
        secondaryOcrResult = ocrSettled.value;
      } else {
        console.warn("[ExtractRoute] Secondary OCR warning:", ocrSettled.reason?.message);
      }

      // If both readers failed, throw error so user is notified
      if (!extractionResult && !secondaryOcrResult) {
        throw new Error(primaryError || "Both primary and secondary perception readers failed.");
      }

      if (secondaryOcrResult) {
        // Update bounding boxes and cross-checks for all existing items on this page (even if confirmed or omitted by Gemini)
        const itemsToUpdate = (existingDocItems || []).filter(
          (item) => item.page_id === page.id || (!item.page_id && item.quote)
        );

        for (const existingItem of itemsToUpdate) {
          if (existingItem.quote) {
            const check = crossCheckItem(existingItem, secondaryOcrResult);
            await supabase
              .from("items")
              .update({
                page_id: page.id,
                ocr_check: check.ocrCheckPayload,
                review_reason: check.state === "disagree" ? (check.reviewReason || "OCR disagreement") : null,
              })
              .eq("id", existingItem.id);
          }
        }
      }

      // If Gemini returned extractions, process and insert them
      if (extractionResult) {
        // Rule 4: Extract document date when present (distinguishing discharge vs signed date)
        if (!detectedDocDate && extractionResult.doc_date) {
          detectedDocDate = extractionResult.doc_date;
          detectedDocDateType = extractionResult.doc_date_type || "unspecified";
        }

        // Feature A: Extract patient identity metadata
        if (!detectedPatientNamePrinted && extractionResult.patient_name_as_printed) {
          detectedPatientNamePrinted = extractionResult.patient_name_as_printed;
        }
        if (!detectedPatientNameLatin && extractionResult.patient_name_latin) {
          detectedPatientNameLatin = extractionResult.patient_name_latin;
        }
        if (!detectedPatientDob && extractionResult.patient_dob) {
          detectedPatientDob = extractionResult.patient_dob;
        }

        // Run Identity Matcher against active patient profile
        const identityResult = matchPatientIdentity(
          { full_name: profile?.full_name || "", dob: profile?.dob },
          {
            patient_name_as_printed: detectedPatientNamePrinted,
            patient_name_latin: detectedPatientNameLatin,
            patient_dob: detectedPatientDob,
          }
        );

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

          // Rule A.3: Identity Mismatch Lock
          // If mismatch: ALL items from that document become needs_review
          if (identityResult.outcome === "mismatch") {
            itemStatus = "needs_review";
            reviewReason = "Report appears to be for someone else";
          }

          return {
            user_id: user.id,
            patient_id: document.patient_id || user.id,
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
                  review_reason: row.review_reason,
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
  }

    // 8. Update Document: mark ready, set doc_date if detected, and record identity verification
    const finalIdentityResult = matchPatientIdentity(
      { full_name: profile?.full_name || "", dob: profile?.dob },
      {
        patient_name_as_printed: detectedPatientNamePrinted,
        patient_name_latin: detectedPatientNameLatin,
        patient_dob: detectedPatientDob,
      }
    );

    const updateDocData: Record<string, any> = {
      status: "ready",
      identity_status: finalIdentityResult.outcome,
      identity_details: finalIdentityResult,
      patient_name_as_printed: detectedPatientNamePrinted,
      patient_name_latin: detectedPatientNameLatin,
      patient_dob: detectedPatientDob,
    };

    if (detectedDocDate && !document.doc_date) {
      updateDocData.doc_date = detectedDocDate;
    }
    if (detectedDocDateType) {
      updateDocData.doc_date_type = detectedDocDateType;
    }

    if (finalIdentityResult.outcome === "mismatch") {
      // Rule A.3: Mismatch -> ALL items from that document become needs_review
      await supabase
        .from("items")
        .update({
          status: "needs_review",
          review_reason: "Report appears to be for someone else",
        })
        .eq("user_id", user.id)
        .in("page_id", pageIds);
    }

    try {
      await supabase
        .from("documents")
        .update(updateDocData)
        .eq("id", documentId);
    } catch {
      // Fallback if identity / doc_date_type columns are not yet applied in DB
      delete updateDocData.identity_status;
      delete updateDocData.identity_details;
      delete updateDocData.patient_name_as_printed;
      delete updateDocData.patient_name_latin;
      delete updateDocData.patient_dob;
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
      warning: primaryError ? `Note: ${primaryError}` : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Extraction process failed" },
      { status: 500 }
    );
  }
}
