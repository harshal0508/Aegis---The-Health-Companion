import { DocumentUploadForm } from "@/components/documents/DocumentUploadForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upload Document",
};

export default function DocumentUploadPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/documents"
          className="p-2 -ml-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          aria-label="Back to documents"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Medical Record</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Add discharge summaries, prescriptions, lab tests or scans
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <DocumentUploadForm />
      </div>
    </div>
  );
}
