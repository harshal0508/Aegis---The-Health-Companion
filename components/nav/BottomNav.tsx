"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FileText,
  FolderOpen,
  ShieldAlert,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Bottom navigation order is fixed per design spec:
// Home → Summary → Documents → Emergency → Profile
const NAV_ITEMS = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/summary", label: "Summary", icon: FileText },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/emergency", label: "Emergency", icon: ShieldAlert },
  { href: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    // pb-safe-area ensures nav stays above the iOS home indicator
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-safe"
      aria-label="Main navigation"
    >
      <div className="flex h-16 items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-[13px] font-medium transition-colors",
                isActive
                  ? "text-teal-600"
                  : "text-gray-400 hover:text-gray-600"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-5 w-5",
                  // Emergency icon uses gray — NOT red per design spec
                  // Red is reserved exclusively for allergy items
                  isActive ? "text-teal-600" : "text-gray-400"
                )}
                aria-hidden="true"
              />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
