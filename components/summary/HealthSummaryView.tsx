"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Pill,
  Activity,
  Scissors,
  FileCheck2,
  Cpu,
  Plus,
  Check,
  Edit2,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Sparkles,
  Info,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatClinicalDate, getDateAge, cn } from "@/lib/utils";
import { usePatient } from "@/components/patient/PatientContext";
import { matchPatientIdentity } from "@/lib/extraction/identity-matcher";
import { getMedicationPurpose } from "@/lib/medications/purpose-resolver";

interface ItemDocument {
  id: string;
  doc_type: string;
  doc_date: string | null;
  doc_date_type?: string | null;
  storage_path: string;
  patient_id?: string | null;
  patient_name_as_printed?: string | null;
  patient_name_latin?: string | null;
  patient_dob?: string | null;
  identity_status?: string | null;
  attestation_timestamp?: string | null;
  attestation_type?: string | null;
}

interface ItemSource {
  page_id?: string;
  page_no?: number;
  quote: string;
  confidence?: number;
  verified?: boolean;
}

export interface SummaryItem {
  id: string;
  category: "allergy" | "medication" | "condition" | "surgery" | "lab" | "implant";
  value: string;
  quote?: string | null;
  confidence?: number | null;
  status: "extracted" | "confirmed" | "needs_review";
  source: "extracted" | "patient_entered";
  sources?: ItemSource[];
  page_no?: number | null;
  document?: ItemDocument | null;
  created_at: string;
  last_confirmed_at?: string | null;
  ocr_check?: {
    state: "agree" | "disagree" | "unavailable";
    page_confidence?: number;
    matched_tokens?: string[];
    missing_tokens?: string[];
    review_reason?: string;
  } | null;
  review_reason?: string | null;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; emptyText: string; color: string }
> = {
  allergy: {
    label: "Allergies & Adverse Reactions",
    icon: ShieldAlert,
    emptyText: "No allergies recorded for this patient",
    color: "text-rose-600 bg-rose-50/70 border-rose-200",
  },
  medication: {
    label: "Active Medications",
    icon: Pill,
    emptyText: "No active medications recorded",
    color: "text-blue-600 bg-blue-50/70 border-blue-200",
  },
  condition: {
    label: "Conditions & Diagnoses",
    icon: Activity,
    emptyText: "No conditions or diagnoses recorded",
    color: "text-purple-600 bg-purple-50/70 border-purple-200",
  },
  surgery: {
    label: "Surgeries & Procedures",
    icon: Scissors,
    emptyText: "No surgeries or procedures recorded",
    color: "text-indigo-600 bg-indigo-50/70 border-indigo-200",
  },
  lab: {
    label: "Lab Results & Investigations",
    icon: FileCheck2,
    emptyText: "No lab reports recorded",
    color: "text-emerald-600 bg-emerald-50/70 border-emerald-200",
  },
  implant: {
    label: "Implants & Devices",
    icon: Cpu,
    emptyText: "No implants or devices recorded",
    color: "text-slate-600 bg-slate-50/70 border-slate-200",
  },
};

const CATEGORY_TABS = [
  { id: "all", label: "All Records" },
  { id: "medication", label: "Medications" },
  { id: "allergy", label: "Allergies" },
  { id: "condition", label: "Conditions" },
  { id: "lab", label: "Labs" },
  { id: "surgery", label: "Procedures" },
  { id: "implant", label: "Devices" },
] as const;

export function HealthSummaryView() {
  const { patients, activePatient, activePatientId } = usePatient();
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("all");

  // Interaction states
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [attestingDocId, setAttestingDocId] = useState<string | null>(null);
  const [movingDocId, setMovingDocId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<{ id: string; value: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Manual Add Modal State
  const [isAdding, setIsAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<string>("condition");
  const [newValue, setNewValue] = useState("");
  const [addingError, setAddingError] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!activePatientId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/items?patient_id=${activePatientId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load summary items");
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || "Could not retrieve records");
    } finally {
      setLoading(false);
    }
  }, [activePatientId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAttest = async (docId: string, action: "attest_name_not_found" | "same_person") => {
    let note: string | undefined;
    if (action === "same_person") {
      const input = prompt(
        "Confirm this report is for this patient (e.g. maiden name, minor hospital typo, or family member variant):"
      );
      if (input === null) return;
      note = input.trim();
    }
    setAttestingDocId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/attest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Attestation failed");
      await fetchItems();
    } catch (err: any) {
      alert(`Attestation failed: ${err.message}`);
    } finally {
      setAttestingDocId(null);
    }
  };

  const handleMoveDocument = async (docId: string, targetPatientId: string) => {
    setMovingDocId(docId);
    try {
      const res = await fetch(`/api/documents/${docId}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_patient_id: targetPatientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to move document");
      await fetchItems();
    } catch (err: any) {
      alert(`Move document failed: ${err.message}`);
    } finally {
      setMovingDocId(null);
    }
  };

  const handleConfirm = async (itemId: string) => {
    setConfirmingId(itemId);
    try {
      const res = await fetch(`/api/items/${itemId}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm item");
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, status: "confirmed", last_confirmed_at: new Date().toISOString() }
            : item
        )
      );
    } catch (err: any) {
      alert(`Error confirming item: ${err.message}`);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.value.trim()) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/items/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: editingItem.value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save item edit");

      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? {
                ...item,
                value: editingItem.value.trim(),
                status: "confirmed",
                source: "patient_entered",
              }
            : item
        )
      );
      setEditingItem(null);
    } catch (err: any) {
      alert(`Error updating item: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!window.confirm("Are you sure you want to remove this record from your health summary?")) {
      return;
    }
    setDeletingId(itemId);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete item");
      }
      setItems((prev) => prev.filter((item) => item.id !== itemId));
    } catch (err: any) {
      alert(`Error deleting item: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newValue.trim()) {
      setAddingError("Please enter a medical description or drug name.");
      return;
    }
    setSavingNew(true);
    setAddingError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newCategory,
          value: newValue.trim(),
          patient_id: activePatientId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add manual item");

      setItems((prev) => [data.item, ...prev]);
      setNewValue("");
      setIsAdding(false);
    } catch (err: any) {
      setAddingError(err.message || "Failed to add item");
    } finally {
      setSavingNew(false);
    }
  };

  const formatAllergyDisplay = (item: SummaryItem): string => {
    const isNkda =
      item.value.toLowerCase().includes("no known drug allergies") ||
      item.value.toLowerCase().includes("nkda");

    if (isNkda) {
      const docType = item.document?.doc_type || "medical document";
      const docDate = item.document?.doc_date;
      const dateType = item.document?.doc_date_type || "dated";

      if (docDate) {
        const formattedDate = formatClinicalDate(docDate);
        const age = getDateAge(docDate);
        return `No known drug allergies, per ${docType}, ${dateType} ${formattedDate} (${age})`;
      } else {
        return `No known drug allergies, per ${docType}, date not found`;
      }
    }

    return item.value;
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-7 w-7 text-teal-600 animate-spin" />
        <p className="text-xs text-slate-500 font-medium">Loading clinical health records...</p>
      </div>
    );
  }

  const confirmedCount = items.filter((i) => i.status === "confirmed").length;
  const unconfirmedCount = items.filter((i) => i.status !== "confirmed").length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* 1. Header & Active Patient Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl sm:text-4xl font-serif font-normal tracking-tight text-slate-900">
              Health Summary
            </h1>
            {activePatient && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200/80">
                {activePatient.full_name} ({activePatient.relationship_label})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-normal mt-1">
            Verified clinical records, active prescriptions, and documented diagnoses
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            onClick={() => setIsAdding(!isAdding)}
            className="bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold h-9 px-3.5 gap-1.5 shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Record</span>
          </Button>
        </div>
      </div>

      {/* 2. Sleek Modern Tab Bar (No Pill Shapes) */}
      <div className="flex items-center gap-6 border-b border-slate-200 overflow-x-auto no-scrollbar select-none pt-1">
        {CATEGORY_TABS.map((tab) => {
          const isActive = selectedCategoryTab === tab.id;
          const count =
            tab.id === "all" ? items.length : items.filter((i) => i.category === tab.id).length;

          return (
            <button
              key={tab.id}
              onClick={() => setSelectedCategoryTab(tab.id)}
              className={cn(
                "pb-3 text-sm transition-all relative flex items-center gap-2 whitespace-nowrap",
                isActive
                  ? "text-teal-900 font-semibold"
                  : "text-slate-500 hover:text-slate-800 font-medium"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "text-[11px] px-1.5 py-0.5 rounded font-mono font-medium",
                  isActive
                    ? "bg-teal-100 text-teal-800 font-bold"
                    : "text-slate-400 bg-slate-100"
                )}
              >
                {count}
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Subtle Status Summary Strip (No Pill Badges) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 py-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium text-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {confirmedCount} confirmed records
          </span>
          {unconfirmedCount > 0 && (
            <>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5 text-amber-700 font-medium">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {unconfirmedCount} awaiting your confirmation
              </span>
            </>
          )}
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span>Only confirmed records sync to your Emergency Medical ID</span>
        </div>
      </div>

      {/* Manual Entry Form */}
      {isAdding && (
        <div className="p-5 rounded-xl border border-teal-200 bg-teal-50/20 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-teal-100 pb-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Add Record Manually
            </h3>
            <button
              onClick={() => setIsAdding(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreateManual} className="space-y-3.5">
            {addingError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {addingError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full h-9 rounded-lg border border-slate-200 bg-white text-xs px-2.5 text-slate-800"
                >
                  <option value="medication">Medication</option>
                  <option value="allergy">Allergy / Reaction</option>
                  <option value="condition">Condition / Diagnosis</option>
                  <option value="surgery">Procedure / Surgery</option>
                  <option value="lab">Lab Result</option>
                  <option value="implant">Implant / Device</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Description / Medication Name
                </label>
                <Input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="e.g. Telmisartan 40mg once daily or Penicillin allergy"
                  className="h-9 text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(false)}
                className="h-8 text-xs text-slate-600"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingNew}
                className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium"
              >
                {savingNew ? "Saving..." : "Save Record"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* 4. Clinical Category Sections (Clean, Uncluttered Editorial List) */}
      <div className="space-y-5">
        {Object.keys(CATEGORY_CONFIG)
          .filter(
            (categoryKey) =>
              selectedCategoryTab === "all" || categoryKey === selectedCategoryTab
          )
          .map((categoryKey) => {
            const config = CATEGORY_CONFIG[categoryKey];
            const categoryItems = items.filter((i) => i.category === categoryKey);
            const Icon = config.icon;

            return (
              <div
                key={categoryKey}
                className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden"
              >
                {/* Clean Section Header */}
                <div className="bg-slate-50/70 border-b border-slate-100 py-3 px-5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={cn("p-1.5 rounded-lg border", config.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h2 className="text-sm font-semibold text-slate-800">
                      {config.label}
                    </h2>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {categoryItems.length} {categoryItems.length === 1 ? "record" : "records"}
                  </span>
                </div>

                {/* Items List */}
                <div className="divide-y divide-slate-100">
                  {categoryItems.length === 0 ? (
                    <div className="py-7 px-5 text-xs text-slate-400 italic text-center">
                      {config.emptyText}
                    </div>
                  ) : (
                    categoryItems.map((item) => {
                      const displayValue =
                        item.category === "allergy"
                          ? formatAllergyDisplay(item)
                          : item.value;
                      const isEditing = editingItem?.id === item.id;
                      const purpose =
                        item.category === "medication"
                          ? getMedicationPurpose(item.value)
                          : null;

                      return (
                        <div
                          key={item.id}
                          className={cn(
                            "p-4 sm:p-5 transition-colors",
                            item.status === "confirmed"
                              ? "hover:bg-slate-50/40"
                              : "bg-amber-50/15 hover:bg-amber-50/25"
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              {/* Status indicator: Clean text, zero pill shapes */}
                              <div className="flex items-center gap-2.5 flex-wrap text-xs">
                                {item.status === "confirmed" ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                    <Check className="h-3 w-3 text-emerald-600" />
                                    Confirmed
                                  </span>
                                ) : item.status === "needs_review" ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                                    Needs Review
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    <Sparkles className="h-3 w-3 text-teal-600" />
                                    Extracted from Scan
                                  </span>
                                )}

                                {item.source === "patient_entered" && (
                                  <span className="text-[11px] text-slate-400">
                                    • {item.document ? "Edited by you" : "Added manually"}
                                  </span>
                                )}

                                {(item.ocr_check?.state === "disagree" ||
                                  (item.review_reason &&
                                    item.review_reason.includes("OCR"))) && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                    <AlertTriangle className="h-3 w-3 text-rose-600" />
                                    Second reading disagrees:{" "}
                                    {item.review_reason
                                      ? item.review_reason.replace(/^OCR disagreement:\s*/i, "")
                                      : "dose"}
                                  </span>
                                )}
                              </div>

                              {/* Item Main Value */}
                              {isEditing ? (
                                <div className="pt-1 flex items-center gap-2">
                                  <Input
                                    value={editingItem.value}
                                    onChange={(e) =>
                                      setEditingItem({ id: item.id, value: e.target.value })
                                    }
                                    className="h-8 text-sm bg-white"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={handleSaveEdit}
                                    disabled={savingEdit}
                                    className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                                  >
                                    {savingEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingItem(null)}
                                    disabled={savingEdit}
                                    className="h-8 text-xs"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <div className="pt-0.5">
                                  <h3 className="text-base font-semibold text-slate-900 leading-snug">
                                    {displayValue}
                                  </h3>
                                  {/* Purpose: subtle natural subtitle without pill box */}
                                  {item.category === "medication" && purpose && (
                                    <p className="text-xs text-slate-500 font-normal mt-0.5">
                                      Used for: {purpose}
                                    </p>
                                  )}
                                </div>
                              )}

                              {/* Concise Provenance & Source Citation (Replaces giant grey box) */}
                              {!isEditing && (
                                <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                                  {item.quote && (
                                    <span className="italic text-slate-600 font-normal">
                                      &ldquo;{item.quote}&rdquo;
                                    </span>
                                  )}
                                  {item.quote && <span>•</span>}
                                  {item.document ? (
                                    <Link
                                      href={`/documents/${item.document.id}`}
                                      className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                                    >
                                      <span>{item.document.doc_type || "Document"}</span>
                                      {item.page_no && <span>(Page {item.page_no})</span>}
                                      <ExternalLink className="h-3 w-3" />
                                    </Link>
                                  ) : (
                                    <span>Direct Entry</span>
                                  )}
                                  {item.document?.doc_date && (
                                    <>
                                      <span>•</span>
                                      <span>
                                        {formatClinicalDate(item.document.doc_date)} (
                                        {getDateAge(item.document.doc_date)})
                                      </span>
                                    </>
                                  )}
                                  {item.last_confirmed_at && (
                                    <>
                                      <span>•</span>
                                      <span className="text-emerald-700">
                                        Confirmed {formatClinicalDate(item.last_confirmed_at)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}

                              {/* Confirmation & Mismatch Actions for unconfirmed records */}
                              {item.status !== "confirmed" &&
                                !isEditing &&
                                (() => {
                                  const isIdentityMismatch =
                                    item.review_reason ===
                                      "Report appears to be for someone else" ||
                                    (item.document?.identity_status === "mismatch" &&
                                      item.document?.attestation_type !==
                                        "same_person_override");

                                  const isNameNotFoundUnattested =
                                    item.document?.identity_status === "name_not_found" &&
                                    !item.document?.attestation_timestamp;

                                  const isConfirmDisabled =
                                    confirmingId === item.id ||
                                    isIdentityMismatch ||
                                    isNameNotFoundUnattested;

                                  return (
                                    <div className="mt-3 space-y-2 pt-2 border-t border-slate-100">
                                      {isIdentityMismatch ? (
                                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900 space-y-2">
                                          <div className="flex items-center gap-1.5 font-bold text-rose-800">
                                            <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                                            <span>
                                              Patient Identity Mismatch: Report appears to be for
                                              someone else
                                            </span>
                                          </div>
                                          <p className="text-[11px] text-rose-700 leading-relaxed">
                                            The patient name on this document differs from the
                                            active profile. Confirmation is locked to prevent
                                            record contamination.
                                          </p>
                                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                                            {(() => {
                                              const matchingProfile = patients.find((p) => {
                                                if (p.id === activePatientId) return false;
                                                if (
                                                  !item.document?.patient_name_as_printed &&
                                                  !item.document?.patient_name_latin
                                                )
                                                  return false;
                                                const check = matchPatientIdentity(
                                                  { full_name: p.full_name, dob: p.dob },
                                                  {
                                                    patient_name_as_printed:
                                                      item.document.patient_name_as_printed,
                                                    patient_name_latin:
                                                      item.document.patient_name_latin,
                                                    patient_dob: item.document.patient_dob,
                                                  }
                                                );
                                                return check.outcome === "match";
                                              });

                                              if (!matchingProfile || !item.document?.id)
                                                return null;

                                              return (
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  disabled={movingDocId === item.document.id}
                                                  onClick={() =>
                                                    handleMoveDocument(
                                                      item.document!.id,
                                                      matchingProfile.id
                                                    )
                                                  }
                                                  className="h-7 text-xs bg-teal-50 text-teal-800 border-teal-300 hover:bg-teal-100 font-semibold gap-1.5"
                                                >
                                                  {movingDocId === item.document.id ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                  ) : (
                                                    <Users className="h-3 w-3 text-teal-600" />
                                                  )}
                                                  <span>
                                                    Move to {matchingProfile.full_name} (
                                                    {matchingProfile.relationship_label})
                                                  </span>
                                                </Button>
                                              );
                                            })()}

                                            {item.document?.id && (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={attestingDocId === item.document.id}
                                                onClick={() =>
                                                  handleAttest(item.document!.id, "same_person")
                                                }
                                                className="h-7 text-xs bg-white text-rose-900 border-rose-300 hover:bg-rose-100 font-semibold"
                                              >
                                                Confirm Same Person
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                      ) : isNameNotFoundUnattested ? (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 space-y-1.5">
                                          <div className="flex items-center gap-1.5 font-bold text-amber-800">
                                            <Info className="h-4 w-4 text-amber-600 flex-shrink-0" />
                                            <span>Patient Name Not Detected on Report</span>
                                          </div>
                                          <p className="text-[11px] text-amber-800">
                                            Please attest this document belongs to this patient
                                            before confirming.
                                          </p>
                                          {item.document?.id && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={attestingDocId === item.document.id}
                                              onClick={() =>
                                                handleAttest(
                                                  item.document!.id,
                                                  "attest_name_not_found"
                                                )
                                              }
                                              className="h-7 text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100 font-semibold"
                                            >
                                              Attest Document
                                            </Button>
                                          )}
                                        </div>
                                      ) : null}

                                      <div className="flex items-center justify-between gap-3 pt-1">
                                        <span className="text-[11px] text-slate-500">
                                          Verify against your physical prescription or scan
                                        </span>
                                        <Button
                                          size="sm"
                                          disabled={isConfirmDisabled}
                                          onClick={() => handleConfirm(item.id)}
                                          className={`text-white text-xs h-7 px-3 font-semibold shadow-2xs rounded-md ${
                                            isConfirmDisabled
                                              ? "bg-slate-300 cursor-not-allowed opacity-60"
                                              : "bg-emerald-600 hover:bg-emerald-700"
                                          }`}
                                        >
                                          {confirmingId === item.id ? (
                                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                          ) : (
                                            <Check className="h-3 w-3 mr-1" />
                                          )}
                                          {isIdentityMismatch
                                            ? "Confirm Locked"
                                            : "Confirm Record"}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })()}
                            </div>

                            {/* Unobtrusive Actions (Edit & Delete) */}
                            <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setEditingItem({ id: item.id, value: item.value })
                                }
                                className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700 rounded-md"
                                title="Edit item"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={deletingId === item.id}
                                onClick={() => handleDelete(item.id)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md"
                                title="Remove item"
                              >
                                {deletingId === item.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
