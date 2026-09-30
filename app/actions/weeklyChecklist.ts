"use server";

import { createClient } from "@/lib/supabase/server";
import {
  buildWeeklyChecklistState,
  weekStartFor,
  WEEKLY_CHECKLIST_TIMEZONE,
  type WeeklyChecklistItemId,
  type WeeklyCheckRow,
} from "@/lib/weeklyChecklist";

/** Client-safe shape of WeeklyChecklistState — a plain array instead of
 * a Set, so it crosses the server action boundary with no serialization
 * ambiguity. */
export interface WeeklyChecklistStateDTO {
  weekStart: string;
  checkedItemIds: WeeklyChecklistItemId[];
  streakWeeks: number;
}

function toDTO(rows: WeeklyCheckRow[]): WeeklyChecklistStateDTO {
  const state = buildWeeklyChecklistState(rows);
  return {
    weekStart: state.weekStart,
    checkedItemIds: Array.from(state.checkedItemIds),
    streakWeeks: state.streakWeeks,
  };
}

export type GetWeeklyChecklistStateResult =
  | { status: "ok"; state: WeeklyChecklistStateDTO }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/** Every real weekly_checks row for this business (RLS-scoped — a
 * caller can only ever see their own business's rows), reduced to the
 * current display state. Reads every row ever logged, not just the
 * current week, since the streak needs real history — a small, cheap
 * table (5 rows per business per week at most). */
export async function getWeeklyChecklistState(businessId: string): Promise<GetWeeklyChecklistStateResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("weekly_checks")
    .select("week_start, item_id")
    .eq("business_id", businessId)
    .order("week_start", { ascending: false });

  if (error) {
    return { status: "error", message: error.message };
  }

  return { status: "ok", state: toDTO((data ?? []) as WeeklyCheckRow[]) };
}

export type SetWeeklyCheckItemResult =
  | { status: "ok"; state: WeeklyChecklistStateDTO }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

/**
 * Checks or unchecks one item for the CURRENT real week (computed
 * server-side from the real clock, never trusted from the client, same
 * as every other "when did this really happen" field in the app).
 * Checking upserts a row; unchecking deletes it — so "checked" always
 * means a real row exists, matching the table's own doc in
 * supabase/schema.sql. Ownership is enforced the same way every other
 * business action here does it: the owner-scoped Supabase client plus
 * RLS, never a manual businesses.owner_id check in application code.
 */
export async function setWeeklyCheckItem(
  businessId: string,
  itemId: WeeklyChecklistItemId,
  checked: boolean
): Promise<SetWeeklyCheckItemResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const weekStart = weekStartFor(new Date(), WEEKLY_CHECKLIST_TIMEZONE);

  if (checked) {
    const { error } = await supabase.from("weekly_checks").upsert(
      {
        business_id: businessId,
        week_start: weekStart,
        item_id: itemId,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "business_id,week_start,item_id" }
    );
    if (error) {
      return { status: "error", message: error.message };
    }
  } else {
    const { error } = await supabase
      .from("weekly_checks")
      .delete()
      .eq("business_id", businessId)
      .eq("week_start", weekStart)
      .eq("item_id", itemId);
    if (error) {
      return { status: "error", message: error.message };
    }
  }

  return getWeeklyChecklistState(businessId);
}
