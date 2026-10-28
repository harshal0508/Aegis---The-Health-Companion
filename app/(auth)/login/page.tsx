import { LoginForm } from "@/components/auth/LoginForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Text logo — no graphic, clinical feel */}
        <div className="text-center">
          <span className="text-3xl font-bold tracking-tight text-teal-600">
            MedAnchor
          </span>
          <p className="mt-2 text-base text-muted-foreground">
            Grounded clinical document intelligence
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="mb-6 text-xl font-semibold text-gray-900">
            Welcome to MedAnchor
          </h1>
          <LoginForm />
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <a
            href="mailto:support@medrecord.app"
            className="text-teal-600 underline underline-offset-4"
          >
            Contact support
          </a>
        </p>
      </div>
    </main>
  );
}
