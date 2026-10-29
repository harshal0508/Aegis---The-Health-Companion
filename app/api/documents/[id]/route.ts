import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch document record (RLS ensures user can only fetch their own)
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json(
        { error: "Document not found or access denied" },
        { status: 404 }
      );
    }

    // 3. Fetch pages
    const { data: pages, error: pagesError } = await supabase
      .from("pages")
      .select("id, page_no, ocr_text")
      .eq("document_id", documentId)
      .order("page_no", { ascending: true });

    if (pagesError) {
      return NextResponse.json(
        { error: "Failed to fetch document pages" },
        { status: 500 }
      );
    }

    // 4. Fetch associated items
    const { data: items } = await supabase
      .from("items")
      .select("id, category, value, quote, confidence, status, source, page_id, ocr_check, review_reason")
      .eq("user_id", user.id);

    // Filter items related to this document's pages
    const pageIdSet = new Set((pages || []).map((p) => p.id));
    const documentItems = (items || []).filter((item) =>
      item.page_id ? pageIdSet.has(item.page_id) : false
    );

    // 5. Generate signed read URLs for each page (valid for 15 minutes)
    // Files are located in the private storage bucket under {account_id}/{patient_id}/{document_id}/ or legacy {user_id}/{document_id}/
    const patientFolder = document.patient_id ? `${user.id}/${document.patient_id}/${documentId}` : null;
    const legacyFolder = `${user.id}/${documentId}`;

    let storageFolder = patientFolder || legacyFolder;
    let { data: storageFiles } = await supabase.storage
      .from("medical-records")
      .list(storageFolder);

    if (!storageFiles || storageFiles.length === 0) {
      if (patientFolder) {
        const { data: legacyFiles } = await supabase.storage
          .from("medical-records")
          .list(legacyFolder);
        if (legacyFiles && legacyFiles.length > 0) {
          storageFolder = legacyFolder;
          storageFiles = legacyFiles;
        }
      }
    }

    const pagesWithUrls = await Promise.all(
      (pages || []).map(async (page) => {
        // Find matching file in storage (e.g. page-1.jpg or page-1.pdf)
        const prefix = `page-${page.page_no}.`;
        const matchedFile = storageFiles?.find((f) => f.name.startsWith(prefix));
        const filename = matchedFile?.name || `page-${page.page_no}.jpg`;
        const fullPath = `${storageFolder}/${filename}`;

        const { data: signedUrlData } = await supabase.storage
          .from("medical-records")
          .createSignedUrl(fullPath, 60 * 15); // 15 mins expiry

        return {
          id: page.id,
          page_no: page.page_no,
          ocr_text: page.ocr_text,
          signed_url: signedUrlData?.signedUrl || null,
          is_pdf: filename.toLowerCase().endsWith(".pdf"),
        };
      })
    );

    return NextResponse.json(
      {
        document,
        pages: pagesWithUrls,
        items: documentItems,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
        },
      }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Verify ownership
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, patient_id, storage_path")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 2. Remove files from storage (clean up both patient prefix and legacy prefix)
    const prefixes = [
      document.patient_id ? `${user.id}/${document.patient_id}/${documentId}` : null,
      `${user.id}/${documentId}`,
    ].filter(Boolean) as string[];

    const pathsToDelete: string[] = [];
    for (const prefix of prefixes) {
      const { data: files } = await supabase.storage
        .from("medical-records")
        .list(prefix);
      if (files && files.length > 0) {
        files.forEach((f) => pathsToDelete.push(`${prefix}/${f.name}`));
      }
    }

    if (pathsToDelete.length > 0) {
      await supabase.storage.from("medical-records").remove(pathsToDelete);
    }

    // 3. Delete document row from DB (cascade deletes pages and disassociates items)
    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
