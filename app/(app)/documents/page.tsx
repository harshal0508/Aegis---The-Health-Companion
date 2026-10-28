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
    <div className="space-y-4 pt-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Medical Records
          </h1>
          <p className="text-[11px] text-slate-500 font-medium">
            Scans, discharge summaries, and prescriptions
          </p>
        </div>
        <Link href="/documents/upload">
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5 h-8 px-3 rounded-full text-xs font-semibold shadow-xs">
            <Plus className="h-3.5 w-3.5" />
            <span>Upload</span>
          </Button>
        </Link>
      </div>

      <DocumentsList initialDocuments={typedDocs} />
    </div>
  );
}
