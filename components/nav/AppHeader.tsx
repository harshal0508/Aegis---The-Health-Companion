"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldAlert,
  Activity,
  Home,
  FileText,
  FolderOpen,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileSwitcher } from "@/components/patient/ProfileSwitcher";

const NAV_LINKS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/summary", label: "Summary", icon: FileText },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/advisories", label: "Outbreak Watch", icon: Bell },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const isEmergencyPage = pathname === "/emergency";

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs select-none">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Brand Logo - Clean Single-Line */}
        <Link href="/home" className="flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
            <Activity className="h-5 w-5" />
          </div>
          <span className="font-extrabold text-base tracking-tight text-slate-900 leading-none">
            MedAnchor
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5" aria-label="Desktop navigation">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || (href !== "/home" && pathname.startsWith(href + "/"));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all",
                  isActive
                    ? "bg-teal-50 text-teal-800 border border-teal-200/80 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <ProfileSwitcher />

          <Link
            href="/emergency"
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-2xs",
              isEmergencyPage
                ? "bg-rose-100 text-rose-800 border border-rose-300 ring-2 ring-rose-500/20"
                : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
            )}
            title="One-Tap Emergency Medical Card"
          >
            <ShieldAlert className="h-4 w-4 text-rose-600 animate-pulse" />
            <span>SOS Medical ID</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
