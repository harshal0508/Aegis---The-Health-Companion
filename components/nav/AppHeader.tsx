"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, Activity, Wifi, Battery, Signal } from "lucide-react";

export function AppHeader() {
  const pathname = usePathname();

  // Show emergency action button unless already on the emergency page
  const isEmergencyPage = pathname === "/emergency";

  return (
    <header className="sticky top-0 z-40 w-full glass-header border-b border-slate-200/60 select-none">
      {/* Simulated Phone Status Bar (Visible on desktop frame) */}
      <div className="hidden sm:flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-semibold tracking-tight text-slate-800">
        <span className="tabular-nums">9:41</span>
        {/* Dynamic Island pill */}
        <div className="h-4 w-20 bg-slate-900 rounded-full mx-auto" />
        <div className="flex items-center gap-1.5 text-slate-700">
          <Signal className="h-3 w-3" />
          <Wifi className="h-3 w-3" />
          <Battery className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Main App Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 sm:px-5 sm:py-3">
        <Link href="/home" className="flex items-center gap-2.5 group">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
            <Activity className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-slate-900 leading-none">
                MedAnchor
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 bg-teal-50 text-teal-700 border border-teal-200/60 rounded">
                Clinical
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5">
              Patient-Owned PHR
            </p>
          </div>
        </Link>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {!isEmergencyPage && (
            <Link
              href="/emergency"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 hover:bg-rose-100 transition-colors shadow-2xs"
              title="One-Tap Emergency Medical Card"
            >
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600 animate-pulse" />
              <span>SOS</span>
            </Link>
          )}

          <Link
            href="/profile"
            className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200/80 text-slate-700 flex items-center justify-center font-semibold text-xs hover:border-teal-500 hover:text-teal-700 transition-colors"
            title="Profile & Settings"
          >
            P
          </Link>
        </div>
      </div>
    </header>
  );
}
