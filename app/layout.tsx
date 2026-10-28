import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MedAnchor",
    template: "%s | MedAnchor",
  },
  description:
    "MedAnchor — Grounded Clinical Document Intelligence for Emergency Care & Advisories. Paper records, verified by the patient, ready when emergencies strike.",
  // Prevent search engines from indexing health data pages
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased font-sans"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
