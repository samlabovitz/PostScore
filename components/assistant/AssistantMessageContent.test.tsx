import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { AssistantMessageContent, parseInlineBold, splitAssistantContent } from "./AssistantMessageContent";

// Day 3 PostAI-leftovers fix: a Spanish reply now uses its OWN exact
// marker, "Consejo general:" — never the English "General guidance:"
// (see buildAssistantLanguageDirective's es-specific override in
// lib/assistant.ts) — so the parser must recognize BOTH literal tokens,
// case-insensitively, regardless of which one a given reply actually
// used. Only the VISIBLE heading (dashboard.assistant.generalGuidanceLabel)
// is translated; the raw marker itself is always stripped from the body.

describe("splitAssistantContent — recognizes each language's own real general-guidance marker", () => {
  test("strips the Spanish marker from a Spanish-language reply", () => {
    const spanishReply =
      "Su calificación es 4.3 con 58 reseñas.\n\nConsejo general: Considere publicar actualizaciones semanales en su Perfil de Negocio de Google para mantener su ficha activa.";

    const parts = splitAssistantContent(spanishReply);

    expect(parts).toEqual([
      { general: false, text: "Su calificación es 4.3 con 58 reseñas." },
      {
        general: true,
        text: "Considere publicar actualizaciones semanales en su Perfil de Negocio de Google para mantener su ficha activa.",
      },
    ]);
  });

  test("strips the English marker from an English-language reply", () => {
    const parts = splitAssistantContent("General guidance: Post a weekly update to your listing.");
    expect(parts).toEqual([{ general: true, text: "Post a weekly update to your listing." }]);
  });

  test("still matches case-insensitively for either marker", () => {
    expect(splitAssistantContent("CONSEJO GENERAL: Texto en español aquí.")).toEqual([
      { general: true, text: "Texto en español aquí." },
    ]);
    expect(splitAssistantContent("GENERAL GUIDANCE: English text here.")).toEqual([
      { general: true, text: "English text here." },
    ]);
  });

  test("defensively still recognizes the English marker even inside an otherwise-Spanish reply, in case the model ever slips", () => {
    const parts = splitAssistantContent("General guidance: Considere anunciarse localmente.");
    expect(parts).toEqual([{ general: true, text: "Considere anunciarse localmente." }]);
  });
});

describe("AssistantMessageContent — Spanish body renders under the translated heading", () => {
  test("es locale: the real Spanish marker is parsed away, translated heading + Spanish body both render", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="es">
        <AssistantMessageContent content="Consejo general: Considere anunciarse localmente." />
      </LocaleProvider>
    );

    // The translated heading renders...
    expect(html).toContain("Orientación general");
    // ...the Spanish body renders...
    expect(html).toContain("Considere anunciarse localmente.");
    // ...and the literal Spanish marker never leaks into the visible output.
    expect(html).not.toContain("Consejo general:");
  });

  test("en locale: the English marker still renders under the English heading", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <AssistantMessageContent content="General guidance: Post a weekly update to your listing." />
      </LocaleProvider>
    );

    expect(html).toContain("General guidance");
    expect(html).toContain("Post a weekly update to your listing.");
    // The heading itself is "General guidance" (no colon) — the colon-
    // suffixed marker is stripped from the body, not duplicated as a label.
    expect(html).not.toContain("General guidance: Post a weekly update");
  });
});

describe("parseInlineBold", () => {
  test("splits mid-sentence bold next to punctuation (an em dash) into plain/bold/plain runs", () => {
    const parts = parseInlineBold("Check your **Pricing page** too — you've never run a price check");
    expect(parts).toEqual([
      { bold: false, text: "Check your " },
      { bold: true, text: "Pricing page" },
      { bold: false, text: " too — you've never run a price check" },
    ]);
  });

  test("handles two separate bold spans in one string without collapsing them into one", () => {
    const parts = parseInlineBold("See **Growth page** and **Pricing page**.");
    expect(parts).toEqual([
      { bold: false, text: "See " },
      { bold: true, text: "Growth page" },
      { bold: false, text: " and " },
      { bold: true, text: "Pricing page" },
      { bold: false, text: "." },
    ]);
  });

  test("a bold span can cross a real newline within the same paragraph", () => {
    const parts = parseInlineBold("See the **Pricing\npage** for this.");
    expect(parts).toEqual([
      { bold: false, text: "See the " },
      { bold: true, text: "Pricing\npage" },
      { bold: false, text: " for this." },
    ]);
  });

  test("plain text with no bold markers returns a single plain run", () => {
    expect(parseInlineBold("No bold here at all.")).toEqual([{ bold: false, text: "No bold here at all." }]);
  });

  test("a genuinely unmatched ** (no real closing pair) is left as literal text, never guessed at", () => {
    const parts = parseInlineBold("This has an unmatched ** marker.");
    expect(parts).toEqual([{ bold: false, text: "This has an unmatched ** marker." }]);
  });
});

describe("AssistantMessageContent — inline bold rendering", () => {
  test('the exact reported case renders a real <strong> element, never literal asterisks: "Check your **Pricing page** too — you\'ve never run a price check"', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <AssistantMessageContent content="Check your **Pricing page** too — you've never run a price check" />
      </LocaleProvider>
    );

    expect(html).toContain("<strong>Pricing page</strong>");
    expect(html).not.toContain("**Pricing page**");
    expect(html).not.toContain("**");
  });

  test("bold also renders correctly inside a General guidance paragraph", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="en">
        <AssistantMessageContent content="General guidance: Post to your **Google Business Profile** weekly." />
      </LocaleProvider>
    );

    expect(html).toContain("<strong>Google Business Profile</strong>");
    expect(html).not.toContain("**");
  });
});
