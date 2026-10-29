import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: itemId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch item to verify document identity status
    const { data: existingItem, error: fetchErr } = await supabase
      .from("items")
      .select("id, page_id, review_reason, status")
      .eq("id", itemId)
      .eq("user_id", user.id)
      .single();

    if (fetchErr || !existingItem) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // 2. Document Identity Check Guard
    if (existingItem.page_id) {
      const { data: page } = await supabase
        .from("pages")
        .select("document_id")
        .eq("id", existingItem.page_id)
        .single();

      if (page?.document_id) {
        const { data: doc } = await supabase
          .from("documents")
          .select("id, identity_status, attestation_timestamp, attestation_type")
          .eq("id", page.document_id)
          .single();

        if (doc) {
          // Rule 3: Mismatch lock
          if (
            doc.identity_status === "mismatch" &&
            doc.attestation_type !== "same_person_override"
          ) {
            return NextResponse.json(
              {
                error:
                  "Confirmation is disabled: Report appears to be for someone else. Resolve this mismatch first (move to another profile, delete, or attest same person).",
              },
              { status: 400 }
            );
          }

          // Rule 3: name_not_found attestation requirement
          if (doc.identity_status === "name_not_found" && !doc.attestation_timestamp) {
            return NextResponse.json(
              {
                error:
                  "Confirmation is disabled: No patient name was found on this document. You must attest this document before confirming records.",
              },
              { status: 400 }
            );
          }
        }
      }
    }

    const { data: item, error } = await supabase
      .from("items")
      .update({
        status: "confirmed",
        last_confirmed_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error || !item) {
      return NextResponse.json(
        { error: error?.message || "Failed to confirm record" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
