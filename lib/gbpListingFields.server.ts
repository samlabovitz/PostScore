// Server-only. The two field specs for lib/gbpFieldWrite.server.ts:
// holiday hours (specialHours) and services (serviceItems).
import "server-only";
import type { FieldSpec } from "@/lib/gbpFieldWrite.server";
import { sameServices, sameSpecialHours, type ServiceItem, type SpecialHourPeriod } from "@/lib/gbpListingFields";

export const SPECIAL_HOURS_KIND = "special_hours";
export const SERVICES_KIND = "services";

export const SPECIAL_HOURS_SPEC: FieldSpec<SpecialHourPeriod[]> = {
  mask: "specialHours",
  logField: "special_hours",
  kind: (practice) => (practice ? `${SPECIAL_HOURS_KIND}_practice` : SPECIAL_HOURS_KIND),
  read: (loc) => ((loc.specialHours as { specialHourPeriods?: SpecialHourPeriod[] } | undefined)?.specialHourPeriods ?? []),
  body: (v) => ({ specialHours: { specialHourPeriods: v } }),
  same: sameSpecialHours,
};

export const SERVICES_SPEC: FieldSpec<ServiceItem[]> = {
  mask: "serviceItems",
  logField: "services",
  kind: (practice) => (practice ? `${SERVICES_KIND}_practice` : SERVICES_KIND),
  read: (loc) => (loc.serviceItems as ServiceItem[] | undefined) ?? [],
  body: (v) => ({ serviceItems: v }),
  same: sameServices,
};
