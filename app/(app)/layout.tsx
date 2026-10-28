import { BottomNav } from "@/components/nav/BottomNav";
import { AppHeader } from "@/components/nav/AppHeader";

// Responsive Clinical Web Application Layout
// On Desktop: Elegant top navigation bar with spacious, readable canvas.
// On Mobile: Compact header with bottom floating pill dock.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col antialiased">
      {/* Top Navigation Header */}
      <AppHeader />

      {/* Main Content Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12">
        {children}
      </main>

      {/* Mobile Floating Bottom Dock (hidden on md+ screens) */}
      <BottomNav />
    </div>
  );
}
