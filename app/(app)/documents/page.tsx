import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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

  // Read active patient ID from cookie, fallback to self patient
  const cookieStore = await cookies();
  const activePatientCookie = cookieStore.get("medanchor_active_patient_id")?.value;

  let activePatient = null;
  if (activePatientCookie) {
    const { data: p } = await supabase
      .from("patients")
      .select("id, full_name, relationship_label, is_self")
      .eq("id", activePatientCookie)
      .eq("account_id", user.id)
      .maybeSingle();
    activePatient = p;
  }

  if (!activePatient) {
    const { data: selfPatient } = await supabase
      .from("patients")
      .select("id, full_name, relationship_label, is_self")
      .eq("account_id", user.id)
      .eq("is_self", true)
      .maybeSingle();
    activePatient = selfPatient;
  }

  const patientId = activePatient?.id || user.id;

  // Fetch documents for the active patient profile, newest first
  const { data: documents } = await supabase
    .from("documents")
    .select("id, user_id, patient_id, storage_path, doc_type, doc_date, status, page_count, created_at")
    .eq("patient_id", patientId)
    .order("doc_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const typedDocs: DocumentSummary[] = (documents || []).map((d) => ({
    id: d.id,
    user_id: d.user_id,
    patient_id: d.patient_id,
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
          <h1 className="text-3xl sm:text-4xl font-serif font-normal tracking-tight text-slate-900">
            Medical Records
          </h1>
          <p className="text-xs text-slate-500 font-normal mt-1">
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
