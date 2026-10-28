"use server";

// Per-account UI choices (supabase/ui-preferences.sql): only known keys,
// only the signed-in owner's own rows (RLS). Before the SQL file is run
// reads return null and writes report "not_enabled" — the page then
// remembers the choice on the device instead (lib/uiPreferences.ts).

import { createClient } from "@/lib/supabase/server";
import { UI_PREFERENCE_KEYS, type UiPreferenceKey } from "@/lib/uiPreferences";

const KNOWN = new Set<string>(UI_PREFERENCE_KEYS);

export async function getUiPreference(key: UiPreferenceKey): Promise<boolean | null> {
  if (!KNOWN.has(key)) return null;
  try {
    const { data, error } = await createClient().from("user_ui_preferences").select("value").eq("key", key).maybeSingle();
    return !error && data && typeof data.value === "boolean" ? data.value : null;
  } catch {
    return null;
  }
}

export async function setUiPreference(key: UiPreferenceKey, value: boolean): Promise<{ status: "ok" | "unauthenticated" | "not_enabled" | "error" }> {
  if (!KNOWN.has(key)) return { status: "error" };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };
  const { error } = await supabase
    .from("user_ui_preferences")
    .upsert({ user_id: user.id, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
  if (error) return /user_ui_preferences|42P01|PGRST205/.test(`${error.code} ${error.message}`) ? { status: "not_enabled" } : { status: "error" };
  return { status: "ok" };
}
