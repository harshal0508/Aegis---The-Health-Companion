import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  FileText,
  ChevronRight,
  ShieldAlert,
  Calendar,
  Bell,
  Activity,
  HeartPulse,
  Pill,
  FolderOpen,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatClinicalDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, blood_group, emergency_contact_name, emergency_contact_phone")
    .single();

  if (!profile) redirect("/onboarding");

  // Fetch recent documents
  const { data: recentDocs } = await supabase
    .from("documents")
    .select("id, doc_type, doc_date, status, page_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(4);

  // Fetch critical items counts for Emergency Readiness & Health Rings
  const { data: confirmedItems } = await supabase
    .from("items")
    .select("id, category, value")
    .eq("user_id", user.id)
    .eq("status", "confirmed");

  const medsCount = (confirmedItems || []).filter((i) => i.category === "medication").length;
  const allergiesCount = (confirmedItems || []).filter((i) => i.category === "allergy").length;
  const conditionsCount = (confirmedItems || []).filter((i) => i.category === "condition").length;

  const firstName = profile.full_name ? profile.full_name.split(" ")[0] : "Patient";

  return (
    <div className="space-y-6">
      {/* Clean Greeting Header (removed vault/encryption badge) */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Good evening, {firstName}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Your patient-owned health records and emergency readiness
          </p>
        </div>

        <Link
          href="/documents/upload"
          className="h-10 px-4 rounded-full bg-teal-600 text-white flex items-center gap-1.5 text-xs font-semibold shadow-xs hover:bg-teal-700 transition-all active:scale-95"
          title="Upload Medical Scan"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add Scan</span>
        </Link>
      </div>

      {/* 1. Clinical Readiness Card (Enlarged & Centered across full container) */}
      <div className="apple-card p-6 sm:p-7 bg-gradient-to-br from-white via-white to-teal-50/25">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center shadow-2xs">
              <HeartPulse className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 uppercase tracking-wider block">
                  Clinical Readiness
                </span>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                Confirmed medical status across records
              </span>
            </div>
          </div>
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200/80 text-xs font-semibold px-2.5 py-1">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 inline" />
            Active
          </Badge>
        </div>

        {/* 3 Metric Pills — Large & Spacious */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
          <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 sm:p-5 transition-all hover:bg-white hover:shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Meds
              </span>
              <div className="h-7 w-7 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Pill className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {medsCount}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Tracked</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Active prescriptions confirmed
            </p>
          </div>

          <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 sm:p-5 transition-all hover:bg-white hover:shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Allergies
              </span>
              <div className="h-7 w-7 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {allergiesCount}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Documented</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Adverse reaction alerts
            </p>
          </div>

          <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-4 sm:p-5 transition-all hover:bg-white hover:shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Conditions
              </span>
              <div className="h-7 w-7 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                {conditionsCount}
              </span>
              <span className="text-xs text-slate-500 font-semibold">Confirmed</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Chronic &amp; acute diagnoses
            </p>
          </div>
        </div>
      </div>

      {/* 2. Emergency Medical ID Card (Helpful, Patient-Focused Emergency Content) */}
      <Link href="/emergency" className="block group">
        <div className="apple-card p-5 sm:p-6 bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 text-white shadow-md relative overflow-hidden group-hover:shadow-lg transition-all">
          {/* Subtle background emergency cross watermark */}
          <div className="absolute -right-4 -bottom-10 text-white/10 pointer-events-none select-none font-bold text-[180px] leading-none">
            +
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform shadow-inner">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight">
                  Emergency Medical ID
                </h2>
                <p className="text-xs sm:text-sm text-rose-100 mt-1 font-medium max-w-xl leading-relaxed">
                  Instant scan for paramedics and ER doctors — shows your blood group, confirmed allergies, and emergency contact phone without requiring a login.
                </p>
              </div>
            </div>

            <div className="flex items-center self-end sm:self-center">
              <span className="px-4 py-2 rounded-full bg-white text-rose-700 text-xs font-bold shadow-sm group-hover:bg-rose-50 flex items-center gap-1.5 transition-colors">
                <span>Open Medical ID</span>
                <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* 3. The 4 Quick Action Boxes (Renamed Scan Provenance to Medical Records) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        <Link
          href="/documents/upload"
          className="apple-card apple-card-hover p-4 sm:p-5 flex flex-col justify-between group"
        >
          <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-700 border border-teal-100 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Plus className="h-5 w-5" />
          </div>
          <div className="mt-4">
            <span className="text-xs sm:text-sm font-bold text-slate-900 block group-hover:text-teal-700 transition-colors">
              Scan Document
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              Upload Prescriptions &amp; Reports
            </span>
          </div>
        </Link>

        <Link
          href="/summary"
          className="apple-card apple-card-hover p-4 sm:p-5 flex flex-col justify-between group"
        >
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FileText className="h-5 w-5" />
          </div>
          <div className="mt-4">
            <span className="text-xs sm:text-sm font-bold text-slate-900 block group-hover:text-blue-700 transition-colors">
              Health Summary
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              Chronological Records
            </span>
          </div>
        </Link>

        <Link
          href="/advisories"
          className="apple-card apple-card-hover p-4 sm:p-5 flex flex-col justify-between group"
        >
          <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Bell className="h-5 w-5" />
          </div>
          <div className="mt-4">
            <span className="text-xs sm:text-sm font-bold text-slate-900 block group-hover:text-amber-700 transition-colors">
              Outbreak Watch
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              MoHFW &amp; Press Alerts
            </span>
          </div>
        </Link>

        <Link
          href="/documents"
          className="apple-card apple-card-hover p-4 sm:p-5 flex flex-col justify-between group"
        >
          <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FolderOpen className="h-5 w-5" />
          </div>
          <div className="mt-4">
            <span className="text-xs sm:text-sm font-bold text-slate-900 block group-hover:text-purple-700 transition-colors">
              Medical Records
            </span>
            <span className="text-[11px] text-slate-500 font-medium mt-0.5 block">
              Original Scans &amp; Reports
            </span>
          </div>
        </Link>
      </div>

      {/* 4. Recent Clinical Scans (Full Width) */}
      <div className="apple-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider">
                Recent Clinical Scans
              </h2>
              <p className="text-[11px] text-slate-400 font-medium">
                Digitized hospital documents and verified quotes
              </p>
            </div>
          </div>
          <Link
            href="/documents"
            className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1 group"
          >
            <span>View all</span>
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        {(!recentDocs || recentDocs.length === 0) ? (
          <div className="text-center py-8">
            <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-2">
              <FileText className="h-5 w-5" />
            </div>
            <p className="text-xs text-slate-500 font-medium">No documents uploaded yet</p>
            <Link
              href="/documents/upload"
              className="mt-2 inline-flex items-center gap-1 text-xs text-teal-700 font-semibold hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Upload your first scan
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentDocs.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="py-3 sm:py-3.5 flex items-center justify-between hover:bg-slate-50/80 -mx-2 px-3 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-teal-50 text-teal-700 border border-teal-100/80 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-slate-900 capitalize truncate group-hover:text-teal-700 transition-colors">
                      {doc.doc_type.replace("_", " ")}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatClinicalDate(doc.doc_date, "Not dated")}</span>
                      </span>
                      <span>•</span>
                      <span className="text-emerald-700 font-semibold flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Dual-Reader Verified
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline-block text-[11px] text-slate-400 font-medium group-hover:text-teal-600 transition-colors">
                    Review Record
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
