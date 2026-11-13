/**
 * Replaces dynamic template variables such as {cafe_name} with the lead's business title.
 */
export function renderPitchMessage(
  template: string,
  businessTitle: string
): string {
  return template.replace(/\{cafe_name\}/gi, businessTitle.trim());
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
