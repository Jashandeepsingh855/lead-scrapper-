import type { ScrapedLead, VcfPlatform } from "./types";

/**
 * Escapes special characters per RFC 2426 (vCard 3.0) so Contacts
 * parses commas, semicolons, backslashes, and newlines reliably.
 */
function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * Formats a phone string for vCard TEL field, preserving leading '+' if present.
 */
function formatVCardPhone(lead: ScrapedLead): string {
  const raw = lead.phone.trim();
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return lead.whatsappPhone;
  }
  return hasPlus ? `+${digits}` : raw;
}

/**
 * Capitalizes words in a string into Title Case while preserving uppercase acronyms (e.g. UK, USA, NY, CP).
 */
export function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Automatically extracts a location name from a search query.
 * Examples:
 * - "cafes in hanumangarh" -> "Hanumangarh"
 * - "best cafes in Sri Ganganagar" -> "Sri Ganganagar"
 * - "dentists near South Delhi" -> "South Delhi"
 * - "jaipur cafes" -> "Jaipur"
 * - "hanumangarh" -> "Hanumangarh"
 */
export function extractLocationFromQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "";

  // 1. Look for preposition phrases like "in <location>", "near <location>", "around <location>", "at <location>"
  const prepMatch = trimmed.match(/\b(?:in|near|around|at)\s+([^,]+)/i);
  if (prepMatch && prepMatch[1]) {
    const rawLoc = prepMatch[1].replace(/[.,;]+$/, "").trim();
    if (rawLoc) return toTitleCase(rawLoc);
  }

  // 2. Remove common query prefixes/suffixes (cafes, restaurants, coffee shops, hotels, etc.)
  const stripped = trimmed
    .replace(
      /\b(?:cafes?|coffee\s*shops?|restaurants?|hotels?|gyms?|dentists?|doctors?|clinics?|hospitals?|bars?|bakeries|bakery|shops?|stores?|salons?|spas?|services?|businesses?|leads?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  if (stripped) {
    return toTitleCase(stripped);
  }

  return toTitleCase(trimmed);
}

/**
 * Automatically constructs the sequential contact name using:
 * [Original Business Title] + [Search Query Location] + [Serial Number]
 *
 * Example:
 * Title: "Brew House", Location: "Hanumangarh", Serial: 1
 * Output: "Brew House Hanumangarh 1"
 */
export function buildSequentialContactName(
  businessTitle: string,
  location: string,
  serialNumber: number
): string {
  const cleanTitle = (businessTitle || "Business").trim();
  const cleanLocation = location.trim();
  const serial = Math.max(1, serialNumber);

  if (cleanLocation) {
    return `${cleanTitle} ${cleanLocation} ${serial}`;
  }
  return `${cleanTitle} ${serial}`;
}

/**
 * Generates an Apple / macOS / iOS compatible vCard 3.0 (.vcf) string.
 * Formatted with GivenName slot for macOS Contacts so names are preserved in sequence
 * without surname flipping.
 */
export function generateMacVcf(
  leads: ScrapedLead[],
  location: string
): string {
  const cleanLocation = location.trim();

  const cards = leads.map((lead, index) => {
    const contactName = buildSequentialContactName(
      lead.title,
      cleanLocation,
      index + 1
    );
    const escapedName = escapeVCardValue(contactName);
    const escapedOrg = escapeVCardValue(lead.title);
    const vcardPhone = formatVCardPhone(lead);

    const noteParts = [`Business: ${lead.title}`];
    if (cleanLocation) noteParts.push(`Location: ${cleanLocation}`);
    if (lead.category) noteParts.push(`Category: ${lead.category}`);
    if (lead.address) noteParts.push(`Address: ${lead.address}`);
    if (lead.website) noteParts.push(`Website: ${lead.website}`);
    const escapedNote = escapeVCardValue(noteParts.join(" | "));

    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "PRODID:-//LeadFlow//AppleContacts//EN",
      `N:;${escapedName};;;`,
      `FN:${escapedName}`,
      `ORG:${escapedOrg}`,
      `TEL;TYPE=CELL,VOICE:${vcardPhone}`,
      `NOTE:${escapedNote}`,
      "END:VCARD",
    ];

    return lines.join("\r\n");
  });

  return cards.join("\r\n") + "\r\n";
}

/**
 * Generates an Android / Google Contacts / Samsung Contacts compatible vCard (.vcf) string.
 * Uses UTF-8 charset declarations, structured N field in family slot, and Android-specific
 * custom metadata so the Android Contacts app and Google Contacts (contacts.google.com)
 * import and index contacts instantly with zero name-inversion.
 */
export function generateAndroidVcf(
  leads: ScrapedLead[],
  location: string
): string {
  const cleanLocation = location.trim();

  const cards = leads.map((lead, index) => {
    const contactName = buildSequentialContactName(
      lead.title,
      cleanLocation,
      index + 1
    );
    const escapedName = escapeVCardValue(contactName);
    const escapedOrg = escapeVCardValue(lead.title);
    const vcardPhone = formatVCardPhone(lead);

    const noteParts = [`Business: ${lead.title}`];
    if (cleanLocation) noteParts.push(`Location: ${cleanLocation}`);
    if (lead.category) noteParts.push(`Category: ${lead.category}`);
    if (lead.address) noteParts.push(`Address: ${lead.address}`);
    if (lead.website) noteParts.push(`Website: ${lead.website}`);
    const escapedNote = escapeVCardValue(noteParts.join(" | "));

    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "PRODID:-//LeadFlow//AndroidGoogleContacts//EN",
      `FN;CHARSET=UTF-8:${escapedName}`,
      `N;CHARSET=UTF-8:${escapedName};;;;`,
      `ORG;CHARSET=UTF-8:${escapedOrg}`,
      `TEL;TYPE=CELL;TYPE=PREF:${vcardPhone}`,
      `X-ANDROID-CUSTOM:vnd.android.cursor.item/organization;${escapedOrg};;;;;;;;;;;;;`,
      `NOTE;CHARSET=UTF-8:${escapedNote}`,
      "END:VCARD",
    ];

    return lines.join("\r\n");
  });

  return cards.join("\r\n") + "\r\n";
}

/**
 * Unified VCF download dispatcher for Apple (Mac/iOS) or Android (Google Contacts).
 */
export function downloadVcf(
  leads: ScrapedLead[],
  location: string,
  platform: VcfPlatform = "apple"
): void {
  if (leads.length === 0) return;

  const isAndroid = platform === "android";
  const vcfContent = isAndroid
    ? generateAndroidVcf(leads, location)
    : generateMacVcf(leads, location);

  // text/x-vcard is widely supported by Android download managers to prompt "Open with Contacts"
  const mimeType = isAndroid
    ? "text/x-vcard;charset=utf-8"
    : "text/vcard;charset=utf-8";

  const blob = new Blob([vcfContent], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const slug =
    location
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "leads";

  const filename = isAndroid
    ? `${slug}-android-google-contacts.vcf`
    : `${slug}-apple-mac-contacts.vcf`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convenience export for Apple / macOS / iOS
 */
export function downloadMacVcf(leads: ScrapedLead[], location: string): void {
  downloadVcf(leads, location, "apple");
}

/**
 * Convenience export for Android / Google Contacts
 */
export function downloadAndroidVcf(leads: ScrapedLead[], location: string): void {
  downloadVcf(leads, location, "android");
}
