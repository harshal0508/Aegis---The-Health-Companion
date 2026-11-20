import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { downloadPageImageBuffer } from "@/lib/ocr/page-storage";

export const dynamic = "force-dynamic";

/**
 * Same-origin image proxy for document pages.
 * Ensures the browser and client workers can fetch and inspect page images
 * without CORS blocks or signed URL expiry issues.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const url = new URL(request.url);
    const pageNo = parseInt(url.searchParams.get("page_no") || "1", 10);

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("id, patient_id, storage_path")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      return NextResponse.json({ error: "Document not found or access denied" }, { status: 404 });
    }

    const imageResult = await downloadPageImageBuffer(supabase, user.id, document, pageNo);
    if (!imageResult) {
      return NextResponse.json({ error: "Page image not found" }, { status: 404 });
    }

    return new Response(new Uint8Array(imageResult.buffer), {
      status: 200,
      headers: {
        "Content-Type": imageResult.mimeType,
        "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": `inline; filename="${imageResult.filename}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
