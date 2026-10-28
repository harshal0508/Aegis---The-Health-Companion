import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, FileText, ChevronRight, Upload, ShieldCheck, Clock, Calendar, Bell, MapPin, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatClinicalDate } from "@/lib/utils";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Home",
};

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .single();

  if (!profile) redirect("/onboarding");

  // Fetch recent documents
  const { data: recentDocs } = await supabase
    .from("documents")
    .select("id, doc_type, doc_date, status, page_count, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(3);

  // Fetch critical items counts for Emergency Readiness & Personalized Advisories
  const { data: confirmedItems } = await supabase
    .from("items")
    .select("id, category, value")
    .eq("user_id", user.id)
    .eq("status", "confirmed");

  const confirmedConditions = (confirmedItems || []).filter(
    (i) => i.category === "condition" || i.category === "allergy"
  );

  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Greeting Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Hello, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your patient-owned health records are private.
          </p>
        </div>
        <Link href="/documents/upload">
          <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Add document
          </Button>
        </Link>
      </div>

      {/* Emergency Card Readiness */}
      <Card className="border-teal-100 bg-teal-50/40 shadow-sm">
        <CardContent className="p-5 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Emergency Health Card
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(confirmedItems?.length ?? 0) > 0
                  ? `${confirmedItems?.length} critical items confirmed for your emergency card.`
                  : "No clinical records confirmed yet. Upload medical files to verify allergies and medications."}
              </p>
            </div>
          </div>
          <Link href="/emergency">
            <Button variant="outline" size="sm" className="bg-white border-teal-200 text-teal-700 hover:bg-teal-50 text-xs">
              View Emergency Card
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Local Health Advisories & Outbreak Intelligence (Tier 04) */}
      <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
        <CardContent className="p-5 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
          <div className="flex items-start gap-3.5">
            <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">
                  Local Health Advisories
                </h2>
                <Badge className="bg-rose-600 text-white text-[10px] uppercase font-bold py-0">
                  Active Notice
                </Badge>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Seasonal Dengue spike &amp; viral respiratory notices active in your region (Bhopal / Central India).
                {confirmedConditions.length > 0 && (
                  <span className="text-teal-700 font-medium">
                    {" "}Matched with precautions for your confirmed {confirmedConditions[0].value}.
                  </span>
                )}
              </p>
            </div>
          </div>
          <Link href="/advisories">
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-xs whitespace-nowrap">
              View Outbreaks &amp; Precautions
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Recent Documents Section */}
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg font-bold">Recent Records</CardTitle>
          <Link
            href="/documents"
            className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
          >
            View all <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          {(!recentDocs || recentDocs.length === 0) ? (
            <div className="text-center py-8 space-y-3">
              <div className="h-10 w-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm text-muted-foreground">
                No medical documents uploaded yet.
              </p>
              <Link href="/documents/upload" className="inline-block">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  Upload your first record
                </Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {recentDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  className="py-3 flex items-center justify-between hover:bg-gray-50/80 -mx-2 px-2 rounded-lg transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0 border border-teal-100">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 capitalize truncate group-hover:text-teal-700 transition-colors">
                        {doc.doc_type.replace("_", " ")}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-teal-600" />
                          <span>Doc: {formatClinicalDate(doc.doc_date, "Not set")}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>Uploaded: {formatClinicalDate(doc.created_at)}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 capitalize bg-gray-100 text-gray-700"
                    >
                      {doc.status}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-teal-600 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
