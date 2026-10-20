import { OnboardingForm } from "@/components/auth/OnboardingForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set up your profile",
};

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-start bg-white px-4 py-10">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <span className="text-2xl font-bold tracking-tight text-teal-600">
            MedRecord
          </span>
          <h1 className="mt-3 text-xl font-semibold text-gray-900">
            Set up your profile
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            This takes about 2 minutes
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <OnboardingForm />
        </div>
      </div>
    </main>
  );
}
