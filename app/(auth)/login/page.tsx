import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";
import { ShieldCheck, Lock } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Aegis",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 antialiased selection:bg-teal-100 selection:text-teal-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo & Header */}
        <div className="inline-flex items-center justify-center h-14 w-14 mb-4 hover:scale-105 transition-transform">
          <Image
            src="/images/aegis-icon.png"
            alt="Aegis Logo"
            width={56}
            height={56}
            className="h-14 w-14 object-contain"
            priority
          />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          Aegis
        </h1>
        <p className="text-xs text-slate-500 font-medium mt-1.5">
          Patient-Owned Personal Health Record &amp; Document Intelligence
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="apple-card p-6 sm:p-8 bg-white shadow-sm border border-slate-200/90">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Lock className="h-3.5 w-3.5 text-teal-600" />
            <span>Secure Patient Access</span>
          </div>
          <LoginForm />
        </div>

        {/* Clinical Trust & Guarantees */}
        <div className="mt-6 text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/80 text-[11px] font-semibold text-slate-600 border border-slate-200/80">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
            <span>Client-First • Dual-Engine Grounded Intelligence</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Every clinical extraction is verified with second-reader OCR and verbatim quotes.
          </p>
        </div>
      </div>
    </div>
  );
}
