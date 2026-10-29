import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    const { action, note } = body;

    if (!action || !["attest_name_not_found", "same_person"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'attest_name_not_found' or 'same_person'." },
        { status: 400 }
      );
    }

    // 1. Fetch document
    const { data: document, error: docErr } = await supabase
      .from("documents")
      .select("id, user_id, identity_status, attestation_timestamp")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .single();

    if (docErr || !document) {
      return NextResponse.json(
        { error: "Document not found or access denied." },
        { status: 404 }
      );
    }

    const timestamp = new Date().toISOString();
    let attestationType: "name_not_found_attested" | "same_person_override";

    if (action === "attest_name_not_found") {
      attestationType = "name_not_found_attested";
    } else {
      attestationType = "same_person_override";
    }

    // 2. Update document attestation fields
    const updatePayload: Record<string, any> = {
      attestation_timestamp: timestamp,
      attestation_type: attestationType,
      attestation_note: note || null,
    };

    const { error: updateErr } = await supabase
      .from("documents")
      .update(updatePayload)
      .eq("id", documentId);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to record attestation: ${updateErr.message}` },
        { status: 500 }
      );
    }

    // 3. If resolving a mismatch via "same_person", clear the blocking review_reason from items
    if (action === "same_person") {
      const { data: docPages } = await supabase
        .from("pages")
        .select("id")
        .eq("document_id", documentId);

      const pageIds = (docPages || []).map((p) => p.id);
      if (pageIds.length > 0) {
        await supabase
          .from("items")
          .update({
            review_reason: null,
          })
          .eq("user_id", user.id)
          .in("page_id", pageIds)
          .eq("review_reason", "Report appears to be for someone else");
      }
    }

    return NextResponse.json({
      success: true,
      documentId,
      attestation_type: attestationType,
      attestation_timestamp: timestamp,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
