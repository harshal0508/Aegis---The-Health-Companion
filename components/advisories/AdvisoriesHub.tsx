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
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// Color and icon configuration per disease category
const CATEGORY_THEME: Record<
  string,
  {
    borderAccent: string;
    iconBg: string;
    iconColor: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    icon: React.ElementType;
  }
> = {
  vector_borne: {
    borderAccent: "border-t-rose-500",
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
    badgeBg: "bg-rose-50",
    badgeText: "text-rose-700",
    badgeBorder: "border-rose-200",
    icon: Droplets,
  },
  respiratory: {
    borderAccent: "border-t-sky-500",
    iconBg: "bg-sky-50",
    iconColor: "text-sky-600",
    badgeBg: "bg-sky-50",
    badgeText: "text-sky-700",
    badgeBorder: "border-sky-200",
    icon: Wind,
  },
  water_borne: {
    borderAccent: "border-t-amber-500",
    iconBg: "bg-amber-50",
    iconColor: "text-amber-700",
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    badgeBorder: "border-amber-200",
    icon: Droplets,
  },
  viral_contact: {
    borderAccent: "border-t-violet-500",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-700",
    badgeBg: "bg-violet-50",
    badgeText: "text-violet-700",
    badgeBorder: "border-violet-200",
    icon: Eye,
  },
  general: {
    borderAccent: "border-t-indigo-500",
    iconBg: "bg-indigo-50",
    iconColor: "text-indigo-600",
    badgeBg: "bg-indigo-50",
    badgeText: "text-indigo-700",
    badgeBorder: "border-indigo-200",
    icon: ShieldAlert,
  },
};

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
  const { advisories } = getAdvisoriesForLocality(
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

  const handleSearchExecute = () => {
    if (!searchInput.trim()) return;
    const resolved = resolveIndianLocality(searchInput.trim());
    setCurrentLocality(resolved);
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
      {/* 1. Page Header (Airy, Open, Clean) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif font-normal text-slate-900 tracking-tight">
            Outbreak Radar
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
            Official IDSP epidemiological notices, real-time press alerts, and public health guidelines
          </p>
        </div>

        {/* Location Chip & Push Notification Pill */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-xs font-semibold text-slate-800">
            <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
            <span className="truncate max-w-[200px] sm:max-w-xs">{currentLocality.displayName}</span>
          </div>

          {pushStatus !== "subscribed" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleEnablePushAlerts}
              disabled={pushStatus === "requesting"}
              className="h-8 text-xs font-semibold rounded-full border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 gap-1.5 shadow-2xs"
            >
              {pushStatus === "requesting" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Enabling...</span>
                </>
              ) : (
                <>
                  <Bell className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Get Alerts</span>
                </>
              )}
            </Button>
          ) : (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Alerts Active</span>
            </span>
          )}
        </div>
      </div>

      {pushMessage && (
        <div className="text-xs bg-indigo-50 text-indigo-900 p-3 rounded-xl border border-indigo-200/80 flex items-center justify-between">
          <span>{pushMessage}</span>
          <button onClick={() => setPushMessage("")} className="text-indigo-600 hover:text-indigo-950 font-bold px-1">
            ✕
          </button>
        </div>
      )}

      {/* 2. Standalone Spotlight Search Bar (No Box Overcrowding) */}
      <div className="space-y-2.5">
        <div className="apple-card p-1.5 bg-white border border-slate-200/90 shadow-2xs rounded-2xl flex items-center gap-2 transition-all focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
          <div className="pl-3.5 text-slate-400">
            <Search className="h-4 w-4" />
          </div>
          <input
            type="text"
            placeholder="Search any Indian PIN code (e.g. 560034, 411014, 452001) or City name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearchExecute();
              }
            }}
            className="flex-1 bg-transparent text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none py-2 px-1"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 mr-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <Button
            type="button"
            onClick={handleSearchExecute}
            className="h-9 px-4 sm:px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs shrink-0"
          >
            Find District
          </Button>
        </div>

        {/* Clean Popular City Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 select-none text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
            Quick Cities:
          </span>
          {[
            { city: "Indore", pin: "452001" },
            { city: "Pune", pin: "411001" },
            { city: "Bhopal", pin: "462001" },
            { city: "Mumbai", pin: "400001" },
            { city: "Delhi / NCR", pin: "110001" },
            { city: "Bengaluru", pin: "560001" },
            { city: "Hyderabad", pin: "500001" },
            { city: "Jaipur", pin: "302001" },
            { city: "Chennai", pin: "600001" },
            { city: "Kolkata", pin: "700001" },
            { city: "Lucknow", pin: "226001" },
            { city: "Ahmedabad", pin: "380001" },
          ].map((loc) => {
            const isSelected =
              currentLocality.district.toLowerCase() === loc.city.toLowerCase() ||
              currentLocality.pincode === loc.pin;

            return (
              <button
                key={loc.city}
                type="button"
                onClick={() => handleSelectQuickCity(loc.pin)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
                  isSelected
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80"
                }`}
              >
                {loc.city}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Apple-Style Segmented Navigation Dock */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-2xl w-fit border border-slate-200/80 select-none overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab("official")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "official"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5 text-indigo-600" />
          <span>Official Surveillance</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === "official"
                ? "bg-indigo-50 text-indigo-700 border border-indigo-200/80"
                : "bg-slate-200/80 text-slate-600"
            }`}
          >
            {advisories.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("news")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "news"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Newspaper className="h-3.5 w-3.5 text-amber-600" />
          <span>Local Press Radar</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === "news"
                ? "bg-amber-50 text-amber-800 border border-amber-200/80"
                : "bg-slate-200/80 text-slate-600"
            }`}
          >
            {loadingNews ? "..." : newsArticles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("guidelines")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === "guidelines"
              ? "bg-white text-slate-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5 text-teal-600" />
          <span>Clinical Guidelines</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
              activeTab === "guidelines"
                ? "bg-teal-50 text-teal-700 border border-teal-200/80"
                : "bg-slate-200/80 text-slate-600"
            }`}
          >
            {matchedGuidance.length}
          </span>
        </button>
      </div>

      {/* TAB 1: OFFICIAL GOVERNMENT OUTBREAK NOTICES */}
      {activeTab === "official" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
            <p>
              Official epidemiological surveillance notices for{" "}
              <strong className="text-slate-900">{currentLocality.displayName}</strong>:
            </p>
            <span className="text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full font-mono font-medium self-start sm:self-auto">
              Source: IDSP / NCDC Weekly Reports
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {advisories.map((advisory) => {
              const theme = CATEGORY_THEME[advisory.category] || CATEGORY_THEME.general;
              const CategoryIcon = theme.icon;

              return (
                <div
                  key={advisory.id}
                  className={`apple-card apple-card-hover p-6 border-t-4 ${theme.borderAccent} flex flex-col justify-between space-y-4 shadow-2xs`}
                >
                  <div className="space-y-3.5">
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className={`h-8 w-8 rounded-xl ${theme.iconBg} ${theme.iconColor} flex items-center justify-center`}>
                          <CategoryIcon className="h-4 w-4" />
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold uppercase tracking-wider py-0.5 ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder}`}
                        >
                          {advisory.categoryLabel}
                        </Badge>
                      </div>

                      <Badge
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          advisory.severity === "high"
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : advisory.severity === "moderate"
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-sky-50 text-sky-700 border-sky-200"
                        }`}
                      >
                        {advisory.severity === "high"
                          ? "High Priority Alert"
                          : advisory.severity === "moderate"
                          ? "Seasonal Surge"
                          : "Advisory"}
                      </Badge>
                    </div>

                    {/* Title */}
                    <div>
                      <h2 className="text-lg font-serif font-medium text-slate-900 leading-snug">
                        {advisory.name}
                      </h2>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        {advisory.headline}
                      </p>
                    </div>

                    {/* Summary Excerpt */}
                    <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                      {advisory.summary}
                    </p>

                    {/* Reported Symptoms */}
                    <div className="space-y-1.5">
                      <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                        <Thermometer className="h-3.5 w-3.5 text-rose-500" />
                        Key Symptoms:
                      </span>
                      <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                        {advisory.symptoms.map((symptom, idx) => (
                          <li key={idx}>{symptom}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Preventive Protocols */}
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
                  <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-700">Official Source:</span>
                      <a
                        href={advisory.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-700 hover:text-teal-900 underline inline-flex items-center gap-1 text-right font-medium"
                      >
                        <span className="truncate max-w-[220px]">{advisory.source_title}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Report: {advisory.report_date}</span>
                      <span>Verified: {advisory.retrieved_at}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: LOCAL PRESS RADAR */}
      {activeTab === "news" && (
        <div className="space-y-4">
          <div className="bg-amber-50/70 border border-amber-200/90 rounded-2xl p-4 text-xs text-amber-950 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <Newspaper className="h-4 w-4 text-amber-700" />
              <span>Real-Time Local Media Surveillance for {currentLocality.district}</span>
            </div>
            <p className="leading-relaxed">
              These articles are scanned live from regional newspapers covering health developments in{" "}
              <strong>{currentLocality.district} and surrounding blocks</strong>. Press reports are provided for early situational awareness.
            </p>
          </div>

          {loadingNews ? (
            <div className="py-12 text-center text-xs text-slate-500 space-y-2">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-600" />
              <p>Scanning regional health headlines for {currentLocality.displayName}...</p>
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
                <div key={article.id} className="apple-card apple-card-hover p-5 border-t-4 border-t-amber-500 flex flex-col justify-between space-y-3 shadow-2xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-amber-900 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/80">
                        {article.source}
                      </span>
                      <span className="flex items-center gap-1 font-medium">
                        <Calendar className="h-3 w-3" />
                        {article.publishedAt}
                      </span>
                    </div>
                    <h2 className="text-base font-serif font-medium text-slate-900 leading-snug">
                      {article.title}
                    </h2>
                    <p className="text-slate-600 leading-relaxed text-xs">
                      {article.snippet}
                    </p>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-amber-800 bg-amber-50/70 px-2 py-0.5 rounded-full font-medium border border-amber-200/80">
                      Regional Press Report
                    </span>
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 group"
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
          <div className="bg-teal-50/60 border border-teal-200/80 rounded-2xl p-4 text-xs text-teal-950 space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-teal-900">
              <BookOpen className="h-4 w-4 text-teal-700" />
              <span>Official National Clinical Guidelines (Cited Verbatim Excerpts)</span>
            </div>
            <p className="leading-relaxed">
              Quoted verbatim from published national clinical guidelines matching diagnoses confirmed in your records.
              Aegis does not author instructions or artificial medical rules.
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
                <div key={guidance.id} className="apple-card p-6 border-t-4 border-t-teal-600 space-y-4 shadow-2xs">
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
      <div className="apple-card p-4 sm:p-5 bg-slate-50/80 border border-slate-200/80 text-xs text-slate-600 w-full rounded-2xl shadow-2xs">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-slate-800 text-xs block">
              Assistive Public Health Notice
            </span>
            <p className="leading-relaxed text-slate-500 text-xs">
              Aegis organizes public surveillance reports and official guideline references. This service does not provide clinical diagnoses, evaluate active symptoms, or recommend treatment changes. Always consult your treating physician.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
