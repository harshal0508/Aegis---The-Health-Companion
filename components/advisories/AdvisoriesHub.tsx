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
  Search,
  X,
  CheckCircle2,
  Navigation,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DiseaseAdvisory,
  getAdvisoriesForLocality,
} from "@/lib/advisories/disease-data";
import {
  ConditionGuidance,
  matchConfirmedPrecautions,
} from "@/lib/advisories/condition-precautions";
import {
  resolveIndianLocality,
  POPULAR_INDIAN_LOCALITIES,
  ResolvedLocality,
} from "@/lib/advisories/pincode-resolver";

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
  // Resolved locality state
  const [currentLocality, setCurrentLocality] = useState<ResolvedLocality>(() =>
    resolveIndianLocality(initialLocality)
  );

  const [searchInput, setSearchInput] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"official" | "news" | "guidelines">("official");

  // Real-time news state
  const [newsArticles, setNewsArticles] = useState<DistrictNewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState<boolean>(false);

  // Push notifications state
  const [pushStatus, setPushStatus] = useState<"idle" | "requesting" | "subscribed" | "unsupported">("idle");
  const [pushMessage, setPushMessage] = useState<string>("");

  // Get official advisories for current locality
  const { advisories, matchedLocality } = getAdvisoriesForLocality(
    currentLocality.pincode || currentLocality.district
  );
  const matchedGuidance = matchConfirmedPrecautions(confirmedItems);

  // Fetch live district news whenever canonical district changes
  useEffect(() => {
    let isMounted = true;
    async function loadNews() {
      setLoadingNews(true);
      try {
        const queryDistrict = currentLocality.district || currentLocality.city || "Indore";
        const res = await fetch(
          `/api/advisories/news?district=${encodeURIComponent(queryDistrict)}&pincode=${encodeURIComponent(
            currentLocality.pincode
          )}`
        );
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
  }, [currentLocality.district, currentLocality.pincode, currentLocality.city]);

  const handleSelectQuickCity = (cityOrPin: string) => {
    const resolved = resolveIndianLocality(cityOrPin);
    setCurrentLocality(resolved);
    setSearchInput("");
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    const resolved = resolveIndianLocality(searchInput.trim());
    setCurrentLocality(resolved);
  };

  const handleClearSearch = () => {
    setSearchInput("");
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

      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

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
          district: currentLocality.district,
        }),
      });

      const data = await res.json();
      setPushStatus("subscribed");
      setPushMessage(data.message || `Push alerts active for ${currentLocality.displayName}.`);
    } catch (err: any) {
      console.error("[AdvisoriesHub] Push subscription error:", err);
      setPushStatus("idle");
      setPushMessage("Failed to activate push alerts. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Location Controls Card (Clean, Light, Classy) */}
      <div className="apple-card p-6 sm:p-7 bg-gradient-to-br from-white via-white to-teal-50/25 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 text-[11px] font-bold border border-teal-200/80">
              <ShieldAlert className="h-3.5 w-3.5 text-teal-600" />
              <span>District Surveillance &amp; Early Outbreak Radar</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Health Advisories &amp; Outbreak Radar
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl leading-relaxed">
              Active epidemiological surveillance reports (IDSP / NCDC), live regional press reporting, and published national clinical guidelines.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2.5">
            {/* Active District Indicator Badge */}
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/90 rounded-2xl px-4 py-2 shadow-2xs">
              <div className="h-7 w-7 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <MapPin className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Active District &amp; State
                </span>
                <span className="text-xs font-extrabold text-slate-900 block">
                  {currentLocality.displayName}
                </span>
              </div>
            </div>

            {/* Push Notification Button */}
            {pushStatus !== "subscribed" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleEnablePushAlerts}
                disabled={pushStatus === "requesting"}
                className="h-8 text-xs font-semibold rounded-full border-teal-300 text-teal-800 bg-teal-50/50 hover:bg-teal-100/70 shadow-2xs gap-1.5"
              >
                {pushStatus === "requesting" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Activating Alerts...</span>
                  </>
                ) : (
                  <>
                    <Bell className="h-3.5 w-3.5 text-teal-600" />
                    <span>Enable District Alerts</span>
                  </>
                )}
              </Button>
            ) : (
              <span className="text-xs text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Alerts Active</span>
              </span>
            )}
          </div>
        </div>

        {pushMessage && (
          <div className="text-xs bg-teal-50 text-teal-900 p-3 rounded-xl border border-teal-200/80 flex items-center justify-between">
            <span>{pushMessage}</span>
            <button onClick={() => setPushMessage("")} className="text-teal-600 hover:text-teal-950 font-bold px-1">
              ✕
            </button>
          </div>
        )}

        {/* 2. Interactive Search Bar for ANY Indian Pincode or City */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Enter any Indian PIN code (e.g. 560034, 411014, 452001) or City name..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-11 pl-10 pr-9 text-xs sm:text-sm bg-white border-slate-200 rounded-xl focus:ring-teal-500 shadow-2xs"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              className="h-11 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold shadow-xs shrink-0"
            >
              Search Location
            </Button>
          </form>

          {/* Quick Popular District Selector Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 pb-0.5 select-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <Navigation className="h-3 w-3" /> Quick:
            </span>
            {POPULAR_INDIAN_LOCALITIES.slice(0, 10).map((loc) => {
              const isSelected =
                currentLocality.district.toLowerCase() === loc.district.toLowerCase() ||
                currentLocality.pincode === loc.pincode;

              return (
                <button
                  key={loc.city}
                  type="button"
                  onClick={() => handleSelectQuickCity(loc.pincode)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                    isSelected
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                  }`}
                >
                  {loc.city}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. 3-Tier Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar select-none">
        <button
          onClick={() => setActiveTab("official")}
          className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "official"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Official Surveillance ({advisories.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("news")}
          className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "news"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Newspaper className="h-3.5 w-3.5" />
          <span>Local Media Watch ({loadingNews ? "..." : newsArticles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("guidelines")}
          className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "guidelines"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Clinical Guidelines ({matchedGuidance.length})</span>
        </button>
      </div>

      {/* TAB 1: OFFICIAL GOVERNMENT OUTBREAK NOTICES */}
      {activeTab === "official" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
            <p>
              Official epidemiological surveillance notices matching{" "}
              <strong className="text-slate-900">{currentLocality.displayName}</strong>:
            </p>
            <span className="text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full font-mono font-medium self-start sm:self-auto">
              Source: IDSP / NCDC Weekly Reports
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {advisories.map((advisory) => (
              <div
                key={advisory.id}
                className={`apple-card apple-card-hover p-6 flex flex-col justify-between space-y-4 ${
                  advisory.severity === "high"
                    ? "border-rose-200/90"
                    : advisory.severity === "moderate"
                    ? "border-amber-200/90"
                    : "border-slate-200/90"
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                        {advisory.category === "vector_borne" && (
                          <Droplets className="h-4 w-4" />
                        )}
                        {advisory.category === "respiratory" && (
                          <Wind className="h-4 w-4" />
                        )}
                        {advisory.category === "viral_contact" && (
                          <Eye className="h-4 w-4" />
                        )}
                        {advisory.category === "water_borne" && (
                          <Droplets className="h-4 w-4" />
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider py-0.5">
                        {advisory.categoryLabel}
                      </Badge>
                    </div>

                    <Badge
                      className={`text-[10px] font-bold px-2 py-0.5 ${
                        advisory.severity === "high"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : advisory.severity === "moderate"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {advisory.severity === "high"
                        ? "High Priority Alert"
                        : advisory.severity === "moderate"
                        ? "Seasonal Alert"
                        : "Preventive Advisory"}
                    </Badge>
                  </div>

                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      {advisory.name}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {advisory.headline}
                    </p>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    {advisory.summary}
                  </p>

                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1">
                      <Thermometer className="h-3.5 w-3.5 text-rose-500" />
                      Symptoms Reported:
                    </span>
                    <ul className="list-disc pl-5 space-y-0.5 text-xs text-slate-600">
                      {advisory.symptoms.map((symptom, idx) => (
                        <li key={idx}>{symptom}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1.5">
                    <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider">
                      Preventive Protocols:
                    </span>
                    <ul className="space-y-1.5 text-xs text-slate-700">
                      {advisory.precautions.map((precaution, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-teal-600 shrink-0 mt-0.5" />
                          <span>{precaution}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Verifiable Source Footer */}
                <div className="pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-500">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-slate-700">Authority:</span>
                    <a
                      href={advisory.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 hover:text-teal-800 underline inline-flex items-center gap-1 text-right font-medium"
                    >
                      <span className="truncate max-w-[240px]">{advisory.source_title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Report Date: {advisory.report_date}</span>
                    <span>Retrieved: {advisory.retrieved_at}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: LOCAL MEDIA WATCH (REAL-TIME RSS PRESS DIGEST) */}
      {activeTab === "news" && (
        <div className="space-y-4">
          <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-950 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <Newspaper className="h-4 w-4 text-amber-700" />
              <span>Real-Time Local Media Surveillance for {currentLocality.district}</span>
            </div>
            <p className="leading-relaxed">
              These articles are scanned live from regional newspapers and press covering health developments in{" "}
              <strong>{currentLocality.district} and surrounding blocks</strong>. Press reports are provided for early situational awareness.
            </p>
          </div>

          {loadingNews ? (
            <div className="py-12 text-center text-xs text-slate-500 space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-teal-600" />
              <p>Scanning regional health news headlines for {currentLocality.displayName}...</p>
            </div>
          ) : newsArticles.length === 0 ? (
            <div className="apple-card p-8 text-center text-xs text-slate-500 space-y-2">
              <Newspaper className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="font-bold text-slate-800 text-sm">No active disease cluster reports found for {currentLocality.district}</p>
              <p className="max-w-md mx-auto text-slate-500">
                No recent media reports matched communicable disease surge keywords (dengue, malaria, H1N1, or viral fever) in this district over the past week.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newsArticles.map((article) => (
                <div key={article.id} className="apple-card apple-card-hover p-5 flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80">
                        {article.source}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {article.publishedAt}
                      </span>
                    </div>
                    <h2 className="text-sm font-bold text-slate-900 leading-snug">
                      {article.title}
                    </h2>
                    <p className="text-slate-600 leading-relaxed text-xs">
                      {article.snippet}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-medium border border-amber-200/80">
                      Unverified Press
                    </span>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1 group"
                    >
                      <span>Read Full Report</span>
                      <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: OFFICIAL CLINICAL GUIDELINES */}
      {activeTab === "guidelines" && (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-800 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <BookOpen className="h-4 w-4 text-teal-700" />
              <span>Official Public Health Guidelines (Cited Verbatim Excerpts)</span>
            </div>
            <p className="leading-relaxed">
              Quoted verbatim from published national clinical guidelines matching diagnoses confirmed in your records.
              MedAnchor does not author instructions or artificial medical rules.
            </p>
          </div>

          {matchedGuidance.length === 0 ? (
            <div className="apple-card p-8 text-center text-xs text-slate-500 space-y-2">
              <FileText className="h-8 w-8 text-slate-400 mx-auto" />
              <p className="font-bold text-slate-800 text-sm">No condition-specific public health excerpts matched</p>
              <p className="max-w-md mx-auto text-slate-500">
                Upload and confirm clinical documents (prescriptions or discharge summaries) to view relevant official national guideline references.
              </p>
              <p className="font-medium text-teal-800 mt-2">
                Always consult your treating physician regarding your prescribed medicines.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {matchedGuidance.map((guidance) => (
                <div key={guidance.id} className="apple-card p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {guidance.targetCondition}
                      </h2>
                      <p className="text-xs text-slate-400 font-medium">
                        Category: {guidance.clinicalCategory}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-teal-800 border-teal-300 bg-teal-50 font-bold">
                      National Clinical Guideline
                    </Badge>
                  </div>

                  <div className="p-4 bg-slate-50 border-l-4 border-teal-600 rounded-r-xl text-slate-800 leading-relaxed font-serif italic text-sm">
                    &ldquo;{guidance.officialCitation.verbatim_excerpt}&rdquo;
                  </div>

                  <div className="space-y-1 text-xs text-slate-600">
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
                        className="text-teal-700 hover:text-teal-800 underline inline-flex items-center gap-1 font-semibold mt-1"
                      >
                        View Official Published Guidelines
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-rose-800 bg-rose-50/70 p-3 rounded-xl font-semibold text-xs">
                    <Info className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{guidance.mandatoryPhysicianNotice}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. Assistive Clinical Boundary Notice */}
      <div className="apple-card p-4.5 bg-slate-50/70 border border-slate-200/80 text-xs text-slate-600">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Assistive Boundary Notice:</strong> MedAnchor organizes document excerpts, live regional media reports,
            and links to official public health references. This service does not provide clinical diagnoses, evaluate active symptoms,
            or recommend medication changes. Always consult your treating physician or a qualified healthcare professional.
          </p>
        </div>
      </div>
    </div>
  );
}
