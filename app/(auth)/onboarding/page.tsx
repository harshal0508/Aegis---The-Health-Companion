import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { Activity, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set up your profile | MedAnchor",
};

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 antialiased selection:bg-teal-100 selection:text-teal-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-500 text-white shadow-lg shadow-teal-600/20 mb-4 hover:scale-105 transition-transform">
          <Activity className="h-7 w-7" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl font-extrabold tracking-tight text-slate-900">
            MedAnchor
          </span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200/80 rounded-md">
            Clinical
          </span>
        </div>
        <h1 className="mt-3 text-lg font-bold text-slate-900">
          Set up your clinical profile
        </h1>
        <p className="mt-1 text-xs text-slate-500 font-medium">
          Personal identification &amp; emergency contact settings
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="apple-card p-6 sm:p-8 bg-white shadow-sm border border-slate-200/90">
          <OnboardingForm />
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/80 text-[11px] font-semibold text-slate-600 border border-slate-200/80">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
            <span>Encrypted At Rest &amp; In Transit</span>
          </div>
        </div>
      </div>
    </main>
  );
}
