"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Upload,
  Calendar,
  Layers,
  ChevronRight,
  Search,
  Filter,
  FileSpreadsheet,
  Activity,
  Receipt,
  FileCheck,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatClinicalDate } from "@/lib/utils";

export interface DocumentSummary {
  id: string;
  user_id: string;
  storage_path: string;
  doc_type: string;
  doc_date: string | null;
  status: "uploaded" | "processing" | "ready" | "failed";
  page_count: number | null;
  created_at: string;
}

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof FileText; color: string }
> = {
  prescription: {
    label: "Prescription",
    icon: FileText,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  discharge_summary: {
    label: "Discharge Summary",
    icon: FileCheck,
    color: "bg-teal-50 text-teal-700 border-teal-200",
  },
  lab_report: {
    label: "Lab / Diagnostic Report",
    icon: Activity,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  radiology: {
    label: "Scan / Radiology",
    icon: Layers,
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  bill: {
    label: "Medical Bill",
    icon: Receipt,
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  other: {
    label: "Medical Document",
    icon: FileSpreadsheet,
    color: "bg-gray-50 text-gray-700 border-gray-200",
  },
};

export function DocumentsList({
  initialDocuments,
}: {
  initialDocuments: DocumentSummary[];
}) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const categories = [
    { id: "all", label: "All" },
    { id: "discharge_summary", label: "Discharge" },
    { id: "prescription", label: "Prescriptions" },
    { id: "lab_report", label: "Lab Reports" },
    { id: "radiology", label: "Scans" },
    { id: "bill", label: "Bills" },
    { id: "other", label: "Other" },
  ];

  const filteredDocs = initialDocuments.filter((doc) => {
    const matchesCategory =
      selectedCategory === "all" || doc.doc_type === selectedCategory;

    const query = searchQuery.toLowerCase().trim();
    if (!query) return matchesCategory;

    const typeConfig = TYPE_CONFIG[doc.doc_type] || TYPE_CONFIG.other;
    const formattedDocDate = formatClinicalDate(doc.doc_date, "").toLowerCase();
    const formattedUploadDate = formatClinicalDate(doc.created_at, "").toLowerCase();

    const matchesSearch =
      doc.doc_type?.toLowerCase().includes(query) ||
      typeConfig.label.toLowerCase().includes(query) ||
      (doc.doc_date && doc.doc_date.toLowerCase().includes(query)) ||
      formattedDocDate.includes(query) ||
      formattedUploadDate.includes(query);

    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      {initialDocuments.length > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search documents by type or date (e.g. 'Prescription', 'Oct 2026')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1 flex-shrink-0" />
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1 rounded-full font-medium transition-colors whitespace-nowrap ${
                  selectedCategory === cat.id
                    ? "bg-teal-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Document List */}
      {filteredDocs.length === 0 ? (
        <div className="border rounded-2xl bg-white p-8 text-center space-y-4 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mx-auto">
            <FileText className="h-6 w-6" />
          </div>
          <div className="max-w-sm mx-auto">
            <h2 className="text-lg font-semibold text-gray-900">
              {initialDocuments.length === 0
                ? "No medical documents yet"
                : "No matching records found"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {initialDocuments.length === 0
                ? "Upload discharge summaries, lab tests, prescriptions, and scans to keep your health records organized."
                : "Try adjusting your filter or search keywords."}
            </p>
          </div>
          <Link href="/documents/upload" className="inline-block">
            <Button className="bg-teal-600 hover:bg-teal-700 text-white gap-2">
              <Upload className="h-4 w-4" />
              Upload Document
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDocs.map((doc) => {
            const config = TYPE_CONFIG[doc.doc_type] || TYPE_CONFIG.other;
            const Icon = config.icon;

            return (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="block group"
              >
                <div className="border rounded-xl p-4 bg-white hover:border-teal-400 hover:shadow-md transition-all flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 border ${config.color}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base text-gray-900 truncate group-hover:text-teal-700 transition-colors">
                          {config.label}
                        </h3>
                        <Badge
                          variant={
                            doc.status === "ready"
                              ? "default"
                              : doc.status === "failed"
                              ? "review"
                              : "secondary"
                          }
                          className={`text-[10px] px-1.5 py-0 capitalize ${
                            doc.status === "ready"
                              ? "bg-teal-600 hover:bg-teal-600"
                              : doc.status === "uploaded"
                              ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                              : ""
                          }`}
                        >
                          {doc.status}
                        </Badge>
                      </div>

                      {/* Explicitly labeled dates using Indian clinical standard DD Mon YYYY */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-teal-600" />
                          <span className="font-medium text-gray-700">Doc date:</span>{" "}
                          <span className={doc.doc_date ? "text-gray-900 font-medium" : "italic text-gray-400"}>
                            {formatClinicalDate(doc.doc_date, "Not set")}
                          </span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-gray-400" />
                          <span className="font-medium text-gray-700">Uploaded:</span>{" "}
                          <span>{formatClinicalDate(doc.created_at)}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5 text-gray-400" />
                          {doc.page_count ?? 1}{" "}
                          {(doc.page_count ?? 1) === 1 ? "page" : "pages"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
