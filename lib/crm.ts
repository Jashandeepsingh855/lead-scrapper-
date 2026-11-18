import type { CRMLead, CRMStatusFilter } from "./crm-types";
import type { ScrapedLead } from "./types";
import { extractLocationFromQuery } from "./vcf";

/** Convert a ScrapedLead from the scraper into a CRMLead row */
export function scrapedToCRM(
  lead: ScrapedLead,
  searchQuery: string
): CRMLead {
  const city = extractLocationFromQuery(searchQuery);
  const parts = searchQuery.split(" in ");
  const niche = parts.length >= 2 ? parts[0].trim() : "Business";

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
    notes: "",
    msg_sent_at: "",
    last_updated: new Date().toISOString(),
    _whatsappPhone: lead.whatsappPhone,
    _googleMapsUrl: lead.googleMapsUrl,
    _category: lead.category,
    _rating: lead.rating,
    _reviewsCount: lead.reviewsCount,
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

/** Sync a single lead update to the Google Sheet via /api/leads */
export async function syncLeadToSheet(lead: CRMLead): Promise<void> {
  try {
    const payload = {
      action: "update",
      lead: {
        id: lead.id,
        business_name: lead.business_name,
        city: lead.city,
        niche: lead.niche,
        contact: lead.contact,
        msg_sent: lead.msg_sent,
        replied: lead.replied,
        demo_sent: lead.demo_sent,
        details_received: lead.details_received,
        in_progress: lead.in_progress,
        delivered: lead.delivered,
        notes: lead.notes,
        msg_sent_at: lead.msg_sent_at,
      },
    };
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Silent background sync — do not throw
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
      notes: "",
      msg_sent_at: "",
    }));
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "append", leads: sheetLeads }),
    });
  } catch {
    // Silent
  }
}
