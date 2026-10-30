"use client";

import React, { useState, useEffect } from "react";
import {
  MapPin,
  ExternalLink,
  Calendar,
  Newspaper,
  Loader2,
  Search,
  X,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resolveIndianLocality,
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
  confirmedItems?: Array<{ category: string; value: string }>;
  initialLocality?: string;
}

/**
 * Returns a human-friendly disease category and color based on title keywords.
 */
function getArticleTopicBadge(title: string): { label: string; tagColor: string } {
  const t = title.toLowerCase();
  if (/dengue/i.test(t)) {
    return {
      label: "Dengue Alert",
      tagColor: "text-rose-700",
    };
  }
  if (/malaria/i.test(t)) {
    return {
      label: "Malaria Alert",
      tagColor: "text-amber-800",
    };
  }
  if (/chikungunya/i.test(t)) {
    return {
      label: "Chikungunya Alert",
      tagColor: "text-rose-700",
    };
  }
  if (/mosquito|vector/i.test(t)) {
    return {
      label: "Mosquito-Borne Illness",
      tagColor: "text-rose-700",
    };
  }
  if (/water|diarrh|cholera|contaminat|drink|vomit|borewell|pipeline/i.test(t)) {
    return {
      label: "Water Contamination",
      tagColor: "text-cyan-800",
    };
  }
  if (/flu|influenza|h1n1|h3n2|respiratory|cough|pneumonia/i.test(t)) {
    return {
      label: "Viral Flu & Respiratory",
      tagColor: "text-sky-700",
    };
  }
  if (/eye\s*flu|conjunctivitis/i.test(t)) {
    return {
      label: "Eye Flu / Conjunctivitis",
      tagColor: "text-violet-700",
    };
  }
  if (/fever|surge|spike|outbreak|epidemic|hospitalized/i.test(t)) {
    return {
      label: "Disease Outbreak",
      tagColor: "text-amber-800",
    };
  }
  return {
    label: "Public Health",
    tagColor: "text-slate-700",
  };
}

export function AdvisoriesHub({ initialLocality }: AdvisoriesHubProps) {
  const [currentLocality, setCurrentLocality] = useState<ResolvedLocality>(() => {
    return resolveIndianLocality(initialLocality || "Indore");
  });
  const [searchInput, setSearchInput] = useState("");
  const [newsArticles, setNewsArticles] = useState<DistrictNewsArticle[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);

  const activeMonthYear = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Fetch live regional media disease surveillance whenever district changes
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

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-serif font-normal text-slate-900 tracking-tight">
            Local Outbreak Radar
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
            Real-time disease surveillance scanned from regional press covering active outbreaks in your district
          </p>
        </div>

        {/* Location Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-slate-200 shadow-2xs text-xs font-semibold text-slate-800 self-start md:self-auto">
          <MapPin className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
          <span className="truncate max-w-[200px] sm:max-w-xs">{currentLocality.displayName}</span>
        </div>
      </div>

      {/* 2. Spotlight Search Bar */}
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

        {/* Quick Cities */}
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

      {/* 3. Real-Time Local Press Radar Content */}
      <div className="space-y-4">
        {/* Banner with clean Month Badge */}
        <div className="apple-card p-4 sm:p-5 bg-gradient-to-r from-amber-50/70 to-orange-50/50 border border-amber-200/80 rounded-2xl shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 font-bold text-amber-950 text-xs sm:text-sm">
              <Newspaper className="h-4 w-4 text-amber-700 shrink-0" />
              <span>Real-Time Local Media Surveillance for {currentLocality.district}</span>
            </div>

            <div className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/95 border border-amber-200/80 text-amber-900 text-xs font-bold shadow-2xs">
              <Calendar className="h-3.5 w-3.5 text-amber-600" />
              <span>{activeMonthYear}</span>
            </div>
          </div>
          <p className="text-xs text-amber-900/80 leading-relaxed mt-2">
            These articles are scanned live from regional newspapers covering health developments in{" "}
            <strong>{currentLocality.district} and surrounding blocks</strong> during {activeMonthYear}, ordered from the latest reports down to the first of the month.
          </p>
        </div>

        {/* Loading State */}
        {loadingNews ? (
          <div className="apple-card p-12 text-center text-xs text-slate-500 space-y-3">
            <Loader2 className="h-6 w-6 animate-spin text-amber-600 mx-auto" />
            <p className="font-semibold text-slate-700">
              Scanning regional news for {currentLocality.district}...
            </p>
          </div>
        ) : newsArticles.length === 0 ? (
          <div className="apple-card p-8 text-center text-xs text-slate-500 space-y-2">
            <Newspaper className="h-8 w-8 text-slate-400 mx-auto" />
            <p className="font-bold text-slate-800 text-sm">
              No active disease cluster reports found for {currentLocality.district}
            </p>
            <p className="max-w-md mx-auto text-slate-500">
              No active communicable disease outbreaks, water contamination alerts, or epidemic surges reported in regional media for {currentLocality.district} during {activeMonthYear}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...newsArticles]
              .sort(
                (a, b) =>
                  new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
              )
              .map((article) => {
                const topic = getArticleTopicBadge(article.title);
                const formattedDate = new Date(article.publishedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });

                return (
                  <div
                    key={article.id}
                    className="apple-card apple-card-hover p-5 border-t-4 border-t-amber-500 flex flex-col justify-between space-y-3 shadow-2xs"
                  >
                    <div className="space-y-2.5">
                      {/* Editorial Publisher Monogram & Human Formatted Date */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-6 w-6 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold shadow-2xs shrink-0 select-none">
                            {article.source.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-slate-900 tracking-tight truncate">
                            {article.source}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          {formattedDate}
                        </span>
                      </div>

                      {/* Title */}
                      <h2 className="text-base font-serif font-medium text-slate-900 leading-snug">
                        {article.title}
                      </h2>

                      {/* Excerpt */}
                      <p className="text-slate-600 leading-relaxed text-xs">
                        {article.snippet}
                      </p>
                    </div>

                    {/* Footer: Plain-Language Health Type & Action Button */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs select-none">
                        <span className="text-slate-400 font-medium">Type:</span>
                        <span className={`font-semibold tracking-tight ${topic.tagColor}`}>
                          {topic.label}
                        </span>
                      </div>

                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200/80 inline-flex items-center gap-1.5 transition-all shadow-2xs group"
                      >
                        <span>Original Story</span>
                        <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-slate-700 transition-colors" />
                      </a>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* 4. Assistive Clinical Disclaimer */}
      <div className="apple-card p-4 sm:p-5 bg-slate-50/80 border border-slate-200/80 text-xs text-slate-600 w-full rounded-2xl shadow-2xs">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-slate-800 text-xs block">
              Assistive Public Health Notice
            </span>
            <p className="leading-relaxed text-slate-500 text-xs">
              Aegis aggregates verified regional press reports for early outbreak awareness. This radar does not provide medical diagnoses, evaluate personal symptoms, or recommend treatment changes. Always consult your treating physician.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
