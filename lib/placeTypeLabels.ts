// Plain-language names for the Google place types a competitor scan can
// search by (the PostScore business types' placesType lists in
// config/bizProfiles.ts), joined as a sentence-ready list.

import { t, type Locale, type MessageKey } from "@/lib/i18n";

/** "dry cleaners and tailors" / "tintorerías y sastrerías". A type with
 * no name yet is left out rather than shown raw. */
export function placeTypeList(types: string[], locale: Locale): string {
  const names = Array.from(
    new Set(
      types.flatMap((type) => {
        const key = `placeType.${type}` as MessageKey;
        const name = t(locale, key);
        return name === key ? [] : [name];
      })
    )
  );
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names);
}
