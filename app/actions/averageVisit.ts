"use server";

// The owner's average visit value (businesses.average_visit_value,
// supabase/gbp-monthly-insights.sql): what one customer visit is usually
// worth to them, in dollars. Used only for the Google Profile tab's
// "What that could be worth" estimate. RLS-scoped: an owner can only
// change their own business. Empty clears it.

import { googlePagePaths } from "@/lib/routes";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseAverageVisit } from "@/lib/averageVisit";

export type SaveAverageVisitResult = { status: "ok"; value: number | null } | { status: "error"; error: "invalid" | "not_ready" | "failed" };

export async function saveAverageVisitValue(businessId: string, raw: string): Promise<SaveAverageVisitResult> {
  const parsed = parseAverageVisit(raw);
  if (parsed === "invalid") return { status: "error", error: "invalid" };
  const supabase = createClient();
  const { data, error } = await supabase.from("businesses").update({ average_visit_value: parsed }).eq("id", businessId).select("id");
  if (error) return { status: "error", error: error.code === "PGRST204" || error.code === "42703" ? "not_ready" : "failed" };
  if (!data || data.length === 0) return { status: "error", error: "failed" };
  for (const p of googlePagePaths(businessId)) revalidatePath(p);
  return { status: "ok", value: parsed };
}
