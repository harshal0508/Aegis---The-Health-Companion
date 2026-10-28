import React from "react";
import Link from "next/link";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  FileText,
  Stethoscope,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "What This App Is & Isn't | MedAnchor",
  description:
    "Clinical scope, boundaries, and safety disclosures for patients and healthcare providers.",
};

export default function AboutClinicalScopePage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation & Header */}
        <div className="space-y-4">
          <Link
            href="/home"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to MedAnchor
          </Link>

          <div>
            <Badge variant="outline" className="mb-2 text-xs font-semibold text-teal-800 border-teal-300 bg-teal-50">
              Clinical Scope & Product Boundaries
            </Badge>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
              What This App Is &amp; Isn&apos;t
            </h1>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              MedAnchor is an assistive organizational tool designed to help patients maintain ownership
              over their medical papers. Please read these clinical boundaries and disclosures carefully.
            </p>
          </div>
        </div>

        {/* 1. Side-by-Side: What It Is vs What It Isn't */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* WHAT IT IS */}
          <Card className="border-2 border-emerald-200 bg-emerald-50/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-emerald-100">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <CardTitle className="text-base font-bold text-emerald-900">
                  What This App IS
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3.5 text-xs text-gray-700 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span className="font-bold text-emerald-700">✓</span>
                <p>
                  <strong>A Patient-Owned Record Organizer:</strong> A secure place to photograph, digitize, and organize your existing hospital discharge summaries, lab reports, and prescriptions.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="font-bold text-emerald-700">✓</span>
                <p>
                  <strong>Assistive Text Extractor:</strong> Uses clinical AI to locate medications, allergies, and diagnoses in uploaded documents and quotes the exact source text on each page.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="font-bold text-emerald-700">✓</span>
                <p>
                  <strong>Patient-Confirmed:</strong> Items appear on your emergency card only after you confirm them.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="font-bold text-emerald-700">✓</span>
                <p>
                  <strong>Emergency First-Responder Access:</strong> Generates a printable wallet card with a long random link and QR code, allowing ER doctors to view patient-confirmed critical details in an emergency without needing a password.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* WHAT IT IS NOT */}
          <Card className="border-2 border-rose-200 bg-rose-50/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-rose-100">
              <div className="flex items-center gap-2 text-rose-800">
                <XCircle className="h-5 w-5 text-rose-600 shrink-0" />
                <CardTitle className="text-base font-bold text-rose-900">
                  What This App IS NOT
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-3.5 text-xs text-gray-700 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span className="font-bold text-rose-600">✗</span>
                <p>
                  <strong>NOT Medical Advice or Diagnosis:</strong> The app does not evaluate symptoms, diagnose diseases, recommend treatments, or suggest dosage changes.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="font-bold text-rose-600">✗</span>
                <p>
                  <strong>NOT a Replacement for Your Doctor:</strong> This app does not replace professional clinical judgment, hospital EHR systems, or consultations with qualified physicians.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="font-bold text-rose-600">✗</span>
                <p>
                  <strong>NOT Infallible:</strong> AI reading handwritten, faded, or blurry photos can make mistakes, miss items, or misinterpret abbreviations. Human verification is always mandatory.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 2. Critical Caveats: Incomplete & Stale Data */}
        <Card className="border border-amber-200 bg-amber-50/60 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <CardTitle className="text-base font-bold">
                Critical Clinical Caveat: Information May Be Incomplete or Stale
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs text-amber-950 leading-relaxed">
            <p>
              The information stored in MedAnchor reflects <strong>only what the patient has uploaded and confirmed</strong>. It is subject to several natural limitations:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-amber-900">
              <li>
                <strong>Discontinued or Changed Medications:</strong> A patient may have stopped taking a drug, reduced their dosage, or been switched to another therapy without an updated document being uploaded.
              </li>
              <li>
                <strong>Unrecorded Allergies:</strong> Absence of an allergy in this app does not mean the patient has no allergies; it only means none were found in uploaded records.
              </li>
              <li>
                <strong>Fragmented Care:</strong> If a patient receives care across multiple hospitals or doctors and only uploads summaries from one facility, the record is incomplete.
              </li>
              <li>
                <strong>Verbal Instructions:</strong> Oral instructions, telephone consults, or over-the-counter medications not documented in writing will not appear here.
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* 3. Notice to Healthcare Providers & First Responders */}
        <Card className="border-2 border-slate-900 bg-slate-900 text-white shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-teal-400">
              <Stethoscope className="h-5 w-5 shrink-0" />
              <CardTitle className="text-base font-bold text-white">
                Notice to Attending Physicians &amp; First Responders
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-slate-200 leading-relaxed">
            <p className="font-semibold text-white">
              Always verify clinically before administering treatment or prescribing medications.
            </p>
            <p>
              The emergency card and health summaries provided by MedAnchor are assembled from patient-uploaded
              documents. While every extracted item is pinned to an underlying document date and patient confirmation,
              it remains patient-provided data.
            </p>
            <p>
              Attending clinicians must exercise independent medical judgment, confirm critical drug allergies
              directly with the patient or family where possible, and cross-reference official hospital records.
            </p>
          </CardContent>
        </Card>

        {/* 4. Privacy & Ownership Commitment */}
        <div className="rounded-xl border bg-white p-5 space-y-2 shadow-sm text-xs text-gray-600">
          <div className="flex items-center gap-2 text-teal-800 font-bold">
            <Lock className="h-4 w-4 text-teal-600" />
            <span>Patient Data Ownership Commitment</span>
          </div>
          <p>
            MedAnchor is built on a patient-first ownership model. Your records are never sold to pharmaceutical companies,
            advertisers, or insurers. You retain full control to edit, delete, or revoke access to your documents and emergency card at any time.
          </p>
        </div>

        {/* Back Link */}
        <div className="text-center pt-2 pb-6">
          <Button asChild variant="outline" className="text-xs">
            <Link href="/home">Return to Home Screen</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
