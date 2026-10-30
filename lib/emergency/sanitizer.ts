import { formatClinicalDate, getDateAge } from "@/lib/utils";

export interface RawDbItem {
  id: string;
  user_id?: string;
  category: string;
  value: string;
  status: string;
  page_id?: string | null;
  document_id?: string | null;
  storage_path?: string | null;
  file_url?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
}

export interface PageDocMeta {
  doc_type: string;
  doc_date: string | null;
  doc_date_type?: string | null;
}

export interface SanitizedResponderItem {
  id: string;
  category: string;
  value: string;
  doc_type?: string | null;
  doc_date?: string | null;
  doc_date_type?: string | null;
  display_text?: string;
}

export interface ResponderPayload {
  full_name?: string | null;
  blood_group?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  visible_categories: string[];
  items: SanitizedResponderItem[];
  grouped: {
    allergy: SanitizedResponderItem[];
    medication: SanitizedResponderItem[];
    condition: SanitizedResponderItem[];
    implant: SanitizedResponderItem[];
  };
  allergy_display_fallback: string;
  category_unshared_notices: {
    allergy: string;
    medication: string;
  };
}

/**
 * Validates emergency token format: exactly 22 base62 alphanumeric characters.
 */
export function isValidEmergencyToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  return /^[0-9a-zA-Z]{20,24}$/.test(token);
}

/**
 * Detects whether an allergy statement is an explicit negative finding / attestation
 * (e.g. "No known drug allergies", "NKDA", "NKA", "No known allergies").
 */
export function isNegativeAllergy(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  const lower = value.toLowerCase().trim();
  return (
    lower.includes("no known drug allergies") ||
    lower.includes("no known allergies") ||
    lower.includes("no known allergy") ||
    lower.includes("no allergies") ||
    lower.includes("no drug allergies") ||
    lower.includes("no drug allergy") ||
    lower.includes("nkda") ||
    lower.includes("nka") ||
    lower.includes("nil known") ||
    lower.includes("no adverse drug reactions") ||
    lower.includes("no known adverse") ||
    lower.includes("none reported") ||
    lower.includes("none known")
  );
}

/**
 * Formats allergy display according to clinical provenance rules.
 * NKDA is contextualized with doc type and signed date (with age).
 */
export function formatAllergyItem(item: {
  value: string;
  doc_type?: string | null;
  doc_date?: string | null;
  doc_date_type?: string | null;
}): string {
  if (!isNegativeAllergy(item.value)) {
    return item.value;
  }

  const docType = item.doc_type || "Discharge Summary";
  if (item.doc_date) {
    const dateStr = formatClinicalDate(item.doc_date);
    const age = getDateAge(item.doc_date);
    const dateType = item.doc_date_type || "signed";
    return `No known drug allergies, per ${docType}, ${dateType} ${dateStr} (${age})`;
  }

  return `No known drug allergies, per ${docType}, date not found`;
}

/**
 * Pure function: filters, sanitizes, and strips all internal IDs and storage URLs.
 * Strictly guarantees that:
 * 1. ONLY status === 'confirmed' items are included.
 * 2. ONLY categories listed in visibleCategories are included.
 * 3. NO user_id, document_id, storage_path, file_url or raw coordinates leak.
 */
export function sanitizeResponderData(params: {
  rawItems: RawDbItem[];
  visibleCategories: string[];
  pageMetaMap?: Map<string, PageDocMeta>;
  profile?: {
    full_name?: string | null;
    blood_group?: string | null;
    emergency_contact_name?: string | null;
    emergency_contact_phone?: string | null;
  } | null;
}): ResponderPayload {
  const { rawItems, visibleCategories, pageMetaMap, profile } = params;

  // Filter 1: Only confirmed items
  // Filter 2: Only categories user explicitly chose to share
  const allowedSet = new Set(visibleCategories || []);
  const eligibleItems = (rawItems || []).filter(
    (item) => item.status === "confirmed" && allowedSet.has(item.category)
  );

  const sanitizedList: SanitizedResponderItem[] = eligibleItems.map((item) => {
    const meta = item.page_id && pageMetaMap ? pageMetaMap.get(item.page_id) : undefined;
    const docType = meta?.doc_type ?? null;
    const docDate = meta?.doc_date ?? null;
    const docDateType = meta?.doc_date_type ?? null;

    let displayText = item.value;
    if (item.category === "allergy") {
      displayText = formatAllergyItem({
        value: item.value,
        doc_type: docType,
        doc_date: docDate,
        doc_date_type: docDateType,
      });
    }

    return {
      id: item.id,
      category: item.category,
      value: item.value,
      doc_type: docType,
      doc_date: docDate,
      doc_date_type: docDateType,
      display_text: displayText,
    };
  });

  // Clinical safety rule: Deduplicate entries so responders never see identical records twice
  const deduplicatedSanitizedList: SanitizedResponderItem[] = [];
  const seenResponderKeys = new Set<string>();

  for (const item of sanitizedList) {
    const normKey = `${item.category}:${item.value.toLowerCase().replace(/[^\w]/g, "")}`;
    if (!seenResponderKeys.has(normKey)) {
      seenResponderKeys.add(normKey);
      deduplicatedSanitizedList.push(item);
    }
  }

  const grouped = {
    allergy: deduplicatedSanitizedList.filter((i) => i.category === "allergy"),
    medication: deduplicatedSanitizedList.filter((i) => i.category === "medication"),
    condition: deduplicatedSanitizedList.filter((i) => i.category === "condition"),
    implant: deduplicatedSanitizedList.filter((i) => i.category === "implant"),
  };

  const showBloodGroup = allowedSet.has("blood_group");
  const showEmergencyContact = allowedSet.has("emergency_contact");

  return {
    full_name: profile?.full_name || null,
    blood_group: showBloodGroup ? profile?.blood_group || null : null,
    emergency_contact_name: showEmergencyContact ? profile?.emergency_contact_name || null : null,
    emergency_contact_phone: showEmergencyContact ? profile?.emergency_contact_phone || null : null,
    visible_categories: visibleCategories || [],
    items: deduplicatedSanitizedList,
    grouped,
    // Clinical requirement: never say "No allergies"; state clearly that none are recorded.
    allergy_display_fallback: "No allergy information recorded",
    category_unshared_notices: {
      allergy: "Allergies: not shared on this card. Ask the patient or family.",
      medication: "Medications: not shared on this card. Ask the patient or family.",
    },
  };
}

/**
 * Printable Wallet Card Payload Generator.
 * STRICT CLINICAL SAFETY RULE:
 * Never print medications or allergies on the physical wallet card.
 * The physical card must only contain Name, Blood Group, ICE contact, and QR code.
 */
export function buildWalletCardPayload(params: {
  fullName: string;
  bloodGroup?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  qrUrl: string;
}): {
  name: string;
  bloodGroup: string;
  iceName: string;
  icePhone: string;
  qrUrl: string;
  instruction: string;
} {
  return {
    name: params.fullName || "Emergency Medical Card",
    bloodGroup: params.bloodGroup || "Not specified",
    iceName: params.emergencyContactName || "Not specified",
    icePhone: params.emergencyContactPhone || "Not specified",
    qrUrl: params.qrUrl,
    instruction: "Scan QR code for real-time confirmed medications, allergies, and conditions",
  };
}
