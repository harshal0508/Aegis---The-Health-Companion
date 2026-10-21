import { notFound } from "next/navigation";
import { hashEmergencyToken, hashIpAddress, checkEmergencyRateLimit } from "@/lib/emergency/token";
import {
  isValidEmergencyToken,
  sanitizeResponderData,
  type ResponderPayload,
  type RawDbItem,
  type PageDocMeta,
} from "@/lib/emergency/sanitizer";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface EmergencyRouteResult {
  rateLimited?: boolean;
  data?: ResponderPayload;
}

/**
 * Route Data Loader for /e/[token].
 * Reads emergency card and confirmed items using the service-role client (unauthenticated public access).
 * Strictly guarantees rate limiting, token validation, audit logging, and full sanitization.
 */
export async function getEmergencyResponderData(
  token: string,
  clientIp = "127.0.0.1",
  userAgent = "unknown",
  overrideSupabase?: any
): Promise<EmergencyRouteResult> {
  // 1. Validate token format
  if (!isValidEmergencyToken(token)) {
    notFound();
  }

  // 2. IP Rate Limiting (30 requests/minute per anonymized IP hash)
  const ipHash = hashIpAddress(clientIp);
  const { allowed } = checkEmergencyRateLimit(ipHash);
  if (!allowed) {
    return { rateLimited: true };
  }

  // 3. Service Role lookup of emergency card by SHA-256 token hash
  // Service role is necessary because responder has no session/login
  const tokenHash = hashEmergencyToken(token);
  const supabase = overrideSupabase || createServiceRoleClient();

  const { data: card, error: cardErr } = await supabase
    .from("emergency_cards")
    .select("id, visible_categories, active, user_id, created_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  // Return identical generic 404 for invalid, unknown, or disabled tokens
  if (cardErr || !card || card.active !== true) {
    notFound();
  }

  // 4. Log access audit trail server-side
  void supabase.from("access_log").insert({
    card_id: card.id,
    accessed_at: new Date().toISOString(),
    ip_hash: ipHash,
    user_agent: (userAgent || "unknown").slice(0, 200),
  });

  const visibleCats: string[] = card.visible_categories || [];

  // 5. Fetch Profile (only exposed if category is enabled)
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, blood_group, emergency_contact_name, emergency_contact_phone")
    .eq("id", card.user_id)
    .single();

  // 6. Fetch ONLY CONFIRMED items for allowed categories
  // Internal IDs, storage URLs, and document paths are stripped
  const { data: confirmedRows } = await supabase
    .from("items")
    .select("id, category, value, page_id, created_at, status")
    .eq("user_id", card.user_id)
    .eq("status", "confirmed")
    .in("category", visibleCats);

  // 7. Resolve document metadata for date & age provenance (without exposing document IDs or storage paths)
  const pageIds = Array.from(new Set((confirmedRows || []).map((r: any) => r.page_id).filter(Boolean)));
  const pageMetaMap = new Map<string, PageDocMeta>();

  if (pageIds.length > 0) {
    const { data: pageRows } = await supabase
      .from("pages")
      .select("id, document_id")
      .in("id", pageIds);

    const docIds = Array.from(new Set((pageRows || []).map((p: any) => p.document_id)));
    if (docIds.length > 0) {
      const { data: docRows } = await supabase
        .from("documents")
        .select("id, doc_type, doc_date, doc_date_type")
        .in("id", docIds);

      const docMap = new Map((docRows || []).map((d: any) => [d.id, d]));
      (pageRows || []).forEach((p: any) => {
        const d: any = docMap.get(p.document_id);
        if (d) {
          pageMetaMap.set(p.id, {
            doc_type: d.doc_type || "Medical Document",
            doc_date: d.doc_date,
            doc_date_type: d.doc_date_type || "dated",
          });
        }
      });
    }
  }

  // 8. Apply Sanitizer: Enforces confirmed-only, visible categories, and strips internal IDs/URLs
  const sanitized = sanitizeResponderData({
    rawItems: (confirmedRows as RawDbItem[]) || [],
    visibleCategories: visibleCats,
    pageMetaMap,
    profile,
  });

  return { data: sanitized };
}
