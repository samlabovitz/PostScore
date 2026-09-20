import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, useLocale } from "./context";
import { normalizeLocale } from "./locale";

function LocaleReadout() {
  const locale = useLocale();
  return <span>{locale}</span>;
}

/** Mirrors exactly what DashboardShell does: take the business's raw,
 * untrusted `language` column value, normalize it, and hand THAT to
 * LocaleProvider — never the raw value. */
function renderForBusinessLanguage(language: string | null | undefined): string {
  return renderToStaticMarkup(
    <LocaleProvider locale={normalizeLocale(language)}>
      <LocaleReadout />
    </LocaleProvider>
  );
}

describe("useLocale / LocaleProvider", () => {
  test("yields 'es' for an es business", () => {
    expect(renderForBusinessLanguage("es")).toBe("<span>es</span>");
  });

  test("yields 'en' for an en business", () => {
    expect(renderForBusinessLanguage("en")).toBe("<span>en</span>");
  });

  test("yields 'en' for a business with no language recorded (null)", () => {
    expect(renderForBusinessLanguage(null)).toBe("<span>en</span>");
  });

  test("yields 'en' for a garbage language value", () => {
    expect(renderForBusinessLanguage("klingon")).toBe("<span>en</span>");
  });

  test("useLocale still yields a real Locale ('en') outside any provider", () => {
    expect(renderToStaticMarkup(<LocaleReadout />)).toBe("<span>en</span>");
  });
});
