import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

/**
 * GET /api/patients
 * Lists all patient profiles associated with the authenticated account (maximum 3).
 * Auto-creates the Self profile from profiles row if not already created.
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch patients for this account
    let { data: patients, error: listErr } = await supabase
      .from("patients")
      .select("*")
      .eq("account_id", user.id)
      .order("is_self", { ascending: false })
      .order("created_at", { ascending: true });

    // 2. Auto-provision Self patient from existing profile if list is empty
    if (!patients || patients.length === 0) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        const { data: selfPatient, error: insErr } = await supabase
          .from("patients")
          .insert({
            id: profile.id,
            account_id: user.id,
            full_name: profile.full_name || "Self",
            dob: profile.dob,
            blood_group: profile.blood_group,
            emergency_contact_name: profile.emergency_contact_name,
            emergency_contact_phone: profile.emergency_contact_phone,
            relationship_label: "Self",
            is_self: true,
            permission_confirmed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (!insErr && selfPatient) {
          patients = [selfPatient];
        }
      }
    }

    return NextResponse.json({
      patients: patients || [],
      count: (patients || []).length,
      maxAllowed: 3,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/patients
 * Creates a dependent family profile for the account (Mother, Father, Spouse, Child, etc.).
 * Strictly enforces a hard ceiling of 3 profiles per account.
 * Requires legal name, DOB, and permission attestation.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      full_name,
      dob,
      blood_group,
      emergency_contact_name,
      emergency_contact_phone,
      relationship_label,
      permission_confirmed,
    } = body;

    // Validation
    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
      return NextResponse.json(
        { error: "Full legal name is required." },
        { status: 400 }
      );
    }

    if (!dob || typeof dob !== "string" || !dob.trim()) {
      return NextResponse.json(
        { error: "Date of birth is required to verify medical records." },
        { status: 400 }
      );
    }

    if (!permission_confirmed) {
      return NextResponse.json(
        {
          error:
            "You must confirm that you have this person's permission to manage their medical records.",
        },
        { status: 400 }
      );
    }

    // Check account limit: max 3 profiles
    const { count, error: countErr } = await supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("account_id", user.id);

    if (!countErr && (count ?? 0) >= 3) {
      return NextResponse.json(
        {
          error:
            "Maximum 3 patient profiles reached (yourself plus two family members). To add another, please delete an existing dependent profile.",
        },
        { status: 400 }
      );
    }

    const { data: newPatient, error: insertErr } = await supabase
      .from("patients")
      .insert({
        account_id: user.id,
        full_name: full_name.trim(),
        dob: dob.trim(),
        blood_group: blood_group ? blood_group.trim() : null,
        emergency_contact_name: emergency_contact_name ? emergency_contact_name.trim() : null,
        emergency_contact_phone: emergency_contact_phone ? emergency_contact_phone.trim() : null,
        relationship_label: relationship_label ? relationship_label.trim() : "Dependent",
        is_self: false,
        permission_confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr || !newPatient) {
      return NextResponse.json(
        { error: insertErr?.message || "Failed to create patient profile." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      patient: newPatient,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
