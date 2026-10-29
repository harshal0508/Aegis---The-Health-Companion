"use client";

import React, { useState, useEffect } from "react";
import {
  Pill,
  CheckCircle2,
  Calendar,
  Clock,
  Sparkles,
  Stethoscope,
  ChevronRight,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMedicationPurpose } from "@/lib/medications/purpose-resolver";
import {
  calculateCourseProgress,
  CourseProgress,
} from "@/lib/medications/course-tracker";

interface MedicationItem {
  id: string;
  value: string;
  quote?: string | null;
  created_at: string;
  status: string;
}

interface TreatmentCourseCardProps {
  medications: MedicationItem[];
  patientId: string;
  patientName: string;
}

export function TreatmentCourseCard({
  medications,
  patientId,
  patientName,
}: TreatmentCourseCardProps) {
  // Keyed state for completed medications and dismissed check-ins
  const [completedMeds, setCompletedMeds] = useState<Record<string, string>>({});
  const [acknowledgedCheckins, setAcknowledgedCheckins] = useState<Record<string, number>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const savedCompleted = localStorage.getItem(`aegis_courses_completed_${patientId}`);
      if (savedCompleted) {
        setCompletedMeds(JSON.parse(savedCompleted));
      }
      const savedAck = localStorage.getItem(`aegis_courses_ack_${patientId}`);
      if (savedAck) {
        setAcknowledgedCheckins(JSON.parse(savedAck));
      }
    } catch {
      // LocalStorage unavailable/disabled
    }
  }, [patientId]);

  const handleMarkCompleted = (medId: string) => {
    const timestamp = new Date().toISOString();
    const updated = { ...completedMeds, [medId]: timestamp };
    setCompletedMeds(updated);
    try {
      localStorage.setItem(`aegis_courses_completed_${patientId}`, JSON.stringify(updated));
    } catch {}
  };

  const handleStillTaking = (medId: string, milestone: number) => {
    const updated = { ...acknowledgedCheckins, [medId]: milestone };
    setAcknowledgedCheckins(updated);
    try {
      localStorage.setItem(`aegis_courses_ack_${patientId}`, JSON.stringify(updated));
    } catch {}
  };

  const handleReactivateCourse = (medId: string) => {
    const updated = { ...completedMeds };
    delete updated[medId];
    setCompletedMeds(updated);
    try {
      localStorage.setItem(`aegis_courses_completed_${patientId}`, JSON.stringify(updated));
    } catch {}
  };

  if (!medications || medications.length === 0) {
    return null;
  }

  return (
    <div className="apple-card p-5 sm:p-6 bg-white space-y-4 border border-slate-200/90 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center">
            <Pill className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-serif font-medium text-slate-900">
                Prescription Course &amp; Follow-Up Tracker
              </h2>
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                Active Treatment
              </Badge>
            </div>
            <p className="text-[11px] text-slate-400 font-normal">
              Tracking prescribed durations and milestone check-ins for {patientName.split(" ")[0]}
            </p>
          </div>
        </div>
      </div>

      {/* Medication Course List */}
      <div className="space-y-3.5 pt-1">
        {medications.map((med) => {
          const isCompleted = Boolean(completedMeds[med.id]);
          const completedAt = completedMeds[med.id] || null;
          const purpose = getMedicationPurpose(med.value);

          const course = calculateCourseProgress({
            medicationId: med.id,
            medicationName: med.value,
            textForDuration: med.quote ? `${med.value} ${med.quote}` : med.value,
            startDate: med.created_at,
            isCompleted,
            completedAt,
          });

          const currentMilestone = course.currentMilestone;
          const hasAcknowledgedCurrentMilestone =
            currentMilestone !== null &&
            currentMilestone !== undefined &&
            acknowledgedCheckins[med.id] === currentMilestone;

          return (
            <div
              key={med.id}
              className={`p-4 rounded-xl border transition-all ${
                isCompleted
                  ? "bg-slate-50/70 border-slate-200"
                  : "bg-gradient-to-r from-blue-50/20 via-white to-white border-blue-100 shadow-2xs"
              }`}
            >
              {/* Top Row: Name, Purpose Pill & Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">
                      {med.value}
                    </span>
                    {purpose && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80 text-[10px] font-medium">
                        <Info className="h-2.5 w-2.5 text-blue-600" />
                        <span>Used for: {purpose}</span>
                      </span>
                    )}
                  </div>

                  {/* Duration Context */}
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>
                      {course.isExplicitDuration && course.totalDays
                        ? `Day ${Math.min(course.elapsedDays, course.totalDays)} of ${course.totalDays}-day course`
                        : `Day ${course.elapsedDays} of treatment`}
                    </span>
                  </div>
                </div>

                {/* Progress / Status Badge */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {isCompleted ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs px-2.5 py-0.5 font-medium">
                      <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-600" /> Course Completed
                    </Badge>
                  ) : course.isExplicitDuration && course.totalDays ? (
                    <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {Math.max(0, course.totalDays - course.elapsedDays)} days left
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Progress Bar for Explicit Duration */}
              {course.isExplicitDuration && !isCompleted && course.totalDays && (
                <div className="mt-3">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${course.progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Milestone Check-In Prompts (Days 1, 3, 5, 7 when duration not explicit) */}
              {!course.isExplicitDuration && !isCompleted && course.checkInPrompt && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/40 -mx-4 -mb-4 p-3.5 rounded-b-xl border-t border-amber-100/80">
                  <div className="flex items-center gap-2 text-xs text-amber-900 font-medium">
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                    <span>{course.checkInPrompt}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {!hasAcknowledgedCurrentMilestone ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStillTaking(med.id, currentMilestone!)}
                        className="h-7 text-xs bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      >
                        Still Taking
                      </Button>
                    ) : (
                      <span className="text-[11px] text-slate-500 font-medium px-2 py-0.5 bg-white/80 rounded border">
                        Checked on Day {currentMilestone}
                      </span>
                    )}

                    <Button
                      size="sm"
                      onClick={() => handleMarkCompleted(med.id)}
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Mark Completed
                    </Button>
                  </div>
                </div>
              )}

              {/* Explicit Duration: Quick Mark Completed Button */}
              {course.isExplicitDuration && !isCompleted && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMarkCompleted(med.id)}
                    className="h-7 text-xs text-slate-700 hover:text-emerald-700 hover:border-emerald-300"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Mark Course Completed
                  </Button>
                </div>
              )}

              {/* Doctor Follow-Up Recommendation Box (Shown upon completion or end of course) */}
              {course.followUpPrompt && (
                <div className="mt-3 p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-900 leading-relaxed">
                  <Stethoscope className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <span className="font-bold text-emerald-950 block">
                      Routine Doctor Follow-Up:
                    </span>
                    <p>{course.followUpPrompt}</p>
                  </div>
                  {isCompleted && (
                    <button
                      onClick={() => handleReactivateCourse(med.id)}
                      className="text-[11px] text-emerald-700 underline hover:text-emerald-800 self-center"
                      title="Undo completion if you are still taking this medication"
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
