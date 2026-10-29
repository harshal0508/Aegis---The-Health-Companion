"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
  Clock,
  FolderOpen,
  Calendar,
  FileText,
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
  page_id?: string | null;
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

const DOC_TYPE_LABELS: Record<string, string> = {
  prescription: "Prescription",
  discharge_summary: "Discharge Summary",
  lab_report: "Lab / Diagnostic Report",
  radiology: "Scan / Radiology",
  bill: "Medical Bill",
  other: "Medical Document",
};

function getEventProvenance(event: {
  document: ItemDocument | null;
  items: SummaryItem[];
}) {
  const doc = event.document;
  if (doc) {
    const rawType = (doc.doc_type || "").toLowerCase().trim();
    const label = DOC_TYPE_LABELS[rawType] || doc.doc_type || "Medical Document";
    return {
      title: label,
      isDocument: true,
      hasViewLink: true,
      docId: doc.id,
    };
  }

  // If document was not returned from lookup but items were scanned / have page numbers
  const docItem = event.items.find(
    (i) => i.page_no || i.page_id || i.source === "extracted"
  );
  if (docItem) {
    return {
      title: docItem.page_no
        ? `Scanned Clinical Document (Page ${docItem.page_no})`
        : "Scanned Clinical Document",
      isDocument: true,
      hasViewLink: false,
      docId: null,
    };
  }

  // Truly manual entry added directly by patient
  return {
    title: "Patient Self-Reported Entry",
    isDocument: false,
    hasViewLink: false,
    docId: null,
  };
}

export function HealthSummaryView() {
  const { patients, activePatient, activePatientId } = usePatient();
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode: Timeline (Concept 2) vs Category View
  const [viewMode, setViewMode] = useState<"timeline" | "category">("timeline");
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

  // Filter items by category tab
  const filteredItems = useMemo(() => {
    if (selectedCategoryTab === "all") return items;
    return items.filter((item) => item.category === selectedCategoryTab);
  }, [items, selectedCategoryTab]);

  // Group items chronologically for Concept 2 (Timeline View)
  const timelineGroups = useMemo(() => {
    // Sort in reverse chronological order (newest first)
    const sorted = [...filteredItems].sort((a, b) => {
      const dateA = new Date(a.document?.doc_date || a.created_at).getTime();
      const dateB = new Date(b.document?.doc_date || b.created_at).getTime();
      return dateB - dateA;
    });

    // Group by Month & Year, then by Event (Document/Visit)
    const monthsMap = new Map<
      string,
      Map<
        string,
        {
          dateStr: string;
          dateAge: string;
          document: ItemDocument | null;
          items: SummaryItem[];
        }
      >
    >();

    for (const item of sorted) {
      const rawDate = item.document?.doc_date || item.created_at;
      const d = new Date(rawDate);
      const monthYear = !isNaN(d.getTime())
        ? d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase()
        : "OTHER RECORDS";

      const eventKey =
        item.document?.id ||
        (item.page_id
          ? `page_${item.page_id}`
          : item.page_no
          ? `scan_page_${item.page_no}_${formatClinicalDate(rawDate)}`
          : `manual_${formatClinicalDate(rawDate)}`);

      if (!monthsMap.has(monthYear)) {
        monthsMap.set(monthYear, new Map());
      }

      const eventsMap = monthsMap.get(monthYear)!;
      if (!eventsMap.has(eventKey)) {
        eventsMap.set(eventKey, {
          dateStr: formatClinicalDate(rawDate),
          dateAge: getDateAge(rawDate),
          document: item.document || null,
          items: [],
        });
      } else if (!eventsMap.get(eventKey)!.document && item.document) {
        eventsMap.get(eventKey)!.document = item.document;
      }

      eventsMap.get(eventKey)!.items.push(item);
    }

    return Array.from(monthsMap.entries()).map(([month, events]) => ({
      month,
      events: Array.from(events.values()),
    }));
  }, [filteredItems]);

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
      {/* 1. Header & Controls */}
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
            Chronological health timeline, verified prescriptions, and clinical diagnoses
          </p>
        </div>

        {/* View Switcher (Timeline vs Category) & Add Button */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/80 text-xs font-medium">
            <button
              onClick={() => setViewMode("timeline")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all",
                viewMode === "timeline"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Clock className="h-3.5 w-3.5 text-teal-600" />
              <span>Timeline</span>
            </button>
            <button
              onClick={() => setViewMode("category")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all",
                viewMode === "category"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <FolderOpen className="h-3.5 w-3.5 text-teal-600" />
              <span>By Category</span>
            </button>
          </div>

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

      {/* 2. Status Summary Strip */}
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
                {unconfirmedCount} awaiting confirmation
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
            <h3 className="text-sm font-semibold text-slate-900">Add Record Manually</h3>
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
                <label className="text-xs font-semibold text-slate-700 block mb-1">Category</label>
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

      {/* 3. Category Filter Tabs (Applies directly to both Timeline & Category Views) */}
      <div className="flex items-center gap-6 border-b border-slate-200 overflow-x-auto no-scrollbar select-none pt-1">
        {CATEGORY_TABS.map((tab) => {
          const isActive = selectedCategoryTab === tab.id;
          const count =
            tab.id === "all"
              ? items.length
              : items.filter((i) => i.category === tab.id).length;

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

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* CONCEPT 2: CHRONOLOGICAL TIMELINE VIEW                                     */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {viewMode === "timeline" ? (
        <div className="space-y-10 pt-2">
          {timelineGroups.length === 0 ? (
            <div className="apple-card p-12 text-center text-slate-400 text-sm">
              No medical records recorded for this category yet.
            </div>
          ) : (
            timelineGroups.map(({ month, events }) => (
              <div key={month} className="space-y-4">
                {/* Month Milestone Header */}
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-teal-600" />
                  <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
                    {month}
                  </span>
                  <div className="h-[1px] bg-slate-200 flex-1" />
                </div>

                {/* Vertical Timeline Spine */}
                <div className="relative pl-6 sm:pl-8 border-l-2 border-slate-200/80 space-y-6 ml-1 sm:ml-2">
                  {events.map((event, idx) => {
                    const prov = getEventProvenance(event);

                    return (
                      <div key={idx} className="relative">
                        {/* Timeline Node Icon */}
                        <div className="absolute -left-[31px] sm:-left-[39px] top-1.5 h-4 w-4 rounded-full bg-white border-2 border-teal-600 ring-4 ring-white" />

                        {/* Event Card */}
                        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                          {/* Event Card Header */}
                          <div className="bg-slate-50/70 border-b border-slate-100 py-3 px-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {prov.isDocument ? (
                                <FileText className="h-4 w-4 text-teal-600" />
                              ) : (
                                <Users className="h-4 w-4 text-teal-600" />
                              )}
                              <span className="text-xs font-bold text-slate-900">
                                {prov.title}
                              </span>
                              {prov.hasViewLink && prov.docId && (
                                <Link
                                  href={`/documents/${prov.docId}`}
                                  className="text-[11px] text-teal-700 hover:underline inline-flex items-center gap-1 font-medium ml-1"
                                >
                                  <span>View Document</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>{event.dateStr}</span>
                              {event.dateAge && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-500 font-medium">
                                    {event.dateAge}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Event Records */}
                          <div className="divide-y divide-slate-100">
                            {event.items.map((item) => {
                              const displayValue =
                                item.category === "allergy"
                                  ? formatAllergyDisplay(item)
                                  : item.value;
                              const isEditing = editingItem?.id === item.id;
                              const purpose =
                                item.category === "medication"
                                  ? getMedicationPurpose(item.value)
                                  : null;
                              const CategoryIcon =
                                CATEGORY_CONFIG[item.category]?.icon || Pill;
                              const categoryColor =
                                CATEGORY_CONFIG[item.category]?.color ||
                                "text-slate-600 bg-slate-50";

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
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      {/* Category Indicator Icon */}
                                      <div
                                        className={cn(
                                          "p-1.5 rounded-lg border shrink-0 mt-0.5",
                                          categoryColor
                                        )}
                                        title={CATEGORY_CONFIG[item.category]?.label}
                                      >
                                        <CategoryIcon className="h-3.5 w-3.5" />
                                      </div>

                                      <div className="space-y-1 flex-1 min-w-0">
                                        {/* Status Flag if not confirmed */}
                                        {(item.status !== "confirmed" ||
                                          item.source === "patient_entered" ||
                                          item.ocr_check?.state === "disagree" ||
                                          (item.review_reason &&
                                            item.review_reason.includes("OCR"))) && (
                                          <div className="flex items-center gap-2 flex-wrap text-xs pb-0.5">
                                            {item.status === "needs_review" ? (
                                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                <AlertTriangle className="h-3 w-3 text-amber-600" />
                                                Needs Review
                                              </span>
                                            ) : item.status === "extracted" ? (
                                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                                <Sparkles className="h-3 w-3 text-teal-600" />
                                                Extracted from Scan
                                              </span>
                                            ) : null}

                                            {item.source === "patient_entered" && item.document && (
                                              <span className="text-[11px] text-slate-400">
                                                Edited by you
                                              </span>
                                            )}

                                            {(item.ocr_check?.state === "disagree" ||
                                              (item.review_reason &&
                                                item.review_reason.includes("OCR"))) && (
                                              <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                                <AlertTriangle className="h-3 w-3 text-rose-600" />
                                                Second reading disagrees
                                              </span>
                                            )}
                                          </div>
                                        )}

                                        {/* Item Title */}
                                        {isEditing ? (
                                          <div className="pt-1 flex items-center gap-2">
                                            <Input
                                              value={editingItem.value}
                                              onChange={(e) =>
                                                setEditingItem({
                                                  id: item.id,
                                                  value: e.target.value,
                                                })
                                              }
                                              className="h-8 text-sm bg-white"
                                            />
                                            <Button
                                              size="sm"
                                              onClick={handleSaveEdit}
                                              disabled={savingEdit}
                                              className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                                            >
                                              {savingEdit ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                              ) : (
                                                "Save"
                                              )}
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
                                          <div>
                                            <h3 className="text-sm sm:text-base font-semibold text-slate-900 leading-snug">
                                              {displayValue}
                                            </h3>
                                            {/* Purpose note */}
                                            {item.category === "medication" && purpose && (
                                              <p className="text-xs text-slate-500 font-normal mt-0.5">
                                                Used for: {purpose}
                                              </p>
                                            )}
                                          </div>
                                        )}

                                        {/* Page & Confirmation Metadata */}
                                        <div className="flex items-center gap-2 text-xs text-slate-400 pt-0.5">
                                          {item.page_no ? (
                                            <span>Page {item.page_no}</span>
                                          ) : item.source === "patient_entered" ? (
                                            <span>Added manually</span>
                                          ) : null}
                                          {(item.page_no || item.source === "patient_entered") &&
                                            item.last_confirmed_at && <span>•</span>}
                                          {item.last_confirmed_at && (
                                            <span className="text-emerald-700 font-medium">
                                              Confirmed {formatClinicalDate(item.last_confirmed_at)}
                                            </span>
                                          )}
                                        </div>

                                        {/* Confirmation bar if unconfirmed */}
                                        {item.status !== "confirmed" && !isEditing && (
                                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                                            <span className="text-[11px] text-slate-500">
                                              {item.quote
                                                ? `Document quote: "${item.quote}"`
                                                : "Verify against document before confirming"}
                                            </span>
                                            <Button
                                              size="sm"
                                              onClick={() => handleConfirm(item.id)}
                                              disabled={confirmingId === item.id}
                                              className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md shadow-2xs"
                                            >
                                              {confirmingId === item.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                              ) : (
                                                <Check className="h-3 w-3 mr-1" />
                                              )}
                                              Confirm Record
                                            </Button>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Edit & Delete Action Buttons */}
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
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* ────────────────────────────────────────────────────────────────────────── */
        /* CATEGORY VIEW (DESIGN A: Clean List by Category)                           */
        /* ────────────────────────────────────────────────────────────────────────── */
        <div className="space-y-5 pt-1">
          {/* Category Sections */}
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
                    {/* Section Header */}
                    <div className="bg-slate-50/70 border-b border-slate-100 py-3 px-5 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={cn("p-1.5 rounded-lg border", config.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <h2 className="text-sm font-semibold text-slate-800">{config.label}</h2>
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
                                  {(item.status !== "confirmed" ||
                                    item.source === "patient_entered" ||
                                    item.ocr_check?.state === "disagree" ||
                                    (item.review_reason &&
                                      item.review_reason.includes("OCR"))) && (
                                    <div className="flex items-center gap-2.5 flex-wrap text-xs">
                                      {item.status === "needs_review" ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                                          Needs Review
                                        </span>
                                      ) : item.status === "extracted" ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                          <Sparkles className="h-3 w-3 text-teal-600" />
                                          Extracted from Scan
                                        </span>
                                      ) : null}

                                      {item.source === "patient_entered" && (
                                        <span className="text-[11px] text-slate-400">
                                          {item.document ? "Edited by you" : "Added manually"}
                                        </span>
                                      )}

                                      {(item.ocr_check?.state === "disagree" ||
                                        (item.review_reason &&
                                          item.review_reason.includes("OCR"))) && (
                                        <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                          <AlertTriangle className="h-3 w-3 text-rose-600" />
                                          Second reading disagrees:{" "}
                                          {item.review_reason
                                            ? item.review_reason.replace(
                                                /^OCR disagreement:\s*/i,
                                                ""
                                              )
                                            : "dose"}
                                        </span>
                                      )}
                                    </div>
                                  )}

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
                                        {savingEdit ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          "Save"
                                        )}
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
                                      {item.category === "medication" && purpose && (
                                        <p className="text-xs text-slate-500 font-normal mt-0.5">
                                          Used for: {purpose}
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {/* Provenance Metadata Line */}
                                  {!isEditing && (
                                    <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                                      {item.document ? (
                                        <Link
                                          href={`/documents/${item.document.id}`}
                                          className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                                        >
                                          <span>
                                            {DOC_TYPE_LABELS[
                                              (item.document.doc_type || "").toLowerCase()
                                            ] ||
                                              item.document.doc_type ||
                                              "Medical Document"}
                                          </span>
                                          {item.page_no && <span>(Page {item.page_no})</span>}
                                          <ExternalLink className="h-3 w-3" />
                                        </Link>
                                      ) : item.page_no ? (
                                        <span>Scanned Document (Page {item.page_no})</span>
                                      ) : (
                                        <span>Added manually</span>
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
                                          <span className="text-emerald-700 font-medium">
                                            Confirmed {formatClinicalDate(item.last_confirmed_at)}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* Confirmation Bar for Unconfirmed Items */}
                                  {item.status !== "confirmed" && !isEditing && (
                                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                                      <span className="text-[11px] text-slate-500">
                                        {item.quote
                                          ? `Document quote: "${item.quote}"`
                                          : "Verify against document before confirming"}
                                      </span>
                                      <Button
                                        size="sm"
                                        onClick={() => handleConfirm(item.id)}
                                        disabled={confirmingId === item.id}
                                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md shadow-2xs"
                                      >
                                        {confirmingId === item.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                        ) : (
                                          <Check className="h-3 w-3 mr-1" />
                                        )}
                                        Confirm Record
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Actions */}
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
      )}
    </div>
  );
}
