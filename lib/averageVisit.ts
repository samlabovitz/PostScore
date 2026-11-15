// The owner's average visit value, typed in Settings ("$45", "45.50", "1,200").
// Pure: the parsing and the rule (more than 0, under 100,000, cents at most).

/** null: cleared; "invalid": not a usable amount. */
export function parseAverageVisit(raw: string): number | null | "invalid" {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return "invalid";
  const value = Number(cleaned);
  return value > 0 && value < 100000 ? value : "invalid";
}
