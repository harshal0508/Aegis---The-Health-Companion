import { describe, it, expect } from "vitest";
import {
  extractPrescriptionDuration,
  getCheckInMilestone,
  calculateCourseProgress,
} from "@/lib/medications/course-tracker";

describe("Prescription Course Tracker", () => {
  it("extracts explicit durations accurately", () => {
    expect(extractPrescriptionDuration("Augmentin 625mg for 7 days")?.days).toBe(7);
    expect(extractPrescriptionDuration("Paracetamol 650mg x 5 days")?.days).toBe(5);
    expect(extractPrescriptionDuration("Azithromycin 500mg 3d")?.days).toBe(3);
    expect(extractPrescriptionDuration("Tab Pantocid 40 for 2 weeks")?.days).toBe(14);
    expect(extractPrescriptionDuration("Metformin 500mg daily")).toBeNull();
  });

  it("determines check-in milestones for Day 1, 3, 5, 7", () => {
    expect(getCheckInMilestone(1)).toBe(1);
    expect(getCheckInMilestone(2)).toBe(3);
    expect(getCheckInMilestone(3)).toBe(3);
    expect(getCheckInMilestone(4)).toBe(5);
    expect(getCheckInMilestone(5)).toBe(5);
    expect(getCheckInMilestone(6)).toBe(7);
    expect(getCheckInMilestone(7)).toBe(7);
    expect(getCheckInMilestone(10)).toBe(7);
  });

  it("handles unmentioned duration with milestone check-in prompts", () => {
    const startDate = new Date("2026-10-25T10:00:00Z");
    // 4 days later = Day 5
    const currentDate = new Date("2026-10-29T10:00:00Z");

    const progress = calculateCourseProgress({
      medicationId: "med-1",
      medicationName: "Amoxicillin 500mg",
      startDate,
      currentDate,
    });

    expect(progress.isExplicitDuration).toBe(false);
    expect(progress.totalDays).toBeNull();
    expect(progress.elapsedDays).toBe(5);
    expect(progress.currentMilestone).toBe(5);
    expect(progress.checkInPrompt).toBe("Day 5 Check-In: Are you still taking this medication?");
    expect(progress.status).toBe("active");
  });

  it("prompts for doctor follow-up when marked completed on Day 5", () => {
    const startDate = new Date("2026-10-25T10:00:00Z");
    const currentDate = new Date("2026-10-29T10:00:00Z");

    const progress = calculateCourseProgress({
      medicationId: "med-1",
      medicationName: "Amoxicillin 500mg",
      startDate,
      currentDate,
      isCompleted: true,
      doctorName: "Dr. Sharma",
      clinicName: "Apollo Clinic",
    });

    expect(progress.status).toBe("completed");
    expect(progress.followUpPrompt).toContain("Course marked completed");
    expect(progress.followUpPrompt).toContain("Dr. Sharma at Apollo Clinic");
  });

  it("tracks explicit 7-day course and prompts follow-up upon completion", () => {
    const startDate = new Date("2026-10-22T10:00:00Z");
    // 7 days later
    const currentDate = new Date("2026-10-29T10:00:00Z");

    const progress = calculateCourseProgress({
      medicationId: "med-2",
      medicationName: "Augmentin 625mg",
      textForDuration: "Augmentin 625mg for 7 days",
      startDate,
      currentDate,
      doctorName: "Dr. Mehta",
    });

    expect(progress.isExplicitDuration).toBe(true);
    expect(progress.totalDays).toBe(7);
    expect(progress.elapsedDays).toBe(8);
    expect(progress.followUpPrompt).toContain("Your 7-day course is now complete");
    expect(progress.followUpPrompt).toContain("Dr. Mehta");
  });
});
