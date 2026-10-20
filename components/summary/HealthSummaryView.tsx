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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatClinicalDate, getDateAge } from "@/lib/utils";

interface ItemDocument {
  id: string;
  doc_type: string;
  doc_date: string | null;
  doc_date_type?: string | null;
  storage_path: string;
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
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; emptyText: string; color: string }
> = {
  allergy: {
    label: "Allergies & Adverse Reactions",
    icon: ShieldAlert,
    emptyText: "No allergy information recorded",
    color: "text-rose-600 bg-rose-50 border-rose-200",
  },
  medication: {
    label: "Active Medications",
    icon: Pill,
    emptyText: "No medications recorded",
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  condition: {
    label: "Conditions & Diagnoses",
    icon: Activity,
    emptyText: "No conditions or diagnoses recorded",
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
  surgery: {
    label: "Surgeries & Procedures",
    icon: Scissors,
    emptyText: "No surgeries or procedures recorded",
    color: "text-purple-600 bg-purple-50 border-purple-200",
  },
  lab: {
    label: "Lab Results & Investigations",
    icon: FileCheck2,
    emptyText: "No lab results recorded",
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  implant: {
    label: "Implants & Devices",
    icon: Cpu,
    emptyText: "No implants or devices recorded",
    color: "text-slate-600 bg-slate-50 border-slate-200",
  },
};

export function HealthSummaryView() {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interaction states
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
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
    try {
      const res = await fetch("/api/items");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load summary items");
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || "Could not retrieve records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

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
        body: JSON.stringify({ category: newCategory, value: newValue.trim() }),
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

  /**
   * Safety formatting for allergy statements:
   * Rule: NKDA displays as "No known drug allergies, per <doc type>, <date> (<age>)", never a bare "No allergies".
   */
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
      <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-8 w-8 text-teal-600 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading your clinical health summary...</p>
      </div>
    );
  }

  const confirmedCount = items.filter((i) => i.status === "confirmed").length;
  const unconfirmedCount = items.filter((i) => i.status !== "confirmed").length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Health Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Confirmed medical records & extracted document findings
          </p>
        </div>

        <Button
          onClick={() => setIsAdding(!isAdding)}
          className="bg-teal-600 hover:bg-teal-700 text-white shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Add Manual Entry
        </Button>
      </div>

      {/* Manual Entry Form */}
      {isAdding && (
        <Card className="border-teal-200 bg-teal-50/20 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Plus className="h-4 w-4 text-teal-600" />
              Add Patient-Entered Health Record
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateManual} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full text-sm border rounded-lg p-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="allergy">Allergy</option>
                    <option value="medication">Medication</option>
                    <option value="condition">Condition / Diagnosis</option>
                    <option value="surgery">Surgery / Procedure</option>
                    <option value="lab">Lab Result</option>
                    <option value="implant">Implant / Device</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Description or Drug Name (with dose if known)
                  </label>
                  <Input
                    placeholder="e.g. Metformin 500mg PO BID or Penicillin (Rash)"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="bg-white"
                  />
                </div>
              </div>

              {addingError && (
                <p className="text-xs text-rose-600 font-medium">{addingError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAdding(false)}
                  disabled={savingNew}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingNew}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  {savingNew ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                      Saving...
                    </>
                  ) : (
                    "Save to Summary"
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Safety Notice & Status Count Bar */}
      <div className="bg-gray-50 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-teal-600 flex-shrink-0" />
          <span>
            <strong>Patient Confirmation Rule:</strong> Extracted items start as unconfirmed.
            Only records confirmed by you appear on your Emergency Card.
          </span>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto font-mono text-[11px]">
          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
            {confirmedCount} Confirmed
          </span>
          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
            {unconfirmedCount} Unconfirmed
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Clinical Sections */}
      <div className="space-y-6">
        {Object.keys(CATEGORY_CONFIG).map((categoryKey) => {
          const config = CATEGORY_CONFIG[categoryKey];
          const categoryItems = items.filter((i) => i.category === categoryKey);
          const Icon = config.icon;

          return (
            <Card key={categoryKey} className="border shadow-sm overflow-hidden">
              <CardHeader className="bg-gray-50/70 border-b py-3 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-lg border ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base font-semibold text-gray-900">
                      {config.label}
                    </CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {categoryItems.length} {categoryItems.length === 1 ? "entry" : "entries"}
                  </span>
                </div>
              </CardHeader>

              <CardContent className="p-0 divide-y divide-gray-100">
                {categoryItems.length === 0 ? (
                  <div className="py-6 px-5 text-sm text-gray-500 italic bg-white">
                    {config.emptyText}
                  </div>
                ) : (
                  categoryItems.map((item) => {
                    const displayValue =
                      item.category === "allergy"
                        ? formatAllergyDisplay(item)
                        : item.value;

                    const isEditing = editingItem?.id === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`p-5 transition-colors ${
                          item.status === "confirmed"
                            ? "bg-white hover:bg-gray-50/50"
                            : "bg-amber-50/20 hover:bg-amber-50/30"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          {/* Item Value & Verbatim Details */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Status Badge */}
                              {item.status === "confirmed" ? (
                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[11px] px-2 py-0.5">
                                  <Check className="h-3 w-3 mr-1" /> Confirmed
                                </Badge>
                              ) : item.status === "needs_review" ? (
                                <Badge variant="review" className="text-[11px] px-2 py-0.5">
                                  <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" /> Needs Review
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[11px] px-2 py-0.5 text-gray-700 bg-gray-100">
                                  <Sparkles className="h-3 w-3 mr-1 text-teal-600" /> Extracted (Unconfirmed)
                                </Badge>
                              )}

                              {/* Distinguish Edited vs Manual vs Document Items */}
                              {item.source === "patient_entered" && item.document && (
                                <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                                  Edited by you
                                </Badge>
                              )}

                              {item.source === "patient_entered" && !item.document && (
                                <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">
                                  Added by you, no document
                                </Badge>
                              )}
                            </div>

                            {/* Main Display Value / Inline Edit */}
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
                              <p className="text-base font-medium text-gray-900 leading-snug break-words">
                                {displayValue}
                              </p>
                            )}

                            {/* Verbatim Supporting Quote */}
                            {item.quote && !isEditing && (
                              <div className="text-xs text-gray-700 bg-gray-50 rounded-lg p-2.5 border-l-2 border-teal-500 mt-2">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 block mb-0.5">
                                  {item.source === "patient_entered"
                                    ? "Original Document Quote (prior to your edit):"
                                    : "Verbatim Quote from Document:"}
                                </span>
                                <p className="italic font-serif text-gray-800">
                                  &quot;{item.quote}&quot;
                                </p>
                              </div>
                            )}

                            {/* Multi-source quotes notice if merged */}
                            {item.sources && item.sources.length > 1 && !isEditing && (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                Supported by {item.sources.length} distinct verbatim mentions in document.
                              </div>
                            )}

                            {/* Source Provenance Link & Dates */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 flex-wrap">
                              {item.document ? (
                                <Link
                                  href={`/documents/${item.document.id}`}
                                  className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
                                >
                                  {item.document.doc_type || "Document"}
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span>Direct Entry</span>
                              )}

                              {item.page_no && (
                                <span>• Page {item.page_no}</span>
                              )}

                              {item.document?.doc_date ? (
                                <span>
                                  • {item.document.doc_date_type === "signed" ? "Signed" : "Document Date"}:{" "}
                                  <strong className="text-gray-700">
                                    {formatClinicalDate(item.document.doc_date)}
                                  </strong>{" "}
                                  ({getDateAge(item.document.doc_date)})
                                </span>
                              ) : item.document ? (
                                <span>• Document date: not set</span>
                              ) : null}

                              {item.last_confirmed_at && (
                                <span className="text-emerald-700">
                                  • Confirmed {formatClinicalDate(item.last_confirmed_at)}
                                </span>
                              )}
                            </div>

                            {/* Confirm Action Bar adjacent to Quote & Document Link */}
                            {item.status !== "confirmed" && !isEditing && (
                              <div className="mt-3 pt-2.5 border-t border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-amber-50/40 p-2.5 rounded-lg border border-amber-200/60">
                                <div className="text-[11px] text-amber-900 flex items-center gap-1.5">
                                  <Info className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                                  <span>Compare quote against {item.page_no ? `Page ${item.page_no}` : "your scan"} before confirming.</span>
                                </div>
                                <Button
                                  size="sm"
                                  disabled={confirmingId === item.id}
                                  onClick={() => handleConfirm(item.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 font-medium shadow-sm flex-shrink-0"
                                >
                                  {confirmingId === item.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 mr-1.5" />
                                  )}
                                  I checked this against my document
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons: Edit, Remove */}
                          <div className="flex items-center gap-1 self-end sm:self-start pt-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingItem({ id: item.id, value: item.value })}
                              className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900"
                              title="Edit item"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deletingId === item.id}
                              onClick={() => handleDelete(item.id)}
                              className="h-8 w-8 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
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
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
