"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  ShieldCheck,
  MapPin,
  Thermometer,
  Activity,
  HeartPulse,
  Info,
  CheckCircle2,
  Droplets,
  Wind,
  Eye,
  Search,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
  Calendar,
  AlertCircle,
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
  ConditionPrecaution,
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
  const matchedPrecautions = matchConfirmedPrecautions(confirmedItems);

  const highSeverityCount = advisories.filter((a) => a.severity === "high").length;

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
      <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 rounded-2xl p-6 text-white shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-200 text-xs font-medium border border-teal-400/30">
              <Bell className="h-3.5 w-3.5" />
              <span>Public Health &amp; Outbreak Surveillance</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Local Health Advisories
            </h1>
            <p className="text-xs text-teal-100/90 max-w-xl leading-relaxed">
              Real-time regional disease surveillance and personalized medical precautions matched to your confirmed records.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-black/20 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2.5">
            <MapPin className="h-4 w-4 text-teal-300 shrink-0" />
            <div>
              <p className="text-[10px] text-teal-200 uppercase tracking-wider font-semibold">Active Region</p>
              <p className="text-xs font-bold text-white">{matchedLocality}</p>
            </div>
          </div>
        </div>

        {/* Quick Locality Bar */}
        <div className="pt-2 border-t border-teal-700/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <span className="text-teal-200/80 shrink-0 mr-1 font-medium">Quick Cities:</span>
            {SUPPORTED_LOCALITIES.slice(0, 5).map((loc) => (
              <button
                key={loc.city}
                onClick={() => handleSelectQuickCity(loc.city)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  selectedLocality.toLowerCase().includes(loc.city.toLowerCase())
                    ? "bg-teal-400 text-teal-950 font-bold"
                    : "bg-white/10 text-white hover:bg-white/20"
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
              className="h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-teal-200/50 focus:bg-white focus:text-gray-900 rounded-lg w-44"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              className="h-8 text-xs bg-teal-400 hover:bg-teal-300 text-teal-950 font-semibold"
            >
              Search
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
              ? "bg-teal-600 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Regional Disease Alerts ({advisories.length})</span>
          {highSeverityCount > 0 && (
            <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("precautions")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "precautions"
              ? "bg-teal-600 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <HeartPulse className="h-3.5 w-3.5" />
          <span>Personalized Condition Precautions ({matchedPrecautions.length})</span>
        </button>
      </div>

      {/* TAB 1: OUTBREAKS & REGIONAL ADVISORIES */}
      {activeTab === "outbreaks" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              Showing active public health notices reported for <strong>{matchedLocality}</strong>:
            </p>
            <span className="text-[11px] bg-gray-100 px-2 py-0.5 rounded text-gray-600 font-mono">
              Surveillance Source: Municipal &amp; State Bulletins
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
                  <div className="flex items-start justify-between gap-2">
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

                    <Badge
                      className={`text-[10px] uppercase font-bold tracking-wider ${
                        advisory.severity === "high"
                          ? "bg-rose-600 hover:bg-rose-700 text-white"
                          : advisory.severity === "moderate"
                          ? "bg-amber-600 hover:bg-amber-700 text-white"
                          : "bg-slate-600 text-white"
                      }`}
                    >
                      {advisory.severity} Alert
                    </Badge>
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
                      Key Symptoms to Monitor:
                    </span>
                    <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                      {advisory.symptoms.map((symptom, idx) => (
                        <li key={idx}>{symptom}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1">
                    <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-teal-600" />
                      Recommended Precautions:
                    </span>
                    <ul className="space-y-1 text-gray-700">
                      {advisory.precautions.map((precaution, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-teal-600 font-bold shrink-0">✓</span>
                          <span>{precaution}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Updated: {advisory.lastUpdated}
                    </span>
                    <span className="capitalize font-medium">
                      Trend: {advisory.reportedTrend}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: PERSONALIZED CONDITION PRECAUTIONS */}
      {activeTab === "precautions" && (
        <div className="space-y-4">
          <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-4 text-xs text-teal-950 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-teal-900">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              <span>Grounded in Your Patient-Confirmed Health Profile</span>
            </div>
            <p className="leading-relaxed">
              These clinical guidance notes are tailored to the diagnoses and drug allergies you have
              confirmed in your MedAnchor summary. They help you stay ahead of potential drug interactions
              and seasonal vulnerability triggers.
            </p>
          </div>

          <div className="space-y-4">
            {matchedPrecautions.map((precaution, idx) => (
              <Card key={idx} className="border shadow-sm">
                <CardHeader className="pb-3 border-b bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-teal-600" />
                      <CardTitle className="text-base font-bold text-gray-900">
                        {precaution.matchedTitle}
                      </CardTitle>
                    </div>
                    <Badge variant="outline" className="text-[10px] font-semibold capitalize">
                      {precaution.category}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-3.5 text-xs">
                  {precaution.outbreakVulnerabilityNote && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-medium leading-relaxed">
                      {precaution.outbreakVulnerabilityNote}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <span className="font-bold text-gray-900 text-xs uppercase tracking-wider block">
                      Daily Care &amp; Health Precautions:
                    </span>
                    <ul className="space-y-1.5 text-gray-700">
                      {precaution.dailyPrecautions.map((item, pIdx) => (
                        <li key={pIdx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {precaution.redFlags && precaution.redFlags.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t">
                      <span className="font-bold text-rose-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                        Red-Flag Warning Signs (Seek Immediate Medical Care):
                      </span>
                      <ul className="space-y-1 text-gray-700">
                        {precaution.redFlags.map((flag, fIdx) => (
                          <li key={fIdx} className="flex items-start gap-2">
                            <span className="text-rose-600 font-bold shrink-0">•</span>
                            <span className="leading-relaxed">{flag}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Safety & Assistive Disclaimer */}
      <Card className="border border-slate-200 bg-slate-50 text-xs text-slate-700">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Assistive Public Health Guidance:</strong> MedAnchor organizes verified clinical document excerpts
            and public health notifications. This platform does not provide automated diagnoses, evaluate raw symptoms,
            or alter prescriptions. Always consult a licensed healthcare professional for medical diagnosis or before changing
            any medical regimen.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
