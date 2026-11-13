"use client";

import React, { useMemo, useState } from "react";
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
  MapPin,
  MessageSquare,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import type { ScrapedLead, ScrapeResponseBody } from "@/lib/types";
import {
  buildSequentialContactName,
  downloadMacVcf,
  extractLocationFromQuery,
} from "@/lib/vcf";
import { buildWhatsAppDesktopUrl, renderPitchMessage } from "@/lib/whatsapp";

const DEFAULT_PITCH_TEMPLATE = `Hi {cafe_name} team! Came across your place on Google Maps and loved what you're doing. Quick question — are you looking to bring in more repeat local customers this month?`;

const QUICK_SEARCH_PROMPTS = [
  "cafes in hanumangarh",
  "restaurants in jaipur",
  "dentists in south delhi",
  "bakeries in sri ganganagar",
];

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

  const [tableFilter, setTableFilter] = useState("");
  const [openedIds, setOpenedIds] = useState<Set<string>>(() => new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [vcfDownloaded, setVcfDownloaded] = useState(false);

  // Compute location dynamically from the search query per design rules
  const autoDetectedLocation = useMemo(
    () => extractLocationFromQuery(searchQuery),
    [searchQuery]
  );

  const effectiveLocation =
    locationOverride.trim().length > 0
      ? locationOverride.trim()
      : autoDetectedLocation;

  const filteredLeads = useMemo(() => {
    const query = tableFilter.trim().toLowerCase();
    if (!query) {
      return leads.map((lead, index) => ({ lead, index }));
    }
    return leads
      .map((lead, index) => ({ lead, index }))
      .filter(({ lead, index }) => {
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
  }, [leads, tableFilter, effectiveLocation]);

  async function handleRunScraper(e: React.FormEvent) {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setErrorMessage("Please enter a Google Maps search query.");
      return;
    }

    setIsScraping(true);
    setErrorMessage(null);
    setVcfDownloaded(false);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          searchQuery: trimmedQuery,
          maxResults: Number.isFinite(maxResults) ? maxResults : 20,
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

  function handleDownloadVcf() {
    if (leads.length === 0) return;
    downloadMacVcf(leads, effectiveLocation);
    setVcfDownloaded(true);
    setTimeout(() => setVcfDownloaded(false), 3000);
  }

  function handleOpenWhatsApp(lead: ScrapedLead) {
    const personalizedMessage = renderPitchMessage(pitchTemplate, lead.title);
    const protocolUrl = buildWhatsAppDesktopUrl(
      lead.whatsappPhone,
      personalizedMessage
    );

    setOpenedIds((prev) => {
      const next = new Set(prev);
      next.add(lead.id);
      return next;
    });

    window.location.href = protocolUrl;
  }

  async function handleCopyPhone(lead: ScrapedLead) {
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopiedId(lead.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard permission issue
    }
  }

  function handleInsertVariable() {
    setPitchTemplate((prev) =>
      prev.includes("{cafe_name}") ? prev : `${prev.trim()} {cafe_name}`
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
      <aside className="flex w-full shrink-0 flex-col border-r border-[#272727] bg-[#181818] lg:h-full lg:w-[420px] xl:w-[440px]">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-[#272727] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#313131] bg-[#1F1F1F]">
              <Sparkles className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight text-white">
                LeadFlow Outreach
              </h1>
              <p className="text-xs text-slate-400">
                Google Maps lead generation and WhatsApp outreach
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-[#1F1F1F] px-2.5 py-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Verified
          </span>
        </div>

        {/* Form Controls */}
        <form
          onSubmit={handleRunScraper}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          {/* Search Query Input */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="searchQuery"
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
            >
              <MapPin className="h-3.5 w-3.5 text-emerald-400" />
              Google Maps search query
            </label>
            <input
              id="searchQuery"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. cafes in hanumangarh"
              className="w-full rounded-lg border border-[#272727] bg-[#1F1F1F] px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:border-[#424242] focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              required
            />
            {/* Quick prompts */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500">Suggestions:</span>
              {QUICK_SEARCH_PROMPTS.slice(0, 2).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSearchQuery(item)}
                  className="rounded-md border border-[#272727] bg-[#1F1F1F] px-2 py-0.5 text-[11px] text-slate-300 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#424242] hover:text-white active:scale-[0.98]"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Grid: Max Results & Auto Detected Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="maxResults"
                className="text-xs font-medium text-slate-300"
              >
                Max results
              </label>
              <input
                id="maxResults"
                type="number"
                min={1}
                max={200}
                value={maxResults}
                onChange={(e) =>
                  setMaxResults(Math.max(1, parseInt(e.target.value, 10) || 1))
                }
                className="w-full rounded-lg border border-[#272727] bg-[#1F1F1F] px-3.5 py-2 text-sm text-white outline-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:border-[#424242] focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="locationInput"
                  className="text-xs font-medium text-slate-300"
                >
                  Search location
                </label>
                {locationOverride && (
                  <button
                    type="button"
                    onClick={() => setLocationOverride("")}
                    className="flex items-center gap-1 text-[10px] text-emerald-400 transition-colors hover:text-emerald-300"
                    title="Reset to auto detected query location"
                  >
                    <RotateCcw className="h-2.5 w-2.5" />
                    Reset
                  </button>
                )}
              </div>
              <input
                id="locationInput"
                type="text"
                value={effectiveLocation}
                onChange={(e) => setLocationOverride(e.target.value)}
                placeholder="Hanumangarh"
                className="w-full rounded-lg border border-[#272727] bg-[#1F1F1F] px-3.5 py-2 text-sm text-white placeholder-slate-500 outline-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:border-[#424242] focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />
            </div>
          </div>

          {/* Dynamic Contact Name Preview Banner */}
          <div className="rounded-xl border border-[#272727] bg-[#1F1F1F] p-3 transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Compass className="h-3.5 w-3.5" />
                Contact naming formula
              </span>
              <span className="rounded bg-[#272727] px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                vCard 3.0
              </span>
            </div>
            <p className="mt-1.5 font-mono text-xs text-slate-200">
              [Original Business Title] {effectiveLocation || "City"} [Serial Number]
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Example: &ldquo;Brew House {effectiveLocation || "City"} 1&rdquo;
            </p>
          </div>

          {/* Pitch Message Template */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="pitchTemplate"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-300"
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                Pitch message template
              </label>
              <button
                type="button"
                onClick={handleInsertVariable}
                className="rounded-md border border-[#272727] bg-[#1F1F1F] px-2 py-0.5 font-mono text-[11px] text-emerald-400 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#424242] active:scale-[0.98]"
                title="Insert dynamic cafe name token"
              >
                + {"{cafe_name}"}
              </button>
            </div>
            <textarea
              id="pitchTemplate"
              rows={4}
              value={pitchTemplate}
              onChange={(e) => setPitchTemplate(e.target.value)}
              placeholder="Write your outreach message using {cafe_name}..."
              className="w-full resize-none rounded-lg border border-[#272727] bg-[#1F1F1F] px-3.5 py-2 text-sm leading-relaxed text-white placeholder-slate-500 outline-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:border-[#424242] focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            />
            <p className="text-[11px] text-slate-400">
              The dynamic variable{" "}
              <code className="rounded bg-[#272727] px-1 py-0.5 font-mono text-emerald-400">
                {"{cafe_name}"}
              </code>{" "}
              fills each row with its verified business title.
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-[#1F1F1F] p-3 text-xs text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Action Trigger Buttons */}
          <div className="mt-1 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isScraping}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2 px-4 text-sm font-semibold text-black transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isScraping ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Scraping Google Maps...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Run Apify scraper
                </>
              )}
            </button>

            {leads.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadVcf}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-[#1F1F1F] py-2 px-4 text-sm font-medium text-emerald-300 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-emerald-500/50 hover:bg-[#272727] active:scale-[0.98]"
              >
                {vcfDownloaded ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Downloaded Mac contacts (.vcf)
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 text-emerald-400" />
                    Download Mac contacts (.vcf)
                  </>
                )}
              </button>
            )}
          </div>

          {/* Outreach workflow info card */}
          <div className="mt-auto rounded-2xl border border-[#272727] bg-[#1F1F1F] p-4 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-medium text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Apple Contacts and safe outreach workflow</span>
            </div>
            <ol className="mt-2.5 space-y-1.5 text-xs text-slate-400">
              <li className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 font-semibold">1.</span>
                <span>Scrape business numbers via Apify directly from Google Maps.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 font-semibold">2.</span>
                <span>
                  Export <span className="text-white">.vcf (vCard 3.0)</span> with unique named contacts to safeguard WhatsApp trust score.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-mono text-emerald-400 font-semibold">3.</span>
                <span>
                  Click <span className="text-white">Open app and prefill</span> to launch native WhatsApp Desktop.
                </span>
              </li>
            </ol>
          </div>
        </form>
      </aside>

      {/* Right Lead Management Table Workspace */}
      <main className="flex min-w-0 flex-1 flex-col bg-[#000000] lg:h-full lg:overflow-hidden">
        {/* Top Header & Metrics Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#272727] bg-[#181818] px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold tracking-tight text-white">
              Lead management queue
            </h2>

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#272727] bg-[#1F1F1F] px-2.5 py-1 text-xs font-medium text-slate-200">
                <Users className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-mono font-semibold">{leads.length}</span> verified leads
              </span>

              {scrapeStats && scrapeStats.filteredOut > 0 && (
                <span className="inline-flex items-center rounded-lg border border-[#272727] bg-[#1F1F1F] px-2.5 py-1 text-xs text-slate-400">
                  {scrapeStats.filteredOut} filtered without phone or title
                </span>
              )}

              {leads.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-[#1F1F1F] px-2.5 py-1 text-xs font-medium text-emerald-300">
                  <Check className="h-3.5 w-3.5" />
                  <span className="font-mono font-semibold">{openedIds.size}</span> of {leads.length} contacted
                </span>
              )}
            </div>
          </div>

          {leads.length > 0 && (
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder="Filter leads..."
                  className="w-48 rounded-lg border border-[#272727] bg-[#1F1F1F] py-1.5 pr-3 pl-8 text-xs text-white placeholder-slate-500 outline-none transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus:border-[#424242] focus-visible:ring-2 focus-visible:ring-emerald-500/30 sm:w-60"
                />
              </div>
              <button
                type="button"
                onClick={handleClearLeads}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#272727] bg-[#1F1F1F] px-3 py-1.5 text-xs font-medium text-slate-400 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#424242] hover:text-white active:scale-[0.98]"
                title="Clear current leads"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>
          )}
        </header>

        {/* Table Content Area */}
        <div className="flex-1 overflow-auto p-6">
          {/* SKELETON LOADING STATE (B9 requirement: layout shaped skeletons, not plain circular spinners) */}
          {isScraping ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-2xl border border-[#272727] bg-[#181818] p-4">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Crawling Google Maps via Apify
                    </p>
                    <p className="text-xs text-slate-400">
                      Searching for &ldquo;{searchQuery}&rdquo; and validating phone numbers.
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-[#272727] bg-[#1F1F1F] px-2.5 py-1 font-mono text-xs text-slate-400">
                  Target: {maxResults} leads
                </span>
              </div>

              {/* Skeleton Table Rows */}
              <div className="rounded-2xl border border-[#272727] bg-[#181818] overflow-hidden">
                <div className="border-b border-[#272727] px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Crawling real places...
                </div>
                <div className="divide-y divide-[#272727]">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-4 px-5 py-4 animate-pulse"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-4 w-6 rounded bg-[#272727]" />
                        <div className="h-6 w-36 rounded-md bg-[#272727]" />
                        <div className="flex flex-col gap-1.5">
                          <div className="h-4 w-44 rounded bg-[#272727]" />
                          <div className="h-3 w-28 rounded bg-[#1F1F1F]" />
                        </div>
                      </div>
                      <div className="hidden h-4 w-32 rounded bg-[#272727] sm:block" />
                      <div className="h-8 w-28 rounded-lg bg-[#272727]" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : leads.length === 0 ? (
            /* EMPTY STATE (B9: composed getting-started view, never a blank panel) */
            <div className="flex h-full min-h-[440px] flex-col items-center justify-center">
              <div className="w-full max-w-xl rounded-2xl border border-[#272727] bg-[#181818] p-8 text-center">
                {/* Hero Heading with left to right gradient per B5 */}
                <h3 className="bg-gradient-to-r from-white to-[#9B9B9B] bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                  Turn Google Maps listings into verified WhatsApp conversations
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Enter your target search query to scrape local business numbers, export
                  vCard 3.0 files for Apple Contacts, and launch personalized WhatsApp chats.
                </p>

                {/* 3 Step Workflow Cards */}
                <div className="mt-6 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
                  <div className="rounded-xl border border-[#272727] bg-[#1F1F1F] p-3.5">
                    <span className="font-mono text-xs font-semibold text-emerald-400">
                      Step 1
                    </span>
                    <p className="mt-1 font-medium text-white text-xs">
                      Scrape businesses
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Filters valid phones and titles from Google Maps.
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#272727] bg-[#1F1F1F] p-3.5">
                    <span className="font-mono text-xs font-semibold text-emerald-400">
                      Step 2
                    </span>
                    <p className="mt-1 font-medium text-white text-xs">
                      Sync to Contacts
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Exports vCard 3.0 with dynamic serial contact names.
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#272727] bg-[#1F1F1F] p-3.5">
                    <span className="font-mono text-xs font-semibold text-emerald-400">
                      Step 3
                    </span>
                    <p className="mt-1 font-medium text-white text-xs">
                      Prefill WhatsApp
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      One click trigger to launch desktop chat prefilled.
                    </p>
                  </div>
                </div>

                {/* Quick Start Launcher */}
                <div className="mt-6 border-t border-[#272727] pt-4 text-left">
                  <span className="text-xs font-medium text-slate-400">
                    Quick start queries:
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {QUICK_SEARCH_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          setSearchQuery(prompt);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#272727] bg-[#1F1F1F] px-3 py-1.5 text-xs text-slate-300 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[#424242] hover:text-white active:scale-[0.98]"
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
            /* NO SEARCH RESULTS STATE */
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-[#272727] bg-[#181818] text-center">
              <Filter className="h-8 w-8 text-slate-500 mb-2" />
              <p className="text-sm font-medium text-white">No matching leads</p>
              <p className="mt-1 text-xs text-slate-400">
                No entries match &ldquo;{tableFilter}&rdquo;. Try another term or clear filter.
              </p>
              <button
                type="button"
                onClick={() => setTableFilter("")}
                className="mt-3 rounded-lg border border-[#272727] bg-[#1F1F1F] px-3 py-1.5 text-xs font-medium text-slate-300 transition-all duration-300 hover:border-[#424242] hover:text-white"
              >
                Clear filter
              </button>
            </div>
          ) : (
            /* DATA TABLE (Complete 360 borders, nested radius formula, clear typography) */
            <div className="rounded-2xl border border-[#272727] bg-[#181818] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="border-b border-[#272727] bg-[#1F1F1F] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="w-12 px-4 py-3.5">#</th>
                      <th className="px-4 py-3.5">Assigned contact</th>
                      <th className="px-4 py-3.5">Business title</th>
                      <th className="px-4 py-3.5">Phone number</th>
                      <th className="hidden px-4 py-3.5 xl:table-cell">
                        Personalized pitch preview
                      </th>
                      <th className="px-4 py-3.5 text-right">Outreach action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#272727]">
                    {filteredLeads.map(({ lead, index }) => {
                      const assignedName = buildSequentialContactName(
                        lead.title,
                        effectiveLocation,
                        index + 1
                      );
                      const pitchPreview = renderPitchMessage(
                        pitchTemplate,
                        lead.title
                      );
                      const isOpened = openedIds.has(lead.id);
                      const isCopied = copiedId === lead.id;

                      return (
                        <tr
                          key={lead.id}
                          className={`group transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#1F1F1F] ${
                            isOpened ? "bg-emerald-950/20" : ""
                          }`}
                        >
                          <td className="px-4 py-3.5 font-mono text-xs text-slate-500">
                            {String(index + 1).padStart(2, "0")}
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-[#1F1F1F] px-2.5 py-1 text-xs font-medium text-emerald-300 font-mono">
                              {assignedName}
                            </span>
                          </td>

                          <td className="max-w-[260px] px-4 py-3.5">
                            <div className="font-medium text-white">
                              {lead.title}
                            </div>
                            {(lead.category || lead.rating || lead.address) && (
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                                {lead.category && <span>{lead.category}</span>}
                                {typeof lead.rating === "number" && (
                                  <span className="inline-flex items-center gap-0.5 text-amber-400">
                                    <Star className="h-3 w-3 fill-amber-400" />
                                    {lead.rating.toFixed(1)}
                                    {typeof lead.reviewsCount === "number" && (
                                      <span className="text-slate-500 font-mono">
                                        ({lead.reviewsCount})
                                      </span>
                                    )}
                                  </span>
                                )}
                                {lead.address && (
                                  <span className="truncate max-w-[200px]">
                                    {lead.address}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-200">
                                <Phone className="h-3.5 w-3.5 text-slate-500" />
                                {lead.phone}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyPhone(lead)}
                                className="rounded p-1 text-slate-500 transition-colors duration-200 hover:bg-[#272727] hover:text-white"
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
                            <p
                              className="line-clamp-2 text-xs leading-relaxed text-slate-400"
                              title={pitchPreview}
                            >
                              {pitchPreview}
                            </p>
                          </td>

                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleOpenWhatsApp(lead)}
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg py-2 px-3 text-xs font-semibold transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] ${
                                isOpened
                                  ? "border border-emerald-500/40 bg-[#1F1F1F] text-emerald-300 hover:border-emerald-500/60"
                                  : "bg-emerald-500 text-black hover:bg-emerald-400"
                              }`}
                            >
                              {isOpened ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Opened (Reopen)
                                </>
                              ) : (
                                <>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Open app and prefill
                                </>
                              )}
                            </button>
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
    </div>
  );
}
