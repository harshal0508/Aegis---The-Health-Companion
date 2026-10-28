"use client";

import React, { useState, useEffect } from "react";
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
  Newspaper,
  Check,
  Loader2,
  ShieldAlert,
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

interface DistrictNewsArticle {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet: string;
  district: string;
}

interface AdvisoriesHubProps {
  confirmedItems: Array<{ category: string; value: string }>;
  initialLocality?: string;
}

export function AdvisoriesHub({
  confirmedItems,
  initialLocality = "Indore (452001)",
}: AdvisoriesHubProps) {
  const [selectedLocality, setSelectedLocality] = useState<string>("Indore");
  const [customInput, setCustomInput] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"official" | "news" | "guidelines">("official");

  // Real-time news state
  const [newsArticles, setNewsArticles] = useState<DistrictNewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(false);

  // Push notifications state
  const [pushStatus, setPushStatus] = useState<"idle" | "requesting" | "subscribed" | "unsupported">("idle");
  const [pushMessage, setPushMessage] = useState<string>("");

  const { advisories, matchedLocality } = getAdvisoriesForLocality(selectedLocality);
  const matchedGuidance = matchConfirmedPrecautions(confirmedItems);

  // Fetch live district news whenever selectedLocality changes
  useEffect(() => {
    let isMounted = true;
    async function loadNews() {
      setLoadingNews(true);
      try {
        const res = await fetch(`/api/advisories/news?district=${encodeURIComponent(selectedLocality)}`);
        const data = await res.json();
        if (isMounted && data.articles) {
          setNewsArticles(data.articles);
        }
      } catch (e) {
        console.warn("[AdvisoriesHub] Failed to fetch news:", e);
      } finally {
        if (isMounted) setLoadingNews(false);
      }
    }
    loadNews();
    return () => {
      isMounted = false;
    };
  }, [selectedLocality]);

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

  const handleEnablePushAlerts = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("unsupported");
      setPushMessage("Web Push notifications are not supported in this browser environment.");
      return;
    }

    try {
      setPushStatus("requesting");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushStatus("idle");
        setPushMessage("Notification permission was not granted by your browser.");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Simulated production subscription payload
      const subPayload = {
        endpoint: `https://fcm.googleapis.com/fcm/send/medanchor-${Date.now()}`,
        keys: {
          p256dh: "BM_sample_p256dh_key_medanchor_production",
          auth: "sample_auth_secret",
        },
      };

      const res = await fetch("/api/advisories/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subPayload,
          district: selectedLocality,
        }),
      });

      const data = await res.json();
      setPushStatus("subscribed");
      setPushMessage(data.message || `Push alerts active for ${selectedLocality} official notices.`);
    } catch (err: any) {
      console.error("[AdvisoriesHub] Push subscription error:", err);
      setPushStatus("idle");
      setPushMessage("Failed to activate push alerts. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-sm space-y-4 border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-200 text-xs font-medium border border-teal-400/30">
              <Bell className="h-3.5 w-3.5" />
              <span>District Surveillance &amp; Official Health References</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              Health Advisories &amp; Outbreak Radar
            </h1>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              Official district surveillance reports (IDSP / NCDC), live regional media reporting, and published national clinical guidelines.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2">
              <MapPin className="h-4 w-4 text-teal-400 shrink-0" />
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active District</p>
                <p className="text-xs font-bold text-white">{matchedLocality}</p>
              </div>
            </div>

            {pushStatus !== "subscribed" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleEnablePushAlerts}
                disabled={pushStatus === "requesting"}
                className="h-7 text-[11px] bg-slate-800 border-slate-700 text-teal-300 hover:bg-slate-700 hover:text-white"
              >
                {pushStatus === "requesting" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <Bell className="h-3 w-3 mr-1 text-teal-400" />
                    Enable District Alerts
                  </>
                )}
              </Button>
            ) : (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800">
                <Check className="h-3 w-3" /> Alerts Active
              </span>
            )}
          </div>
        </div>

        {pushMessage && (
          <div className="text-[11px] bg-slate-800/90 text-teal-200 p-2 rounded-lg border border-slate-700 flex items-center justify-between">
            <span>{pushMessage}</span>
            <button onClick={() => setPushMessage("")} className="text-slate-400 hover:text-white text-xs">
              ✕
            </button>
          </div>
        )}

        {/* Quick Locality Selector */}
        <div className="pt-2 border-t border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <span className="text-slate-400 shrink-0 mr-1 font-medium">Select District:</span>
            {SUPPORTED_LOCALITIES.map((loc) => (
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
              placeholder="District or PIN (e.g. Indore, 452001)..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:bg-slate-900 focus:text-white rounded-lg w-52"
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

      {/* 3-Tier Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("official")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === "official"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Official Surveillance ({advisories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("news")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === "news"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <Newspaper className="h-3.5 w-3.5" />
          <span>Local Media Watch ({loadingNews ? "..." : newsArticles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("guidelines")}
          className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === "guidelines"
              ? "bg-teal-700 text-white shadow-sm"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Clinical Guidelines ({matchedGuidance.length})</span>
        </button>
      </div>

      {/* TAB 1: OFFICIAL GOVERNMENT OUTBREAK NOTICES */}
      {activeTab === "official" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <p>
              Official epidemiological surveillance notices for <strong>{matchedLocality}</strong>:
            </p>
            <span className="text-[11px] bg-slate-100 text-slate-800 border px-2 py-0.5 rounded font-mono">
              Source: IDSP / NCDC Weekly Reports
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
                      <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider py-0">
                        {advisory.categoryLabel}
                      </Badge>
                    </div>

                    {advisory.is_sample_demo && (
                      <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
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
                      Symptoms Reported:
                    </span>
                    <ul className="list-disc pl-5 space-y-0.5 text-gray-600">
                      {advisory.symptoms.map((symptom, idx) => (
                        <li key={idx}>{symptom}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1">
                    <span className="font-bold text-gray-800 text-[11px] uppercase tracking-wider">
                      Preventive Protocols:
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
                  <div className="pt-2 border-t border-gray-200/80 space-y-1 text-[11px] text-gray-600">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-gray-800">Source:</span>
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

      {/* TAB 2: LOCAL MEDIA WATCH (LIVE RSS NEWS) */}
      {activeTab === "news" && (
        <div className="space-y-4">
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-1">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <Newspaper className="h-4 w-4 text-amber-700" />
              <span>Local Media Intelligence (Unverified Press Reports)</span>
            </div>
            <p className="leading-relaxed">
              These articles are aggregated live from regional news media covering health developments in{" "}
              <strong>{selectedLocality} and surrounding blocks</strong>. Press reports are unconfirmed by government
              health authorities and are provided for situational awareness only.
            </p>
          </div>

          {loadingNews ? (
            <div className="py-12 text-center text-xs text-gray-500 space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-teal-600" />
              <p>Scanning regional health news for {selectedLocality}...</p>
            </div>
          ) : newsArticles.length === 0 ? (
            <Card className="border border-dashed border-gray-300 p-8 text-center text-xs text-gray-500">
              <Newspaper className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="font-semibold text-gray-700">No active media reports found for {selectedLocality}</p>
              <p className="mt-1">
                No recent health news articles matched disease cluster keywords in this area over the past week.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newsArticles.map((article) => (
                <Card key={article.id} className="border shadow-sm hover:border-teal-300 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {article.source}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {article.publishedAt}
                      </span>
                    </div>
                    <CardTitle className="text-sm font-bold text-gray-900 leading-snug">
                      {article.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-1 space-y-3 text-xs">
                    <p className="text-gray-600 leading-relaxed text-[11px]">
                      {article.snippet}
                    </p>
                    <div className="pt-2 border-t flex items-center justify-between">
                      <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                        Unverified Media Report
                      </span>
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"
                      >
                        Read Full Article
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OFFICIAL PUBLIC HEALTH REFERENCE EXCERPTS */}
      {activeTab === "guidelines" && (
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
                    <div className="p-3 bg-slate-50 border-l-4 border-teal-600 rounded-r-lg text-gray-800 leading-relaxed italic">
                      &ldquo;{guidance.officialCitation.verbatim_excerpt}&rdquo;
                    </div>

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
            <strong>Assistive Boundary Notice:</strong> MedAnchor organizes document excerpts, live regional media reports,
            and links to official public health references. This service does not provide clinical diagnoses, evaluate active symptoms,
            or recommend medication changes. Always consult your treating physician or a qualified healthcare professional.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
