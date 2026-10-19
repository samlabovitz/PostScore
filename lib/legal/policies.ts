// The refund / cancellation policy and the Terms — one source for the
// /refund-policy and /terms pages, the Settings policy box, and (later)
// checkout and its emails (see lib/billing/compliance.ts). English and
// Spanish (usted). Change the wording only together with
// POLICY_VERSION, so stored consents can point at the exact text.

export const POLICY_VERSION = "2026-10-19";

export type PolicyLocale = "en" | "es";

export const REFUND_POLICY = {
  en: {
    title: "Refund & cancellation policy",
    updated: "Last updated October 19, 2026",
    summary:
      "Plans renew automatically each month until you cancel. You can cancel anytime online in Settings → Plan & billing — no call or email needed. When you cancel, you keep full access until the end of the period you've already paid for, and you won't be charged again. Payments are non-refundable, except where required by law (for example, consumer withdrawal rights in the EU/UK, or billing errors and duplicate charges, which we always refund).",
    sections: [
      {
        heading: "Renewal",
        body: ["Paid plans renew automatically each month at the price shown when you subscribed, until you cancel."],
      },
      {
        heading: "Cancelling",
        body: [
          "You can cancel anytime online in Settings → Plan & billing — no call or email needed.",
          "When you cancel, you keep full access until the end of the period you've already paid for, then your account switches to the Free plan. You won't be charged again.",
        ],
      },
      {
        heading: "Refunds",
        body: [
          "Payments are non-refundable, except where required by law.",
          "We always refund billing errors and duplicate charges.",
        ],
      },
      {
        heading: "EU/UK customers",
        body: [
          "If you're a consumer in the EU or UK, you have a 14-day right to withdraw from your purchase.",
          "If you asked us to start the service immediately and acknowledged that you lose this right once the service begins, the right of withdrawal no longer applies.",
          "Otherwise, if you withdraw within 14 days, we refund you — pro-rated for the days you used.",
        ],
      },
      {
        heading: "Price changes",
        body: ["If a plan's price changes, we email you at least 30 days before the new price applies, with how to cancel."],
      },
    ],
  },
  es: {
    title: "Política de reembolsos y cancelación",
    updated: "Última actualización: 19 de octubre de 2026",
    summary:
      "Los planes se renuevan automáticamente cada mes hasta que usted cancele. Puede cancelar cuando quiera en línea, en Configuración → Plan y facturación — sin llamar ni escribir. Al cancelar, conserva el acceso completo hasta el final del período que ya pagó y no se le volverá a cobrar. Los pagos no son reembolsables, salvo cuando la ley lo exija (por ejemplo, el derecho de desistimiento de los consumidores en la UE/Reino Unido, o errores de facturación y cobros duplicados, que siempre reembolsamos).",
    sections: [
      {
        heading: "Renovación",
        body: ["Los planes de pago se renuevan automáticamente cada mes al precio indicado al suscribirse, hasta que usted cancele."],
      },
      {
        heading: "Cancelación",
        body: [
          "Puede cancelar cuando quiera en línea, en Configuración → Plan y facturación — sin llamar ni escribir.",
          "Al cancelar, conserva el acceso completo hasta el final del período que ya pagó y luego su cuenta pasa al plan Gratis. No se le volverá a cobrar.",
        ],
      },
      {
        heading: "Reembolsos",
        body: ["Los pagos no son reembolsables, salvo cuando la ley lo exija.", "Siempre reembolsamos los errores de facturación y los cobros duplicados."],
      },
      {
        heading: "Clientes de la UE/Reino Unido",
        body: [
          "Si usted es consumidor en la UE o el Reino Unido, tiene un derecho de desistimiento de 14 días.",
          "Si nos pidió empezar el servicio de inmediato y aceptó que pierde este derecho una vez que el servicio comienza, el derecho de desistimiento ya no aplica.",
          "En otro caso, si desiste dentro de los 14 días, le reembolsamos — de forma proporcional a los días usados.",
        ],
      },
      {
        heading: "Cambios de precio",
        body: ["Si cambia el precio de un plan, le escribimos al menos 30 días antes de que se aplique el nuevo precio, con cómo cancelar."],
      },
    ],
  },
} as const;

/** The short box in Settings. */
export const REFUND_POLICY_SHORT = {
  en: "Cancel anytime in Settings. You keep access until the end of the period you've paid for. Payments are non-refundable except where required by law — billing errors and duplicate charges are always refunded.",
  es: "Cancele cuando quiera en Configuración. Conserva el acceso hasta el final del período que pagó. Los pagos no son reembolsables salvo cuando la ley lo exija — los errores de facturación y cobros duplicados siempre se reembolsan.",
} as const;

export const TERMS = {
  en: {
    title: "Terms of service",
    updated: "Last updated October 19, 2026",
    sections: [
      {
        heading: "A service for businesses",
        body: [
          "PostScore is a service for businesses: it scores how a business shows up online (its Google listing, website and reviews) and offers tools to improve it. By using PostScore you confirm you're using it for a business.",
        ],
      },
      {
        heading: "What our scores are",
        body: [
          "Scores and estimates use real public signals and are general guidance, not guarantees. Items we couldn't check are marked as such. PostScore never posts, messages or charges anyone on your behalf.",
        ],
      },
      {
        heading: "Your account",
        body: ["Keep your login secure. You're responsible for what's done with your account, and for having the right to manage the businesses you add."],
      },
      {
        heading: "Plans, billing and refunds",
        body: ["Paid plans renew monthly until you cancel, and you can cancel online anytime. Refunds follow our Refund & cancellation policy."],
        link: "refund",
      },
      {
        heading: "Acceptable use",
        body: ["Don't use PostScore to break the law, to mislead customers, or to harm other businesses or people."],
      },
      {
        heading: "Changes",
        body: ["We may update these terms. When a change matters, we'll tell you before it applies."],
      },
    ],
  },
  es: {
    title: "Términos del servicio",
    updated: "Última actualización: 19 de octubre de 2026",
    sections: [
      {
        heading: "Un servicio para negocios",
        body: [
          "PostScore es un servicio para negocios: califica cómo se ve un negocio en línea (su ficha de Google, su sitio web y sus reseñas) y ofrece herramientas para mejorarlo. Al usar PostScore, usted confirma que lo usa para un negocio.",
        ],
      },
      {
        heading: "Qué son nuestras puntuaciones",
        body: [
          "Las puntuaciones y estimaciones usan señales públicas reales y son una orientación general, no garantías. Lo que no pudimos revisar se marca como tal. PostScore nunca publica, envía mensajes ni cobra a nadie en su nombre.",
        ],
      },
      {
        heading: "Su cuenta",
        body: ["Mantenga segura su sesión. Usted es responsable de lo que se haga con su cuenta y de tener derecho a administrar los negocios que agrega."],
      },
      {
        heading: "Planes, facturación y reembolsos",
        body: ["Los planes de pago se renuevan cada mes hasta que usted cancele, y puede cancelar en línea cuando quiera. Los reembolsos siguen nuestra Política de reembolsos y cancelación."],
        link: "refund",
      },
      {
        heading: "Uso aceptable",
        body: ["No use PostScore para infringir la ley, engañar a los clientes ni perjudicar a otros negocios o personas."],
      },
      {
        heading: "Cambios",
        body: ["Podemos actualizar estos términos. Cuando un cambio sea importante, se lo diremos antes de que se aplique."],
      },
    ],
  },
} as const;

export function policyLocale(value: unknown): PolicyLocale {
  return value === "es" ? "es" : "en";
}

export function legalHref(page: "terms" | "refund", locale: PolicyLocale): string {
  const path = page === "terms" ? "/terms" : "/refund-policy";
  return locale === "es" ? `${path}?lang=es` : path;
}
