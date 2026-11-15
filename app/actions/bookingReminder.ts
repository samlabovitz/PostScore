"use server";

// "I turned it on" on the "Turn on Google booking" reminder (case B in
// lib/bookingPartners.ts): hides it for 14 days; after that, if Google
// still counts 0 bookings, it comes back as "Still not tracked".

export async function snoozeBookingReminder(businessId: string): Promise<{ ok: boolean }> {
  const { createClient } = await import("@/lib/supabase/server");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createClient();
  const { data: owned } = await supabase.from("businesses").select("id").eq("id", businessId).maybeSingle();
  if (!owned) return { ok: false };
  const { error } = await createAdminClient().from("gbp_connections").update({ booking_reminder_snoozed_at: new Date().toISOString() }).eq("business_id", businessId);
  if (error) return { ok: false };
  const { revalidatePath } = await import("next/cache");
  revalidatePath(`/business/${businessId}/growth`);
  return { ok: true };
}
