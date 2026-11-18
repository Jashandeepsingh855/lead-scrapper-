import type { CRMLead, CRMStatusFilter } from "./crm-types";
import type { ScrapedLead } from "./types";
import { extractLocationFromQuery } from "./vcf";

/** Build comprehensive notes string with address, rating, website */
export function buildLeadNotes(lead: ScrapedLead): string {
  const parts: string[] = [];
  if (lead.address) parts.push(`Address: ${lead.address}`);
  if (typeof lead.rating === "number") {
    parts.push(`★ ${lead.rating}${lead.reviewsCount ? ` (${lead.reviewsCount} reviews)` : ""}`);
  }
  if (lead.website) parts.push(`Web: ${lead.website}`);
  if (lead.googleMapsUrl) parts.push(`Maps: ${lead.googleMapsUrl}`);
  return parts.join(" · ") || lead.address || "";
}

/** Convert a ScrapedLead from the scraper into a CRMLead with full details */
export function scrapedToCRM(
  lead: ScrapedLead,
  searchQuery: string
): CRMLead {
  const city = extractLocationFromQuery(searchQuery);
  const parts = searchQuery.split(" in ");
  const niche = lead.category || (parts.length >= 2 ? parts[0].trim() : "Local Business");
  const now = new Date().toISOString();

  return {
    id: lead.id,
    business_name: lead.title,
    city: city || searchQuery,
    niche,
    contact: lead.whatsappPhone || lead.phone,
    msg_sent: false,
    replied: false,
    demo_sent: false,
    details_received: false,
    in_progress: false,
    delivered: false,
    notes: buildLeadNotes(lead),
    msg_sent_at: "",
    last_updated: now,
    _whatsappPhone: lead.whatsappPhone,
    _googleMapsUrl: lead.googleMapsUrl,
    _category: lead.category,
    _rating: lead.rating,
    _reviewsCount: lead.reviewsCount,
  };
}

/** Convert a ScrapedLead into a full CRMLead ready for WhatsApp send and Google Sheet sync */
export function scrapedToCRMLead(
  lead: ScrapedLead,
  location: string,
  searchQuery?: string
): CRMLead {
  const now = new Date().toISOString();
  let niche = lead.category || "";
  if (!niche && searchQuery) {
    const parts = searchQuery.split(" in ");
    niche = parts.length >= 2 ? parts[0].trim() : searchQuery;
  }
  if (!niche) niche = "Local Business";

  return {
    id: lead.id,
    business_name: lead.title,
    city: location || "Local",
    niche,
    contact: lead.whatsappPhone || lead.phone,
    msg_sent: true,
    replied: false,
    demo_sent: false,
    details_received: false,
    in_progress: false,
    delivered: false,
    notes: buildLeadNotes(lead),
    msg_sent_at: now,
    last_updated: now,
  };
}

/** Count how many CRM checkbox stages are ticked */
export function countProgress(lead: CRMLead): number {
  return [
    lead.msg_sent,
    lead.replied,
    lead.demo_sent,
    lead.details_received,
    lead.in_progress,
    lead.delivered,
  ].filter(Boolean).length;
}

/** Days since a date string */
function daysSince(isoStr: string): number {
  if (!isoStr) return 999;
  const diff = Date.now() - new Date(isoStr).getTime();
  return diff / (1000 * 60 * 60 * 24);
}

/** Filter leads by CRM status tab */
export function filterByStatus(
  leads: CRMLead[],
  status: CRMStatusFilter
): CRMLead[] {
  switch (status) {
    case "all":
      return leads;
    case "ready":
      return leads.filter((l) => !l.msg_sent);
    case "follow_up":
      return leads.filter(
        (l) => l.msg_sent && !l.replied && daysSince(l.msg_sent_at) > 3
      );
    case "active_replies":
      return leads.filter((l) => l.replied && !l.delivered);
    case "in_production":
      return leads.filter(
        (l) => (l.details_received || l.in_progress) && !l.delivered
      );
    case "completed":
      return leads.filter((l) => l.delivered);
    default:
      return leads;
  }
}

/** Sort leads by last_updated descending */
export function sortByLastUpdated(leads: CRMLead[]): CRMLead[] {
  return [...leads].sort((a, b) => {
    const ta = a.last_updated ? new Date(a.last_updated).getTime() : 0;
    const tb = b.last_updated ? new Date(b.last_updated).getTime() : 0;
    return tb - ta;
  });
}

/** Export filtered leads to CSV and trigger download */
export function exportCSV(leads: CRMLead[], filename = "leadflow-export.csv") {
  const headers = [
    "id",
    "business_name",
    "city",
    "niche",
    "contact",
    "msg_sent",
    "replied",
    "demo_sent",
    "details_received",
    "in_progress",
    "delivered",
    "notes",
    "msg_sent_at",
    "last_updated",
  ];
  const rows = leads.map((l) =>
    headers
      .map((h) => {
        const val = (l as unknown as Record<string, unknown>)[h] ?? "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      })
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Sync a single lead update to the Google Sheet via /api/leads with keepalive */
export async function syncLeadToSheet(
  lead: CRMLead
): Promise<{ ok: boolean; action?: string; error?: string }> {
  try {
    const payload = {
      action: "sync",
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        city: lead.city,
        niche: lead.niche,
        contact: lead.contact,
        msg_sent: Boolean(lead.msg_sent),
        replied: Boolean(lead.replied),
        demo_sent: Boolean(lead.demo_sent),
        details_received: Boolean(lead.details_received),
        in_progress: Boolean(lead.in_progress),
        delivered: Boolean(lead.delivered),
        notes: lead.notes || "",
        msg_sent_at: lead.msg_sent_at || new Date().toISOString(),
        last_updated: lead.last_updated || new Date().toISOString(),
      },
    };
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    const data = await res.json();
    return { ok: res.ok && !data?.error, ...data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync failed" };
  }
}

/** Append an array of new leads to the Sheet (dedup handled server-side) */
export async function appendLeadsToSheet(leads: CRMLead[]): Promise<void> {
  try {
    const sheetLeads = leads.map((l) => ({
      id: l.id,
      business_name: l.business_name,
      city: l.city,
      niche: l.niche,
      contact: l.contact,
      msg_sent: false,
      replied: false,
      demo_sent: false,
      details_received: false,
      in_progress: false,
      delivered: false,
      notes: l.notes || "",
      msg_sent_at: "",
    }));
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "append", leads: sheetLeads }),
      keepalive: true,
    });
  } catch {
    // Silent
  }
}
