import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { matchPatientIdentity } from "@/lib/extraction/identity-matcher";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { target_patient_id } = body;

    if (!target_patient_id) {
      return NextResponse.json(
        { error: "Target patient ID is required." },
        { status: 400 }
      );
    }

    // 1. Fetch document and verify ownership
    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id, patient_id, storage_path, patient_name_as_printed, patient_name_latin, patient_dob")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docErr || !document) {
      return NextResponse.json(
        { error: "Document not found or access denied." },
        { status: 404 }
      );
    }

    const oldPatientId = document.patient_id || user.id;

    if (oldPatientId === target_patient_id) {
      return NextResponse.json(
        { error: "Document already belongs to this profile." },
        { status: 400 }
      );
    }

    // 2. Fetch target patient and verify it belongs to this account
    const { data: targetPatient, error: targetErr } = await supabase
      .from("patients")
      .select("id, full_name, dob, account_id")
      .eq("id", target_patient_id)
      .eq("account_id", user.id)
      .single();

    if (targetErr || !targetPatient) {
      return NextResponse.json(
        { error: "Target patient profile not found in your account." },
        { status: 404 }
      );
    }

    // 3. Strict Identity Verification: Move is ONLY permitted if printed name matches target profile
    const identityCheck = matchPatientIdentity(
      { full_name: targetPatient.full_name, dob: targetPatient.dob },
      {
        patient_name_as_printed: document.patient_name_as_printed,
        patient_name_latin: document.patient_name_latin,
        patient_dob: document.patient_dob,
      }
    );

    if (identityCheck.outcome !== "match") {
      return NextResponse.json(
        {
          error: `Cannot move to ${targetPatient.full_name}: Document identity does not match this profile (${identityCheck.reason}).`,
        },
        { status: 400 }
      );
    }

    // 4. Fetch pages to collect item IDs
    const { data: pages } = await supabase
      .from("pages")
      .select("id, page_no")
      .eq("document_id", documentId);

    const pageIds = (pages || []).map((p) => p.id);

    // 5. Update patient_id on document and re-set identity_status to match
    const newStoragePath = document.storage_path
      ? document.storage_path.replace(
          new RegExp(`^${user.id}/[^/]+/`),
          `${user.id}/${target_patient_id}/`
        )
      : document.storage_path;

    const { error: docUpdateErr } = await supabase
      .from("documents")
      .update({
        patient_id: target_patient_id,
        storage_path: newStoragePath,
        identity_status: "match",
        identity_details: identityCheck,
        attestation_timestamp: null,
        attestation_type: null,
        attestation_note: `Moved from profile ${oldPatientId} to ${target_patient_id}`,
      })
      .eq("id", documentId);

    if (docUpdateErr) {
      return NextResponse.json(
        { error: `Failed to update document profile: ${docUpdateErr.message}` },
        { status: 500 }
      );
    }

    // 6. Update patient_id and reset items to needs_review (Rule 5)
    if (pageIds.length > 0) {
      await supabase
        .from("items")
        .update({
          patient_id: target_patient_id,
          status: "needs_review",
          review_reason: `Transferred to ${targetPatient.full_name}. Please re-verify clinical items.`,
          last_confirmed_at: null,
        })
        .in("page_id", pageIds);
    }

    // 7. Log transfer in audit table
    try {
      await supabase.from("document_move_log").insert({
        document_id: documentId,
        from_patient_id: oldPatientId,
        to_patient_id: target_patient_id,
        moved_by: user.id,
        reason: `Identity matched target profile ${targetPatient.full_name}`,
      });
    } catch {
      // Non-blocking if table is pending migration
    }

    // 8. Relocate storage files if stored in path format {account_id}/{patient_id}/{doc_id}/*
    try {
      const oldPrefix = `${user.id}/${oldPatientId}/${documentId}`;
      const newPrefix = `${user.id}/${target_patient_id}/${documentId}`;

      const { data: files } = await supabase.storage
        .from("medical-records")
        .list(oldPrefix);

      if (files && files.length > 0) {
        for (const f of files) {
          await supabase.storage
            .from("medical-records")
            .move(`${oldPrefix}/${f.name}`, `${newPrefix}/${f.name}`);
        }
      }
    } catch {
      // Non-blocking storage move
    }

    return NextResponse.json({
      success: true,
      documentId,
      oldPatientId,
      newPatientId: target_patient_id,
      newPatientName: targetPatient.full_name,
      identityStatus: "match",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
