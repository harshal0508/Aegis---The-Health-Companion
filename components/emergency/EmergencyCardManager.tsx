"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import QRCode from "qrcode";
import {
  ShieldAlert,
  QrCode,
  RefreshCw,
  Power,
  Eye,
  Printer,
  Copy,
  Check,
  AlertTriangle,
  Info,
  Loader2,
  Heart,
  Phone,
  Pill,
  Activity,
  Cpu,
  FileCheck2,
  ExternalLink,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatClinicalDate } from "@/lib/utils";
import { usePatient } from "@/components/patient/PatientContext";

interface CardData {
  id: string;
  visible_categories: string[];
  active: boolean;
  created_at: string;
}

interface ProfileData {
  full_name?: string | null;
  blood_group?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}

interface AccessLogEntry {
  accessed_at: string;
  ip_hash: string;
  user_agent?: string;
}

const CATEGORIES = [
  { id: "allergy", label: "Allergies & Sensitivities", icon: ShieldAlert, critical: true },
  { id: "medication", label: "Active Medications", icon: Pill },
  { id: "condition", label: "Conditions & Diagnoses", icon: Activity },
  { id: "implant", label: "Implants & Devices", icon: Cpu },
  { id: "blood_group", label: "Blood Group", icon: Heart },
  { id: "emergency_contact", label: "Emergency Contact Phone", icon: Phone },
];

export function EmergencyCardManager() {
  const { activePatient, activePatientId } = usePatient();
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardData | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [confirmedCounts, setConfirmedCounts] = useState<Record<string, number>>({});
  const [accessLogs, setAccessLogs] = useState<AccessLogEntry[]>([]);

  // Selected categories state
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [savingCats, setSavingCats] = useState(false);

  // Active / Deactivate state
  const [togglingActive, setTogglingActive] = useState(false);

  // One-time Token & QR State
  const [activeToken, setActiveToken] = useState<string | null>(null);
  const [activeShareUrl, setActiveShareUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // View Modals
  const [showPreview, setShowPreview] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const printCardRef = useRef<HTMLDivElement>(null);

  const fetchCardData = useCallback(async () => {
    if (!activePatientId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/emergency/card?patient_id=${activePatientId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load card");

      setCard(data.card);
      setProfile(data.patient || data.profile);
      setConfirmedCounts(data.confirmedCounts || {});
      setAccessLogs(data.accessLogs || []);
      if (data.card) {
        setSelectedCats(data.card.visible_categories || []);
      } else {
        setSelectedCats(["allergy", "medication", "condition", "implant", "blood_group", "emergency_contact"]);
      }
    } catch (err: any) {
      console.error("Failed to fetch emergency card:", err.message);
    } finally {
      setLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchCardData();
  }, [fetchCardData]);

  // Generate QR Code image when token/shareUrl changes
  useEffect(() => {
    if (activeShareUrl) {
      QRCode.toDataURL(activeShareUrl, {
        width: 250,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error("QR generation error:", err));
    }
  }, [activeShareUrl]);

  // Category Toggle
  const handleCategoryToggle = async (catId: string) => {
    const next = selectedCats.includes(catId)
      ? selectedCats.filter((c) => c !== catId)
      : [...selectedCats, catId];

    setSelectedCats(next);

    if (card) {
      setSavingCats(true);
      try {
        const res = await fetch("/api/emergency/card/categories", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visible_categories: next,
            card_id: card?.id,
            patient_id: activePatientId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update categories");
        setCard(data.card);
      } catch (err: any) {
        alert(`Error updating visible categories: ${err.message}`);
      } finally {
        setSavingCats(false);
      }
    }
  };

  // Create or Regenerate Emergency Card
  const handleCreateOrRegenerate = async (isRegen = false) => {
    if (
      isRegen &&
      !window.confirm(
        "Regenerating will immediately invalidate your previous emergency card link and QR code. Anyone scanning your old card will see 'Not Found'. Proceed?"
      )
    ) {
      return;
    }

    setGenerating(true);
    setCopied(false);
    try {
      const endpoint = isRegen ? "/api/emergency/card/regenerate" : "/api/emergency/card";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visible_categories: selectedCats,
          card_id: card?.id,
          patient_id: activePatientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate emergency card");

      setCard(data.card);
      setActiveToken(data.token);
      setActiveShareUrl(data.shareUrl);
    } catch (err: any) {
      alert(`Error creating emergency card: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // Toggle Active/Inactive
  const handleToggleActive = async () => {
    if (!card) return;
    const nextState = !card.active;

    if (
      !nextState &&
      !window.confirm(
        "Disabling your emergency card prevents responders from seeing your info. Anyone scanning the card will see a generic 'Not Found' page. Disable now?"
      )
    ) {
      return;
    }

    setTogglingActive(true);
    try {
      const res = await fetch("/api/emergency/card/toggle-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: nextState,
          card_id: card?.id,
          patient_id: activePatientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle card status");
      setCard(data.card);
    } catch (err: any) {
      alert(`Error changing card status: ${err.message}`);
    } finally {
      setTogglingActive(false);
    }
  };

  const handleCopyLink = () => {
    if (!activeShareUrl) return;
    navigator.clipboard.writeText(activeShareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownloadQrImage = () => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `aegis-emergency-qr-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrintCard = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading Emergency Card settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Printable Wallet Card Hidden Styles for Print */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #wallet-print-card,
          #wallet-print-card * {
            visibility: visible;
          }
          #wallet-print-card {
            position: absolute;
            left: 0;
            top: 0;
            width: 3.375in;
            height: 2.125in;
            margin: 0;
            padding: 12px;
            border: 2px solid #000;
            border-radius: 8px;
            box-shadow: none;
            background: #fff !important;
            color: #000 !important;
          }
        }
      `}</style>

      {/* Active Patient Indicator Banner */}
      {activePatient && (
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-teal-50/80 border border-teal-200/80 text-teal-900 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Medical ID Profile:</span>
            <span className="font-bold text-teal-900 text-sm">{activePatient.full_name}</span>
            <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold text-[10px]">
              {activePatient.relationship_label}
            </span>
          </div>
          <span className="text-[11px] text-teal-700 hidden sm:inline">
            QR code & card show exclusively this patient&apos;s verified records
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-serif font-normal text-slate-900 tracking-tight">
              Emergency Medical Card
            </h1>
            {card ? (
              card.active ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200">Disabled</Badge>
              )
            ) : (
              <Badge variant="secondary">Not Created</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Share vital medical details with first responders via secure QR code (no login required)
          </p>
        </div>

        {card && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={togglingActive}
              onClick={handleToggleActive}
              className={`h-9 text-xs font-semibold ${
                card.active
                  ? "text-rose-700 border-rose-200 hover:bg-rose-50"
                  : "text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              <Power className="h-3.5 w-3.5 mr-1.5" />
              {card.active ? "Disable Card" : "Activate Card"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={generating}
              onClick={() => handleCreateOrRegenerate(true)}
              className="h-9 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              title="Regenerates link and invalidates previous token immediately"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generating ? "animate-spin" : ""}`} />
              Regenerate Link
            </Button>
          </div>
        )}
      </div>

      {/* Wallet Card Privacy Note (Unboxed, single point) */}
      <p className="text-xs text-slate-500 flex items-start gap-2 px-1">
        <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-slate-700 font-semibold">Wallet Card Privacy:</strong> The printable card includes ONLY your Name, Blood Group, and QR code. Medications and allergies are never printed physically on the card to prevent stale data hazards.
        </span>
      </p>

      {/* Step 1: Category Selection (All Off by Default) */}
      <Card className="border shadow-sm">
        <CardHeader className="bg-gray-50/70 border-b py-4 px-6">
          <CardTitle className="text-base font-semibold text-gray-900">
            1. Select Information to Share
          </CardTitle>
          <CardDescription className="text-xs">
            Choose exactly which confirmed records first responders can see. All categories are disabled by default.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3 text-amber-900 text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">Public Access Warning:</span>
              <p>
                Anyone who has this link or scans your emergency QR code will be able to view the categories selected below without logging in. This includes your name, blood group, and emergency contact phone number. Only enable categories you want first responders to access.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isChecked = selectedCats.includes(cat.id);
              const count =
                cat.id === "blood_group"
                  ? profile?.blood_group ? 1 : 0
                  : cat.id === "emergency_contact"
                  ? profile?.emergency_contact_phone ? 1 : 0
                  : confirmedCounts[cat.id] ?? 0;

              return (
                <div
                  key={cat.id}
                  onClick={() => handleCategoryToggle(cat.id)}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                    isChecked
                      ? "border-teal-600 bg-teal-50/20 shadow-sm"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => handleCategoryToggle(cat.id)}
                    className="mt-0.5 data-[state=checked]:bg-teal-600 data-[state=checked]:border-teal-600"
                  />

                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                        <Icon className={`h-4 w-4 ${isChecked ? "text-teal-700" : "text-gray-400"}`} />
                        {cat.label}
                      </span>
                      {cat.critical && (
                        <Badge variant="allergy" className="text-[10px] px-1.5 py-0">
                          Critical
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {cat.id === "blood_group"
                        ? profile?.blood_group ? `Set to ${profile.blood_group}` : "Not set in profile"
                        : cat.id === "emergency_contact"
                        ? profile?.emergency_contact_phone ? `Set to ${profile.emergency_contact_phone}` : "Not set in profile"
                        : `${count} confirmed ${count === 1 ? "entry" : "entries"}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {savingCats && (
            <p className="text-xs text-teal-700 flex items-center gap-1 mt-4">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving changes to emergency card...
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Generation / Token / QR Display */}
      {!card ? (
        <Card className="border shadow-sm text-center p-8 space-y-4">
          <div className="h-12 w-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
            <QrCode className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create Your Emergency Card</h2>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
              Generates a long random secure URL and QR code. First responders scan this to see only the categories you enabled.
            </p>
          </div>
          <Button
            onClick={() => handleCreateOrRegenerate(false)}
            disabled={generating}
            className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 shadow-sm"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating Secure Link...
              </>
            ) : (
              "Generate Emergency Card & QR"
            )}
          </Button>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* One-Time Token Alert (If newly generated or regenerated) */}
          {activeShareUrl && (
            <Card className="border-2 border-amber-300 bg-amber-50/30 shadow-md">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-base font-bold">
                    Save Your Emergency Card (Shown Once)
                  </CardTitle>
                </div>
                <div className="text-xs text-amber-900 leading-relaxed space-y-1 mt-1">
                  <p>
                    <strong>Save or Download Now:</strong> To protect your privacy, this emergency link and QR code are only shown once. Please save the link or download your card before leaving this page.
                  </p>
                  <p className="text-[11px] text-amber-800">
                    If you ever misplace it, you can safely generate a new card anytime with the <strong>Regenerate Link</strong> button above.
                  </p>
                </div>
              </CardHeader>

              <CardContent className="space-y-4 pt-2">
                <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-amber-200">
                  {qrDataUrl && (
                    <img
                      src={qrDataUrl}
                      alt="Emergency QR Code"
                      className="h-36 w-36 rounded-lg border p-1 bg-white shadow-sm"
                    />
                  )}

                  <div className="space-y-3 flex-1 min-w-0 w-full">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 block">
                        Public Access Link:
                      </span>
                      <p className="font-mono text-xs text-gray-900 bg-gray-50 p-2 rounded border truncate select-all">
                        {activeShareUrl}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleCopyLink}
                        className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-8"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                        {copied ? "Copied!" : "Copy Link"}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownloadQrImage}
                        className="text-xs h-8 border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download QR Image
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowPrintModal(true)}
                        className="text-xs h-8 border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        <Printer className="h-3.5 w-3.5 mr-1" />
                        Download Wallet PDF
                      </Button>

                      <a
                        href={activeShareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-teal-700 hover:underline flex items-center gap-1 font-medium ml-2"
                      >
                        Open Live Link <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border shadow-sm">
            <div className="space-y-0.5">
              <span className="text-sm font-bold text-gray-900 block">
                Card Status: {card.active ? "Enabled & Active" : "Disabled (Returns 404)"}
              </span>
              <span className="text-xs text-muted-foreground">
                Created on {formatClinicalDate(card.created_at)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(true)}
                className="text-xs h-9 border-teal-200 text-teal-800 hover:bg-teal-50 font-semibold"
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Preview Responder View
              </Button>

              <Button
                size="sm"
                onClick={() => setShowPrintModal(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-9 font-semibold"
              >
                <Printer className="h-3.5 w-3.5 mr-1.5" />
                Print Wallet Card
              </Button>
            </div>
          </div>

          {/* Access Log Audit Trail */}
          <Card className="border shadow-sm">
            <CardHeader className="bg-gray-50/70 border-b py-3 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-900">
                  Card Access History (Audit Trail)
                </CardTitle>
                <span className="text-xs font-mono text-muted-foreground">
                  {accessLogs.length} logged {accessLogs.length === 1 ? "view" : "views"}
                </span>
              </div>
            </CardHeader>

            <CardContent className="p-0 divide-y divide-gray-100">
              {accessLogs.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-500">
                  No first responder views recorded yet.
                </div>
              ) : (
                accessLogs.map((log, idx) => (
                  <div key={idx} className="p-3.5 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <span className="font-semibold text-gray-900 block">
                        Verified Card Access
                      </span>
                      <span className="text-gray-500 font-mono text-[11px]">
                        IP Identifier: {log.ip_hash} • {log.user_agent?.slice(0, 40) || "Mobile Browser"}
                      </span>
                    </div>
                    <span className="font-mono text-gray-600">
                      {new Date(log.accessed_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Responder Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
                Live Responder Preview
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(false)}
                className="h-8 text-xs text-gray-500"
              >
                Close Preview
              </Button>
            </div>

            {/* Simulated Public Responder View */}
            <div className="rounded-xl border-2 border-rose-500 bg-rose-600 text-white p-5">
              <span className="text-[10px] font-bold uppercase tracking-widest bg-rose-700 px-2 py-0.5 rounded">
                Emergency Medical Card
              </span>
              <h2 className="text-2xl font-bold mt-2">{profile?.full_name || "Patient Record"}</h2>
              {selectedCats.includes("blood_group") && profile?.blood_group && (
                <p className="text-sm font-bold bg-white text-rose-700 px-2.5 py-1 rounded inline-block mt-2">
                  Blood Group: {profile.blood_group}
                </p>
              )}
            </div>

            {selectedCats.includes("emergency_contact") && profile?.emergency_contact_phone && (
              <div className="rounded-xl border p-4 bg-gray-50 space-y-1 text-xs">
                <span className="font-bold text-gray-500 uppercase">Emergency Contact:</span>
                <p className="text-sm font-bold text-gray-900">{profile.emergency_contact_name}</p>
                <p className="text-sm text-teal-700 font-bold">{profile.emergency_contact_phone}</p>
              </div>
            )}

            {/* Allergies: never omitted silently */}
            {selectedCats.includes("allergy") ? (
              <div className="rounded-xl border border-rose-200 p-4 space-y-2">
                <span className="text-xs font-bold text-rose-700 uppercase">Allergies:</span>
                <p className="text-sm font-semibold text-gray-900">
                  {confirmedCounts.allergy > 0
                    ? `${confirmedCounts.allergy} confirmed allergy records will appear here.`
                    : "No allergy information recorded"}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4 space-y-1">
                <span className="text-xs font-bold text-gray-600 uppercase">Allergies:</span>
                <p className="text-sm font-medium text-gray-600">
                  Allergies: not shared on this card. Ask the patient or family.
                </p>
              </div>
            )}

            {/* Medications: never omitted silently */}
            {selectedCats.includes("medication") ? (
              <div className="rounded-xl border border-blue-200 p-4 space-y-2">
                <span className="text-xs font-bold text-blue-700 uppercase">Active Medications:</span>
                <p className="text-sm font-semibold text-gray-900">
                  {confirmedCounts.medication > 0
                    ? `${confirmedCounts.medication} confirmed active medications will appear here.`
                    : "No active medications shared on this card"}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/80 p-4 space-y-1">
                <span className="text-xs font-bold text-gray-600 uppercase">Active Medications:</span>
                <p className="text-sm font-medium text-gray-600">
                  Medications: not shared on this card. Ask the patient or family.
                </p>
              </div>
            )}

            <p className="text-center text-xs text-gray-500 font-medium">
              Patient-provided information. Verify clinically.
            </p>
          </div>
        </div>
      )}

      {/* Printable Wallet Card Modal / Component */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-3">
              <span className="text-sm font-bold text-gray-900">Printable Wallet Card</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPrintModal(false)}
                className="h-8 text-xs text-gray-500"
              >
                Close
              </Button>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-gray-600">
                Standard credit-card size (3.375&quot; x 2.125&quot;). Print on heavy paper or cardstock to carry in your wallet.
              </p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                <strong className="text-gray-700">Wallet Card Privacy:</strong> The printable card includes ONLY your Name, Blood Group, and QR code. Medications and allergies are never printed physically on the card to prevent stale data hazards.
              </p>
            </div>

            {/* Standard Printable Card Canvas */}
            <div
              id="wallet-print-card"
              ref={printCardRef}
              className="w-full max-w-[340px] mx-auto h-[210px] rounded-xl border-2 border-slate-900 bg-white p-4 flex flex-col justify-between shadow-md relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-rose-600 block">
                    Emergency Health Card
                  </span>
                  <h3 className="text-lg font-black text-gray-900 leading-tight">
                    {profile?.full_name || "Cardholder"}
                  </h3>
                  {profile?.blood_group && (
                    <span className="inline-block bg-rose-50 text-rose-700 text-[11px] font-extrabold px-1.5 py-0.5 rounded border border-rose-200 mt-0.5">
                      Blood: {profile.blood_group}
                    </span>
                  )}
                </div>

                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="Emergency QR Code"
                    className="h-20 w-20 rounded border border-gray-300 p-0.5"
                  />
                ) : (
                  <div className="h-20 w-20 border rounded flex items-center justify-center text-[10px] text-gray-400">
                    QR Code
                  </div>
                )}
              </div>

              {profile?.emergency_contact_phone && (
                <div className="text-[10px] text-gray-700">
                  <span className="font-semibold block">Emergency ICE Contact:</span>
                  <span className="font-bold text-gray-900">
                    {profile.emergency_contact_name ? `${profile.emergency_contact_name}: ` : ""}
                    {profile.emergency_contact_phone}
                  </span>
                </div>
              )}

              <div className="border-t pt-1 flex items-center justify-between text-[8px] text-gray-500 font-semibold uppercase tracking-wider">
                <span>Scan QR for current medical info</span>
                <span>Aegis</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPrintModal(false)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePrintCard}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                <Printer className="h-3.5 w-3.5 mr-1" />
                Print Card (or Save PDF)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
