/**
 * Prescription Course Tracker & Follow-Up Engine
 * 
 * Implements clinical course management and milestone check-ins:
 * 1. Detects prescribed duration (e.g. "5 days", "7 days", "10 days") when mentioned.
 * 2. If duration is not mentioned: checks in on Day 1, 3, 5, and 7 asking if the patient
 *    is still taking the medication.
 * 3. When marked completed (e.g. on Day 5), generates an immediate doctor follow-up prompt.
 */

export interface CourseProgress {
  medicationId: string;
  medicationName: string;
  prescribedDate: string; // ISO date string
  totalDays: number | null; // null if not explicitly prescribed
  elapsedDays: number;
  isExplicitDuration: boolean;
  status: "active" | "completed";
  completedAt?: string | null;
  currentMilestone?: 1 | 3 | 5 | 7 | null;
  checkInPrompt?: string | null;
  followUpPrompt?: string | null;
  progressPercent: number;
}

/**
 * Extracts duration in days from medication instructions or quotes.
 * e.g. "Augmentin 625mg for 7 days" -> 7
 * e.g. "Tab Paracetamol x 5d" -> 5
 * e.g. "1 Tab TDS x 3 days" -> 3
 * e.g. "for 2 weeks" -> 14
 */
export function extractPrescriptionDuration(text: string): { days: number; raw: string } | null {
  if (!text || typeof text !== "string") return null;

  // Pattern: "for 7 days", "x 5 days", "7 days", "5d", "14 days"
  const dayMatch = text.match(/\b(?:for|x)?\s*(\d{1,2})\s*(?:days?|d)\b/i);
  if (dayMatch && dayMatch[1]) {
    const days = parseInt(dayMatch[1], 10);
    if (days > 0 && days <= 90) {
      return { days, raw: dayMatch[0].trim() };
    }
  }

  // Pattern: "2 weeks", "x 1 week"
  const weekMatch = text.match(/\b(?:for|x)?\s*(\d{1,2})\s*weeks?\b/i);
  if (weekMatch && weekMatch[1]) {
    const weeks = parseInt(weekMatch[1], 10);
    if (weeks > 0 && weeks <= 12) {
      return { days: weeks * 7, raw: weekMatch[0].trim() };
    }
  }

  // Pattern: "1 month", "x 1 month"
  const monthMatch = text.match(/\b(?:for|x)?\s*(\d{1,2})\s*months?\b/i);
  if (monthMatch && monthMatch[1]) {
    const months = parseInt(monthMatch[1], 10);
    if (months > 0 && months <= 6) {
      return { days: months * 30, raw: monthMatch[0].trim() };
    }
  }

  return null;
}

/**
 * Determines which milestone (Day 1, 3, 5, or 7) applies to the current elapsed day.
 */
export function getCheckInMilestone(elapsedDays: number): 1 | 3 | 5 | 7 {
  if (elapsedDays <= 1) return 1;
  if (elapsedDays <= 3) return 3;
  if (elapsedDays <= 5) return 5;
  return 7;
}

/**
 * Computes full progress, milestone prompt, and doctor follow-up recommendation
 * for a given prescription item.
 */
export function calculateCourseProgress(params: {
  medicationId: string;
  medicationName: string;
  textForDuration?: string;
  startDate: string | Date;
  currentDate?: string | Date;
  isCompleted?: boolean;
  completedAt?: string | null;
  doctorName?: string | null;
  clinicName?: string | null;
}): CourseProgress {
  const start = new Date(params.startDate);
  const now = params.currentDate ? new Date(params.currentDate) : new Date();

  // Validate start date; fallback to now if invalid
  const validStart = isNaN(start.getTime()) ? now : start;
  const diffMs = Math.max(0, now.getTime() - validStart.getTime());
  const elapsedDays = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);

  // Check if explicit duration is present
  const durationInfo = params.textForDuration
    ? extractPrescriptionDuration(params.textForDuration)
    : null;
  const totalDays = durationInfo ? durationInfo.days : null;
  const isExplicitDuration = totalDays !== null;

  const isCompleted = Boolean(params.isCompleted);

  let progressPercent = 0;
  if (isCompleted) {
    progressPercent = 100;
  } else if (totalDays) {
    progressPercent = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
  } else {
    // If unbounded, progress through the 7-day initial check-in window
    progressPercent = Math.min(100, Math.round((Math.min(elapsedDays, 7) / 7) * 100));
  }

  const doctorReference = params.doctorName
    ? `with ${params.doctorName}${params.clinicName ? ` at ${params.clinicName}` : ""}`
    : "with your doctor";

  let checkInPrompt: string | null = null;
  let followUpPrompt: string | null = null;
  let currentMilestone: 1 | 3 | 5 | 7 | null = null;

  if (isCompleted) {
    followUpPrompt = `Course marked completed. If your symptoms persist or your doctor advised a follow-up review, please schedule your routine checkup ${doctorReference}.`;
  } else if (isExplicitDuration && totalDays) {
    if (elapsedDays >= totalDays) {
      followUpPrompt = `Your ${totalDays}-day course is now complete. Please schedule your routine follow-up checkup ${doctorReference} to evaluate recovery.`;
    }
  } else {
    // Duration is not mentioned: prompt on Day 1, 3, 5, 7
    currentMilestone = getCheckInMilestone(elapsedDays);
    checkInPrompt = `Day ${currentMilestone} Check-In: Are you still taking this medication?`;
  }

  return {
    medicationId: params.medicationId,
    medicationName: params.medicationName,
    prescribedDate: validStart.toISOString(),
    totalDays,
    elapsedDays,
    isExplicitDuration,
    status: isCompleted ? "completed" : "active",
    completedAt: params.completedAt || null,
    currentMilestone,
    checkInPrompt,
    followUpPrompt,
    progressPercent,
  };
}
