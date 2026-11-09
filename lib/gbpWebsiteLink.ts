// "Update website on Google" (Premium, Google connected): replace the
// Google listing's website link with the business's real site. Pure — the
// Google side is lib/gbpWebsiteLink.server.ts.

import { latestUndoable, type GbpChangeRow } from "@/lib/gbpAttributes";

/** The gbp_changes `kind` for a website link change (field "websiteUri"). */
export const WEBSITE_LINK_KIND = "website_uri";
export const WEBSITE_LINK_FIELD = "websiteUri";

/**
 * The owner's typed address as a website URL, or null when it can't be
 * one: http(s) only (https:// is added when there's no scheme), a real
 * public host name — never an IP address, localhost or an internal name —
 * and no user name or password in it.
 */
export function websiteLinkInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2000 || /\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) return null;
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(host)) return null;
  return url.toString();
}

/** Same site address, ignoring case, "www.", a trailing slash and the scheme
 * (Google may store "https://x.com/" for "http://www.x.com"). */
export function sameWebsiteLink(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined) => {
    if (!v || !v.trim()) return "";
    try {
      const u = new URL(/^https?:\/\//i.test(v.trim()) ? v.trim() : `https://${v.trim()}`);
      return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
    } catch {
      return v.trim().toLowerCase();
    }
  };
  return norm(a) === norm(b);
}

export interface WebsiteLinkUndo {
  batchId: string;
  approvedAt: string;
  undoUntil: string;
  status: "sent" | "pending_review";
  /** The link before (null = there was none) and the one we set. */
  before: string | null;
  after: string | null;
}

/** The latest website link change the owner may still undo — the same
 * rules as customer details (latestUndoable: 7 days, not failed, not an
 * undo, not undone, made on the location connected now), keeping the URLs. */
export function latestWebsiteLinkUndo(rows: GbpChangeRow[], now: number, locationName: string): WebsiteLinkUndo | null {
  const undoable = latestUndoable(rows, now, locationName);
  if (!undoable) return null;
  const row = rows.find((r) => r.batch_id === undoable.batchId && r.field === WEBSITE_LINK_FIELD);
  if (!row) return null;
  return { batchId: undoable.batchId, approvedAt: undoable.approvedAt, undoUntil: undoable.undoUntil, status: undoable.status, before: row.before_value, after: row.after_value };
}
