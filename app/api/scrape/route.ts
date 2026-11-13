import { NextRequest, NextResponse } from "next/server";
import type {
  ScrapedLead,
  ScrapeRequestBody,
  ScrapeResponseBody,
} from "@/lib/types";

export const maxDuration = 300;

// Requested public actor path and the canonical Apify registry identifier
const REQUESTED_ACTOR_ID = "compass~google-maps-scraper";
const CANONICAL_ACTOR_ID = "compass~crawler-google-places";

interface ApifyGoogleMapsPlace {
  placeId?: string;
  cid?: string;
  title?: unknown;
  phone?: unknown;
  phoneUnformatted?: unknown;
  address?: unknown;
  categoryName?: unknown;
  totalScore?: unknown;
  reviewsCount?: unknown;
  website?: unknown;
  url?: unknown;
}

function normalizePhoneForWhatsApp(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  // Strip international dialing prefix "00" if present
  if (digits.startsWith("00") && digits.length > 9) {
    return digits.slice(2);
  }
  return digits;
}

function isValidPhone(digits: string): boolean {
  return digits.length >= 7 && digits.length <= 15;
}

export async function POST(request: NextRequest) {
  try {
    const apiToken = process.env.APIFY_API_TOKEN?.trim();
    if (!apiToken) {
      return NextResponse.json(
        {
          error:
            "Missing APIFY_API_TOKEN environment variable. Add it to .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    let body: Partial<ScrapeRequestBody>;
    try {
      body = (await request.json()) as Partial<ScrapeRequestBody>;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const searchQuery =
      typeof body.searchQuery === "string" ? body.searchQuery.trim() : "";
    if (!searchQuery) {
      return NextResponse.json(
        { error: "searchQuery is required." },
        { status: 400 }
      );
    }

    const parsedMax = Number(body.maxResults);
    const maxResults = Number.isFinite(parsedMax)
      ? Math.min(Math.max(Math.trunc(parsedMax), 1), 200)
      : 15;

    const requestPayload = {
      searchStringsArray: [searchQuery],
      maxCrawledPlacesPerSearch: maxResults,
      language: "en",
      skipClosedPlaces: false,
    };

    // 1. Primary endpoint requested: https://api.apify.com/v2/actors/compass~google-maps-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}
    const requestedEndpoint = `https://api.apify.com/v2/actors/${REQUESTED_ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(
      apiToken
    )}`;

    let apifyResponse = await fetch(requestedEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      cache: "no-store",
    });

    // 2. Fallback to the canonical actor identifier (compass~crawler-google-places) if Apify reports 404 record-not-found
    if (apifyResponse.status === 404) {
      const canonicalEndpoint = `https://api.apify.com/v2/actors/${CANONICAL_ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(
        apiToken
      )}`;
      apifyResponse = await fetch(canonicalEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
        cache: "no-store",
      });
    }

    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      let detail = errorText;
      try {
        const parsedError = JSON.parse(errorText) as {
          error?: { message?: string };
          message?: string;
        };
        detail =
          parsedError.error?.message || parsedError.message || errorText;
      } catch {
        // Keep raw text if not JSON
      }

      return NextResponse.json(
        {
          error: `Apify API request failed (${apifyResponse.status}): ${detail}`,
        },
        { status: apifyResponse.status >= 400 ? apifyResponse.status : 502 }
      );
    }

    const rawItems = (await apifyResponse.json()) as unknown;
    if (!Array.isArray(rawItems)) {
      return NextResponse.json(
        { error: "Unexpected response format from Apify dataset." },
        { status: 502 }
      );
    }

    const seenPhones = new Set<string>();
    const leads: ScrapedLead[] = [];

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i] as ApifyGoogleMapsPlace;
      const title =
        typeof item.title === "string" ? item.title.trim() : "";

      const rawUnformatted =
        typeof item.phoneUnformatted === "string"
          ? item.phoneUnformatted.trim()
          : "";
      const rawFormatted =
        typeof item.phone === "string" ? item.phone.trim() : "";

      const preferredPhone = rawFormatted || rawUnformatted;
      const whatsappSource = rawUnformatted || rawFormatted;
      const whatsappPhone = normalizePhoneForWhatsApp(whatsappSource);

      if (!title || !preferredPhone || !isValidPhone(whatsappPhone)) {
        continue;
      }

      if (seenPhones.has(whatsappPhone)) {
        continue;
      }
      seenPhones.add(whatsappPhone);

      const id =
        (typeof item.placeId === "string" && item.placeId) ||
        (typeof item.cid === "string" && item.cid) ||
        `${whatsappPhone}-${i}`;

      leads.push({
        id,
        title,
        phone: preferredPhone,
        whatsappPhone,
        address:
          typeof item.address === "string" ? item.address.trim() : undefined,
        category:
          typeof item.categoryName === "string"
            ? item.categoryName.trim()
            : undefined,
        rating:
          typeof item.totalScore === "number" ? item.totalScore : undefined,
        reviewsCount:
          typeof item.reviewsCount === "number"
            ? item.reviewsCount
            : undefined,
        website:
          typeof item.website === "string" ? item.website.trim() : undefined,
        googleMapsUrl:
          typeof item.url === "string" ? item.url.trim() : undefined,
      });
    }

    const payload: ScrapeResponseBody = {
      leads,
      totalRaw: rawItems.length,
      filteredOut: rawItems.length - leads.length,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unexpected server error while scraping leads.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
