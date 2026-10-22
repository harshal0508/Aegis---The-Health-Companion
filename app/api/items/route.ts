import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch user items
    const { data: items, error: itemsErr } = await supabase
      .from("items")
      .select("id, category, value, quote, confidence, status, source, page_id, sources, ocr_check, review_reason, created_at, last_confirmed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

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
      { id: string; doc_type: string; doc_date: string | null; doc_date_type?: string | null; storage_path: string }
    >();

    if (pageIds.length > 0) {
      const { data: pages } = await supabase
        .from("pages")
        .select("id, page_no, document_id")
        .in("id", pageIds);

      (pages || []).forEach((p) => {
        pagesMap.set(p.id, { page_no: p.page_no, document_id: p.document_id });
      });

      const docIds = Array.from(new Set((pages || []).map((p) => p.document_id)));
      if (docIds.length > 0) {
        const { data: docs } = await supabase
          .from("documents")
          .select("id, doc_type, doc_date, doc_date_type, storage_path")
          .in("id", docIds);

        (docs || []).forEach((d) => {
          docsMap.set(d.id, d);
        });
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
    const { category, value } = body;

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

    const { data: item, error: insertErr } = await supabase
      .from("items")
      .insert({
        user_id: user.id,
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
