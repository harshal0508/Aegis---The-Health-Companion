import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdvisoriesHub } from "@/components/advisories/AdvisoriesHub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Health Advisories & Precautions | MedAnchor",
  description:
    "Real-time local disease surveillance and personalized medical precautions matched to your confirmed records.",
};

export default async function AdvisoriesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Fetch user's confirmed clinical items (conditions and allergies) to personalize precautions
  const { data: confirmedItems } = await supabase
    .from("items")
    .select("category, value")
    .eq("user_id", user.id)
    .eq("status", "confirmed")
    .in("category", ["condition", "allergy"]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <AdvisoriesHub confirmedItems={confirmedItems || []} />
    </div>
  );
}
