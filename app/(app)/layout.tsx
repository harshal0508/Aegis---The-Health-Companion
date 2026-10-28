import { BottomNav } from "@/components/nav/BottomNav";
import { AppHeader } from "@/components/nav/AppHeader";

// Mobile-First Centered App Shell Layout
// On desktop: Renders inside a sleek, centered smartphone canvas with soft ambient backdrop.
// On mobile: Expands to full-bleed native viewport with safe-area insets.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 flex flex-col items-center justify-center p-0 sm:py-4 sm:px-4 antialiased select-auto">
      {/* Centered Smartphone Canvas */}
      <div className="relative w-full max-w-[440px] h-screen sm:h-[880px] sm:max-h-[95vh] bg-[#F8FAFC] sm:rounded-[44px] sm:border-[7px] sm:border-slate-800/90 sm:shadow-[0_25px_80px_-15px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.1)] flex flex-col overflow-hidden">
        {/* Sticky Top Header */}
        <AppHeader />

        {/* Scrollable Main Content Area */}
        <main className="flex-1 overflow-y-auto no-scrollbar pb-24 px-4 py-4 sm:px-4 sm:py-4 relative">
          {children}
        </main>

        {/* Floating Frosted Glass Bottom Dock */}
        <BottomNav />
      </div>

      {/* Desktop Ambient Brand Footer */}
      <div className="hidden sm:flex items-center gap-2 mt-3 text-[11px] text-slate-400 font-medium tracking-tight">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
        <span>MedAnchor Clinical Platform</span>
        <span>•</span>
        <span>Dual-Reader Grounded Architecture</span>
      </div>
    </div>
  );
}
