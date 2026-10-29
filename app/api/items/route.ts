import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const filterPatientId = searchParams.get("patient_id");

    // 1. Fetch user items (filtered by patient_id if provided)
    let query = supabase
      .from("items")
      .select("id, category, value, quote, confidence, status, source, page_id, patient_id, ocr_check, review_reason, created_at, last_confirmed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (filterPatientId) {
      query = query.eq("patient_id", filterPatientId);
    }

    const { data: items, error: itemsErr } = await query;

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    // 2. Fetch pages and documents to attach source provenance
    const pageIds = Array.from(
      new Set((items || []).map((i) => i.page_id).filter(Boolean))
    );

    let pagesMap = new Map<string, { page_no: number; document_id: string }>();
    let docsMap = new Map<
      string,
      {
        id: string;
        doc_type: string;
        doc_date: string | null;
        doc_date_type?: string | null;
        storage_path: string;
        patient_id?: string | null;
        patient_name_as_printed?: string | null;
        patient_name_latin?: string | null;
        patient_dob?: string | null;
        identity_status?: string | null;
        attestation_timestamp?: string | null;
        attestation_type?: string | null;
      }
    >();

    if (pageIds.length > 0) {
      const { data: pages } = await supabase
        .from("pages")
        .select("id, page_no, document_id")
        .in("id", pageIds);

      (pages || []).forEach((p) => {
        pagesMap.set(p.id, { page_no: p.page_no, document_id: p.document_id });
      });

      const docIds = Array.from(
        new Set((pages || []).map((p) => p.document_id).filter(Boolean))
      ) as string[];

      if (docIds.length > 0) {
        // Query documents table with full resilience (select * avoids column mismatch failures)
        const { data: docs, error: docsErr } = await supabase
          .from("documents")
          .select("*")
          .in("id", docIds);

        if (docsErr) {
          // Fallback to core columns if select * encountered an issue
          const { data: fallbackDocs } = await supabase
            .from("documents")
            .select("id, doc_type, doc_date, storage_path")
            .in("id", docIds);

          (fallbackDocs || []).forEach((d) => {
            docsMap.set(d.id, d as any);
          });
        } else {
          (docs || []).forEach((d) => {
            docsMap.set(d.id, d);
          });
        }
      }
    }

    // Combine provenance details with each item
    const enrichedItems = (items || []).map((item) => {
      const pageInfo = item.page_id ? pagesMap.get(item.page_id) : null;
      const docInfo = pageInfo ? docsMap.get(pageInfo.document_id) : null;

      return {
        ...item,
        page_no: pageInfo?.page_no ?? null,
        document: docInfo
          ? {
              id: docInfo.id,
              doc_type: docInfo.doc_type || "Document",
              doc_date: docInfo.doc_date,
              doc_date_type: docInfo.doc_date_type || "unspecified",
              storage_path: docInfo.storage_path,
              identity_status: docInfo.identity_status,
              attestation_timestamp: docInfo.attestation_timestamp,
              attestation_type: docInfo.attestation_type,
              patient_name_as_printed: docInfo.patient_name_as_printed,
              patient_name_latin: docInfo.patient_name_latin,
              patient_dob: docInfo.patient_dob,
              patient_id: docInfo.patient_id,
            }
          : null,
      };
    });

    return NextResponse.json({ items: enrichedItems });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { category, value, patient_id } = body;

    if (!category || !value || value.trim() === "") {
      return NextResponse.json(
        { error: "Category and value are required." },
        { status: 400 }
      );
    }

    const validCategories = [
      "allergy",
      "medication",
      "condition",
      "surgery",
      "lab",
      "implant",
    ];

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Invalid clinical category." },
        { status: 400 }
      );
    }

    const targetPatientId = patient_id || user.id;

    const { data: item, error: insertErr } = await supabase
      .from("items")
      .insert({
        user_id: user.id,
        patient_id: targetPatientId,
        category,
        value: value.trim(),
        source: "patient_entered",
        status: "confirmed",
        last_confirmed_at: new Date().toISOString(),
        confidence: 1.0,
        normalization_source: "none",
      })
      .select()
      .single();

    if (insertErr || !item) {
      return NextResponse.json(
        { error: insertErr?.message || "Failed to create manual item." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, item });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
