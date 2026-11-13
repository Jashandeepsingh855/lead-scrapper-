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
}

export interface ScrapeResponseBody {
  leads: ScrapedLead[];
  totalRaw: number;
  filteredOut: number;
  error?: string;
}
