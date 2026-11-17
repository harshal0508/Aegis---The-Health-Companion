import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { extractDocumentFunction } from "@/lib/inngest/functions/extract-document";

// Inngest serve handler for Next.js App Router
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [extractDocumentFunction],
});
