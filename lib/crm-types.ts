// CRM lead row stored in Google Sheets
export interface CRMLead {
  id: string;
  business_name: string;
  city: string;
  niche: string;
  contact: string; // phone number for WhatsApp
  msg_sent: boolean;
  replied: boolean;
  demo_sent: boolean;
  details_received: boolean;
  in_progress: boolean;
  delivered: boolean;
  notes: string;
  msg_sent_at: string; // ISO string
  last_updated: string; // ISO string
  // local-only fields (not saved to sheet)
  _whatsappPhone?: string;
  _pitchMessage?: string;
  _googleMapsUrl?: string;
  _category?: string;
  _rating?: number;
  _reviewsCount?: number;
}

export type CRMCheckField =
  | "msg_sent"
  | "replied"
  | "demo_sent"
  | "details_received"
  | "in_progress"
  | "delivered";

export type CRMStatusFilter =
  | "all"
  | "ready"
  | "follow_up"
  | "active_replies"
  | "in_production"
  | "completed";
