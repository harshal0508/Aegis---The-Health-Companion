import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdvisoriesHub } from "@/components/advisories/AdvisoriesHub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Local Outbreak Radar | Aegis",
  description:
    "Real-time regional media disease surveillance and outbreak monitoring across Indian districts.",
};

export default async function AdvisoriesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="space-y-4 pt-1">
      <AdvisoriesHub />
    </div>
  );
}
