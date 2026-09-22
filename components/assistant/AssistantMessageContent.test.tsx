import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n";
import { AssistantMessageContent, splitAssistantContent } from "./AssistantMessageContent";

// Step L7 beat 3: the model is instructed (ASSISTANT_SYSTEM_RULES rule 2 in
// lib/assistant.ts) to always emit the "General guidance:" marker verbatim
// in English, even when answering in Spanish — the parser below must stay
// tied to that one stable English token regardless of locale, and only the
// VISIBLE heading (dashboard.assistant.generalGuidanceLabel) is translated.

describe("splitAssistantContent — English marker stays stable across locales", () => {
  test("strips the English marker from a Spanish-language reply", () => {
    const spanishReply =
      "Su calificación es 4.3 con 58 reseñas.\n\nGeneral guidance: Considere publicar actualizaciones semanales en su Perfil de Negocio de Google para mantener su ficha activa.";

    const parts = splitAssistantContent(spanishReply);

    expect(parts).toEqual([
      { general: false, text: "Su calificación es 4.3 con 58 reseñas." },
      {
        general: true,
        text: "Considere publicar actualizaciones semanales en su Perfil de Negocio de Google para mantener su ficha activa.",
      },
    ]);
  });

  test("still matches case-insensitively when the model varies the marker's casing", () => {
    const parts = splitAssistantContent("GENERAL GUIDANCE: Texto en español aquí.");
    expect(parts).toEqual([{ general: true, text: "Texto en español aquí." }]);
  });
});

describe("AssistantMessageContent — Spanish body renders under the translated heading", () => {
  test("es locale: English marker is parsed away, translated heading + Spanish body both render", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider locale="es">
        <AssistantMessageContent content="General guidance: Considere anunciarse localmente." />
      </LocaleProvider>
    );

    // The translated heading renders...
    expect(html).toContain("Orientación general");
    // ...the Spanish body renders...
    expect(html).toContain("Considere anunciarse localmente.");
    // ...and the literal English marker never leaks into the visible output.
    expect(html).not.toContain("General guidance:");
  });

  test("en locale: same marker still renders under the English heading", () => {
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
