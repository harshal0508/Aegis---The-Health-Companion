import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdvisoriesHub } from "@/components/advisories/AdvisoriesHub";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Health Advisories & References | Aegis",
  description:
    "Regional health advisory digest (demonstration) and official public health reference citations matching confirmed records.",
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
    <div className="space-y-4 pt-1">
      <AdvisoriesHub confirmedItems={confirmedItems || []} />
    </div>
  );
}
