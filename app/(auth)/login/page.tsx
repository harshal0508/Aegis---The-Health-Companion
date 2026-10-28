import { LoginForm } from "@/components/auth/LoginForm";
import { Activity, ShieldCheck, Lock } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | MedAnchor",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 flex flex-col items-center justify-center p-0 sm:py-6 sm:px-4 antialiased">
      {/* Centered Smartphone Canvas */}
      <div className="relative w-full max-w-[440px] min-h-screen sm:min-h-0 sm:h-[880px] sm:max-h-[95vh] bg-[#F8FAFC] sm:rounded-[44px] sm:border-[7px] sm:border-slate-800/90 sm:shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.1)] flex flex-col justify-between overflow-y-auto no-scrollbar p-6">
        {/* Top Branding Section */}
        <div className="text-center pt-8 sm:pt-4">
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-teal-600/20 mx-auto mb-3">
            <Activity className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            MedAnchor
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Grounded Clinical Document Intelligence
          </p>
        </div>

        {/* Login Card */}
        <div className="apple-card p-5 my-6 bg-white shadow-md">
          <div className="flex items-center gap-2 mb-4 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Lock className="h-3.5 w-3.5 text-teal-600" />
            <span>Secure Patient Access</span>
          </div>
          <LoginForm />
        </div>

        {/* Bottom Clinical Trust Guarantee */}
        <div className="text-center pb-6 sm:pb-2 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 border border-slate-200">
            <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
            <span>Patient-Owned • Zero AI Cloud PHI Leak</span>
          </div>
          <p className="text-[10px] text-slate-400">
            Compliant with clinical document grounding standards
          </p>
        </div>
      </div>
    </div>
  );
}
