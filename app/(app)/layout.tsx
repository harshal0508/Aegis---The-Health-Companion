import { BottomNav } from "@/components/nav/BottomNav";

// App shell layout — wraps all authenticated routes.
// The bottom nav height (64px = h-16) requires pb-20 on main content
// so nothing is hidden behind the nav bar.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-white">
      <main className="pb-20">{children}</main>
      <BottomNav />
    </div>
  );
}
