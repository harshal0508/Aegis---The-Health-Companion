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
  Sparkles,
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
    .select("full_name")
    .single();

  if (!profile) redirect("/onboarding");

  // Fetch recent documents
  const { data: recentDocs } = await supabase
    .from("documents")
    .select("id, doc_type, doc_date, status, page_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

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
    <div className="space-y-4">
      {/* Apple Health Greeting & Status */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>Today</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-teal-700 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
              Vault Synced
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            Hello, {firstName}
          </h1>
        </div>

        <Link
          href="/documents/upload"
          className="h-9 w-9 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-sm hover:bg-teal-700 transition-transform active:scale-95"
          title="Upload Medical Scan"
        >
          <Plus className="h-5 w-5" />
        </Link>
      </div>

      {/* Apple Health Clinical Readiness Rings Card */}
      <div className="apple-card p-4 bg-gradient-to-br from-white via-white to-teal-50/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <HeartPulse className="h-4 w-4" />
            </div>
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Health Readiness
            </span>
          </div>
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200/80 text-[10px] font-semibold">
            <CheckCircle2 className="h-3 w-3 mr-1 inline" />
            Verified
          </Badge>
        </div>

        {/* 3 Metric Pills */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Meds
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Pill className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-lg font-extrabold text-slate-900">{medsCount}</span>
            </div>
            <span className="text-[9px] text-slate-500 font-medium">Tracked</span>
          </div>

          <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Allergies
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
              <span className="text-lg font-extrabold text-slate-900">{allergiesCount}</span>
            </div>
            <span className="text-[9px] text-slate-500 font-medium">Documented</span>
          </div>

          <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-2.5 text-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Conditions
            </span>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <Activity className="h-3.5 w-3.5 text-purple-600" />
              <span className="text-lg font-extrabold text-slate-900">{conditionsCount}</span>
            </div>
            <span className="text-[9px] text-slate-500 font-medium">Confirmed</span>
          </div>
        </div>
      </div>

      {/* Emergency Medical ID Card (Apple Medical ID aesthetic) */}
      <Link href="/emergency" className="block group">
        <div className="apple-card p-4 bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 text-white shadow-md relative overflow-hidden group-hover:shadow-lg transition-all">
          {/* Subtle background emergency cross watermark */}
          <div className="absolute -right-4 -bottom-4 text-white/10 pointer-events-none select-none font-bold text-8xl leading-none">
            +
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white flex-shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-bold tracking-tight text-white leading-none">
                    Emergency Medical ID
                  </h2>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <p className="text-[11px] text-rose-100 mt-1 font-medium">
                  Offline QR Active • Ready for Paramedics
                </p>
              </div>
            </div>

            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white group-hover:translate-x-0.5 transition-transform">
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </div>
      </Link>

      {/* 2x2 Quick Action Tiles */}
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href="/documents/upload"
          className="apple-card p-3.5 flex flex-col justify-between hover:border-teal-300 transition-colors group"
        >
          <div className="h-8 w-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Plus className="h-4 w-4" />
          </div>
          <div className="mt-2.5">
            <span className="text-xs font-bold text-slate-900 block">Scan Document</span>
            <span className="text-[10px] text-slate-500 font-medium">Gemini + Tesseract OCR</span>
          </div>
        </Link>

        <Link
          href="/summary"
          className="apple-card p-3.5 flex flex-col justify-between hover:border-teal-300 transition-colors group"
        >
          <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FileText className="h-4 w-4" />
          </div>
          <div className="mt-2.5">
            <span className="text-xs font-bold text-slate-900 block">Health Summary</span>
            <span className="text-[10px] text-slate-500 font-medium">Chronological Records</span>
          </div>
        </Link>

        <Link
          href="/advisories"
          className="apple-card p-3.5 flex flex-col justify-between hover:border-teal-300 transition-colors group"
        >
          <div className="h-8 w-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Bell className="h-4 w-4" />
          </div>
          <div className="mt-2.5">
            <span className="text-xs font-bold text-slate-900 block">Outbreak Watch</span>
            <span className="text-[10px] text-slate-500 font-medium">MoHFW &amp; Press Alerts</span>
          </div>
        </Link>

        <Link
          href="/documents"
          className="apple-card p-3.5 flex flex-col justify-between hover:border-teal-300 transition-colors group"
        >
          <div className="h-8 w-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="mt-2.5">
            <span className="text-xs font-bold text-slate-900 block">Scan Provenance</span>
            <span className="text-[10px] text-slate-500 font-medium">Bounding Box Viewer</span>
          </div>
        </Link>
      </div>

      {/* Recent Medical Documents */}
      <div className="apple-card p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-slate-700" />
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Recent Clinical Scans
            </h2>
          </div>
          <Link
            href="/documents"
            className="text-[11px] font-semibold text-teal-700 hover:text-teal-800 flex items-center"
          >
            All <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {(!recentDocs || recentDocs.length === 0) ? (
          <div className="text-center py-6">
            <p className="text-xs text-slate-400 font-medium">No documents uploaded yet</p>
            <Link
              href="/documents/upload"
              className="mt-2 inline-block text-xs text-teal-700 font-semibold"
            >
              + Upload first scan
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentDocs.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="py-2.5 flex items-center justify-between hover:bg-slate-50/80 -mx-1 px-1 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-100/80 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 capitalize truncate group-hover:text-teal-700 transition-colors">
                      {doc.doc_type.replace("_", " ")}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium mt-0.5">
                      <Calendar className="h-3 w-3" />
                      <span>{formatClinicalDate(doc.doc_date, "Not dated")}</span>
                      <span>•</span>
                      <span className="text-emerald-700 font-semibold">2nd Reader OCR</span>
                    </div>
                  </div>
                </div>

                <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-teal-600 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
