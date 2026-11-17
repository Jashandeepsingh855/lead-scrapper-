import type { ScrapedLead } from "./types";

/**
 * Replaces dynamic template variables such as {cafe_name}, {business_name}, {location}, {phone}
 * with the lead's real attributes.
 */
export function renderPitchMessage(
  template: string,
  businessTitle: string,
  location?: string,
  lead?: Partial<ScrapedLead>
): string {
  let rendered = template
    .replace(/\{cafe_name\}/gi, businessTitle.trim())
    .replace(/\{business_name\}/gi, businessTitle.trim());

  if (location) {
    rendered = rendered.replace(/\{location\}/gi, location.trim());
  }

  if (lead?.phone) {
    rendered = rendered.replace(/\{phone\}/gi, lead.phone.trim());
  }

  if (lead?.rating) {
    rendered = rendered.replace(/\{rating\}/gi, lead.rating.toFixed(1));
  }

  return rendered;
}

/**
 * Builds the native macOS WhatsApp Desktop protocol URL:
 * whatsapp://send?phone={phone}&text={encodedMessage}
 */
export function buildWhatsAppDesktopUrl(
  whatsappPhone: string,
  message: string
): string {
  const cleanPhone = whatsappPhone.replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(message);
  return `whatsapp://send?phone=${cleanPhone}&text=${encodedMessage}`;
}

/**
 * Builds universal WhatsApp Web link:
 * https://web.whatsapp.com/send?phone={phone}&text={encodedMessage}
 */
export function buildWhatsAppWebUrl(
  whatsappPhone: string,
  message: string
): string {
  const cleanPhone = whatsappPhone.replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(message);
  return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
}

/**
 * Builds universal wa.me deep link (works seamlessly on mobile Android & iOS browsers):
 * https://wa.me/{phone}?text={encodedMessage}
 */
export function buildWhatsAppUniversalUrl(
  whatsappPhone: string,
  message: string
): string {
  const cleanPhone = whatsappPhone.replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
}
