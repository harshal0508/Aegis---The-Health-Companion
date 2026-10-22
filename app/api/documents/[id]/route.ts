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
    // Files are located in the private storage bucket under {user_id}/{document_id}/
    const { data: storageFiles } = await supabase.storage
      .from("medical-records")
      .list(`${user.id}/${documentId}`);

    const pagesWithUrls = await Promise.all(
      (pages || []).map(async (page) => {
        // Find matching file in storage (e.g. page-1.jpg or page-1.pdf)
        const prefix = `page-${page.page_no}.`;
        const matchedFile = storageFiles?.find((f) => f.name.startsWith(prefix));
        const filename = matchedFile?.name || `page-${page.page_no}.jpg`;
        const fullPath = `${user.id}/${documentId}/${filename}`;

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

    return NextResponse.json({
      document,
      pages: pagesWithUrls,
      items: documentItems,
    });
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
      .select("id, storage_path")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 2. Remove files from storage
    const { data: files } = await supabase.storage
      .from("medical-records")
      .list(`${user.id}/${documentId}`);

    if (files && files.length > 0) {
      const pathsToDelete = files.map((f) => `${user.id}/${documentId}/${f.name}`);
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
