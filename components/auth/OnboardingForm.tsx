"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// Step 1: Consent — required before collecting any health data
// Step 2: Profile — personal and emergency contact information
type Step = "consent" | "profile";

const profileSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  dob: z.string().optional(),
  blood_group: z.string().optional(),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−", "Unknown"];

export function OnboardingForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("consent");
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [selectedBloodGroup, setSelectedBloodGroup] = useState("");

  const supabase = createClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  });

  const handleConsentNext = () => {
    if (!consentChecked) {
      setConsentError(true);
      return;
    }
    setConsentError(false);
    setStep("profile");
  };

  const onSubmit = async (data: ProfileFormData) => {
    setServerError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: data.full_name,
      dob: data.dob || null,
      blood_group: selectedBloodGroup || null,
      emergency_contact_name: data.emergency_contact_name || null,
      emergency_contact_phone: data.emergency_contact_phone || null,
    });

    if (error) {
      setServerError(error.message || "Failed to save profile. Please ensure database tables are created.");
      return;
    }

    // Explicitly provision Self patient in patients table (in addition to database trigger)
    try {
      await supabase.from("patients").upsert({
        id: user.id,
        account_id: user.id,
        full_name: data.full_name,
        dob: data.dob || null,
        blood_group: selectedBloodGroup || null,
        emergency_contact_name: data.emergency_contact_name || null,
        emergency_contact_phone: data.emergency_contact_phone || null,
        relationship_label: "Self",
        is_self: true,
        permission_confirmed_at: new Date().toISOString(),
      });
    } catch {
      // Database trigger trg_profile_sync_self_patient or /api/patients handles auto-provisioning
    }

    router.push("/home");
  };

  // ── Step 1: Consent ───────────────────────────────────────────────────────
  if (step === "consent") {
    return (
      <div className="space-y-6">
        <div className="space-y-4 rounded-xl border bg-gray-50 p-5 text-base leading-relaxed text-gray-700">
          <p className="font-semibold text-gray-900">Before you continue</p>
          <p>
            Aegis stores your personal health information — including
            medications, conditions, and documents you upload — securely in your
            account. <strong>Only you can see your records.</strong>
          </p>
          <Separator />
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2">
              <span className="mt-0.5 text-teal-600">✓</span>
              Your data is private and accessible only through your personal account.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-teal-600">✓</span>
              You control who can view your emergency health card.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-teal-600">✓</span>
              You can delete your documents and records at any time.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-teal-600">✓</span>
              Your uploaded documents are processed by Google&apos;s Gemini AI service to extract clinical information.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-amber-600">!</span>
              Aegis is a personal record tool, not a clinical service. It
              does not provide medical guidance of any kind.
            </li>
          </ul>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="consent"
            checked={consentChecked}
            onCheckedChange={(checked) => {
              setConsentChecked(checked === true);
              if (checked) setConsentError(false);
            }}
            aria-describedby={consentError ? "consent-error" : undefined}
          />
          <label
            htmlFor="consent"
            className="cursor-pointer text-base leading-snug text-gray-700"
          >
            I understand that my uploaded documents are processed by Google&apos;s Gemini AI service to extract information, and I agree to continue.
          </label>
        </div>

        {consentError && (
          <p id="consent-error" className="text-sm text-destructive">
            You must agree before continuing.
          </p>
        )}

        <Button className="w-full" onClick={handleConsentNext}>
          Continue
        </Button>
      </div>
    );
  }

  // ── Step 2: Profile ───────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="full_name">
          Full name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="full_name"
          type="text"
          autoComplete="name"
          placeholder="Jane Smith"
          {...register("full_name")}
          aria-invalid={!!errors.full_name}
        />
        {errors.full_name && (
          <p className="text-sm text-destructive">{errors.full_name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="dob">Date of birth</Label>
        <Input
          id="dob"
          type="date"
          autoComplete="bday"
          {...register("dob")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="blood_group">Blood group</Label>
        <Select onValueChange={setSelectedBloodGroup} value={selectedBloodGroup}>
          <SelectTrigger id="blood_group">
            <SelectValue placeholder="Select blood group" />
          </SelectTrigger>
          <SelectContent>
            {BLOOD_GROUPS.map((bg) => (
              <SelectItem key={bg} value={bg}>
                {bg}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <p className="text-base font-medium text-gray-900">Emergency contact</p>
      <p className="text-sm text-muted-foreground -mt-3">
        This person may be contacted if you are unresponsive.
      </p>

      <div className="space-y-2">
        <Label htmlFor="emergency_contact_name">Contact name</Label>
        <Input
          id="emergency_contact_name"
          type="text"
          autoComplete="off"
          placeholder="John Smith"
          {...register("emergency_contact_name")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="emergency_contact_phone">Contact phone</Label>
        <Input
          id="emergency_contact_phone"
          type="tel"
          autoComplete="off"
          placeholder="+1 555 000 0000"
          {...register("emergency_contact_phone")}
        />
      </div>

      {serverError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}
