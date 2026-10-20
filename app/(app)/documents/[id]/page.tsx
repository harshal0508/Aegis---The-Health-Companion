import { DocumentViewer } from "@/components/documents/DocumentViewer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Document Viewer",
};

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DocumentViewer documentId={id} />;
}
