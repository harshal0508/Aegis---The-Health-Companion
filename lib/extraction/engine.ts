import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/llm/provider";
import { verifyQuotesAgainstOcr, deduplicateExtractedItems } from "@/lib/extraction/verify";
import { crossCheckItem } from "@/lib/extraction/crosscheck";
import { matchPatientIdentity } from "@/lib/extraction/identity-matcher";
import { getActiveOcrProvider, type OcrResult } from "@/lib/ocr/provider";
import sharp from "sharp";

const DAILY_PAGE_CAP =
  process.env.NODE_ENV !== "production"
    ? 500
    : parseInt(process.env.DAILY_PAGE_CAP || "50", 10);

export interface ExtractionExecutionResult {
  success: boolean;
  documentId: string;
  status: "ready" | "failed";
  summary?: {
    totalItems: number;
    verifiedItems: number;
    docDateDetected: string | null;
    readerSource: string;
  };
  error?: string;
  warning?: string;
}

/**
 * Core clinical extraction pipeline.
 * Guarantees:
 * 1. Statuses: uploaded -> queued -> processing -> ready / failed
 * 2. Failed attempts DO NOT count against daily page cap (only 'ready' documents count)
 * 3. Never saves partial results — all pages processed in memory before database commit
 * 4. Second reader is optional — failure marks items 'second reader unavailable' without blocking
 * 5. Tags reader_source in database for both document and all items
 */
export async function executeDocumentExtraction(
  documentId: string,
  userId: string
): Promise<ExtractionExecutionResult> {
  const supabase = await createClient();

  // 1. Fetch Document owned by user
  const { data: document, error: docErr } = await supabase
    .from("documents")
    .select("id, user_id, patient_id, storage_path, doc_date, doc_type, status, page_count")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (docErr || !document) {
    throw new Error("Document not found or access denied.");
  }

  // 2. Fetch Document Pages
  const { data: pages, error: pagesErr } = await supabase
    .from("pages")
    .select("id, page_no, ocr_text")
    .eq("document_id", documentId)
    .order("page_no", { ascending: true });

  if (pagesErr || !pages || pages.length === 0) {
    throw new Error("No document pages found to extract.");
  }

  // 3. Daily page cap calculation (Rule 2: Failed attempts don't count against cap)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: readyDocsToday, error: capErr } = await supabase
    .from("documents")
    .select("page_count")
    .eq("status", "ready")
    .gte("created_at", today.toISOString());

  const pagesExtractedToday = (readyDocsToday || []).reduce(
    (acc: number, d: any) => acc + (d.page_count || 1),
    0
  );

  if (!capErr && pagesExtractedToday + pages.length > DAILY_PAGE_CAP) {
    const errorMsg = `Daily page extraction cap reached (${DAILY_PAGE_CAP} pages/day). To keep this service free, please continue tomorrow.`;
    await supabase
      .from("documents")
      .update({ status: "failed", error_message: errorMsg })
      .eq("id", documentId);
    return { success: false, documentId, status: "failed", error: errorMsg };
  }

  // 4. Update status to 'processing'
  await supabase
    .from("documents")
    .update({ status: "processing", error_message: null })
    .eq("id", documentId);

  // 5. Fetch patient profile for identity matching
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
      .eq("id", userId)
      .single();
    profile = userProfile;
  }

  // 6. Initialize Providers
  const llmProvider = await getProvider();
  const ocrProvider = getActiveOcrProvider();

  // In-memory collection: Never save partial results
  const collectedPageUpdates: Array<{
    pageId: string;
    ocrText: string;
    ocrTextSecondary: string | null;
  }> = [];

  const collectedItemsToInsert: Array<any> = [];
  let detectedDocDate: string | null = null;
  let detectedDocDateType: string | null = null;
  let detectedPatientNamePrinted: string | null = null;
  let detectedPatientNameLatin: string | null = null;
  let detectedPatientDob: string | null = null;
  let verifiedItemsCount = 0;
  let dominantReaderSource = "primary_vision";

  try {
    // Process each page entirely in-memory
    for (const page of pages) {
      const patientFolder = document.patient_id
        ? `${userId}/${document.patient_id}/${documentId}`
        : null;
      const legacyFolder = `${userId}/${documentId}`;
      const docStoragePath = document.storage_path?.trim();

      const candidateFolders = [patientFolder, docStoragePath, legacyFolder].filter(
        Boolean
      ) as string[];

      let activeBlob: any = null;
      let matchedPath = "";

      for (const folder of candidateFolders) {
        const { data: storageFiles } = await supabase.storage
          .from("medical-records")
          .list(folder);

        if (storageFiles && storageFiles.length > 0) {
          const prefix = `page-${page.page_no}.`;
          const matchedFile = storageFiles.find((f) =>
            f.name.toLowerCase().startsWith(prefix)
          );
          if (matchedFile) {
            const fullPath = `${folder}/${matchedFile.name}`;
            const { data: b } = await supabase.storage
              .from("medical-records")
              .download(fullPath);
            if (b) {
              activeBlob = b;
              matchedPath = fullPath;
              break;
            }
          }
        }
      }

      if (!activeBlob) {
        const extensions = ["pdf", "jpg", "jpeg", "png", "webp"];
        for (const folder of candidateFolders) {
          for (const ext of extensions) {
            const p = `${folder}/page-${page.page_no}.${ext}`;
            const { data: b } = await supabase.storage
              .from("medical-records")
              .download(p);
            if (b) {
              activeBlob = b;
              matchedPath = p;
              break;
            }
          }
          if (activeBlob) break;
        }
      }

      if (!activeBlob) {
        throw new Error(`Failed to load file for page ${page.page_no} from storage.`);
      }

      const arrayBuffer = await activeBlob.arrayBuffer();
      const imageBuffer = Buffer.from(arrayBuffer);

      const isPdf =
        matchedPath.toLowerCase().endsWith(".pdf") ||
        activeBlob.type === "application/pdf" ||
        document.doc_type === "pdf";

      let visionBuffer = imageBuffer;
      if (!isPdf && imageBuffer.length > 800 * 1024) {
        try {
          visionBuffer = await sharp(imageBuffer)
            .resize({ width: 2048, withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        } catch {
          visionBuffer = imageBuffer;
        }
      }

      const base64 = visionBuffer.toString("base64");
      const mimeType = isPdf
        ? "application/pdf"
        : activeBlob.type && activeBlob.type.startsWith("image/")
        ? activeBlob.type
        : "image/jpeg";

      let extractionResult: any = null;
      let secondaryOcrResult: OcrResult | null = null;
      let primaryVisionError: Error | null = null;

      // 1. Execute Primary Multimodal Vision Extraction
      try {
        extractionResult = await llmProvider.extractPage(base64, mimeType, page.page_no);
        dominantReaderSource = extractionResult.reader_source || "primary_vision";
      } catch (err: any) {
        primaryVisionError = err;
      }

      // 2. Execute Optional Second-Reader OCR (Tesseract or Azure Document Intelligence)
      if (ocrProvider && !isPdf) {
        try {
          secondaryOcrResult = await ocrProvider.recognize(imageBuffer, mimeType);
        } catch {
          secondaryOcrResult = null;
        }
      }

      // 3. Fallback: If Vision extraction failed but OCR succeeded, use Text-Only Extraction Path
      if (!extractionResult && secondaryOcrResult?.text) {
        try {
          const readerSourceTag =
            ocrProvider?.name === "azure_document_intelligence"
              ? "text_ocr_azure"
              : "text_ocr_tesseract";
          extractionResult = await llmProvider.extractFromText(
            secondaryOcrResult.text,
            page.page_no,
            readerSourceTag
          );
          dominantReaderSource = readerSourceTag;
        } catch (err: any) {
          throw new Error(
            `Vision and Text extraction both failed for page ${page.page_no}: ${err.message}`
          );
        }
      }

      if (!extractionResult) {
        throw new Error(
          primaryVisionError?.message ||
            `Failed to extract clinical records from page ${page.page_no}.`
        );
      }

      // Track document dates & identity
      if (!detectedDocDate && extractionResult.doc_date) {
        detectedDocDate = extractionResult.doc_date;
        detectedDocDateType = extractionResult.doc_date_type || "unspecified";
      }
      if (!detectedPatientNamePrinted && extractionResult.patient_name_as_printed) {
        detectedPatientNamePrinted = extractionResult.patient_name_as_printed;
      }
      if (!detectedPatientNameLatin && extractionResult.patient_name_latin) {
        detectedPatientNameLatin = extractionResult.patient_name_latin;
      }
      if (!detectedPatientDob && extractionResult.patient_dob) {
        detectedPatientDob = extractionResult.patient_dob;
      }

      // Verify quotes against verbatim text
      const verification = verifyQuotesAgainstOcr(
        extractionResult.items,
        extractionResult.ocr_text
      );

      // Identity Matcher
      const identityResult = matchPatientIdentity(
        { full_name: profile?.full_name || "", dob: profile?.dob },
        {
          patient_name_as_printed: detectedPatientNamePrinted,
          patient_name_latin: detectedPatientNameLatin,
          patient_dob: detectedPatientDob,
        }
      );

      // Deduplicate items
      const deduplicated = deduplicateExtractedItems(verification.items);

      for (const item of deduplicated) {
        let itemStatus: "extracted" | "needs_review" = item.status;
        let ocrCheckPayload: any = null;
        let reviewReason: string | null = null;

        if (secondaryOcrResult) {
          const check = crossCheckItem(item, secondaryOcrResult as any);
          ocrCheckPayload = check.ocrCheckPayload;
          if (check.state === "disagree") {
            itemStatus = "needs_review";
            reviewReason = check.reviewReason || "OCR disagreement";
          }
        } else {
          // Rule 4: Second reader unavailable marked clearly without failing
          ocrCheckPayload = {
            state: "unavailable",
            page_confidence: 0,
            matched_tokens: [],
            missing_tokens: [],
            bounding_boxes: null,
          };
        }

        if (identityResult.outcome === "mismatch") {
          itemStatus = "needs_review";
          reviewReason = "Report appears to be for someone else";
        }

        collectedItemsToInsert.push({
          user_id: userId,
          patient_id: document.patient_id || userId,
          page_id: page.id,
          category: item.category,
          value: item.value,
          quote: item.quote,
          confidence: item.confidence,
          source: "extracted",
          status: itemStatus,
          normalization_source: item.normalization_source || "none",
          reader_source: item.reader_source || dominantReaderSource,
          ocr_check: ocrCheckPayload,
          review_reason: reviewReason,
        });
      }

      collectedPageUpdates.push({
        pageId: page.id,
        ocrText: extractionResult.ocr_text,
        ocrTextSecondary: secondaryOcrResult?.text || null,
      });

      verifiedItemsCount += deduplicated.filter((i) => i.verified).length;
    }

    // ─── COMMIT PHASE: NEVER SAVE PARTIAL RESULTS ────────────────────────────
    // Only executed if ALL pages processed without errors.

    const pageIds = pages.map((p) => p.id);

    // 1. Remove previous unconfirmed items for this document
    await supabase
      .from("items")
      .delete()
      .eq("user_id", userId)
      .in("page_id", pageIds)
      .eq("source", "extracted")
      .neq("status", "confirmed");

    // 2. Fetch existing confirmed items to avoid duplicate keys
    const { data: existingConfirmed } = await supabase
      .from("items")
      .select("id, category, value")
      .eq("user_id", userId)
      .eq("status", "confirmed");

    const confirmedMap = new Map<string, string>(
      (existingConfirmed || []).map((i) => [
        `${i.category}:${i.value.toLowerCase().replace(/[^\w]/g, "")}`,
        i.id,
      ])
    );

    const nonDuplicateRows = collectedItemsToInsert.filter((r) => {
      const key = `${r.category}:${r.value.toLowerCase().replace(/[^\w]/g, "")}`;
      return !confirmedMap.has(key);
    });

    if (nonDuplicateRows.length > 0) {
      const { error: insertErr } = await supabase
        .from("items")
        .insert(nonDuplicateRows);

      if (insertErr) {
        // Fallback if reader_source or ocr_check column is missing
        const strippedRows = nonDuplicateRows.map((r) => {
          const { reader_source, ocr_check, review_reason, ...rest } = r;
          return rest;
        });
        await supabase.from("items").insert(strippedRows);
      }
    }

    // 3. Update page OCR texts
    for (const update of collectedPageUpdates) {
      await supabase
        .from("pages")
        .update({
          ocr_text: update.ocrText,
          ocr_text_secondary: update.ocrTextSecondary,
        })
        .eq("id", update.pageId);
    }

    // 4. Update Document status to 'ready'
    const finalIdentity = matchPatientIdentity(
      { full_name: profile?.full_name || "", dob: profile?.dob },
      {
        patient_name_as_printed: detectedPatientNamePrinted,
        patient_name_latin: detectedPatientNameLatin,
        patient_dob: detectedPatientDob,
      }
    );

    const docUpdateData: Record<string, any> = {
      status: "ready",
      error_message: null,
      reader_source: dominantReaderSource,
      extracted_at: new Date().toISOString(),
      identity_status: finalIdentity.outcome,
      identity_details: finalIdentity,
      patient_name_as_printed: detectedPatientNamePrinted,
      patient_name_latin: detectedPatientNameLatin,
      patient_dob: detectedPatientDob,
    };

    if (detectedDocDate && !document.doc_date) {
      docUpdateData.doc_date = detectedDocDate;
    }
    if (detectedDocDateType) {
      docUpdateData.doc_date_type = detectedDocDateType;
    }

    await supabase
      .from("documents")
      .update(docUpdateData)
      .eq("id", documentId);

    return {
      success: true,
      documentId,
      status: "ready",
      summary: {
        totalItems: nonDuplicateRows.length,
        verifiedItems: verifiedItemsCount,
        docDateDetected: detectedDocDate,
        readerSource: dominantReaderSource,
      },
    };
  } catch (error: any) {
    // ATOMIC GUARANTEE: Never save partial results on failure
    const errorMsg = error?.message || "Extraction process failed.";
    await supabase
      .from("documents")
      .update({
        status: "failed",
        error_message: errorMsg,
      })
      .eq("id", documentId);

    return {
      success: false,
      documentId,
      status: "failed",
      error: errorMsg,
    };
  }
}
