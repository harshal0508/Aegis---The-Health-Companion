import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocumentsList, type DocumentSummary } from "@/components/documents/DocumentsList";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Documents",
};

export default async function DocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch documents for the authenticated user, newest first
  const { data: documents } = await supabase
    .from("documents")
    .select("id, user_id, storage_path, doc_type, doc_date, status, page_count, created_at")
    .eq("user_id", user.id)
    .order("doc_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const typedDocs: DocumentSummary[] = (documents || []).map((d) => ({
    id: d.id,
    user_id: d.user_id,
    storage_path: d.storage_path,
    doc_type: d.doc_type || "other",
    doc_date: d.doc_date,
    status: d.status as any,
    page_count: d.page_count,
    created_at: d.created_at,
  }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your uploaded records, discharge summaries, and prescriptions
          </p>
        </div>
        <Link href="/documents/upload">
          <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 h-10 shadow-sm">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add document</span>
            <span className="sm:hidden">Upload</span>
          </Button>
        </Link>
      </div>

      <DocumentsList initialDocuments={typedDocs} />
    </div>
  );
}
