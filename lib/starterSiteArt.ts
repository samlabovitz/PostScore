// The starter website's "Style accents": background patterns on
// alternate sections, a divider between the hero and the content, a
// decorative shape behind section headings, and a small icon set — the
// business-type icon (scissors for a salon, a bottle for a liquor store,
// a cup for a café…) plus section icons. Everything is inline SVG or
// CSS drawn here (original, simple line art): no image files, no
// network requests, so the page stays one fast, self-contained file.
// Pure presentation — nothing here is a fact about the business.

export type AccentStyle = "none" | "dots" | "lines" | "waves" | "shapes";

export const ACCENT_STYLES: AccentStyle[] = ["dots", "lines", "waves", "shapes", "none"];

export function safeAccentStyle(value: string | null | undefined): AccentStyle {
  return (ACCENT_STYLES as string[]).includes(value ?? "") ? (value as AccentStyle) : "dots";
}

/** 24×24 line icons (stroke = currentColor). */
const ICON_PATHS = {
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>',
  bottle: '<path d="M10 2.5h4v4l2 3V20a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V9.5l2-3z"/><path d="M8 12.5h8M8 17h8"/>',
  cup: '<path d="M4 9.5h12v4a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 13.5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3"/>',
  utensils: '<path d="M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2.5 1.5-3.5 4.5-3.5 8h3.5"/>',
  basket: '<path d="M3 10h18l-2 10H5z"/><path d="M8 10l3-6M16 10l-3-6M9 14v3M15 14v3"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M9 7.5V5h6v2.5M3 12.5h18"/>',
  cross: '<path d="M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z"/>',
  dumbbell: '<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>',
  wrench: '<path d="M14.5 3.5a5 5 0 0 0-4.6 6.9L3.5 16.8l3.7 3.7 6.4-6.4A5 5 0 0 0 20.5 9.5l-3 1-3-3z"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
  store: '<path d="M3.5 9 5.5 4h13l2 5M4.5 9v11h15V9M3.5 9h17M9.5 20v-6h5v6"/>',
  home: '<path d="M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  car: '<path d="M5 16.5 6.5 11h11l1.5 5.5"/><rect x="3.5" y="16" width="17" height="3.5" rx="1"/><path d="M7 19.5v1.5M17 19.5v1.5"/>',
  heart: '<path d="M12 20s-7.5-4.5-7.5-10A4 4 0 0 1 12 8a4 4 0 0 1 7.5 2c0 5.5-7.5 10-7.5 10z"/>',
  bed: '<path d="M3 18V7M3 13h18v5M21 18v-3M7 13v-2.5h5V13"/>',
  pen: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  glass: '<path d="M7.5 3.5h9l-.8 6a3.7 3.7 0 0 1-7.4 0z"/><path d="M12 13.5v7M8.5 20.5h7"/>',
  flower: '<circle cx="12" cy="8" r="2"/><path d="M12 4.5a2.2 2.2 0 0 1 3.4 2.3 2.2 2.2 0 0 1-.3 4 2.2 2.2 0 0 1-3.1 1.6 2.2 2.2 0 0 1-3.1-1.6 2.2 2.2 0 0 1-.3-4A2.2 2.2 0 0 1 12 4.5zM12 12.4V21M12 18c-2.6 0-4.2-1.6-4.2-3.6 2.3 0 4.2 1.6 4.2 3.6zM12 18c2.6 0 4.2-1.6 4.2-3.6-2.3 0-4.2 1.6-4.2 3.6z"/>',
  paw: '<circle cx="6.5" cy="10" r="1.8"/><circle cx="10" cy="6" r="1.8"/><circle cx="14" cy="6" r="1.8"/><circle cx="17.5" cy="10" r="1.8"/><path d="M12 11.5c-3 0-5 3.5-5 5.5 0 1.5 1.2 2.5 2.7 2.5 1 0 1.5-.6 2.3-.6s1.3.6 2.3.6c1.5 0 2.7-1 2.7-2.5 0-2-2-5.5-5-5.5z"/>',
  book: '<path d="M4 5.5A2 2 0 0 1 6 3.5h13v14H6a2 2 0 0 0-2 2z"/><path d="M4 19.5a2 2 0 0 0 2 2h13v-4"/>',
  // Section icons
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7 10 4.5h4L15.5 7"/><circle cx="12" cy="13.5" r="3.5"/>',
  tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.3"/>',
  map: '<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

/** The business-type icon, by resolved business type id (config/bizProfiles.ts's
 * BUSINESS_TYPE_OPTIONS — e.g. "barbershop", "liquor_store", "cafe"); anything
 * else gets a storefront. */
const PROFILE_ICON: Record<string, IconName> = {
  salon: "scissors",
  barbershop: "scissors",
  nail_salon: "scissors",
  spa: "sparkle",
  cafe: "cup",
  bakery: "cup",
  dessert_shop: "cup",
  bar: "glass",
  liquor_store: "bottle",
  restaurant: "utensils",
  grocery_market: "basket",
  hardware_store: "wrench",
  florist: "flower",
  retail_boutique: "bag",
  specialty_store: "bag",
  community_center: "heart",
  gym_fitness: "dumbbell",
  pet_services: "paw",
  dentist: "cross",
  medical_clinic: "cross",
  practitioner: "cross",
  lawyer: "briefcase",
  accountant: "briefcase",
  consultant: "briefcase",
  real_estate: "home",
  coach: "sparkle",
  tutor_education: "book",
  photographer: "camera",
  auto_repair: "car",
  car_wash_detailing: "car",
  plumber: "wrench",
  electrician: "wrench",
  repair_dropoff: "wrench",
  landscaper: "flower",
  cleaning_service: "sparkle",
  home_services: "home",
  recreation: "sparkle",
  events: "sparkle",
  childcare: "heart",
  lodging: "bed",
  tattoo_body_art: "pen",
  nonprofit: "heart",
  place_of_worship: "heart",
};

export function businessIcon(profileId: string): IconName {
  return PROFILE_ICON[profileId] ?? "store";
}

export function iconSvg(name: IconName, size = 24): string {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

/** An inline SVG as a CSS url() value (no network request). */
function svgUrl(svg: string): string {
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** The background pattern for alternate sections (`color` = the accent). */
export function patternCss(style: AccentStyle, color: string): string {
  switch (style) {
    case "dots":
      return `background-image: radial-gradient(${color}38 1.3px, transparent 1.6px); background-size: 18px 18px;`;
    case "lines":
      return `background-image: repeating-linear-gradient(135deg, ${color}26 0 1px, transparent 1px 12px);`;
    case "waves":
      return `background-image: ${svgUrl(`<svg xmlns="${SVG_NS}" width="96" height="24" viewBox="0 0 96 24"><path d="M0 12 C 12 4, 36 4, 48 12 S 84 20, 96 12" fill="none" stroke="${color}" stroke-opacity="0.22" stroke-width="1.4"/></svg>`)}; background-size: 96px 24px;`;
    case "shapes":
      return `background-image: ${svgUrl(
        `<svg xmlns="${SVG_NS}" width="120" height="120" viewBox="0 0 120 120" fill="none" stroke="${color}" stroke-opacity="0.25" stroke-width="1.6" stroke-linecap="round"><circle cx="20" cy="22" r="5"/><path d="M78 14v12M72 20h12"/><path d="M40 74l8-13 8 13z"/><circle cx="96" cy="88" r="3" fill="${color}" fill-opacity="0.22" stroke="none"/><path d="M12 100c6-6 12 6 18 0"/></svg>`
      )}; background-size: 120px 120px;`;
    default:
      return "";
  }
}

/** The divider between the hero and the content, drawn in `fill` (the
 * first section's background). Empty for "none". */
export function dividerSvg(style: AccentStyle, fill: string): string {
  const path =
    style === "dots" || style === "shapes"
      ? "M0 48 C 360 0, 1080 0, 1440 48 L1440 60 L0 60 Z"
      : style === "lines"
        ? "M0 60 L1440 4 L1440 60 Z"
        : style === "waves"
          ? "M0 30 C 240 62, 480 0, 720 30 C 960 60, 1200 2, 1440 30 L1440 60 L0 60 Z"
          : null;
  if (!path) return "";
  return `<svg class="divider" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true"><path d="${path}" fill="${fill}"/></svg>`;
}

/** The decorative shape behind (or under) each section heading. */
export function headingShapeCss(style: AccentStyle, color: string): string {
  switch (style) {
    case "dots":
      return `.sec-title::before { content: ""; position: absolute; left: -12px; top: 50%; width: 46px; height: 46px; margin-top: -23px; border-radius: 50%; background: ${color}24; z-index: -1; }`;
    case "lines":
      return `.sec-title::after { content: ""; display: block; width: 56px; height: 5px; margin-top: 10px; background: ${color}; transform: skewX(-24deg); border-radius: 1px; }`;
    case "waves":
      return `.sec-title::after { content: ""; display: block; width: 72px; height: 10px; margin-top: 8px; background: ${svgUrl(
        `<svg xmlns="${SVG_NS}" width="72" height="10" viewBox="0 0 72 10"><path d="M1 5 C 7 0, 13 0, 19 5 S 31 10, 37 5 S 49 0, 55 5 S 67 10, 71 5" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/></svg>`
      )} no-repeat; }`;
    case "shapes":
      return `.sec-title::before { content: ""; position: absolute; left: -10px; top: 50%; width: 38px; height: 38px; margin-top: -19px; border-radius: 10px; background: ${color}26; transform: rotate(14deg); z-index: -1; }`;
    default:
      return "";
  }
}
