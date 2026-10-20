import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
};

// Global 404 page — also handles the invalid /e/[token] case
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="text-center space-y-4">
        <span className="text-4xl font-bold text-teal-600">MedRecord</span>
        <h1 className="text-2xl font-semibold text-gray-900">
          Page not found
        </h1>
        <p className="text-base text-muted-foreground max-w-xs">
          This link may have expired or does not exist.
        </p>
        <Link
          href="/home"
          className="inline-block mt-4 text-base font-medium text-teal-600 underline underline-offset-4"
        >
          Go to home
        </Link>
      </div>
    </main>
  );
}
