"use client";

import React, { useCallback, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Phone,
  Star,
} from "lucide-react";
import type { CRMLead, CRMCheckField } from "@/lib/crm-types";
import { countProgress, syncLeadToSheet } from "@/lib/crm";
import { buildWhatsAppDesktopUrl, buildWhatsAppWebUrl } from "@/lib/whatsapp";

const CHECK_STAGES: { key: CRMCheckField; label: string; short: string }[] = [
  { key: "msg_sent", label: "Msg Sent", short: "1" },
  { key: "replied", label: "Replied", short: "2" },
  { key: "demo_sent", label: "Demo Sent", short: "3" },
  { key: "details_received", label: "Details Recv.", short: "4" },
  { key: "in_progress", label: "In Progress", short: "5" },
  { key: "delivered", label: "Delivered", short: "6" },
];

interface CRMTableProps {
  leads: CRMLead[];
  pitchTemplate: string;
  onUpdateLead: (id: string, patch: Partial<CRMLead>) => void;
}

export default function CRMTable({
  leads,
  pitchTemplate,
  onUpdateLead,
}: CRMTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const showSaved = useCallback((id: string) => {
    setSavedId(id);
    setTimeout(() => setSavedId((prev) => (prev === id ? null : prev)), 1800);
  }, []);

  async function handleToggle(lead: CRMLead, field: CRMCheckField) {
    const now = new Date().toISOString();
    const patch: Partial<CRMLead> = {
      [field]: !lead[field],
      last_updated: now,
    };
    if (field === "msg_sent" && !lead.msg_sent) {
      patch.msg_sent_at = now;
    }
    onUpdateLead(lead.id, patch);
    showSaved(lead.id);
    await syncLeadToSheet({ ...lead, ...patch });
  }

  async function handleNotesBlur(lead: CRMLead, notes: string) {
    if (notes === lead.notes) return;
    const patch: Partial<CRMLead> = { notes, last_updated: new Date().toISOString() };
    onUpdateLead(lead.id, patch);
    showSaved(lead.id);
    await syncLeadToSheet({ ...lead, ...patch });
  }

  function handleWhatsApp(lead: CRMLead, mode: "desktop" | "web") {
    const msg = pitchTemplate
      .replace(/\{cafe_name\}/g, lead.business_name)
      .replace(/\{location\}/g, lead.city)
      .replace(/\{phone\}/g, lead.contact);
    const phone = lead._whatsappPhone || lead.contact;
    const url =
      mode === "desktop"
        ? buildWhatsAppDesktopUrl(phone, msg)
        : buildWhatsAppWebUrl(phone, msg);
    if (mode === "desktop") {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    // Auto-tick 1. Msg Sent
    if (!lead.msg_sent) {
      handleToggle(lead, "msg_sent");
    }
  }

  async function handleCopyPhone(lead: CRMLead) {
    try {
      await navigator.clipboard.writeText(lead.contact);
      setCopiedId(lead.id);
      setTimeout(() => setCopiedId((p) => (p === lead.id ? null : p)), 1500);
    } catch {}
  }

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[#486470] bg-[#2a4250] py-16 text-center">
        <CheckCircle2 className="mb-3 h-10 w-10 text-slate-600" />
        <p className="text-sm font-medium text-slate-400">No leads match this filter</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#486470] bg-[#2a4250] overflow-hidden">
      {/* ── DESKTOP TABLE ── */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-[#486470] bg-[#324d58] text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-4 py-3 w-8">#</th>
              <th className="px-3 py-3 min-w-[180px]">Business</th>
              {CHECK_STAGES.map((s) => (
                <th key={s.key} className="px-2 py-3 text-center w-20">
                  <span className="hidden xl:block">{s.label}</span>
                  <span className="xl:hidden">{s.short}</span>
                </th>
              ))}
              <th className="px-3 py-3 w-10 text-center">Progress</th>
              <th className="px-3 py-3 min-w-[160px]">Notes</th>
              <th className="px-3 py-3 w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#3a5460]">
            {leads.map((lead, idx) => {
              const progress = countProgress(lead);
              const isSaved = savedId === lead.id;
              return (
                <tr
                  key={lead.id}
                  className={`group transition-colors ${
                    lead.delivered
                      ? "bg-orange-950/10"
                      : "hover:bg-[#2e4855]"
                  }`}
                >
                  {/* # */}
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                    {String(idx + 1).padStart(2, "0")}
                  </td>

                  {/* Business Info */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-start gap-1">
                      <span className="font-medium text-white leading-snug">{lead.business_name}</span>
                      {lead._googleMapsUrl && (
                        <a href={lead._googleMapsUrl} target="_blank" rel="noopener noreferrer"
                          className="mt-0.5 shrink-0 text-slate-500 hover:text-orange-400"
                          title="Open Google Maps">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400">
                      <span className="font-medium text-orange-300/90">{lead.city}</span>
                      {lead.niche && <span>· {lead.niche}</span>}
                      {typeof lead._rating === "number" && (
                        <span className="inline-flex items-center gap-0.5 text-amber-400 font-mono">
                          <Star className="h-2.5 w-2.5 fill-amber-400" />{lead._rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-slate-400">
                      <Phone className="h-2.5 w-2.5 text-slate-500" />
                      {lead.contact}
                      <button onClick={() => handleCopyPhone(lead)}
                        className="p-0.5 text-slate-500 hover:text-white"
                        title="Copy phone">
                        {copiedId === lead.id
                          ? <Check className="h-3 w-3 text-orange-400" />
                          : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </td>

                  {/* 6 Checkboxes */}
                  {CHECK_STAGES.map((s) => (
                    <td key={s.key} className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggle(lead, s.key)}
                        className={`mx-auto flex h-5 w-5 items-center justify-center rounded border transition ${
                          lead[s.key]
                            ? "border-orange-400 bg-orange-400 text-black"
                            : "border-[#486470] bg-[#1e3540] text-transparent hover:border-orange-400/50"
                        }`}
                        title={s.label}
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    </td>
                  ))}

                  {/* Progress 0/6 */}
                  <td className="px-3 py-2.5 text-center">
                    <span className={`font-mono text-xs font-semibold ${
                      progress === 6 ? "text-orange-400" : progress > 0 ? "text-slate-300" : "text-slate-500"
                    }`}>
                      {progress}/6
                    </span>
                  </td>

                  {/* Inline Notes */}
                  <td className="px-3 py-2.5">
                    <div className="relative">
                      <input
                        type="text"
                        defaultValue={lead.notes}
                        placeholder="Add notes…"
                        onBlur={(e) => handleNotesBlur(lead, e.target.value)}
                        className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-slate-300 placeholder-slate-600 outline-none transition focus:border-[#486470] focus:bg-[#1e3540]"
                      />
                      {isSaved && (
                        <span className="absolute -top-5 right-0 text-[10px] text-orange-400 font-medium">
                          Saved ✓
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => handleWhatsApp(lead, "desktop")}
                        className="inline-flex items-center gap-1 rounded-lg bg-orange-400 px-2.5 py-1.5 text-[11px] font-semibold text-black transition hover:bg-orange-300 active:scale-[0.97]"
                        title="Open in WhatsApp Desktop (Auto-ticks Msg Sent)"
                      >
                        <ExternalLink className="h-3 w-3" /> WA
                      </button>
                      <button
                        onClick={() => handleWhatsApp(lead, "web")}
                        className="rounded-lg border border-[#486470] bg-[#324d58] p-1.5 text-slate-400 hover:text-white"
                        title="Open WhatsApp Web (Auto-ticks Msg Sent)"
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

      {/* ── MOBILE CARDS ── */}
      <div className="lg:hidden divide-y divide-[#3a5460]">
        {leads.map((lead, idx) => {
          const progress = countProgress(lead);
          const isSaved = savedId === lead.id;
          return (
            <div key={lead.id} className={`p-4 space-y-3 ${lead.delivered ? "bg-orange-950/10" : ""}`}>
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-slate-500">#{String(idx + 1).padStart(2, "0")}</span>
                    <span className={`font-mono text-xs font-bold ${
                      progress === 6 ? "text-orange-400" : "text-slate-400"
                    }`}>{progress}/6</span>
                    {isSaved && <span className="text-[10px] text-orange-400 font-medium">Saved ✓</span>}
                  </div>
                  <p className="mt-0.5 font-semibold text-white leading-snug truncate">{lead.business_name}</p>
                  <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-400 mt-0.5">
                    <span className="text-orange-300/90 font-medium">{lead.city}</span>
                    {lead.niche && <span>· {lead.niche}</span>}
                    {lead._googleMapsUrl && (
                      <a href={lead._googleMapsUrl} target="_blank" rel="noopener noreferrer"
                        className="text-slate-500 hover:text-orange-400">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-slate-400">
                    <Phone className="h-2.5 w-2.5 text-slate-500 shrink-0" />
                    <span className="break-all">{lead.contact}</span>
                    <button onClick={() => handleCopyPhone(lead)} className="p-0.5 text-slate-500 hover:text-white shrink-0">
                      {copiedId === lead.id ? <Check className="h-3 w-3 text-orange-400" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Checkboxes — 2 rows of 3 */}
              <div className="grid grid-cols-3 gap-2">
                {CHECK_STAGES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => handleToggle(lead, s.key)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
                      lead[s.key]
                        ? "border-orange-400/50 bg-orange-400/15 text-orange-300"
                        : "border-[#486470] bg-[#1e3540] text-slate-400 hover:border-orange-400/30"
                    }`}
                  >
                    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                      lead[s.key] ? "border-orange-400 bg-orange-400 text-black" : "border-[#486470]"
                    }`}>
                      {lead[s.key] && <Check className="h-2.5 w-2.5" />}
                    </span>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Notes */}
              <div className="relative">
                <input
                  type="text"
                  defaultValue={lead.notes}
                  placeholder="Notes…"
                  onBlur={(e) => handleNotesBlur(lead, e.target.value)}
                  className="w-full rounded-xl border border-[#486470] bg-[#1e3540] px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-orange-400/40"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 border-t border-[#3a5460] pt-3">
                <button
                  onClick={() => handleWhatsApp(lead, "desktop")}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-orange-400 py-2 text-xs font-semibold text-black transition hover:bg-orange-300 active:scale-[0.98]"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> WhatsApp
                </button>
                <button
                  onClick={() => handleWhatsApp(lead, "web")}
                  className="rounded-xl border border-[#486470] bg-[#324d58] p-2 text-slate-400 hover:text-white"
                  title="WhatsApp Web"
                >
                  <Globe className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
