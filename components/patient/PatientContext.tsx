"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

export interface PatientProfile {
  id: string;
  account_id: string;
  full_name: string;
  dob: string | null;
  blood_group: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  relationship_label: string;
  is_self: boolean;
  permission_confirmed_at: string | null;
  created_at: string;
}

export interface AddPatientPayload {
  full_name: string;
  dob: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  relationship_label?: string;
  permission_confirmed: boolean;
}

export interface PatientContextType {
  patients: PatientProfile[];
  activePatient: PatientProfile | null;
  activePatientId: string | null;
  setActivePatientId: (id: string) => void;
  isLoading: boolean;
  error: string | null;
  refreshPatients: () => Promise<void>;
  addPatient: (payload: AddPatientPayload) => Promise<PatientProfile>;
  deletePatient: (id: string) => Promise<void>;
}

const PatientContext = createContext<PatientContextType | undefined>(undefined);

const STORAGE_KEY = "medanchor_active_patient_id";

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [patients, setPatients] = useState<PatientProfile[]>([]);
  const [activePatientId, setActivePatientIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPatients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch("/api/patients");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load patient profiles.");
      }
      const data = await res.json();
      const list: PatientProfile[] = data.patients || [];
      setPatients(list);

      // Determine active patient
      const storedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
      if (storedId && list.some((p) => p.id === storedId)) {
        setActivePatientIdState(storedId);
      } else {
        const selfPatient = list.find((p) => p.is_self) || list[0] || null;
        if (selfPatient) {
          setActivePatientIdState(selfPatient.id);
          if (typeof window !== "undefined") {
            localStorage.setItem(STORAGE_KEY, selfPatient.id);
          }
        }
      }
    } catch (err: any) {
      console.error("[PatientProvider] Error fetching patients:", err);
      setError(err.message || "Failed to load profiles");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPatients();
  }, [refreshPatients]);

  const setActivePatientId = useCallback((id: string) => {
    setActivePatientIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const addPatient = useCallback(
    async (payload: AddPatientPayload): Promise<PatientProfile> => {
      const res = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add family profile.");
      }

      await refreshPatients();
      if (data.patient?.id) {
        setActivePatientId(data.patient.id);
      }
      return data.patient;
    },
    [refreshPatients, setActivePatientId]
  );

  const deletePatient = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/patients/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete patient profile.");
      }

      await refreshPatients();
    },
    [refreshPatients]
  );

  const activePatient = useMemo(() => {
    if (!patients.length) return null;
    return patients.find((p) => p.id === activePatientId) || patients.find((p) => p.is_self) || patients[0];
  }, [patients, activePatientId]);

  const value = useMemo(
    () => ({
      patients,
      activePatient,
      activePatientId: activePatient?.id || null,
      setActivePatientId,
      isLoading,
      error,
      refreshPatients,
      addPatient,
      deletePatient,
    }),
    [patients, activePatient, setActivePatientId, isLoading, error, refreshPatients, addPatient, deletePatient]
  );

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

export function usePatient(): PatientContextType {
  const context = useContext(PatientContext);
  if (!context) {
    throw new Error("usePatient must be used within a PatientProvider");
  }
  return context;
}
