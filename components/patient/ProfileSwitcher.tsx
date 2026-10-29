"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  User,
  Plus,
  Check,
  ChevronDown,
  Trash2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  X,
  Settings,
  ArrowRight,
} from "lucide-react";
import { usePatient, type PatientProfile } from "./PatientContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RELATIONSHIPS = [
  "Mother",
  "Father",
  "Spouse",
  "Child",
  "Sibling",
  "Other",
] as const;

const BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
  "Unknown",
] as const;

export function ProfileSwitcher() {
  const {
    patients,
    activePatient,
    activePatientId,
    setActivePatientId,
    isLoading,
    addPatient,
    deletePatient,
  } = usePatient();

  const [isOpen, setIsOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<PatientProfile | null>(null);

  // Add Profile Form State
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [relationship, setRelationship] = useState<string>("Mother");
  const [bloodGroup, setBloodGroup] = useState<string>("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [permissionConfirmed, setPermissionConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Delete State
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canAddMore = patients.length < 3;

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!fullName.trim()) {
      setAddError("Full legal name is required.");
      return;
    }
    if (!dob.trim()) {
      setAddError("Date of birth is required to verify medical records.");
      return;
    }
    if (!permissionConfirmed) {
      setAddError("You must confirm you have this person's permission.");
      return;
    }

    try {
      setSubmitting(true);
      await addPatient({
        full_name: fullName.trim(),
        dob: dob.trim(),
        relationship_label: relationship,
        blood_group: bloodGroup || undefined,
        emergency_contact_name: contactName.trim() || undefined,
        emergency_contact_phone: contactPhone.trim() || undefined,
        permission_confirmed: permissionConfirmed,
      });

      // Reset and close
      setFullName("");
      setDob("");
      setRelationship("Mother");
      setBloodGroup("");
      setContactName("");
      setContactPhone("");
      setPermissionConfirmed(false);
      setShowAddModal(false);
      setIsOpen(false);
    } catch (err: any) {
      setAddError(err.message || "Failed to add profile");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!profileToDelete) return;
    try {
      setDeleting(true);
      setDeleteError(null);
      await deletePatient(profileToDelete.id);
      setShowDeleteModal(false);
      setProfileToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete profile");
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading && !activePatient) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-400 text-xs font-medium animate-pulse">
        <Users className="h-3.5 w-3.5" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <div className="relative inline-block text-left">
      {/* Switcher Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-slate-200/90 shadow-2xs hover:border-teal-400/80 hover:bg-teal-50/40 text-slate-800 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Switch Patient Profile"
      >
        <div className="h-5 w-5 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-[10px]">
          {activePatient?.relationship_label?.[0]?.toUpperCase() || <User className="h-3 w-3" />}
        </div>
        <div className="flex items-center gap-1.5 max-w-[130px] truncate">
          <span className="truncate">{activePatient?.full_name || "Self"}</span>
          <span className="text-[10px] px-1.5 py-0.2 bg-teal-50 text-teal-700 font-bold border border-teal-200/60 rounded">
            {activePatient?.relationship_label || "Self"}
          </span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white border border-slate-200/80 shadow-xl z-50 p-2 text-slate-800 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">Patient Profiles</p>
                <p className="text-[10px] text-slate-500">
                  {patients.length} of 3 profiles active
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] text-teal-700 border-teal-200 bg-teal-50/50">
                Max 3
              </Badge>
            </div>

            {/* List of profiles */}
            <div className="py-1 space-y-0.5">
              {patients.map((p) => {
                const isSelected = p.id === activePatientId;
                return (
                  <div
                    key={p.id}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-teal-50/80 text-teal-900 font-semibold"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                    onClick={() => {
                      setActivePatientId(p.id);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isSelected
                            ? "bg-teal-600 text-white"
                            : "bg-slate-100 text-slate-600 group-hover:bg-teal-100 group-hover:text-teal-800"
                        }`}
                      >
                        {p.relationship_label?.[0]?.toUpperCase() || "P"}
                      </div>
                      <div className="truncate text-left">
                        <p className="truncate text-xs leading-snug">{p.full_name}</p>
                        <p className="text-[10px] text-slate-400 font-normal">
                          {p.relationship_label} {p.dob ? `· DOB ${p.dob}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      {isSelected && <Check className="h-3.5 w-3.5 text-teal-600" />}
                      {!p.is_self && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProfileToDelete(p);
                            setShowDeleteModal(true);
                            setIsOpen(false);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all"
                          title="Delete profile"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add profile action */}
            <div className="pt-2 border-t border-slate-100 mt-1">
              {canAddMore ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setShowAddModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold text-teal-700 hover:bg-teal-50 border border-dashed border-teal-300 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Family Member</span>
                </button>
              ) : (
                <p className="text-[10px] text-center text-slate-400 py-1">
                  Account limit reached (3 of 3 profiles)
                </p>
              )}
            </div>

            {/* Account Settings & Clinical Scope */}
            <div className="pt-2 border-t border-slate-100 mt-2">
              <Link
                href="/profile"
                onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-between py-1.5 px-3 rounded-xl text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600" />
                  <span>Account &amp; Settings</span>
                </div>
                <ArrowRight className="h-3 w-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Add Family Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div
            className="fixed inset-0"
            onClick={() => !submitting && setShowAddModal(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 z-10 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-serif font-bold text-slate-900">
                  Add Family Member Profile
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Create a dedicated medical profile for your dependent. Each profile keeps separate records, extractions, and emergency cards.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProfile} className="space-y-3.5 pt-1">
              {addError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <Label htmlFor="fullName" className="text-xs font-semibold text-slate-700">
                  Full Legal Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="fullName"
                  placeholder="e.g. Ramesh Chandra Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 text-xs h-9"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Must match the printed name on lab reports and prescriptions.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="dob" className="text-xs font-semibold text-slate-700">
                    Date of Birth <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="mt-1 text-xs h-9"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="relationship" className="text-xs font-semibold text-slate-700">
                    Relationship <span className="text-rose-500">*</span>
                  </Label>
                  <select
                    id="relationship"
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {RELATIONSHIPS.map((rel) => (
                      <option key={rel} value={rel}>
                        {rel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="bloodGroup" className="text-xs font-semibold text-slate-700">
                    Blood Group
                  </Label>
                  <select
                    id="bloodGroup"
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Select (optional)</option>
                    {BLOOD_GROUPS.map((bg) => (
                      <option key={bg} value={bg}>
                        {bg}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor="contactPhone" className="text-xs font-semibold text-slate-700">
                    Emergency Phone
                  </Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="mt-1 text-xs h-9"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="contactName" className="text-xs font-semibold text-slate-700">
                  Emergency Contact Name
                </Label>
                <Input
                  id="contactName"
                  placeholder="e.g. Primary Caregiver / Guardian"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="mt-1 text-xs h-9"
                />
              </div>

              {/* Permission Checkbox (Requirement B.6) */}
              <div className="p-3 bg-teal-50/70 rounded-xl border border-teal-200/70 space-y-1.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={permissionConfirmed}
                    onCheckedChange={(c) => setPermissionConfirmed(Boolean(c))}
                    className="mt-0.5 border-teal-600 data-[state=checked]:bg-teal-600"
                  />
                  <span className="text-xs text-teal-900 leading-snug">
                    <strong>I have this person&apos;s permission</strong> to manage their health records, receive extraction alerts, and generate their emergency medical card.
                  </span>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !fullName.trim() || !dob.trim() || !permissionConfirmed}
                  className="bg-teal-600 hover:bg-teal-700 text-white h-8 text-xs font-semibold gap-1.5"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Create Profile</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div
            className="fixed inset-0"
            onClick={() => !deleting && setShowDeleteModal(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 z-10 space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
              <h2 className="text-lg font-serif font-bold text-slate-900">
                Delete {profileToDelete?.full_name}&apos;s Profile?
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              This action cannot be undone. All documents, uploaded files, extracted clinical items, and the emergency medical card for this profile will be permanently deleted.
            </p>

            {deleteError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {deleteError}
              </div>
            )}

            <div className="pt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="h-8 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="bg-rose-600 hover:bg-rose-700 text-white h-8 text-xs font-semibold gap-1.5"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Delete Profile & Records</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
