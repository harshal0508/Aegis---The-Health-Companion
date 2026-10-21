import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, AlertTriangle, Phone, Activity, Pill, Cpu, Heart } from "lucide-react";
import { formatClinicalDate, getDateAge } from "@/lib/utils";
import { getEmergencyResponderData } from "@/lib/emergency/responder";
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
  referrer: "no-referrer",
};

export default async function EmergencyCardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const rawIp = forwardedFor ? forwardedFor.split(",")[0].trim() : headerList.get("x-real-ip") || "127.0.0.1";
  const userAgent = headerList.get("user-agent") || "unknown";

  const result = await getEmergencyResponderData(token, rawIp, userAgent);

  if (result.rateLimited) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white border rounded-xl p-6 max-w-sm text-center space-y-3 shadow-sm">
          <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto" />
          <h1 className="text-base font-bold text-gray-900">Too Many Requests</h1>
          <p className="text-xs text-gray-600 leading-relaxed">
            Rate limit exceeded for emergency card access. Please retry in a few moments.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-left space-y-1">
            <span className="text-[11px] font-bold text-amber-900 block">
              Using a shared hospital or clinic Wi-Fi?
            </span>
            <p className="text-[11px] text-amber-800 leading-normal">
              Multiple devices on the same network share one IP address. If this limit was reached, try switching to mobile data (cellular), or ask someone to open the QR link from a different device.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const data = result.data!;
  const showBloodGroup = data.visible_categories.includes("blood_group");
  const showEmergencyContact = data.visible_categories.includes("emergency_contact");
  const showAllergies = data.visible_categories.includes("allergy");
  const showMedications = data.visible_categories.includes("medication");
  const showConditions = data.visible_categories.includes("condition");
  const showImplants = data.visible_categories.includes("implant");

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
            {data.full_name || "Patient Record"}
          </h1>

          {showBloodGroup && data.blood_group && (
            <div className="mt-3 inline-flex items-center gap-2 bg-white text-rose-700 px-3 py-1.5 rounded-lg text-sm font-bold shadow-sm">
              <Heart className="h-4 w-4 fill-rose-600 text-rose-600" />
              Blood Group: {data.blood_group}
            </div>
          )}
        </div>

        {/* Emergency Contact */}
        {showEmergencyContact &&
          (data.emergency_contact_name || data.emergency_contact_phone) && (
            <div className="rounded-xl border bg-white p-5 shadow-sm space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Emergency Contact
              </span>
              <p className="text-base font-semibold text-gray-900">
                {data.emergency_contact_name || "Emergency Contact"}
              </p>
              {data.emergency_contact_phone && (
                <a
                  href={`tel:${data.emergency_contact_phone}`}
                  className="inline-flex items-center gap-1.5 text-base font-bold text-teal-700 hover:text-teal-800 hover:underline pt-1"
                >
                  <Phone className="h-4 w-4" />
                  {data.emergency_contact_phone}
                </a>
              )}
            </div>
          )}

        {/* 1. Allergies & Adverse Reactions */}
        {showAllergies ? (
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

            {data.grouped.allergy.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                {data.allergy_display_fallback}
              </p>
            ) : (
              <ul className="space-y-3 divide-y divide-gray-100">
                {data.grouped.allergy.map((item) => {
                  const isNkda =
                    item.value.toLowerCase().includes("no known drug allergies") ||
                    item.value.toLowerCase().includes("nkda");

                  return (
                    <li key={item.id} className="pt-2 first:pt-0">
                      <p className="text-base font-bold text-gray-900 leading-snug">
                        {item.display_text || item.value}
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
        ) : (
          /* Clinical Safety Rule: Never omit allergies silently when toggled off */
          <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4 space-y-1">
            <div className="flex items-center gap-2 text-gray-700">
              <ShieldAlert className="h-4 w-4 text-gray-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Allergies & Sensitivities
              </h2>
            </div>
            <p className="text-sm font-medium text-gray-600">
              {data.category_unshared_notices.allergy}
            </p>
          </section>
        )}

        {/* 2. Active Medications */}
        {showMedications ? (
          <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-blue-700 border-b pb-2">
              <Pill className="h-5 w-5" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-900">
                Active Medications
              </h2>
            </div>

            {data.grouped.medication.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                No medications shared on this card
              </p>
            ) : (
              <ul className="space-y-2.5 divide-y divide-gray-100">
                {data.grouped.medication.map((item) => (
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
        ) : (
          /* Clinical Safety Rule: Never omit medications silently when toggled off */
          <section className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4 space-y-1">
            <div className="flex items-center gap-2 text-gray-700">
              <Pill className="h-4 w-4 text-gray-500" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Active Medications
              </h2>
            </div>
            <p className="text-sm font-medium text-gray-600">
              {data.category_unshared_notices.medication}
            </p>
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

            {data.grouped.condition.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                No conditions shared on this card
              </p>
            ) : (
              <ul className="space-y-2.5 divide-y divide-gray-100">
                {data.grouped.condition.map((item) => (
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

            {data.grouped.implant.length === 0 ? (
              <p className="text-sm text-gray-500 italic py-1">
                No implants recorded
              </p>
            ) : (
              <ul className="space-y-2">
                {data.grouped.implant.map((item) => (
                  <li key={item.id} className="text-base font-medium text-gray-900">
                    {item.value}
                  </li>
                ))}
              </ul>
            )}
          </section>
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
          <div className="pt-0.5">
            <Link
              href="/about"
              className="text-[11px] text-teal-700 hover:text-teal-800 hover:underline font-semibold"
            >
              What this app is &amp; isn&apos;t (Clinical Scope)
            </Link>
          </div>
          <p className="text-[11px] text-gray-400 font-mono">
            Powered by MedRecord Emergency Access • Long Random Link
          </p>
        </footer>
      </div>
    </main>
  );
}
