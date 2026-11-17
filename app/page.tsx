"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Globe,
  Info,
  Key,
  MapPin,
  MessageSquare,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { ScrapedLead, ScrapeResponseBody, VcfPlatform } from "@/lib/types";
import {
  buildSequentialContactName,
  downloadVcf,
  extractLocationFromQuery,
} from "@/lib/vcf";
import {
  buildWhatsAppDesktopUrl,
  buildWhatsAppWebUrl,
  renderPitchMessage,
} from "@/lib/whatsapp";

const DEFAULT_PITCH_TEMPLATE = `Hi {cafe_name} team! Came across your place on Google Maps in {location} and loved what you're doing. Quick question — are you looking to bring in more repeat local customers this month?`;

const QUICK_SEARCH_PROMPTS = [
  "cafes in hanumangarh",
  "restaurants in jaipur",
  "dentists in south delhi",
  "bakeries in sri ganganagar",
  "gyms in chandigarh",
];

const PRESET_LIMITS = [15, 25, 50, 100];

export default function LeadDashboardPage() {
  const [searchQuery, setSearchQuery] = useState("cafes in hanumangarh");
  const [maxResults, setMaxResults] = useState<number>(20);
  const [locationOverride, setLocationOverride] = useState<string>("");
  const [pitchTemplate, setPitchTemplate] = useState(DEFAULT_PITCH_TEMPLATE);

  const [leads, setLeads] = useState<ScrapedLead[]>([]);
  const [scrapeStats, setScrapeStats] = useState<{
    totalRaw: number;
    filteredOut: number;
  } | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Key Pool State (initialized lazily from localStorage)
  const [customKeys, setCustomKeys] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("leadflow_apify_keys");
        if (saved) {
          const parsed = JSON.parse(saved) as string[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {
        // Fallback
      }
    }
    return [];
  });
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyInputText, setKeyInputText] = useState("");
  const [keyValidationStatus, setKeyValidationStatus] = useState<string | null>(null);
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [activeKeyInfo, setActiveKeyInfo] = useState<{
    index: number;
    masked: string;
    total: number;
    keyRotated?: boolean;
    rotationMessage?: string;
  } | null>(null);

  // Filtering & Status State
  const [tableFilter, setTableFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "contacted">("all");
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadSuccessPlatform, setDownloadSuccessPlatform] = useState<VcfPlatform | null>(null);
  const [showAndroidGuide, setShowAndroidGuide] = useState(false);

  // Query backend for env-configured keys count on mount
  useEffect(() => {
    fetch("/api/keys")
      .then((res) => res.json())
      .then((data: { totalConfigured?: number; keys?: { maskedToken: string }[] }) => {
        if (data && typeof data.totalConfigured === "number") {
          setActiveKeyInfo((prev) => ({
            index: 0,
            masked: data.keys?.[0]?.maskedToken || "ENV KEY",
            total: Math.max(data.totalConfigured ?? 1, 1),
            keyRotated: prev?.keyRotated,
            rotationMessage: prev?.rotationMessage,
          }));
        }
      })
      .catch(() => {
        // Fallback
      });
  }, []);

  // Save custom keys to localStorage
  function handleSaveCustomKeys(newKeys: string[]) {
    setCustomKeys(newKeys);
    try {
      localStorage.setItem("leadflow_apify_keys", JSON.stringify(newKeys));
    } catch {
      // Ignore
    }
  }

  async function handleAddSingleKey() {
    const trimmed = keyInputText.trim();
    if (!trimmed) return;

    setIsValidatingKey(true);
    setKeyValidationStatus("Validating with Apify API...");

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });
      const data = (await res.json()) as {
        valid: boolean;
        username?: string;
        plan?: string;
        error?: string;
      };

      if (!res.ok || !data.valid) {
        setKeyValidationStatus(`Invalid key: ${data.error || "Token unauthorized"}`);
      } else {
        const updated = Array.from(new Set([...customKeys, trimmed]));
        handleSaveCustomKeys(updated);
        setKeyInputText("");
        setKeyValidationStatus(`Verified key (${data.username} - ${data.plan} plan)`);
        setTimeout(() => setKeyValidationStatus(null), 3000);
      }
    } catch {
      setKeyValidationStatus("Validation failed: network error");
    } finally {
      setIsValidatingKey(false);
    }
  }

  function handleRemoveCustomKey(index: number) {
    const updated = customKeys.filter((_, i) => i !== index);
    handleSaveCustomKeys(updated);
  }

  // Location calculation
  const autoDetectedLocation = useMemo(
    () => extractLocationFromQuery(searchQuery),
    [searchQuery]
  );

  const effectiveLocation =
    locationOverride.trim().length > 0
      ? locationOverride.trim()
      : autoDetectedLocation;

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    const query = tableFilter.trim().toLowerCase();

    return leads
      .map((lead, index) => ({ lead, index }))
      .filter(({ lead, index }) => {
        const isContacted = openedIds.has(lead.id);

        if (statusFilter === "pending" && isContacted) return false;
        if (statusFilter === "contacted" && !isContacted) return false;

        if (!query) return true;

        const contactName = buildSequentialContactName(
          lead.title,
          effectiveLocation,
          index + 1
        ).toLowerCase();

        return (
          contactName.includes(query) ||
          lead.title.toLowerCase().includes(query) ||
          lead.phone.toLowerCase().includes(query) ||
          (lead.address?.toLowerCase().includes(query) ?? false) ||
          (lead.category?.toLowerCase().includes(query) ?? false)
        );
      });
  }, [leads, tableFilter, statusFilter, openedIds, effectiveLocation]);

  // Outreach progress calculation
  const contactedCount = openedIds.size;
  const contactedPercentage = leads.length > 0
    ? Math.round((contactedCount / leads.length) * 100)
    : 0;

  async function handleRunScraper(e: React.FormEvent) {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setErrorMessage("Please enter a Google Maps search query.");
      return;
    }

    setIsScraping(true);
    setErrorMessage(null);
    setDownloadSuccessPlatform(null);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchQuery: trimmedQuery,
          maxResults: Number.isFinite(maxResults) ? maxResults : 20,
          customApiTokens: customKeys.length > 0 ? customKeys : undefined,
        }),
      });

      const data = (await response.json()) as ScrapeResponseBody;

      if (!response.ok) {
        throw new Error(
          data.error || `Scraper failed with status ${response.status}`
        );
      }

      setLeads(data.leads);
      setScrapeStats({
        totalRaw: data.totalRaw,
        filteredOut: data.filteredOut,
      });

      if (data.totalKeysConfigured) {
        setActiveKeyInfo({
          index: data.activeKeyIndex ?? 0,
          masked: data.activeKeyMasked ?? "Key Active",
          total: data.totalKeysConfigured,
          keyRotated: data.keyRotated,
          rotationMessage: data.rotationMessage,
        });
      }

      setOpenedIds(new Set());
      setTableFilter("");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to run Apify Google Maps scraper.";
      setErrorMessage(msg);
    } finally {
      setIsScraping(false);
    }
  }

  function handleTriggerDownload(platform: VcfPlatform) {
    if (leads.length === 0) return;
    downloadVcf(leads, effectiveLocation, platform);
    setDownloadSuccessPlatform(platform);
    setTimeout(() => setDownloadSuccessPlatform(null), 3500);
  }

  function handleOpenWhatsAppDesktop(lead: ScrapedLead) {
    const personalizedMessage = renderPitchMessage(
      pitchTemplate,
      lead.title,
      effectiveLocation,
      lead
    );
    const protocolUrl = buildWhatsAppDesktopUrl(
      lead.whatsappPhone,
      personalizedMessage
    );

    setOpenedIds((prev) => new Set([...prev, lead.id]));
    window.location.href = protocolUrl;
  }

  function handleOpenWhatsAppWeb(lead: ScrapedLead) {
    const personalizedMessage = renderPitchMessage(
      pitchTemplate,
      lead.title,
      effectiveLocation,
      lead
    );
    const webUrl = buildWhatsAppWebUrl(
      lead.whatsappPhone,
      personalizedMessage
    );

    setOpenedIds((prev) => new Set([...prev, lead.id]));
    window.open(webUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopyPhone(lead: ScrapedLead) {
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopiedId(lead.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Fallback
    }
  }

  function handleInsertVariable(token: string) {
    setPitchTemplate((prev) =>
      prev.includes(token) ? prev : `${prev.trim()} ${token}`
    );
  }

  function handleClearLeads() {
    setLeads([]);
    setScrapeStats(null);
    setOpenedIds(new Set());
    setTableFilter("");
    setErrorMessage(null);
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#000000] text-slate-100 lg:h-screen lg:flex-row lg:overflow-hidden">
      {/* Left Sidebar Control Panel */}
      <aside className="flex w-full shrink-0 flex-col border-r border-[#262626] bg-[#0c0c0c] lg:h-full lg:w-[430px] xl:w-[460px]">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-[#262626] bg-[#121212] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-950/20 shadow-sm">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-white">
                  LeadFlow Outreach
                </h1>
                <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 font-mono text-[10px] text-emerald-400">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Maps Lead Scraper &amp; Dual Contact Sync
              </p>
            </div>
          </div>

          {/* Key Pool Header Pill */}
          <button
            type="button"
            onClick={() => setIsKeyModalOpen(true)}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-all duration-200 hover:border-emerald-500/40 hover:text-white"
            title="Configure multiple Apify free keys pool"
          >
            <Key className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              {activeKeyInfo?.total ? `${activeKeyInfo.total} Keys` : "Key Pool"}
            </span>
            <Settings2 className="h-3 w-3 text-slate-500" />
          </button>
        </div>

        {/* Automatic Rotation Alert Banner */}
        {activeKeyInfo?.keyRotated && (
          <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-xs text-amber-200">
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-amber-400 animate-spin" />
            <span className="line-clamp-1">{activeKeyInfo.rotationMessage}</span>
          </div>
        )}

        {/* Form Controls */}
        <form
          onSubmit={handleRunScraper}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          {/* Search Query Input */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="searchQuery"
              className="flex items-center justify-between text-xs font-medium text-slate-300"
            >
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                Google Maps search query
              </span>
              <span className="text-[11px] text-slate-500">Free dynamic crawl</span>
            </label>
            <div className="relative">
              <input
                id="searchQuery"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. cafes in hanumangarh"
                className="w-full rounded-xl border border-[#262626] bg-[#161616] px-3.5 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30"
                required
              />
            </div>

            {/* Quick search suggestion pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {QUICK_SEARCH_PROMPTS.slice(0, 3).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setSearchQuery(prompt)}
                  className="rounded-md border border-[#262626] bg-[#161616] px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:border-[#383838] hover:text-white active:scale-[0.98]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Grid: Max Results Stepper + Detected Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="maxResults" className="text-xs font-medium text-slate-300">
                Max leads count
              </label>
              <div className="flex items-center gap-1">
                {PRESET_LIMITS.map((limit) => (
                  <button
                    key={limit}
                    type="button"
                    onClick={() => setMaxResults(limit)}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-mono font-medium transition-all ${
                      maxResults === limit
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-[#262626] bg-[#161616] text-slate-400 hover:border-[#383838] hover:text-white"
                    }`}
                  >
                    {limit}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="locationInput" className="text-xs font-medium text-slate-300">
                  Target location
                </label>
                {locationOverride && (
                  <button
                    type="button"
                    onClick={() => setLocationOverride("")}
                    className="flex items-center gap-1 text-[10px] text-emerald-400 hover:underline"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Auto
                  </button>
                )}
              </div>
              <input
                id="locationInput"
                type="text"
                value={effectiveLocation}
                onChange={(e) => setLocationOverride(e.target.value)}
                placeholder="Hanumangarh"
                className="w-full rounded-xl border border-[#262626] bg-[#161616] px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none transition-all focus:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Dynamic Sequential Contact Formula Preview */}
          <div className="rounded-xl border border-[#262626] bg-[#141414] p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Compass className="h-3.5 w-3.5" />
                Dynamic contact name preview
              </span>
              <span className="font-mono text-[10px] text-slate-500">Sequential</span>
            </div>
            <p className="mt-1 font-mono text-xs text-white">
              [Title] + &ldquo;{effectiveLocation || "City"}&rdquo; + [1..N]
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Generated: &ldquo;Brew House {effectiveLocation || "City"} 1&rdquo;
            </p>
          </div>

          {/* Pitch Message Template Editor */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="pitchTemplate"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                WhatsApp pitch template
              </label>
              <div className="flex items-center gap-1">
                {["{cafe_name}", "{location}", "{phone}"].map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => handleInsertVariable(variable)}
                    className="rounded bg-[#222222] px-1.5 py-0.5 font-mono text-[10px] text-emerald-400 transition hover:bg-[#2c2c2c] active:scale-[0.98]"
                  >
                    +{variable}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="pitchTemplate"
              rows={3}
              value={pitchTemplate}
              onChange={(e) => setPitchTemplate(e.target.value)}
              placeholder="Write your outreach message..."
              className="w-full resize-none rounded-xl border border-[#262626] bg-[#161616] p-3 text-sm leading-relaxed text-white placeholder-slate-500 outline-none transition-all focus:border-emerald-500/50"
            />
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div className="flex-1 space-y-1">
                <p className="font-medium text-rose-300">Scrape failed</p>
                <p className="leading-relaxed text-rose-200/90">{errorMessage}</p>
                {errorMessage.includes("quota") || errorMessage.includes("limit") || errorMessage.includes("credit") ? (
                  <button
                    type="button"
                    onClick={() => setIsKeyModalOpen(true)}
                    className="mt-1 inline-flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 font-medium text-rose-300 hover:bg-rose-500/30"
                  >
                    <Key className="h-3 w-3" /> Add another free key to pool
                  </button>
                ) : null}
              </div>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="mt-1 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isScraping}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 px-4 text-sm font-semibold text-black transition-all duration-200 hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isScraping ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Scraping Google Maps via Apify...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Run Apify Scraper
                </>
              )}
            </button>
          </div>

          {/* DUAL PLATFORM EXPORT SECTION: APPLE + ANDROID */}
          {leads.length > 0 && (
            <div className="mt-1 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <Download className="h-3.5 w-3.5 text-emerald-400" />
                  Export Contacts (.vcf)
                </span>
                <button
                  type="button"
                  onClick={() => setShowAndroidGuide(true)}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-emerald-300"
                >
                  <Info className="h-3 w-3" /> Android Guide
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* Apple / Mac Download */}
                <button
                  type="button"
                  onClick={() => handleTriggerDownload("apple")}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                    downloadSuccessPlatform === "apple"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : "border-[#2c2c2c] bg-[#1a1a1a] text-slate-200 hover:border-slate-500 hover:bg-[#222222] active:scale-[0.98]"
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    <span>🍎 Apple / Mac</span>
                    {downloadSuccessPlatform === "apple" && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                  </div>
                  <span className="text-[10px] text-slate-400">Mac Contacts &amp; iCloud</span>
                </button>

                {/* Android / Google Contacts Download */}
                <button
                  type="button"
                  onClick={() => handleTriggerDownload("android")}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition-all ${
                    downloadSuccessPlatform === "android"
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                      : "border-[#2c2c2c] bg-[#1a1a1a] text-slate-200 hover:border-emerald-500/40 hover:bg-[#222222] active:scale-[0.98]"
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs font-semibold">
                    <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Android / Google</span>
                    {downloadSuccessPlatform === "android" && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                  </div>
                  <span className="text-[10px] text-slate-400">Google &amp; Samsung Contacts</span>
                </button>
              </div>
            </div>
          )}

          {/* Safe Outreach Sync Workflow Banner */}
          <div className="mt-auto rounded-2xl border border-[#222222] bg-[#121212] p-4 text-xs text-slate-400">
            <div className="flex items-center gap-2 font-medium text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Safe WhatsApp Outreach Architecture</span>
            </div>
            <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed">
              <li>1. Scrape verified numbers from Google Maps.</li>
              <li>2. Export `.vcf` to Apple or Android contacts so numbers are saved.</li>
              <li>3. Send outreach messages to saved contacts with zero anti-spam flags.</li>
            </ul>
          </div>
        </form>
      </aside>

      {/* Right Lead Management Workspace */}
      <main className="flex min-w-0 flex-1 flex-col bg-[#000000] lg:h-full lg:overflow-hidden">
        {/* Top Header Metrics Bar */}
        <header className="border-b border-[#262626] bg-[#0c0c0c] px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-white">
                Outreach Dashboard
              </h2>
              <p className="text-xs text-slate-400">
                Manage, filter, and message scraped business leads
              </p>
            </div>

            {/* Quick Filter Inputs */}
            {leads.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={tableFilter}
                    onChange={(e) => setTableFilter(e.target.value)}
                    placeholder="Search leads, phone, title..."
                    className="w-48 rounded-xl border border-[#262626] bg-[#161616] py-1.5 pr-3 pl-8 text-xs text-white placeholder-slate-500 outline-none transition focus:border-emerald-500/50 sm:w-64"
                  />
                </div>

                <div className="flex items-center rounded-xl border border-[#262626] bg-[#161616] p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setStatusFilter("all")}
                    className={`rounded-lg px-2.5 py-1 text-xs transition ${
                      statusFilter === "all"
                        ? "bg-[#262626] font-medium text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    All ({leads.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("pending")}
                    className={`rounded-lg px-2.5 py-1 text-xs transition ${
                      statusFilter === "pending"
                        ? "bg-[#262626] font-medium text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Pending ({leads.length - contactedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("contacted")}
                    className={`rounded-lg px-2.5 py-1 text-xs transition ${
                      statusFilter === "contacted"
                        ? "bg-[#262626] font-medium text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Done ({contactedCount})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleClearLeads}
                  className="rounded-xl border border-[#262626] bg-[#161616] p-2 text-slate-400 hover:border-rose-500/30 hover:text-rose-300"
                  title="Clear leads queue"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* KPI Analytics Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[#222222] bg-[#121212] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Scraped Leads</span>
                <Users className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-xl font-semibold text-white">{leads.length}</span>
                {scrapeStats?.filteredOut ? (
                  <span className="text-[10px] text-slate-500">
                    ({scrapeStats.filteredOut} filtered)
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-[#222222] bg-[#121212] p-3">
              <span className="text-[11px] font-medium text-slate-400">WhatsApp Verified</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-xl font-semibold text-emerald-400">{leads.length}</span>
                <span className="text-[10px] text-slate-500">100% valid</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#222222] bg-[#121212] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Outreach Rate</span>
                <span className="font-mono text-[11px] text-emerald-400">{contactedPercentage}%</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#222222]">
                <div
                  className="h-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${contactedPercentage}%` }}
                />
              </div>
            </div>

            <div
              onClick={() => setIsKeyModalOpen(true)}
              className="cursor-pointer rounded-xl border border-[#222222] bg-[#121212] p-3 transition hover:border-[#333333]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Apify Free Pool</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <div className="mt-1 flex items-baseline gap-1.5 font-mono text-xs text-white">
                <span>{activeKeyInfo?.total ?? 1} Keys Pool</span>
                <span className="text-[10px] text-slate-500 truncate">
                  ({activeKeyInfo?.masked ? activeKeyInfo.masked.slice(0, 10) : "Active"})
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Workspace Body */}
        <div className="flex-1 overflow-auto p-6">
          {isScraping ? (
            /* SKELETON LOADING STATE */
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-2xl border border-[#262626] bg-[#111111] p-4">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Crawling Google Maps for &ldquo;{searchQuery}&rdquo;
                    </p>
                    <p className="text-xs text-slate-400">
                      Querying Apify actor and validating phone numbers.
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-[#262626] bg-[#161616] px-2.5 py-1 font-mono text-xs text-slate-400">
                  Target: {maxResults} leads
                </span>
              </div>

              <div className="rounded-2xl border border-[#262626] bg-[#111111] overflow-hidden divide-y divide-[#262626]">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4 p-4 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="h-4 w-6 rounded bg-[#222222]" />
                      <div className="h-6 w-36 rounded bg-[#222222]" />
                      <div className="space-y-1">
                        <div className="h-4 w-40 rounded bg-[#222222]" />
                        <div className="h-3 w-24 rounded bg-[#181818]" />
                      </div>
                    </div>
                    <div className="h-4 w-28 rounded bg-[#222222]" />
                    <div className="h-8 w-28 rounded-xl bg-[#222222]" />
                  </div>
                ))}
              </div>
            </div>
          ) : leads.length === 0 ? (
            /* EMPTY STATE */
            <div className="flex h-full min-h-[460px] flex-col items-center justify-center">
              <div className="w-full max-w-xl rounded-2xl border border-[#262626] bg-[#0f0f0f] p-8 text-center shadow-2xl">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-950/20">
                  <Globe className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-white">
                  Local Business Lead Generation &amp; WhatsApp Outreach
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Enter your target query on the left. The app crawls Google Maps, generates
                  formatted contact files for both Apple and Android, and prepares personalized WhatsApp chats.
                </p>

                {/* 3 Step Workflow */}
                <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
                  <div className="rounded-xl border border-[#262626] bg-[#161616] p-3.5">
                    <span className="font-mono text-xs font-semibold text-emerald-400">Step 1</span>
                    <p className="mt-1 text-xs font-medium text-white">Scrape Places</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Collects validated phone numbers and business names.
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#262626] bg-[#161616] p-3.5">
                    <span className="font-mono text-xs font-semibold text-emerald-400">Step 2</span>
                    <p className="mt-1 text-xs font-medium text-white">Sync Contacts</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Export .vcf for Apple or Android to save contacts safely.
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#262626] bg-[#161616] p-3.5">
                    <span className="font-mono text-xs font-semibold text-emerald-400">Step 3</span>
                    <p className="mt-1 text-xs font-medium text-white">1-Click WhatsApp</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Launches WhatsApp Desktop or Web prefilled with your pitch.
                    </p>
                  </div>
                </div>

                {/* Quick start queries */}
                <div className="mt-6 border-t border-[#222222] pt-4 text-left">
                  <span className="text-xs font-medium text-slate-400">Try these instant searches:</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {QUICK_SEARCH_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setSearchQuery(prompt)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#262626] bg-[#161616] px-3 py-1.5 text-xs text-slate-300 transition hover:border-[#383838] hover:text-white"
                      >
                        <span>{prompt}</span>
                        <ArrowRight className="h-3 w-3 text-emerald-400" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : filteredLeads.length === 0 ? (
            /* NO SEARCH MATCHES */
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-[#262626] bg-[#111111] text-center">
              <Filter className="h-8 w-8 text-slate-500 mb-2" />
              <p className="text-sm font-medium text-white">No leads match filter</p>
              <p className="mt-1 text-xs text-slate-400">
                Try clearing your search query or switching status filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setTableFilter("");
                  setStatusFilter("all");
                }}
                className="mt-3 rounded-lg border border-[#262626] bg-[#161616] px-3 py-1.5 text-xs font-medium text-white hover:border-[#383838]"
              >
                Reset filters
              </button>
            </div>
          ) : (
            /* DATA TABLE */
            <div className="rounded-2xl border border-[#262626] bg-[#111111] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-[#262626] bg-[#161616] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="w-12 px-4 py-3.5">#</th>
                      <th className="px-4 py-3.5">Contact Name (.vcf)</th>
                      <th className="px-4 py-3.5">Business &amp; Category</th>
                      <th className="px-4 py-3.5">Verified Phone</th>
                      <th className="hidden px-4 py-3.5 xl:table-cell">Personalized Pitch</th>
                      <th className="px-4 py-3.5 text-right">Outreach Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222222]">
                    {filteredLeads.map(({ lead, index }) => {
                      const assignedName = buildSequentialContactName(
                        lead.title,
                        effectiveLocation,
                        index + 1
                      );
                      const pitchPreview = renderPitchMessage(
                        pitchTemplate,
                        lead.title,
                        effectiveLocation,
                        lead
                      );
                      const isOpened = openedIds.has(lead.id);
                      const isCopied = copiedId === lead.id;

                      return (
                        <tr
                          key={lead.id}
                          className={`group transition-colors ${
                            isOpened ? "bg-emerald-950/15" : "hover:bg-[#161616]"
                          }`}
                        >
                          <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                            {String(index + 1).padStart(2, "0")}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-2.5 py-1 font-mono text-xs font-medium text-emerald-300">
                              {assignedName}
                            </span>
                          </td>

                          <td className="max-w-[260px] px-4 py-3.5">
                            <div className="flex items-center gap-1.5 font-medium text-white">
                              <span>{lead.title}</span>
                              {lead.googleMapsUrl && (
                                <a
                                  href={lead.googleMapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-500 hover:text-emerald-400"
                                  title="View on Google Maps"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                              {lead.category && <span>{lead.category}</span>}
                              {typeof lead.rating === "number" && (
                                <span className="inline-flex items-center gap-0.5 text-amber-400 font-mono">
                                  <Star className="h-3 w-3 fill-amber-400" />
                                  {lead.rating.toFixed(1)}
                                  {typeof lead.reviewsCount === "number" && (
                                    <span className="text-slate-500 font-sans">
                                      ({lead.reviewsCount})
                                    </span>
                                  )}
                                </span>
                              )}
                              {lead.address && (
                                <span className="truncate max-w-[180px]" title={lead.address}>
                                  {lead.address}
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5 font-mono text-xs text-slate-200">
                                <Phone className="h-3 w-3 text-slate-500" />
                                {lead.phone}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyPhone(lead)}
                                className="rounded p-1 text-slate-500 hover:bg-[#222222] hover:text-white"
                                title="Copy phone number"
                              >
                                {isCopied ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          <td className="hidden max-w-xs px-4 py-3.5 xl:table-cell">
                            <p className="line-clamp-2 text-xs leading-relaxed text-slate-400" title={pitchPreview}>
                              {pitchPreview}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Open Desktop App Protocol */}
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppDesktop(lead)}
                                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 px-3 text-xs font-semibold transition ${
                                  isOpened
                                    ? "border border-emerald-500/40 bg-[#161616] text-emerald-300 hover:border-emerald-500/60"
                                    : "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-[0.98]"
                                }`}
                                title="Launch native WhatsApp Desktop protocol"
                              >
                                {isOpened ? (
                                  <>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Done (Reopen)
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    WhatsApp App
                                  </>
                                )}
                              </button>

                              {/* WhatsApp Web Fallback */}
                              <button
                                type="button"
                                onClick={() => handleOpenWhatsAppWeb(lead)}
                                className="rounded-lg border border-[#2a2a2a] bg-[#161616] p-1.5 text-slate-400 hover:border-[#383838] hover:text-white"
                                title="Open WhatsApp Web in new browser tab"
                              >
                                <Globe className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* API KEY POOL MODAL */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-[#2a2a2a] bg-[#121212] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#222222] pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Apify Free Keys Pool</h3>
                  <p className="text-xs text-slate-400">Automatic multi-account failover &amp; rotation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsKeyModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-[#222222] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-xs text-emerald-300 leading-relaxed">
              <strong>How Free Keys Failover Works:</strong> Each free Apify key includes $5/month.
              When one free key runs out of credits or hits a rate limit, LeadFlow automatically
              switches to the next key in this pool without interrupting your scraping!
            </div>

            {/* Add New Key */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">
                Add another Apify Free API Key:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keyInputText}
                  onChange={(e) => setKeyInputText(e.target.value)}
                  placeholder="apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="flex-1 rounded-xl border border-[#262626] bg-[#161616] px-3.5 py-2 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500/50"
                />
                <button
                  type="button"
                  disabled={isValidatingKey || !keyInputText.trim()}
                  onClick={handleAddSingleKey}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-50"
                >
                  {isValidatingKey ? "Checking..." : "Verify & Add"}
                </button>
              </div>
              {keyValidationStatus && (
                <p className="text-xs text-emerald-400">{keyValidationStatus}</p>
              )}
            </div>

            {/* List of Custom Keys */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-300">
                Configured Key Pool ({customKeys.length} browser keys + env keys):
              </span>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-[#222222] bg-[#161616] p-2 divide-y divide-[#222222]">
                <div className="flex items-center justify-between p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="font-mono text-slate-300">Primary Key (.env.local)</span>
                  </div>
                  <span className="rounded bg-[#222222] px-2 py-0.5 text-[10px] text-slate-400">System Key</span>
                </div>

                {customKeys.map((key, idx) => (
                  <div key={key} className="flex items-center justify-between p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="font-mono text-slate-300">
                        Key #{idx + 2}: {key.slice(0, 14)}...{key.slice(-4)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomKey(idx)}
                      className="text-slate-500 hover:text-rose-400"
                      title="Remove key from pool"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                {customKeys.length === 0 && (
                  <div className="p-3 text-center text-xs text-slate-500">
                    No custom keys added yet. Add additional free Apify keys above for infinite auto-rotation!
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsKeyModalOpen(false)}
                className="rounded-xl bg-[#222222] px-4 py-2 text-xs font-medium text-white hover:bg-[#2c2c2c]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANDROID IMPORT GUIDE MODAL */}
      {showAndroidGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#121212] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#222222] pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-semibold text-white">How to Sync on Android</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAndroidGuide(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-[#222222] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="space-y-3 text-xs text-slate-300">
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">
                  1
                </span>
                <span>
                  Click <strong>Android / Google (.vcf)</strong> to download the contact file.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">
                  2
                </span>
                <span>
                  On your Android phone, tap the downloaded file in your notification bar or Google Files app.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">
                  3
                </span>
                <span>
                  Select <strong>Google Contacts</strong> or <strong>Device Contacts</strong>.
                  All sequential contacts are imported in seconds!
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] font-bold text-emerald-400">
                  4
                </span>
                <span>
                  Alternatively, open <strong>contacts.google.com</strong> on your computer, click <em>Import</em>, and select this file to auto-sync across all your Android devices!
                </span>
              </li>
            </ol>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAndroidGuide(false)}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-black hover:bg-emerald-400"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
