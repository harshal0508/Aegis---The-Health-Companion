import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const uploadUrlSchema = z.object({
  doc_type: z.enum([
    "prescription",
    "discharge_summary",
    "lab_report",
    "radiology",
    "bill",
    "other",
  ]),
  doc_date: z.string().optional(),
  patient_id: z.string().optional(),
  pages: z.array(
    z.object({
      page_no: z.number().int().min(1),
      file_name: z.string(),
      content_type: z.string(),
    })
  ).min(1, "At least one page is required"),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Validate payload
    const body = await request.json();
    const parsed = uploadUrlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { doc_type, doc_date, pages, patient_id } = parsed.data;

    // Resolve target patient profile
    let targetPatientId = patient_id;
    if (targetPatientId) {
      const { data: verifiedPatient } = await supabase
        .from("patients")
        .select("id")
        .eq("id", targetPatientId)
        .eq("account_id", user.id)
        .maybeSingle();

      if (!verifiedPatient) {
        // Fallback check if it matches self user id
        if (targetPatientId !== user.id) {
          return NextResponse.json(
            { error: "Target patient profile not found in your account." },
            { status: 400 }
          );
        }
      }
    } else {
      const { data: selfPatient } = await supabase
        .from("patients")
        .select("id")
        .eq("account_id", user.id)
        .eq("is_self", true)
        .maybeSingle();

      targetPatientId = selfPatient?.id || user.id;
    }

    // 3. Create document record in Supabase
    // Note: status is 'uploaded' until Phase 3 extraction processes it
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        patient_id: targetPatientId,
        storage_path: "pending", // will update with base directory path
        doc_type,
        doc_date: doc_date?.trim() ? doc_date : null,
        status: "uploaded",
        page_count: pages.length,
      })
      .select("id")
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: `Failed to create document record: ${docError?.message}` },
        { status: 500 }
      );
    }

    const documentId = doc.id;
    // Requirement B.3: Storage paths become {account_id}/{patient_id}/{document_id}/page-n
    const documentBaseStoragePath = `${user.id}/${targetPatientId}/${documentId}`;

    // Update the storage_path
    await supabase
      .from("documents")
      .update({ storage_path: documentBaseStoragePath })
      .eq("id", documentId);

    // 4. Pre-create page rows
    const pageRows = pages.map((p, idx) => ({
      document_id: documentId,
      page_no: p.page_no || idx + 1,
    }));

    const { error: pagesError } = await supabase.from("pages").insert(pageRows);
    if (pagesError) {
      return NextResponse.json(
        { error: `Failed to create page entries: ${pagesError.message}` },
        { status: 500 }
      );
    }

    // 5. Generate signed upload URLs for each page
    // Signed upload URLs expire in 15 minutes, allowing direct browser-to-storage upload
    const uploadUrls = await Promise.all(
      pages.map(async (page, index) => {
        const pageNo = page.page_no || index + 1;
        const fileExt = page.file_name.split(".").pop()?.toLowerCase() || "jpg";
        const filePath = `${documentBaseStoragePath}/page-${pageNo}.${fileExt}`;

        const { data: signedData, error: signError } = await supabase.storage
          .from("medical-records")
          .createSignedUploadUrl(filePath);

        if (signError || !signedData) {
          throw new Error(
            signError?.message || `Failed to create signed URL for page ${pageNo}`
          );
        }

        return {
          page_no: pageNo,
          path: signedData.path,
          token: signedData.token,
          signedUrl: signedData.signedUrl,
        };
      })
    );

    return NextResponse.json({
      document_id: documentId,
      upload_urls: uploadUrls,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
