import { NextRequest, NextResponse } from "next/server";
import type {
  ScrapedLead,
  ScrapeRequestBody,
  ScrapeResponseBody,
} from "@/lib/types";
import { extractLocationFromQuery } from "@/lib/vcf";

export const maxDuration = 300;

// Canonical Apify Google Maps scraper actor
const REQUESTED_ACTOR_ID = "compass~crawler-google-places";
const CANONICAL_ACTOR_ID = "compass~crawler-google-places";

/**
 * Unlimited Apify Free-Tier Keys Pool:
 * You can paste as many free-tier Apify API keys here as you want (whether 5, 10, 50, or more)
 * without changing any loop limits.
 * The scraper dynamically iterates through the entire array starting at index 0.
 * Whenever a key runs out of credits (402), gets rate limited (429), or hits its monthly limit,
 * it silently catches the error, increments the index, and immediately retries with the next key.
 * Empty strings and placeholder entries are automatically ignored.
 */
const API_KEYS: string[] = [
  // Read comma-separated keys from process.env.APIFY_KEYS:
  ...(process.env.APIFY_KEYS
    ? process.env.APIFY_KEYS.split(/[\r\n,;]+/).map((k) => k.trim())
    : []),
  // Additional Free-Tier Keys (paste your keys below or set APIFY_KEYS in .env.local):
  "apify_api_PASTE_YOUR_FIRST_FREE_KEY_HERE",
  "apify_api_PASTE_YOUR_SECOND_FREE_KEY_HERE",
  "apify_api_PASTE_YOUR_THIRD_FREE_KEY_HERE",
  "apify_api_PASTE_YOUR_FOURTH_FREE_KEY_HERE",
  "apify_api_PASTE_YOUR_FIFTH_FREE_KEY_HERE",
  // Paste as many additional keys as you want:
  // "apify_api_...",
  // "apify_api_...",
];

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

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  if (token.length <= 16) {
    return `${token.slice(0, 4)}...${token.slice(-3)}`;
  }
  return `${token.slice(0, 12)}...${token.slice(-4)}`;
}

/**
 * Helper to automatically ignore empty strings and placeholder entries.
 */
function isValidApifyKey(token: unknown): boolean {
  if (typeof token !== "string") return false;
  const trimmed = token.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  if (
    upper.includes("PASTE_YOUR") ||
    upper.includes("YOUR_") ||
    upper.includes("PLACEHOLDER") ||
    upper.includes("EXAMPLE") ||
    trimmed.length < 15
  ) {
    return false;
  }
  return true;
}

/**
 * Extracts and deduplicates all available Apify API tokens from:
 * 1. The flexible API_KEYS array defined directly in code
 * 2. Comma or newline separated process.env.APIFY_KEYS
 * 3. Client-supplied custom tokens (from browser key pool settings)
 * 4. Additional fallback env variables (APIFY_API_TOKENS, APIFY_API_TOKEN)
 */
function resolveTokenPool(clientTokens?: string[]): string[] {
  const tokenSet = new Set<string>();

  // 1. Direct API_KEYS array in code
  for (const k of API_KEYS) {
    if (isValidApifyKey(k)) {
      tokenSet.add(k.trim());
    }
  }

  // 2. Comma or newline separated process.env.APIFY_KEYS
  const envKeys = process.env.APIFY_KEYS || "";
  for (const t of envKeys.split(/[\r\n,;]+/)) {
    if (isValidApifyKey(t)) {
      tokenSet.add(t.trim());
    }
  }

  // 3. Client tokens (if any passed from frontend key pool)
  if (Array.isArray(clientTokens)) {
    for (const t of clientTokens) {
      if (isValidApifyKey(t)) {
        tokenSet.add(t.trim());
      }
    }
  }

  // 4. Other env tokens fallback (APIFY_API_TOKENS, APIFY_API_TOKEN)
  const envMulti = process.env.APIFY_API_TOKENS || "";
  for (const t of envMulti.split(/[\r\n,;]+/)) {
    if (isValidApifyKey(t)) {
      tokenSet.add(t.trim());
    }
  }

  const single = process.env.APIFY_API_TOKEN?.trim();
  if (single && isValidApifyKey(single)) {
    tokenSet.add(single);
  }

  return Array.from(tokenSet);
}

/**
 * Checks whether an Apify error indicates quota exhaustion (402), rate limit (429),
 * or credit limit depletion that warrants an immediate automatic failover to the next key.
 */
function isFailoverError(status: number, errorText: string): boolean {
  if (status === 402 || status === 429 || status === 401) {
    return true;
  }
  const lower = errorText.toLowerCase();
  return (
    lower.includes("monthly-usage-limit-exceeded") ||
    lower.includes("usage-limit-exceeded") ||
    lower.includes("insufficient-funds") ||
    lower.includes("rate-limit-exceeded") ||
    lower.includes("user-or-token-not-found") ||
    lower.includes("credit") ||
    lower.includes("payment required")
  );
}

export async function POST(request: NextRequest) {
  try {
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
      ? Math.min(Math.max(Math.trunc(parsedMax), 1), 500)
      : 20;

    // Resolve pool of available tokens (unlimited array, ignoring empty/placeholders)
    const tokens = resolveTokenPool(body.customApiTokens);
    if (tokens.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid Apify API keys found. Please paste your keys into the API_KEYS array in app/api/scrape/route.ts, add APIFY_API_TOKEN in .env.local, or add a key via Key Pool.",
        },
        { status: 500 }
      );
    }

    const location = extractLocationFromQuery(searchQuery);
    const requestPayload: Record<string, unknown> = {
      searchStringsArray: [searchQuery],
      maxCrawledPlaces: maxResults,
      maxCrawledPlacesPerSearch: maxResults,
      language: "en",
      skipClosedPlaces: false,
      ...(location ? { locationQuery: location } : {}),
    };

    let successfulToken = "";
    let successfulIndex = -1;
    let keyRotated = false;
    let rawItems: unknown = null;
    const failureLogs: string[] = [];

    // Dynamic fallback loop: iterates through the entire tokens.length starting at index 0
    for (let i = 0; i < tokens.length; i++) {
      const currentToken = tokens[i];
      const masked = maskToken(currentToken);

      // Primary endpoint
      const requestedEndpoint = `https://api.apify.com/v2/actors/${REQUESTED_ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(
        currentToken
      )}`;

      let response: Response;
      try {
        response = await fetch(requestedEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestPayload),
          cache: "no-store",
        });

        // Fallback to canonical actor identifier if 404
        if (response.status === 404) {
          const canonicalEndpoint = `https://api.apify.com/v2/actors/${CANONICAL_ACTOR_ID}/run-sync-get-dataset-items?token=${encodeURIComponent(
            currentToken
          )}`;
          response = await fetch(canonicalEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestPayload),
            cache: "no-store",
          });
        }
      } catch (networkErr) {
        const netMsg =
          networkErr instanceof Error ? networkErr.message : "Network error";
        failureLogs.push(`Key #${i + 1} (${masked}): ${netMsg}`);
        // Increment and retry with next key
        continue;
      }

      if (response.ok) {
        try {
          rawItems = (await response.json()) as unknown;
          successfulToken = currentToken;
          successfulIndex = i;
          // Break immediately on success
          break;
        } catch {
          failureLogs.push(`Key #${i + 1} (${masked}): Failed to parse response JSON`);
          continue;
        }
      }

      // Read error text for rotation evaluation
      const errorText = await response.text();
      let parsedDetail = errorText;
      try {
        const parsed = JSON.parse(errorText) as {
          error?: { message?: string; type?: string };
          message?: string;
        };
        parsedDetail =
          parsed.error?.message ||
          parsed.error?.type ||
          parsed.message ||
          errorText;
      } catch {
        // Keep raw text
      }

      failureLogs.push(
        `Key #${i + 1} (${masked}): HTTP ${response.status} - ${parsedDetail}`
      );

      // Check if error is 402, 429, or credit limit error
      if (isFailoverError(response.status, errorText)) {
        keyRotated = true;
        // Silently catch the error, increment index, and immediately retry with next key
        if (i < tokens.length - 1) {
          continue;
        }
      }

      // If not a quota/rate limit error and not 404, or if all keys in the array have been tried:
      if (!isFailoverError(response.status, errorText)) {
        return NextResponse.json(
          {
            error: `Apify error on Key #${i + 1} (${masked}): ${parsedDetail}`,
          },
          { status: response.status >= 400 ? response.status : 502 }
        );
      }
    }

    if (!rawItems || !Array.isArray(rawItems)) {
      return NextResponse.json(
        {
          error: `All ${tokens.length} Apify free keys in pool exhausted their monthly credits or rate limits. Details:\n${failureLogs.join(
            "\n"
          )}`,
        },
        { status: 402 }
      );
    }

    // Process and filter valid leads
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
      activeKeyIndex: successfulIndex,
      activeKeyMasked: maskToken(successfulToken),
      totalKeysConfigured: tokens.length,
      keyRotated,
      rotationMessage: keyRotated
        ? `Exhausted previous key(s). Successfully switched to Key #${
            successfulIndex + 1
          } (${maskToken(successfulToken)})`
        : undefined,
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
