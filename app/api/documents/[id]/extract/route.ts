import { createClient } from "@/lib/supabase/server";
import { NextResponse, unstable_after as after } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { executeDocumentExtraction } from "@/lib/extraction/engine";

// Extend Vercel serverless function execution limit for extraction
export const maxDuration = 120;

/**
 * Enqueues document extraction as a durable background task and returns immediately.
 * Statuses: uploaded -> queued -> processing -> ready / failed
 */
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

    // 2. Verify Document Ownership
    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, status")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docErr || !document) {
      return NextResponse.json(
        { error: "Document not found or access denied." },
        { status: 404 }
      );
    }

    // 3. Mark document as 'queued' immediately
    await supabase
      .from("documents")
      .update({
        status: "queued",
        error_message: null,
      })
      .eq("id", documentId);

    // 4. If Inngest event key is present, broadcast event
    if (process.env.INNGEST_EVENT_KEY) {
      try {
        await inngest.send({
          name: "document/extract",
          data: {
            documentId,
            userId: user.id,
          },
        });
      } catch (inngestErr: any) {
        console.warn("[Inngest] Event queue warning:", inngestErr?.message || inngestErr);
      }
    }

    // 5. Always execute extraction in background via Next.js 15 after()
    // This guarantees the serverless container stays alive to process the document
    // and streams all execution logs to Vercel without blocking the HTTP response
    after(async () => {
      try {
        await executeDocumentExtraction(documentId, user.id);
      } catch (err: any) {
        console.error("[Background Extraction Error]", err?.message || err);
      }
    });

    // 6. Return immediately to the client
    return NextResponse.json({
      success: true,
      documentId,
      status: "queued",
      message: "We're reading your document. You can leave this page.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to enqueue document for extraction" },
      { status: 500 }
    );
  }
}
