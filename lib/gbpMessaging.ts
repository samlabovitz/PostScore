// "Let customers text you from Google" — pure. Google's own help ("Chat
// with customers from your Business Profile", GOOGLE_LINKS.chatHelp)
// adds a text message or WhatsApp option under Edit profile → Contact →
// Chat. The Business Information API shows that option as two URL
// attributes on the location (checked on a real location, Nov 4, 2026):
// attributes/url_text_messaging ("Texting number") and
// attributes/url_whatsapp. Google's newer AI-powered messaging pilot has
// no API to read or turn on — so the step is never scored, shows ✓ only
// when one of these is set, and PostScore never turns anything on.

export const MESSAGING_ATTRIBUTE_IDS = ["attributes/url_text_messaging", "attributes/url_whatsapp"] as const;

export interface GbpUrlAttribute {
  name?: string;
  uriValues?: Array<{ uri?: string }>;
}

/** A texting or WhatsApp option is set on the owner's own location. */
export function messagingOnFromAttributes(attributes: GbpUrlAttribute[]): boolean {
  return attributes.some(
    (a) => !!a.name && (MESSAGING_ATTRIBUTE_IDS as readonly string[]).includes(a.name.startsWith("attributes/") ? a.name : `attributes/${a.name}`) && (a.uriValues ?? []).some((u) => typeof u.uri === "string" && u.uri.trim().length > 0)
  );
}
