"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
} from "lucide-react";

interface PagePreview {
  id: string;
  file: File;
  previewUrl: string;
  originalSize: number;
  compressedSize: number;
  isPdf: boolean;
}

const DOC_TYPES = [
  { value: "prescription", label: "Prescription" },
  { value: "discharge_summary", label: "Discharge Summary" },
  { value: "lab_report", label: "Lab / Diagnostic Report" },
  { value: "radiology", label: "Scan / X-Ray / Radiology" },
  { value: "bill", label: "Medical Bill / Expense" },
  { value: "other", label: "Other Medical Document" },
];

export function DocumentUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<string>("discharge_summary");
  const [docDate, setDocDate] = useState<string>("");
  const [pages, setPages] = useState<PagePreview[]>([]);
  const [compressing, setCompressing] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const supabase = createClient();

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setErrorMessage(null);
    setCompressing(true);

    try {
      const newPages: PagePreview[] = [];

      for (const file of selectedFiles) {
        const isPdf = file.type === "application/pdf";

        if (isPdf) {
          // PDFs don't go through browser-image-compression
          newPages.push({
            id: Math.random().toString(36).substring(7),
            file,
            previewUrl: "",
            originalSize: file.size,
            compressedSize: file.size,
            isPdf: true,
          });
        } else if (file.type.startsWith("image/")) {
          // Compress image to < 300 KB to keep within Supabase free storage tier
          const compressionOptions = {
            maxSizeMB: 0.3,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
            fileType: "image/jpeg",
          };

          const compressed = await imageCompression(file, compressionOptions);
          const previewUrl = URL.createObjectURL(compressed);

          newPages.push({
            id: Math.random().toString(36).substring(7),
            file: compressed,
            previewUrl,
            originalSize: file.size,
            compressedSize: compressed.size,
            isPdf: false,
          });
        } else {
          setErrorMessage(
            `Unsupported file format: ${file.name}. Please upload photos or PDF files.`
          );
        }
      }

      setPages((prev) => [...prev, ...newPages]);
    } catch (err: any) {
      setErrorMessage(
        err?.message || "Failed to process images. Please try again."
      );
    } finally {
      setCompressing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pages.length === 0) {
      setErrorMessage("Please select at least one page or document to upload.");
      return;
    }

    setErrorMessage(null);
    setUploading(true);
    setUploadProgress("Preparing upload...");

    try {
      // 1. Request signed upload URLs from route handler
      const requestPayload = {
        doc_type: docType,
        doc_date: docDate,
        pages: pages.map((p, index) => ({
          page_no: index + 1,
          file_name: p.file.name || `page-${index + 1}.${p.isPdf ? "pdf" : "jpg"}`,
          content_type: p.file.type || (p.isPdf ? "application/pdf" : "image/jpeg"),
        })),
      };

      const res = await fetch("/api/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initiate document upload");
      }

      const { document_id, upload_urls } = data;

      // 2. Upload each page directly to Supabase Storage via signed URL
      for (let i = 0; i < pages.length; i++) {
        const pageItem = pages[i];
        const uploadInfo = upload_urls[i];

        setUploadProgress(
          `Uploading page ${i + 1} of ${pages.length}...`
        );

        // Upload using Supabase storage signed upload URL
        const { error: uploadError } = await supabase.storage
          .from("medical-records")
          .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, pageItem.file);

        if (uploadError) {
          throw new Error(
            `Failed to upload page ${i + 1}: ${uploadError.message}`
          );
        }
      }

      setUploadProgress("Upload complete! Opening document...");
      router.push(`/documents/${document_id}`);
      router.refresh();
    } catch (err: any) {
      setErrorMessage(err?.message || "Upload failed. Please try again.");
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Document metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="doc_type">Document Type</Label>
          <Select value={docType} onValueChange={setDocType} disabled={uploading}>
            <SelectTrigger id="doc_type" className="bg-white">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="doc_date">
            Document Date{" "}
            <span className="text-xs font-normal text-muted-foreground">
              (Optional — extracted in Phase 3)
            </span>
          </Label>
          <Input
            id="doc_date"
            type="date"
            value={docDate}
            onChange={(e) => setDocDate(e.target.value)}
            disabled={uploading}
            className="bg-white"
          />
        </div>
      </div>

      {/* File Dropzone */}
      <div className="space-y-3">
        <Label>Pages & Files</Label>
        <div
          onClick={() => !uploading && !compressing && fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 hover:border-teal-600 transition-colors rounded-xl p-6 text-center cursor-pointer bg-gray-50/50 hover:bg-teal-50/20"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleFilesSelected}
            className="hidden"
            disabled={uploading || compressing}
          />
          <div className="flex flex-col items-center justify-center gap-2">
            <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600">
              {compressing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="text-base font-medium text-gray-900">
                {compressing
                  ? "Optimizing and compressing images..."
                  : "Click to upload photos or PDFs"}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Multi-page supported • Auto-compressed to save storage
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pages Preview list */}
      {pages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              Selected Pages ({pages.length})
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || compressing}
              className="text-teal-600 hover:text-teal-700 h-8 gap-1 text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Add more pages
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pages.map((p, index) => (
              <div
                key={p.id}
                className="relative group border rounded-xl overflow-hidden bg-white shadow-sm flex flex-col"
              >
                {/* Thumbnail */}
                <div className="h-32 bg-gray-100 flex items-center justify-center overflow-hidden relative">
                  {p.isPdf ? (
                    <div className="flex flex-col items-center text-gray-500">
                      <FileText className="h-10 w-10 text-teal-600" />
                      <span className="text-xs font-medium mt-1">PDF Document</span>
                    </div>
                  ) : (
                    <img
                      src={p.previewUrl}
                      alt={`Page ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full">
                    Page {index + 1}
                  </div>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => removePage(p.id)}
                      className="absolute top-1.5 right-1.5 bg-white/90 hover:bg-red-500 hover:text-white text-gray-600 p-1 rounded-full shadow-sm transition-colors"
                      title="Remove page"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Compression stats */}
                <div className="p-2 text-[11px] text-gray-500 bg-white border-t flex flex-col justify-between">
                  <div className="truncate font-medium text-gray-700">
                    {p.file.name}
                  </div>
                  <div className="text-teal-700 font-medium">
                    {formatFileSize(p.compressedSize)}
                    {p.originalSize > p.compressedSize && (
                      <span className="text-gray-400 font-normal ml-1">
                        (saved {Math.round((1 - p.compressedSize / p.originalSize) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Upload failed</p>
            <p className="mt-0.5 text-xs text-red-700">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Uploading progress indicator */}
      {uploading && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
          <p className="text-sm font-medium text-teal-900">{uploadProgress}</p>
        </div>
      )}

      {/* Submit button */}
      <Button
        type="submit"
        disabled={pages.length === 0 || uploading || compressing}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium h-11"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Uploading Medical Record...
          </>
        ) : (
          `Save & Upload Record (${pages.length} ${pages.length === 1 ? "page" : "pages"})`
        )}
      </Button>
    </form>
  );
}
