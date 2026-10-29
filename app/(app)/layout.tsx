import { BottomNav } from "@/components/nav/BottomNav";
import { AppHeader } from "@/components/nav/AppHeader";

// Responsive Clinical Web Application Layout
// Styled with a clean, light ambient background mesh and subtle geometric micro-dot canvas
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col antialiased relative selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">
      {/* Ambient Background Decorative Canvas */}
      <div
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Soft Ambient Light Gradient Orbs */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[900px] h-[400px] bg-gradient-to-b from-teal-100/50 via-sky-100/30 to-transparent rounded-full blur-3xl opacity-80" />
        <div className="absolute top-24 right-[-5%] w-[480px] h-[480px] bg-teal-200/20 rounded-full blur-[110px]" />
        <div className="absolute top-72 left-[-8%] w-[440px] h-[440px] bg-indigo-100/25 rounded-full blur-[110px]" />
        <div className="absolute bottom-24 right-[10%] w-[420px] h-[420px] bg-emerald-100/25 rounded-full blur-[100px]" />

        {/* Delicate Micro-Dot Matrix Pattern */}
        <div
          className="absolute inset-0 opacity-[0.28]"
          style={{
            backgroundImage: `radial-gradient(#64748B 0.85px, transparent 0.85px)`,
            backgroundSize: "24px 24px",
          }}
        />

        {/* Subtle Edge Vignette */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#F8FAFC]/30 to-[#F8FAFC]/90" />
      </div>

      {/* Top Navigation Header */}
      <div className="relative z-40">
        <AppHeader />
      </div>

      {/* Main Content Container (relative z-10 floats smoothly above background) */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12">
        {children}
      </main>

      {/* Mobile Floating Bottom Dock (hidden on md+ screens) */}
      <div className="relative z-40">
        <BottomNav />
      </div>
    </div>
  );
}
