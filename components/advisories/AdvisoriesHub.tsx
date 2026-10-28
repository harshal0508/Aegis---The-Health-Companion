"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  MapPin,
  Thermometer,
  BookOpen,
  Info,
  Droplets,
  Wind,
  Eye,
  ExternalLink,
  Calendar,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DiseaseAdvisory,
  SUPPORTED_LOCALITIES,
  getAdvisoriesForLocality,
} from "@/lib/advisories/disease-data";
import {
  ConditionGuidance,
  matchConfirmedPrecautions,
} from "@/lib/advisories/condition-precautions";

interface AdvisoriesHubProps {
  confirmedItems: Array<{ category: string; value: string }>;
  initialLocality?: string;
}

export function AdvisoriesHub({
  confirmedItems,
  initialLocality = "Bhopal (462001)",
}: AdvisoriesHubProps) {
  const [selectedLocality, setSelectedLocality] = useState<string>("Bhopal");
  const [customInput, setCustomInput] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"outbreaks" | "precautions">("outbreaks");

  const { advisories, matchedLocality } = getAdvisoriesForLocality(selectedLocality);
  const matchedGuidance = matchConfirmedPrecautions(confirmedItems);

  const handleSelectQuickCity = (city: string) => {
    setSelectedLocality(city);
    setCustomInput("");
  };

  const handleCustomSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (customInput.trim()) {
      setSelectedLocality(customInput.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-sm space-y-4 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-200 text-xs font-medium border border-amber-400/30">
              <Bell className="h-3.5 w-3.5" />
              <span>Regional Health Digest &amp; Official References</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Health Advisories &amp; Guidance
            </h1>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              District surveillance digests and quoted excerpts from published public health guidelines (NCDC, ICMR, WHO).
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5">
            <MapPin className="h-4 w-4 text-teal-400 shrink-0" />
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Region</p>
              <p className="text-xs font-bold text-white">{matchedLocality}</p>
            </div>
          </div>
        </div>

        {/* Quick Locality Selector */}
        <div className="pt-2 border-t border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <span className="text-slate-400 shrink-0 mr-1 font-medium">Select Region:</span>
            {SUPPORTED_LOCALITIES.slice(0, 5).map((loc) => (
              <button
                key={loc.city}
                onClick={() => handleSelectQuickCity(loc.city)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  selectedLocality.toLowerCase().includes(loc.city.toLowerCase())
                    ? "bg-teal-500 text-slate-950 font-bold"
                    : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
              >
                {loc.city}
              </button>
            ))}
          </div>

          <form onSubmit={handleCustomSearch} className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="City or 6-digit Pincode..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:bg-slate-900 focus:text-white rounded-lg w-44"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              className="h-8 text-xs bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold"
            >
              Filter
            </Button>
          </form>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab("outbreaks")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "outbreaks"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Regional Health Notices ({advisories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("precautions")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "precautions"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Public Health Reference Excerpts ({matchedGuidance.length})</span>
        </button>
      </div>

      {/* TAB 1: OUTBREAKS & REGIONAL ADVISORIES */}
      {activeTab === "outbreaks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              Notices referenced for <strong>{matchedLocality}</strong>:
            </p>
            <span className="text-[11px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-medium">
              Prototype Demonstration Digest
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {advisories.map((advisory) => (
              <Card
                key={advisory.id}
                className={`border shadow-sm transition-all ${
                  advisory.severity === "high"
                    ? "border-rose-200 bg-rose-50/20"
                    : advisory.severity === "moderate"
                    ? "border-amber-200 bg-amber-50/20"
                    : "border-slate-200 bg-white"
                }`}
              >
                <CardHeader className="pb-2.5">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {advisory.category === "vector_borne" && (
                        <Droplets className="h-4 w-4 text-teal-600 shrink-0" />
                      )}
                      {advisory.category === "respiratory" && (
                        <Wind className="h-4 w-4 text-sky-600 shrink-0" />
                      )}
                      {advisory.category === "viral_contact" && (
                        <Eye className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      {advisory.category === "water_borne" && (
                        <Droplets className="h-4 w-4 text-blue-600 shrink-0" />
                      )}
                      <Badge
                        variant="outline"
                        className="text-[10px] font-semibold uppercase tracking-wider py-0"
                      >
                        {advisory.categoryLabel}
                      </Badge>
                    </div>

                    {advisory.is_sample_demo && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold"
                      >
                        Sample data for demonstration
                      </Badge>
                    )}
                  </div>

                  <CardTitle className="text-base font-bold text-gray-900 mt-2">
                    {advisory.name}
                  </CardTitle>
                  <CardDescription className="text-xs text-gray-600 font-medium">
                    {advisory.headline}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3.5 text-xs">
                  <p className="text-gray-700 leading-relaxed bg-white/70 p-2.5 rounded-lg border border-gray-100">
                    {advisory.summary}
                  </p>

                  <div className="space-y-1">
                    <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      <Thermometer className="h-3 w-3 text-rose-500" />
                      Symptoms Described in Public Notice:
                    </span>
                    <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                      {advisory.symptoms.map((symptom, idx) => (
                        <li key={idx}>{symptom}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1">
                    <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                      Official Preventive Measures:
                    </span>
                    <ul className="space-y-1 text-gray-700">
                      {advisory.precautions.map((precaution, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-teal-700 font-bold shrink-0">•</span>
                          <span>{precaution}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Verifiable Source Footer */}
                  <div className="pt-2 border-t border-gray-200/80 space-y-1.5 text-[11px] text-gray-600">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-gray-800">Source Document:</span>
                      <a
                        href={advisory.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-700 hover:text-teal-800 underline inline-flex items-center gap-1 text-right"
                      >
                        <span className="truncate max-w-[220px]">{advisory.source_title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500">
                      <span>Report Date: {advisory.report_date}</span>
                      <span>Retrieved: {advisory.retrieved_at}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: OFFICIAL PUBLIC HEALTH REFERENCE EXCERPTS */}
      {activeTab === "precautions" && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <BookOpen className="h-4 w-4 text-teal-700" />
              <span>Official Public Health Guidelines (Cited Excerpts Only)</span>
            </div>
            <p className="leading-relaxed">
              Below are quoted excerpts from published national clinical guidelines matching diagnoses
              confirmed in your records. MedAnchor does not author instructions or medical rules.
            </p>
          </div>

          {matchedGuidance.length === 0 ? (
            <Card className="border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
              <FileText className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="font-semibold text-gray-700">No condition-specific public health excerpts matched</p>
              <p className="mt-1">
                Upload and confirm clinical documents (prescriptions or discharge summaries) to view relevant official reference links.
              </p>
              <p className="mt-2 font-medium text-teal-800">
                Always consult your treating physician regarding your prescribed medicines.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {matchedGuidance.map((guidance) => (
                <Card key={guidance.id} className="border shadow-sm">
                  <CardHeader className="pb-3 border-b bg-gray-50/50">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <CardTitle className="text-base font-bold text-gray-900">
                          {guidance.targetCondition}
                        </CardTitle>
                        <p className="text-xs text-gray-500 font-medium">
                          Category: {guidance.clinicalCategory}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px] text-teal-800 border-teal-300 bg-teal-50">
                        Official Excerpt
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-3.5 text-xs">
                    {/* Quoted Excerpt */}
                    <div className="p-3 bg-slate-50 border-l-4 border-teal-600 rounded-r-lg text-gray-800 leading-relaxed italic">
                      &ldquo;{guidance.officialCitation.verbatim_excerpt}&rdquo;
                    </div>

                    {/* Source Citation */}
                    <div className="space-y-1 text-[11px] text-gray-600">
                      <p>
                        <strong>Source:</strong> {guidance.officialCitation.source_organization} ({guidance.officialCitation.publication_year})
                      </p>
                      <p>
                        <strong>Publication:</strong> {guidance.officialCitation.document_title}
                      </p>
                      <p>
                        <a
                          href={guidance.officialCitation.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-700 hover:text-teal-800 underline inline-flex items-center gap-1 font-medium mt-1"
                        >
                          View Official Document
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    </div>

                    {/* Non-Negotiable Physician Notice */}
                    <div className="pt-2 border-t border-gray-100 flex items-center gap-2 text-rose-800 bg-rose-50/60 p-2.5 rounded-lg font-semibold">
                      <Info className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>{guidance.mandatoryPhysicianNotice}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Assistive Boundary Notice */}
      <Card className="border border-slate-200 bg-slate-50 text-xs text-slate-700">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Assistive Boundary Notice:</strong> MedAnchor organizes document excerpts and links to official public health references.
            This service does not provide clinical diagnoses, evaluate active symptoms, or recommend medication changes.
            Always consult your treating physician or a qualified healthcare professional.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
