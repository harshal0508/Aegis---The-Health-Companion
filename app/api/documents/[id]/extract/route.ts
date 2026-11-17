import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
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
    // eslint-disable-next-line no-console
    console.log(`[Extract Route] POST /api/documents/${documentId}/extract received`);
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

    // 3. Dual Execution Pipeline:
    // When Inngest Cloud is configured, enqueue to durable background worker and return immediately.
    // When Inngest Cloud is not yet configured, execute directly with maxDuration=120 so Vercel Serverless
    // does not terminate/freeze the container prematurely and streams logs in real-time.
    if (process.env.INNGEST_EVENT_KEY) {
      await supabase
        .from("documents")
        .update({
          status: "queued",
          error_message: null,
        })
        .eq("id", documentId);

      try {
        await inngest.send({
          name: "document/extract",
          data: {
            documentId,
            userId: user.id,
          },
        });
        // eslint-disable-next-line no-console
        console.log(`[Extract Route] Enqueued document ${documentId} to Inngest background queue`);
      } catch (inngestErr: any) {
        console.warn("[Inngest] Event queue warning:", inngestErr?.message || inngestErr);
      }

      return NextResponse.json({
        success: true,
        documentId,
        status: "queued",
        message: "We're reading your document. You can leave this page.",
      });
    }

    // Direct Synchronous Execution Path on Serverless (Guarantees execution & live logs):
    // eslint-disable-next-line no-console
    console.log(`[Extract Route] Inngest queue not configured; running extraction directly with maxDuration=120 for documentId=${documentId}`);
    const result = await executeDocumentExtraction(documentId, user.id);
    // eslint-disable-next-line no-console
    console.log(`[Extract Route] Extraction completed for ${documentId}: status=${result.status}`);

    return NextResponse.json({
      success: result.success,
      documentId,
      status: result.status,
      summary: result.summary,
      message: result.status === "ready" ? "Extraction completed successfully." : result.error,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to enqueue document for extraction" },
      { status: 500 }
    );
  }
}
