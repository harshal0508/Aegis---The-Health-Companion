"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Error boundary for unexpected runtime errors.
// Health data is never shown in error messages to prevent accidental exposure.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error monitoring service in Phase 6 (Sentry)
    // Do NOT log error.message — it may contain health-related context
    console.error("App error digest:", error.digest);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="text-center space-y-4 max-w-sm">
        <span className="text-2xl font-bold text-teal-600">MedRecord</span>
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h1>
        <p className="text-base text-muted-foreground">
          We encountered an unexpected issue. Your data is safe.
        </p>
        <Button onClick={reset} className="w-full">
          Try again
        </Button>
      </div>
    </main>
  );
}
