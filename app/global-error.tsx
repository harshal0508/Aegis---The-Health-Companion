"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error digest:", error.digest);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
          <div className="text-center space-y-4 max-w-sm">
            <span className="text-2xl font-bold text-teal-600">MedRecord</span>
            <h1 className="text-xl font-semibold text-gray-900">
              Something went wrong
            </h1>
            <p className="text-base text-gray-600">
              We encountered an unexpected error. Your health data is safe.
            </p>
            <Button onClick={() => reset()} className="w-full">
              Try again
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
