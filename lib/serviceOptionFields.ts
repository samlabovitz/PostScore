// Google's yes/no service options — how customers get the food. Missing =
// unknown, never "no". Enterprise + Atmosphere Places fields. Pure and tiny,
// so scoring and the browser can read them without the Places client.

export const SERVICE_OPTION_FIELDS = ["takeout", "delivery", "curbsidePickup", "dineIn"] as const;
export type ServiceOption = (typeof SERVICE_OPTION_FIELDS)[number];
/** Only the flags Google actually gave (true or false); a missing one is unknown. */
export type ServiceOptions = Partial<Record<ServiceOption, boolean>>;
