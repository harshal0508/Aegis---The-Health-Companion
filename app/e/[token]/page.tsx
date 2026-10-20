import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, AlertTriangle, Phone, Activity, Pill, Scissors, Cpu, Heart } from "lucide-react";
import { hashEmergencyToken, hashIpAddress, checkEmergencyRateLimit } from "@/lib/emergency/token";
import { isValidEmergencyToken, formatAllergyItem } from "@/lib/emergency/sanitizer";
import { formatClinicalDate, getDateAge } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Emergency Medical Information",
  description: "Emergency medical information for first responders",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

interface ResponderItem {
  id: string;
  category: string;
  value: string;
  doc_type?: string | null;
  doc_date?: string | null;
  doc_date_type?: string | null;
}

export default async function EmergencyCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!isValidEmergencyToken(token)) {
    notFound();
  }

  // 1. Rate Limiting by Client IP hash (30 requests/min)
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const rawIp = forwardedFor ? forwardedFor.split(",")[0].trim() : headerList.get("x-real-ip") || "127.0.0.1";
  const userAgent = headerList.get("user-agent") || "unknown";
  const ipHash = hashIpAddress(rawIp);

  const { allowed } = checkEmergencyRateLimit(ipHash);
  if (!allowed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border rounded-xl p-6 max-w-sm text-center space-y-2 shadow-sm">
          <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
          <h1 className="text-base font-bold text-gray-900">Too Many Requests</h1>
          <p className="text-xs text-gray-500">
            Rate limit exceeded for emergency card access. Please retry in a few moments.
          </p>
        </div>
      </main>
    );
  }

  // 2. Hash token and look up active emergency card using Service Role
  // Service role is required because the responder is unauthenticated (no login)
  const tokenHash = hashEmergencyToken(token);
  const supabase = await createClient(true);

  const { data: card, error: cardErr } = await supabase
    .from("emergency_cards")
    .select("id, visible_categories, active, user_id, created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  // Rule: Return the same generic "not found" for invalid, disabled and unknown tokens
  if (cardErr || !card || card.active !== true) {
    notFound();
  }

  // 3. Log access audit trail server-side (fire & forget to avoid slowing responder)
  void supabase.from("access_log").insert({
    card_id: card.id,
    accessed_at: new Date().toISOString(),
    ip_hash: ipHash,
    user_agent: userAgent.slice(0, 200),
  });

  const visibleCats: string[] = card.visible_categories || [];

  // 4. Fetch Profile (Name, Blood Group, Emergency Contact) ONLY if permitted
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, blood_group, emergency_contact_name, emergency_contact_phone")
    .eq("id", card.user_id)
    .single();

  // 5. Fetch ONLY CONFIRMED items for allowed categories
  // Minimal query: NO document IDs, NO storage paths, NO user_id returned to client
  const { data: confirmedRows } = await supabase
    .from("items")
    .select("id, category, value, page_id, created_at")
    .eq("user_id", card.user_id)
    .eq("status", "confirmed")
    .in("category", visibleCats);

  // Fetch document dates/types for items to display age (without exposing document IDs or storage paths)
  const pageIds = Array.from(new Set((confirmedRows || []).map((r) => r.page_id).filter(Boolean)));
  const pageMetaMap = new Map<string, { doc_type: string; doc_date: string | null; doc_date_type: string }>();

  if (pageIds.length > 0) {
    const { data: pageRows } = await supabase
      .from("pages")
      .select("id, document_id")
      .in("id", pageIds);

    const docIds = Array.from(new Set((pageRows || []).map((p) => p.document_id)));
    if (docIds.length > 0) {
      const { data: docRows } = await supabase
        .from("documents")
        .select("id, doc_type, doc_date, doc_date_type")
        .in("id", docIds);

      const docMap = new Map((docRows || []).map((d) => [d.id, d]));
      (pageRows || []).forEach((p) => {
        const d = docMap.get(p.document_id);
        if (d) {
          pageMetaMap.set(p.id, {
            doc_type: d.doc_type || "Medical Document",
            doc_date: d.doc_date,
            doc_date_type: d.doc_date_type || "dated",
          });
        }
      });
    }
  }

  const items: ResponderItem[] = (confirmedRows || []).map((row) => {
    const meta = row.page_id ? pageMetaMap.get(row.page_id) : null;
    return {
      id: row.id,
      category: row.category,
      value: row.value,
      doc_type: meta?.doc_type ?? null,
      doc_date: meta?.doc_date ?? null,
      doc_date_type: meta?.doc_date_type ?? null,
    };
  });

  // Group items by category
  const groupedItems: Record<string, ResponderItem[]> = {};
  items.forEach((item) => {
    if (!groupedItems[item.category]) groupedItems[item.category] = [];
    groupedItems[item.category].push(item);
  });

  const showBloodGroup = visibleCats.includes("blood_group");
  const showEmergencyContact = visibleCats.includes("emergency_contact");
  const showAllergies = visibleCats.includes("allergy");
  const showMedications = visibleCats.includes("medication");
  const showConditions = visibleCats.includes("condition");
  const showImplants = visibleCats.includes("implant");

  const allergyItems = groupedItems["allergy"] || [];
  const medItems = groupedItems["medication"] || [];
  const condItems = groupedItems["condition"] || [];
  const implantItems = groupedItems["implant"] || [];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 px-4 py-8 antialiased selection:bg-rose-100 selection:text-rose-900">
      <div className="mx-auto max-w-lg space-y-6">
        {/* Responder Banner */}
        <div className="rounded-2xl border-2 border-rose-500 bg-rose-600 text-white p-6 shadow-md">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-widest bg-rose-700/80 px-2.5 py-1 rounded-md">
              Emergency Medical Card
            </span>
            <span className="text-xs opacity-90">First Responder View</span>
          </div>

          <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
            {profile?.full_name || "Patient Record"}
          </h1>

          {showBloodGroup && profile?.blood_group && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white text-rose-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">
              <Heart className="h-4 w-4 fill-rose-600 text-rose-600" />
              Blood Group: {profile.blood_group}
            </div>
          )}
        </div>

        {/* Emergency Contact */}
        {showEmergencyContact &&
          (profile?.emergency_contact_name || profile?.emergency_contact_phone) && (
            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Emergency Contact
              </span>
              <p className="text-base font-semibold text-gray-900">
                {profile?.emergency_contact_name || "Emergency Contact"}
              </p>
              {profile?.emergency_contact_phone && (
                <a
                  href={`tel:${profile.emergency_contact_phone}`}
                  className="inline-flex items-center gap-1.5 text-base font-bold text-teal-700 hover:text-teal-800 hover:underline pt-1"
                >
                  <Phone className="h-4 w-4" />
                  {profile.emergency_contact_phone}
                </a>
              )}
            </div>
          )}

        {/* 1. Allergies & Adverse Reactions (Highest Clinical Priority) */}
        {showAllergies && (
          <section className="rounded-xl border-2 border-rose-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2 text-rose-700">
                <ShieldAlert className="h-5 w-5" />
                <h2 className="text-sm font-bold uppercase tracking-wider">
                  Allergies & Sensitivities
                </h2>
              </div>
              <Badge variant="allergy" className="text-[10px]">
                Critical
              </Badge>
            </div>

            {allergyItems.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                No allergy information recorded
              </p>
            ) : (
              <ul className="space-y-3 divide-y divide-gray-100">
                {allergyItems.map((item) => {
                  const display = formatAllergyItem(item);
                  const isNkda =
                    item.value.toLowerCase().includes("no known drug allergies") ||
                    item.value.toLowerCase().includes("nkda");

                  return (
                    <li key={item.id} className="pt-2 first:pt-0">
                      <p className="text-base font-bold text-gray-900 leading-snug">
                        {display}
                      </p>
                      {item.doc_date && !isNkda && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Documented: {formatClinicalDate(item.doc_date)} ({getDateAge(item.doc_date)})
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* 2. Active Medications */}
        {showMedications && (
          <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-blue-700 border-b pb-2">
              <Pill className="h-5 w-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
                Active Medications
              </h2>
            </div>

            {medItems.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                No medications shared on this card
              </p>
            ) : (
              <ul className="space-y-2.5 divide-y divide-gray-100">
                {medItems.map((item) => (
                  <li key={item.id} className="pt-2 first:pt-0">
                    <p className="text-base font-semibold text-gray-900 leading-snug">
                      {item.value}
                    </p>
                    {item.doc_date && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Recorded: {formatClinicalDate(item.doc_date)} ({getDateAge(item.doc_date)})
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* 3. Chronic Conditions & Diagnoses */}
        {showConditions && (
          <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-amber-700 border-b pb-2">
              <Activity className="h-5 w-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
                Conditions & Diagnoses
              </h2>
            </div>

            {condItems.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                No conditions shared on this card
              </p>
            ) : (
              <ul className="space-y-2.5 divide-y divide-gray-100">
                {condItems.map((item) => (
                  <li key={item.id} className="pt-2 first:pt-0">
                    <p className="text-base font-medium text-gray-900 leading-snug">
                      {item.value}
                    </p>
                    {item.doc_date && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Documented: {formatClinicalDate(item.doc_date)} ({getDateAge(item.doc_date)})
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* 4. Implants & Medical Devices */}
        {showImplants && (
          <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-700 border-b pb-2">
              <Cpu className="h-5 w-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
                Implants & Devices
              </h2>
            </div>

            {implantItems.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                No implants recorded
              </p>
            ) : (
              <ul className="space-y-2">
                {implantItems.map((item) => (
                  <li key={item.id} className="text-base font-medium text-gray-900">
                    {item.value}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Empty state fallback if user disabled all categories */}
        {visibleCats.length === 0 && (
          <div className="bg-white border rounded-xl p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-gray-700">
              No categories enabled
            </p>
            <p className="text-xs text-gray-500">
              The cardholder has not selected any medical categories to share on this emergency card.
            </p>
          </div>
        )}

        <Separator />

        {/* Mandatory Clinical Disclaimers & Provenance Note */}
        <footer className="text-center space-y-2 text-xs text-gray-500 pb-8">
          <p className="font-semibold text-gray-700">
            Patient-provided information. Verify clinically.
          </p>
          <p>
            This emergency card contains only records explicitly confirmed by the patient.
            For direct medical treatment, verify identity and clinical status independently.
          </p>
          <p className="text-[11px] text-gray-400 font-mono">
            Powered by MedRecord Emergency Access • Secure 128-bit Token
          </p>
        </footer>
      </div>
    </main>
  );
}
