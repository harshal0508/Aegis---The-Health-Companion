import { inngest } from "@/lib/inngest/client";
import { NonRetriableError } from "inngest";
import { executeDocumentExtraction } from "@/lib/extraction/engine";
import { createClient } from "@/lib/supabase/server";

export const extractDocumentFunction = inngest.createFunction(
  {
    id: "extract-document",
    name: "Extract Clinical Document",
    retries: 5,
    triggers: [{ event: "document/extract" }],
    onFailure: async ({ event, error }: any) => {
      const documentId = event?.data?.event?.data?.documentId;
      if (!documentId) return;
      try {
        const supabase = await createClient();
        await supabase
          .from("documents")
          .update({
            status: "failed",
            error_message:
              error?.message ||
              "Extraction could not complete after multiple scheduled attempts. Please click Retry.",
          })
          .eq("id", documentId);
      } catch {
        // Silently fail failure handler logging
      }
    },
  },
  async ({ event, step }: any) => {
    const { documentId, userId } = event.data;

    // Execute extraction in a durable step
    const result = await step.run("execute-extraction", async () => {
      const res = await executeDocumentExtraction(documentId, userId);
      if (!res.success) {
        const errorMsg = res.error || "Extraction failed.";

        // Don't retry on client or unrecoverable errors (400, 404, authorization, not found)
        const isNonRetriable =
          errorMsg.includes("400") ||
          errorMsg.includes("404") ||
          errorMsg.includes("not found") ||
          errorMsg.includes("Unauthorized") ||
          errorMsg.includes("Access denied");

        if (isNonRetriable) {
          throw new NonRetriableError(errorMsg);
        }

        // 503, 429, timeout, overload are retryable with growing delays
        throw new Error(errorMsg);
      }
      return res;
    });

    return result;
  }
);
