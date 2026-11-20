"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Trash2,
  FileText,
  Calendar,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Clock,
  Sparkles,
  AlertCircle,
  Loader2,
  ExternalLink,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatClinicalDate } from "@/lib/utils";
import { isNegativeAllergy } from "@/lib/emergency/sanitizer";

interface PageData {
  id: string;
  page_no: number;
  ocr_text: string | null;
  signed_url: string | null;
  is_pdf: boolean;
}

interface DocumentData {
  id: string;
  user_id: string;
  storage_path: string;
  doc_type: string;
  doc_date: string | null;
  status: "uploaded" | "queued" | "processing" | "ready" | "failed";
  page_count: number | null;
  created_at: string;
  error_message?: string | null;
  reader_source?: string | null;
}

interface ItemData {
  id: string;
  category: string;
  value: string;
  quote: string | null;
  confidence: number | null;
  status: string;
  source: string;
  page_id: string | null;
  reader_source?: string | null;
  ocr_check?: {
    state: "agree" | "disagree" | "unavailable";
    page_confidence?: number;
    review_reason?: string;
    bounding_boxes?: Array<{ x: number; y: number; w: number; h: number }> | null;
  } | null;
  review_reason?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  prescription: "Prescription",
  discharge_summary: "Discharge Summary",
  lab_report: "Lab / Diagnostic Report",
  radiology: "Scan / Radiology",
  bill: "Medical Bill",
  other: "Medical Document",
};

function createQuoteRegex(query: string): RegExp | null {
  if (!query || !query.trim()) return null;
  const cleaned = query.trim().replace(/^[•\-*\d.)\s]+/g, "").trim();
  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return null;

  const tokenPatterns = rawTokens.map((tok) => {
    // If token has number + unit (e.g. 500mg, 15mg)
    const match = tok.match(/^(\d+(?:\.\d+)?)([a-zA-Z]+)$/);
    if (match) {
      return `${match[1]}\\s*${match[2]}`;
    }
    // Escape regex special characters
    return tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });

  return new RegExp(`(${tokenPatterns.join("[\\s\\W]+")})`, "i");
}

function renderHighlightedTranscript(
  text: string,
  quote: string | null,
  fallbackValue?: string | null
) {
  if (!text) return null;
  const primaryQuery = quote?.trim();
  const secondaryQuery = fallbackValue?.trim();
  const queriesToTry = [primaryQuery, secondaryQuery].filter(Boolean) as string[];

  if (queriesToTry.length === 0) return text;

  for (const q of queriesToTry) {
    // 1. Exact case-insensitive substring match
    const lowerText = text.toLowerCase();
    const lowerQ = q.toLowerCase();
    const exactIdx = lowerText.indexOf(lowerQ);

    if (exactIdx !== -1) {
      const before = text.slice(0, exactIdx);
      const match = text.slice(exactIdx, exactIdx + q.length);
      const after = text.slice(exactIdx + q.length);
      return (
        <>
          {before}
          <mark
            id="active-ocr-highlight"
            className="bg-amber-300 text-amber-950 font-bold px-1.5 py-0.5 rounded ring-2 ring-amber-400 animate-pulse"
          >
            {match}
          </mark>
          {after}
        </>
      );
    }

    // 2. Flexible regex match (handles newlines, punctuation, number/unit spacing like 500 mg vs 500mg)
    const regex = createQuoteRegex(q);
    if (regex) {
      const match = text.match(regex);
      if (match && match.index !== undefined) {
        const start = match.index;
        const matchedStr = match[0];
        const before = text.slice(0, start);
        const after = text.slice(start + matchedStr.length);
        return (
          <>
            {before}
            <mark
              id="active-ocr-highlight"
              className="bg-amber-300 text-amber-950 font-bold px-1.5 py-0.5 rounded ring-2 ring-amber-400 animate-pulse"
            >
              {matchedStr}
            </mark>
            {after}
          </>
        );
      }
    }

    // 3. Match base phrase if query has parentheses (e.g. "Diabetes Mellitus (ICD-10: E11.9)")
    if (q.includes("(") && q.includes(")")) {
      const basePhrase = q.replace(/\([^)]*\)/g, "").trim();
      if (basePhrase.length >= 3) {
        const baseRegex = createQuoteRegex(basePhrase);
        if (baseRegex) {
          const match = text.match(baseRegex);
          if (match && match.index !== undefined) {
            const start = match.index;
            const matchedStr = match[0];
            const before = text.slice(0, start);
            const after = text.slice(start + matchedStr.length);
            return (
              <>
                {before}
                <mark
                  id="active-ocr-highlight"
                  className="bg-amber-300 text-amber-950 font-bold px-1.5 py-0.5 rounded ring-2 ring-amber-400 animate-pulse"
                >
                  {matchedStr}
                </mark>
                {after}
              </>
            );
          }
        }
      }
    }

    // 4. Token fallback: match first 2 significant words
    const significantWords = q
      .replace(/^[•\-*\d.)\s]+/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^(tab|tablet|cap|capsule|po|od|bid|tid|qid|daily|prn)$/i.test(w))
      .slice(0, 2);

    if (significantWords.length >= 1) {
      const partialPhrase = significantWords.join(" ");
      const partialRegex = createQuoteRegex(partialPhrase);
      if (partialRegex) {
        const match = text.match(partialRegex);
        if (match && match.index !== undefined) {
          const start = match.index;
          const matchedStr = match[0];
          const before = text.slice(0, start);
          const after = text.slice(start + matchedStr.length);
          return (
            <>
              {before}
              <mark
                id="active-ocr-highlight"
                className="bg-amber-300 text-amber-950 font-bold px-1.5 py-0.5 rounded ring-2 ring-amber-400 animate-pulse"
              >
                {matchedStr}
              </mark>
              {after}
            </>
          );
        }
      }
    }
  }

  return text;
}

export function DocumentViewer({ documentId }: { documentId: string }) {
  const router = useRouter();

  const [document, setDocument] = useState<DocumentData | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [items, setItems] = useState<ItemData[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [activeItemQuote, setActiveItemQuote] = useState<string | null>(null);
  const [activeItemValue, setActiveItemValue] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeBoxes, setActiveBoxes] = useState<Array<{ x: number; y: number; w: number; h: number }> | null>(null);
  const [boxNotFound, setBoxNotFound] = useState<boolean>(false);
  const [extracting, setExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showOcrText, setShowOcrText] = useState<boolean>(false);

  const loadDocument = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}?t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load document");
      }

      setDocument(data.document);
      setPages(data.pages || []);
      setItems(data.items || []);
      return data;
    } catch (err: any) {
      setError(err.message || "Failed to load document");
      return null;
    }
  }, [documentId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadDocument();
      setLoading(false);
    }
    init();
  }, [loadDocument]);

  // Non-blocking status polling when document is 'queued', 'processing', or newly 'uploaded'
  // Rule 3: "We're reading your document. You can leave this page." No spinner that blocks the page.
  useEffect(() => {
    if (!document || (document.status !== "queued" && document.status !== "processing" && document.status !== "uploaded")) {
      return;
    }

    const interval = setInterval(async () => {
      const reloaded = await loadDocument();
      if (reloaded?.document?.status === "ready" || reloaded?.document?.status === "failed") {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [document, loadDocument]);

  const handleExtract = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to queue extraction");
      }
      // Reload immediately to capture the 'queued' status and start polling
      await loadDocument();
    } catch (err: any) {
      setExtractError(err.message || "Extraction queueing failed");
    } finally {
      setExtracting(false);
    }
  };

  const handleSelectItem = (item: ItemData) => {
    setActiveItemId(item.id);
    setActiveItemQuote(item.quote);
    setActiveItemValue(item.value);
    setShowOcrText(true);

    // If multi-page, switch to the item's page
    if (item.page_id && pages.length > 0) {
      const pageIdx = pages.findIndex((p) => p.id === item.page_id);
      if (pageIdx !== -1 && pageIdx !== currentPageIndex) {
        setCurrentPageIndex(pageIdx);
      }
    }

    const boxes = item.ocr_check?.bounding_boxes;
    if (boxes && boxes.length > 0) {
      setActiveBoxes(boxes);
      setBoxNotFound(false);
    } else {
      setActiveBoxes(null);
      setBoxNotFound(!currentPage?.is_pdf);
    }
  };

  // Auto-scroll transcript to highlighted verbatim mark when active item changes
  useEffect(() => {
    if (activeItemId && showOcrText) {
      const timer = setTimeout(() => {
        const el = window.document.getElementById("active-ocr-highlight");
        if (el) {
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [activeItemId, showOcrText]);

  // Re-sync active highlight boxes whenever document items update (e.g. after re-running extraction)
  useEffect(() => {
    if (activeItemId && items.length > 0) {
      const active = items.find((i) => i.id === activeItemId);
      if (active) {
        const boxes = active.ocr_check?.bounding_boxes;
        if (boxes && boxes.length > 0) {
          setActiveBoxes(boxes);
          setBoxNotFound(false);
        }
      }
    }
  }, [items, activeItemId]);

  const handleConfirmItem = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmingId(itemId);
    try {
      const res = await fetch(`/api/items/${itemId}/confirm`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to confirm item");
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, status: "confirmed" } : item
        )
      );
    } catch (err: any) {
      alert(`Could not confirm item: ${err.message}`);
    } finally {
      setConfirmingId(null);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this document and all its files? This action cannot be undone.")) {
      return;
    }

    try {
      setDeleting(true);
      const res = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete document");
      }

      router.push("/documents");
      router.refresh();
    } catch (err: any) {
      alert(`Deletion failed: ${err.message}`);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        <p className="text-sm text-gray-500">Loading document...</p>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">Document Unavailable</h2>
        <p className="text-sm text-gray-500">{error || "Could not find this record."}</p>
        <Link href="/documents">
          <Button variant="outline" className="mt-2">
            Back to Documents
          </Button>
        </Link>
      </div>
    );
  }

  const currentPage = pages[currentPageIndex];
  const typeLabel = TYPE_LABELS[document.doc_type] || document.doc_type;

  return (
    <div className="space-y-4 pt-1">
      {/* Top action & navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/documents"
            className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            aria-label="Back to documents"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{typeLabel}</h1>
              <Badge
                variant={
                  document.status === "ready"
                    ? "default"
                    : document.status === "failed"
                    ? "review"
                    : "secondary"
                }
                className={
                  document.status === "ready"
                    ? "bg-teal-600 hover:bg-teal-700 text-white"
                    : document.status === "failed"
                    ? "bg-red-100 text-red-800 hover:bg-red-100"
                    : document.status === "queued" || document.status === "processing"
                    ? "bg-teal-100 text-teal-800 animate-pulse hover:bg-teal-100"
                    : "bg-amber-100 text-amber-800 hover:bg-amber-100"
                }
              >
                {document.status === "uploaded"
                  ? "Uploaded (Pending)"
                  : document.status === "queued"
                  ? "Queued for Extraction"
                  : document.status === "processing"
                  ? "Reading Document..."
                  : document.status === "ready"
                  ? "Ready"
                  : "Extraction Failed"}
              </Badge>
              {document.reader_source && document.reader_source !== "primary_vision" && (
                <Badge variant="outline" className="text-amber-800 bg-amber-50 border-amber-300 text-[10px]">
                  {document.reader_source === "fallback_vision"
                    ? "Fallback Vision"
                    : document.reader_source === "text_ocr_azure"
                    ? "Azure OCR Text"
                    : document.reader_source === "text_ocr_tesseract"
                    ? "Tesseract OCR Text"
                    : document.reader_source}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Doc date: {formatClinicalDate(document.doc_date, "Not set")}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" />
                {pages.length} {pages.length === 1 ? "page" : "pages"}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Uploaded: {formatClinicalDate(document.created_at)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentPage?.signed_url && (
            <a
              href={currentPage.signed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 font-medium px-3 py-1.5 rounded-lg border bg-white shadow-sm hover:bg-gray-50"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Full file
            </a>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {/* Main viewer grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Document Canvas Column */}
        <div className="lg:col-span-8 flex flex-col space-y-3">
          {/* Viewer Controls */}
          <div className="flex items-center justify-between bg-gray-50 border rounded-xl px-4 py-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentPageIndex === 0}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-semibold text-gray-700">
                Page {currentPageIndex + 1} of {pages.length || 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1))
                }
                disabled={currentPageIndex >= pages.length - 1}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Zoom controls */}
            {!currentPage?.is_pdf && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoomLevel((z) => Math.max(50, z - 20))}
                  disabled={zoomLevel <= 50}
                  className="h-8 w-8 p-0"
                  title="Zoom out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-gray-500 w-12 text-center font-mono">
                  {zoomLevel}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoomLevel((z) => Math.min(250, z + 20))}
                  disabled={zoomLevel >= 250}
                  className="h-8 w-8 p-0"
                  title="Zoom in"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoomLevel(100)}
                  className="h-8 px-2 text-xs"
                  title="Reset zoom"
                >
                  Reset
                </Button>
              </div>
            )}
          </div>

          {/* Canvas display */}
          <div className="border rounded-xl bg-gray-100/70 p-4 min-h-[500px] flex items-center justify-center overflow-auto shadow-inner">
            {currentPage?.is_pdf ? (
              <iframe
                src={
                  currentPage.signed_url
                    ? `${currentPage.signed_url}#search=${encodeURIComponent(
                        (activeItemQuote || "").replace(/["\r\n]/g, " ").trim()
                      )}`
                    : ""
                }
                className="w-full h-[650px] rounded-lg border bg-white shadow-sm"
                title={`PDF Document - Page ${currentPageIndex + 1}`}
              />
            ) : currentPage?.signed_url ? (
              <div
                className="transition-transform duration-150 flex items-center justify-center max-w-full"
                style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
              >
                <div className="relative inline-block max-w-full">
                  <img
                    src={currentPage.signed_url}
                    alt={`Page ${currentPageIndex + 1}`}
                    className="max-w-full h-auto rounded-lg shadow-md border bg-white block select-none"
                  />

                  {/* Highlight Box Overlay for Active Extracted Record */}
                  {activeBoxes &&
                    activeBoxes.map((box, idx) => (
                      <div
                        key={idx}
                        className="absolute border-2 border-teal-500 bg-teal-400/35 rounded pointer-events-none transition-all duration-300 ring-4 ring-teal-300/40 animate-pulse"
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.w * 100}%`,
                          height: `${box.h * 100}%`,
                        }}
                        title="Verbatim location on page scan"
                      />
                    ))}

                  {/* Gentle status pill if scan coordinates are unavailable for this item */}
                  {boxNotFound && activeItemId && (
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur text-white text-[11px] px-3 py-1 rounded-full shadow pointer-events-none z-10 flex items-center gap-1.5 animate-in fade-in duration-200">
                      <Sparkles className="h-3 w-3 text-teal-400" />
                      <span>Scan box unavailable — quote highlighted in verbatim text below</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 space-y-2">
                <FileText className="h-10 w-10 mx-auto text-gray-300" />
                <p className="text-sm">Page file unavailable</p>
              </div>
            )}
          </div>

          {/* Multi-page thumbnail selector */}
          {pages.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto py-2">
              {pages.map((p, idx) => (
                <button
                  key={p.id}
                  onClick={() => setCurrentPageIndex(idx)}
                  className={`h-16 w-14 flex-shrink-0 rounded-lg border-2 overflow-hidden relative transition-all ${
                    currentPageIndex === idx
                      ? "border-teal-600 shadow-sm ring-2 ring-teal-100"
                      : "border-gray-200 opacity-60 hover:opacity-100"
                  }`}
                >
                  {p.is_pdf ? (
                    <div className="w-full h-full bg-white flex items-center justify-center text-xs font-bold text-gray-400">
                      PDF
                    </div>
                  ) : p.signed_url ? (
                    <img
                      src={p.signed_url}
                      alt={`Thumb ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100" />
                  )}
                  <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 rounded-tl">
                    {idx + 1}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Verbatim Transcript & Quote Verification Panel */}
          {currentPage?.ocr_text && (
            <div className="border rounded-xl bg-white p-4 space-y-2 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-teal-600" />
                  Page {currentPageIndex + 1} Verbatim Transcription
                </span>
                <div className="flex items-center gap-2">
                  {(activeItemQuote || activeItemValue) && (
                    <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                      Quote highlighted
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOcrText(!showOcrText)}
                    className="h-7 text-xs text-gray-500 hover:text-gray-900"
                  >
                    {showOcrText ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {showOcrText ? "Hide Text" : "Inspect Verbatim Text"}
                  </Button>
                </div>
              </div>
              {showOcrText && (
                <div className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-700 font-mono text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto border leading-relaxed select-text">
                  {renderHighlightedTranscript(currentPage.ocr_text, activeItemQuote, activeItemValue)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Extracted Items & Provenance Column */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-teal-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800">
                  Extracted Records
                </h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {items.length} items
              </span>
            </div>

            {items.length === 0 ? (
              document.status === "queued" || document.status === "processing" ? (
                <div className="py-6 px-3 text-center space-y-4 rounded-xl bg-teal-50/70 border border-teal-200/80">
                  <div className="h-10 w-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center mx-auto">
                    <Sparkles className="h-5 w-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-teal-950">
                      We&apos;re reading your document. You can leave this page.
                    </p>
                    <p className="text-xs text-teal-800/90 leading-relaxed max-w-sm mx-auto">
                      Background extraction is in progress. Verified medications, conditions, and clinical records will appear here as soon as processing completes.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-100/80 text-teal-800 text-xs font-medium">
                    <div className="h-2 w-2 rounded-full bg-teal-600 animate-ping" />
                    <span>Status: {document.status === "queued" ? "Queued in background" : "Processing pages..."}</span>
                  </div>
                </div>
              ) : document.status === "failed" ? (
                <div className="py-6 px-4 text-center space-y-4 rounded-xl bg-red-50 border border-red-200">
                  <div className="h-10 w-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-red-950">
                      Extraction Could Not Complete
                    </p>
                    <p className="text-xs text-red-800 leading-relaxed max-w-sm mx-auto">
                      {document.error_message || "An issue occurred during extraction. Failed attempts do not count against your daily quota."}
                    </p>
                  </div>
                  <Button
                    onClick={handleExtract}
                    disabled={extracting}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm text-xs h-9"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Queuing retry...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Retry Extraction
                      </>
                    )}
                  </Button>
                </div>
              ) : document.status === "ready" ? (
                <div className="py-6 text-center space-y-4">
                  <div className="h-10 w-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Extraction Complete: No Clinical Records Found
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-sm mx-auto">
                      The document text was transcribed successfully, but no active medications, diagnoses, allergies, or procedures were detected on this page.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button
                      onClick={() => setShowOcrText(true)}
                      variant="outline"
                      size="sm"
                      className="w-full text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
                    >
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View Transcribed OCR Text
                    </Button>
                    <Button
                      onClick={handleExtract}
                      disabled={extracting}
                      variant="outline"
                      size="sm"
                      className="w-full text-xs text-gray-700 border-gray-300 hover:bg-gray-50"
                    >
                      {extracting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          Re-extracting...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                          Re-run Extraction
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center space-y-4">
                  <div className="h-10 w-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Ready for Clinical Extraction
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Extract verified medications, allergies, conditions, and procedures from this document with strict verbatim quote verification.
                    </p>
                  </div>

                  <Button
                    onClick={handleExtract}
                    disabled={extracting}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Queuing extraction...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Extract Records from Document
                      </>
                    )}
                  </Button>

                  <div className="rounded-lg bg-gray-50 border p-3 text-left space-y-1.5 text-xs text-gray-600">
                    <p className="font-semibold text-gray-800">Phase 3 Guarantees:</p>
                    <p>• Every item requires an exact verbatim quote</p>
                    <p>• Unverified quotes marked needs review</p>
                    <p>• Items start unconfirmed — patient has final say</p>
                    <p>• Zero storage of plain OCR in public logs</p>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3">
                {(document.status === "queued" || document.status === "processing") && (
                  <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-teal-600 animate-ping" />
                    <span>We&apos;re reading your document. You can leave this page.</span>
                  </div>
                )}
                {document.status === "failed" && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-900 text-xs space-y-2">
                    <p className="font-semibold text-red-950">Extraction issue: {document.error_message}</p>
                    <Button
                      onClick={handleExtract}
                      disabled={extracting}
                      size="sm"
                      className="bg-red-600 hover:bg-red-700 text-white text-xs h-7 w-full"
                    >
                      Retry Extraction
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between pb-1">
                  <Button
                    onClick={handleExtract}
                    disabled={extracting}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs text-teal-700 border-teal-200 hover:bg-teal-50"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Re-extracting...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                        Re-run Extraction
                      </>
                    )}
                  </Button>
                </div>

                {extractError && (
                  <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-1">
                    <p className="font-semibold text-rose-900">Extraction Issue:</p>
                    <p>{extractError}</p>
                  </div>
                )}

                {items.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className={`border rounded-xl p-3.5 text-sm cursor-pointer transition-colors ${
                      activeItemId === item.id
                        ? "border-teal-600 bg-teal-50/50 shadow-sm ring-1 ring-teal-500"
                        : "hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          {item.category}
                        </span>
                        {item.category === "allergy" && (
                          isNegativeAllergy(item.value) ? (
                            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px] px-1.5 py-0 font-medium">
                              <ShieldCheck className="h-2.5 w-2.5 mr-1 text-emerald-600" /> NKDA (No Allergies)
                            </Badge>
                          ) : (
                            <Badge variant="allergy" className="text-[10px] px-1.5 py-0">
                              Allergy
                            </Badge>
                          )
                        )}
                      </div>

                      {item.status === "confirmed" ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px] px-1.5 py-0">
                          <Check className="h-2.5 w-2.5 mr-1" /> Confirmed
                        </Badge>
                      ) : item.status === "needs_review" ? (
                        <Badge variant="review" className="text-[10px] px-1.5 py-0">
                          Needs Review
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          Extracted
                        </Badge>
                      )}

                      {/* Second-Reader Badges */}
                      {(item.ocr_check?.state === "disagree" || (item.review_reason && item.review_reason.includes("OCR"))) && (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[9px] px-1.5 py-0">
                          OCR Disagrees: {item.review_reason ? item.review_reason.replace(/^OCR disagreement:\s*/i, "") : "dose"}
                        </Badge>
                      )}

                      {item.ocr_check?.state === "unavailable" && (
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200 text-[9px] px-1.5 py-0">
                          Second reader unavailable
                        </Badge>
                      )}

                      {/* Rule 6: Flag anything produced by a fallback reader */}
                      {item.reader_source && item.reader_source !== "primary_vision" && (
                        <Badge variant="outline" className="text-amber-800 bg-amber-50 border-amber-300 text-[9px] px-1.5 py-0">
                          {item.reader_source === "fallback_vision"
                            ? "Fallback Vision"
                            : item.reader_source === "text_ocr_azure"
                            ? "Azure OCR Text"
                            : item.reader_source === "text_ocr_tesseract"
                            ? "Tesseract OCR Text"
                            : item.reader_source}
                        </Badge>
                      )}
                    </div>

                    <p className="font-medium text-gray-900 leading-snug">{item.value}</p>

                    {item.review_reason && (
                      <div className="mt-1.5 text-xs text-rose-800 bg-rose-50 rounded p-2 border border-rose-200">
                        <span className="font-semibold block text-[10px] uppercase tracking-wider text-rose-900 mb-0.5">
                          Second Reader Flag:
                        </span>
                        <p>{item.review_reason}</p>
                      </div>
                    )}

                    {item.quote && (
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50/80 rounded p-2 border-l-2 border-teal-500">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-semibold text-gray-500 block text-[10px] uppercase tracking-wider">
                            Verbatim Quote:
                          </span>
                          {activeItemId === item.id && (
                            activeBoxes && activeBoxes.length > 0 ? (
                              <span className="text-[10px] text-teal-800 bg-teal-100/90 px-1.5 py-0.5 rounded font-medium border border-teal-200">
                                ✓ Highlighted on scan
                              </span>
                            ) : (
                              <span className="text-[10px] text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded font-medium border border-teal-200">
                                ✓ Verified in verbatim text
                              </span>
                            )
                          )}
                        </div>
                        <p className="italic font-serif text-slate-800 text-[13px] leading-relaxed">&quot;{item.quote}&quot;</p>
                      </div>
                    )}

                    {item.status !== "confirmed" && (
                      <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          {item.confidence ? `${Math.round(item.confidence * 100)}% confidence` : ""}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={confirmingId === item.id}
                          onClick={(e) => handleConfirmItem(item.id, e)}
                          className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                        >
                          {confirmingId === item.id ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Check className="h-3 w-3 mr-1" />
                          )}
                          Confirm Record
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Privacy & Storage Note */}
          <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 text-xs text-gray-600 space-y-1">
            <p className="font-semibold text-teal-900">Security Guarantee</p>
            <p>
              Stored in private bucket under <code className="text-[11px] font-mono text-teal-800">{document.storage_path}</code>. Access is strictly protected by Supabase Row Level Security.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
