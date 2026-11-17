export interface ScrapedLead {
  id: string;
  title: string;
  phone: string;
  whatsappPhone: string;
  address?: string;
  category?: string;
  rating?: number;
  reviewsCount?: number;
  website?: string;
  googleMapsUrl?: string;
}

export interface ScrapeRequestBody {
  searchQuery: string;
  maxResults: number;
  customApiTokens?: string[];
}

export interface KeyPoolInfo {
  index: number;
  maskedToken: string;
  isEnv: boolean;
  status?: "valid" | "invalid" | "exhausted" | "rate_limited" | "unknown";
  username?: string;
  monthlyUsageUsd?: number;
  maxMonthlyUsageUsd?: number;
}

export interface ScrapeResponseBody {
  leads: ScrapedLead[];
  totalRaw: number;
  filteredOut: number;
  error?: string;
  activeKeyIndex?: number;
  activeKeyMasked?: string;
  totalKeysConfigured?: number;
  keyRotated?: boolean;
  rotationMessage?: string;
}

export type VcfPlatform = "apple" | "android";
