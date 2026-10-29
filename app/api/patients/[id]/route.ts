import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: patientId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: patient, error } = await supabase
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .eq("account_id", user.id)
      .single();

    if (error || !patient) {
      return NextResponse.json(
        { error: "Patient profile not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ patient });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: patientId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    // Disallow altering ownership or is_self flag
    delete body.id;
    delete body.account_id;
    delete body.is_self;

    const { data: updated, error } = await supabase
      .from("patients")
      .update(body)
      .eq("id", patientId)
      .eq("account_id", user.id)
      .select()
      .single();

    if (error || !updated) {
      return NextResponse.json(
        { error: error?.message || "Failed to update profile." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, patient: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: patientId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch patient to ensure ownership and verify is_self is false
    const { data: patient, error: fetchErr } = await supabase
      .from("patients")
      .select("id, is_self, full_name")
      .eq("id", patientId)
      .eq("account_id", user.id)
      .single();

    if (fetchErr || !patient) {
      return NextResponse.json(
        { error: "Patient profile not found." },
        { status: 404 }
      );
    }

    if (patient.is_self) {
      return NextResponse.json(
        { error: "You cannot delete your own primary account profile." },
        { status: 400 }
      );
    }

    // 2. Fetch all document storage paths to clean up files from storage
    const { data: docs } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("patient_id", patientId);

    if (docs && docs.length > 0) {
      const pathsToDelete: string[] = [];
      for (const d of docs) {
        if (d.storage_path) pathsToDelete.push(d.storage_path);
        // Also list page files in directory
        const folder = `${user.id}/${patientId}/${d.id}`;
        const { data: files } = await supabase.storage
          .from("medical-records")
          .list(folder);

        if (files) {
          files.forEach((f) => pathsToDelete.push(`${folder}/${f.name}`));
        }
      }

      if (pathsToDelete.length > 0) {
        await supabase.storage.from("medical-records").remove(pathsToDelete);
      }
    }

    // 3. Delete patient record from database (cascades to documents, items, pages, cards)
    const { error: deleteErr } = await supabase
      .from("patients")
      .delete()
      .eq("id", patientId)
      .eq("account_id", user.id);

    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to delete patient: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedPatientId: patientId,
      message: `Profile '${patient.full_name}' and all associated documents, files, and emergency cards have been permanently removed.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
