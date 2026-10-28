"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FileText,
  FolderOpen,
  ShieldAlert,
  User,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Bottom navigation items matching MedAnchor pillars:
// Home → Summary → Alerts → Documents → Emergency → Profile
const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/summary", label: "Summary", icon: FileText },
  { href: "/advisories", label: "Alerts", icon: Bell },
  { href: "/documents", label: "Docs", icon: FolderOpen },
  { href: "/emergency", label: "Medical ID", icon: ShieldAlert },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    // Only visible on mobile/tablet viewports (< md). Desktop uses the top AppHeader.
    <div className="md:hidden fixed bottom-3 left-3 right-3 z-50 pointer-events-auto">
      <nav
        className="glass-dock border border-slate-200/90 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.15)] rounded-2xl px-2 py-1.5 flex items-center justify-between"
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/home" && pathname.startsWith(href + "/"));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center py-1.5 px-1 rounded-xl text-[10px] font-medium transition-all duration-200",
                isActive
                  ? "bg-teal-50 text-teal-800 font-semibold shadow-2xs"
                  : "text-slate-400 hover:text-slate-700"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-4 w-4 transition-transform duration-200",
                  isActive
                    ? "text-teal-700 scale-110"
                    : "text-slate-400"
                )}
                aria-hidden="true"
              />
              <span className="mt-0.5 leading-none tracking-tight">{label}</span>
              {isActive && (
                <span className="absolute -bottom-0.5 h-1 w-3 bg-teal-600 rounded-full" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
