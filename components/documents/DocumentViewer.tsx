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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatClinicalDate } from "@/lib/utils";

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
  status: "uploaded" | "processing" | "ready" | "failed";
  page_count: number | null;
  created_at: string;
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

  const handleExtract = async () => {
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
        signal: AbortSignal.timeout(45000), // 45s client timeout so UI never hangs indefinitely
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Extraction failed");
      }
      const reloadedData = await loadDocument();
      if (reloadedData?.items && activeItemId) {
        const found = reloadedData.items.find((i: ItemData) => i.id === activeItemId);
        if (found?.ocr_check?.bounding_boxes && found.ocr_check.bounding_boxes.length > 0) {
          setActiveBoxes(found.ocr_check.bounding_boxes);
          setBoxNotFound(false);
        }
      }
    } catch (err: any) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        setExtractError("Extraction timed out. The server or AI model took longer than expected. Please try again.");
      } else {
        setExtractError(err.message || "Extraction failed");
      }
    } finally {
      setExtracting(false);
    }
  };

  const handleSelectItem = (item: ItemData) => {
    setActiveItemId(item.id);
    setActiveItemQuote(item.quote);
    const boxes = item.ocr_check?.bounding_boxes;
    if (boxes && boxes.length > 0) {
      setActiveBoxes(boxes);
      setBoxNotFound(false);
    } else {
      setActiveBoxes(null);
      setBoxNotFound(true);
    }
  };

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
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
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
                    ? "bg-teal-600 hover:bg-teal-700"
                    : document.status === "uploaded"
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                    : ""
                }
              >
                {document.status === "uploaded" ? "Uploaded (Pending Extraction)" : document.status}
              </Badge>
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
                src={currentPage.signed_url || ""}
                className="w-full h-[650px] rounded-lg border bg-white"
                title={`Document Page ${currentPageIndex + 1}`}
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

          {/* Optional OCR Text Viewer (clinical inspection) */}
          {currentPage?.ocr_text && (
            <div className="border rounded-xl bg-white p-4 space-y-2 text-xs shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-teal-600" />
                  Page {currentPageIndex + 1} Transcription
                </span>
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
              {showOcrText && (
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-gray-700 font-mono text-[11px] whitespace-pre-wrap max-h-60 overflow-y-auto border">
                  {currentPage.ocr_text}
                </pre>
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
              <div className="py-6 text-center space-y-4">
                <div className="h-10 w-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Ready for Clinical Extraction
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Extract verified medications, allergies, conditions, and procedures from this document using Gemini Vision with strict quote verification.
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
                      Extracting records with Gemini...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Extract Records with Gemini
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
            ) : (
              <div className="space-y-3">
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
                          <Badge variant="allergy" className="text-[10px] px-1.5 py-0">
                            Allergy
                          </Badge>
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
                            ) : item.ocr_check && "bounding_boxes" in item.ocr_check ? (
                              <span className="text-[10px] text-amber-800 bg-amber-100/90 px-1.5 py-0.5 rounded font-medium border border-amber-200">
                                ⓘ Location not found on page
                              </span>
                            ) : (
                              <span className="text-[10px] text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded font-medium border border-teal-200">
                                ⓘ Click &quot;Re-run Extraction&quot; to highlight
                              </span>
                            )
                          )}
                        </div>
                        <p className="italic">&quot;{item.quote}&quot;</p>
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
