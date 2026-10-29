"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  ShieldAlert,
  Home,
  FileText,
  FolderOpen,
  Bell,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfileSwitcher } from "@/components/patient/ProfileSwitcher";

const NAV_LINKS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/summary", label: "Health Summary", icon: FileText },
  { href: "/advisories", label: "Alerts", icon: Bell },
  { href: "/documents", label: "Documents", icon: FolderOpen },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const isEmergencyPage = pathname === "/emergency";

  return (
    <header className="sticky top-0 z-40 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-2xs select-none">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Brand Logo */}
        <Link href="/home" className="flex items-center group py-0.5" aria-label="Aegis Home">
          <Image
            src="/images/aegis-logo.png"
            alt="Aegis - Patient-Owned Health Platform"
            width={140}
            height={52}
            className="h-11 sm:h-12 md:h-[48px] w-auto object-contain transition-transform group-hover:scale-[1.02]"
            priority
          />
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
                  "px-4 py-2 rounded-full text-sm transition-all",
                  isActive
                    ? "bg-teal-50 text-teal-800 font-semibold border border-teal-200/80 shadow-2xs"
                    : "text-slate-600 font-medium hover:text-slate-900 hover:bg-slate-100/70"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <ProfileSwitcher />

          <Link
            href="/emergency"
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all shadow-2xs",
              isEmergencyPage
                ? "bg-rose-100 text-rose-800 border border-rose-300 ring-2 ring-rose-500/20"
                : "bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
            )}
            title="Emergency Medical ID"
          >
            <ShieldAlert className="h-4 w-4 text-rose-600 animate-pulse" />
            <span>Emergency Medical ID</span>
          </Link>

          <Link
            href="/profile"
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs transition-colors border",
              pathname === "/profile"
                ? "bg-teal-50 text-teal-800 border-teal-300"
                : "bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300 hover:text-slate-900"
            )}
            title="Profile & Settings"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
