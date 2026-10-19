// Per-builder "how to fix this" guides for the Website page's checks.
//
// Every builder guide below is based on that builder's own help article
// (the `url`), looked up on GUIDES_VERIFIED_AT. Where no official article
// was found for a builder + task, there is deliberately NO entry: the
// page falls back to the generic guide ("Ask your web person to…" plus a
// copyable message) instead of guessing at menus. A `limitation` says
// plainly when a builder can't do something and what the closest option
// is. Review copy: ~/Desktop/builder-guides-review.md
// (scripts/write-builder-guides-review.ts). Pure.

import type { CheckResult } from "@/lib/scoring";
import type { WebsiteBuilderId } from "@/lib/websiteBuilder";

export const GUIDES_VERIFIED_AT = "2026-10-19";

/** The owner-side jobs behind the website checks. */
export type GuideTask = "ssl" | "seo_meta" | "add_page" | "phone_link" | "social_links" | "speed" | "edit_text";

type Text = { en: string; es: string };

export interface BuilderGuide {
  steps: { en: string[]; es: string[] };
  /** The builder's official help article this guide follows. */
  url: string;
  verifiedAt: string;
  /** What the builder can't do, and the closest option. */
  limitation?: Text;
}

const V = GUIDES_VERIFIED_AT;

export const BUILDER_GUIDES: Partial<Record<WebsiteBuilderId, Partial<Record<GuideTask, BuilderGuide>>>> = {
  wix: {
    ssl: {
      url: "https://support.wix.com/en/article/about-ssl-and-https",
      verifiedAt: V,
      steps: {
        en: [
          "Wix turns on HTTPS for every Wix site at no cost — there's no switch to flip.",
          "If your site still isn't secure, open your Wix dashboard → Domains and check that your domain is connected to Wix.",
          "Re-check your website here once the domain shows as connected.",
        ],
        es: [
          "Wix activa HTTPS en todos los sitios de Wix sin costo — no hay ningún interruptor que activar.",
          "Si su sitio sigue sin ser seguro, abra su panel de Wix → Dominios y compruebe que su dominio esté conectado a Wix.",
          "Vuelva a revisar su sitio web aquí cuando el dominio aparezca como conectado.",
        ],
      },
      limitation: {
        en: "Wix can't secure a domain that points to a website hosted somewhere else.",
        es: "Wix no puede proteger un dominio que apunta a un sitio web alojado en otro lugar.",
      },
    },
    seo_meta: {
      url: "https://support.wix.com/en/article/adding-seo-title-tags-and-meta-descriptions-to-your-pages",
      verifiedAt: V,
      steps: {
        en: [
          "In the Wix Editor, open Pages & Menu.",
          "Click the More Actions (…) icon next to the page, then SEO basics.",
          "Fill in the title tag and the meta description — the Google preview shows how it will look.",
          "Click Publish (top right).",
        ],
        es: [
          "En el Editor de Wix, abra Páginas y menú.",
          "Haga clic en el icono Más acciones (…) junto a la página y luego en Aspectos básicos de SEO.",
          "Complete la etiqueta de título y la meta descripción — la vista previa de Google muestra cómo se verá.",
          "Haga clic en Publicar (arriba a la derecha).",
        ],
      },
    },
    add_page: {
      url: "https://support.wix.com/en/article/adding-a-page-to-your-site",
      verifiedAt: V,
      steps: {
        en: [
          "In the Wix Editor, open Pages & Menu.",
          "Add a page (blank or from a template) and name it — for example “About us” or “Services”.",
          "Add your text, then Publish. New pages are added to your site menu automatically.",
        ],
        es: [
          "En el Editor de Wix, abra Páginas y menú.",
          "Agregue una página (en blanco o desde una plantilla) y póngale nombre — por ejemplo “Quiénes somos” o “Servicios”.",
          "Agregue su texto y publique. Las páginas nuevas se agregan automáticamente al menú del sitio.",
        ],
      },
    },
    phone_link: {
      url: "https://support.wix.com/en/article/wix-editor-creating-a-clickable-phone-number-email-or-url",
      verifiedAt: V,
      steps: {
        en: [
          "In the Wix Editor, add a Text element near the top of your homepage (or edit an existing one).",
          "Type your phone number — Wix makes a phone number in a text box clickable automatically.",
          "Publish, then tap it on your phone to test it.",
        ],
        es: [
          "En el Editor de Wix, agregue un elemento de Texto cerca de la parte superior de su página principal (o edite uno existente).",
          "Escriba su número de teléfono — Wix convierte automáticamente un número de teléfono en un cuadro de texto en un enlace.",
          "Publique y tóquelo en su teléfono para probarlo.",
        ],
      },
    },
    social_links: {
      url: "https://support.wix.com/en/article/adding-and-setting-up-a-social-bar",
      verifiedAt: V,
      steps: {
        en: [
          "In the Wix Editor, click Add Elements → Social → Social Bar and drag it into your header or footer.",
          "Select the bar, click Set Social Links, and enter the link to each of your profiles.",
          "Publish.",
        ],
        es: [
          "En el Editor de Wix, haga clic en Agregar elementos → Social → Barra social y arrástrela a su encabezado o pie de página.",
          "Seleccione la barra, haga clic en Configurar enlaces sociales e ingrese el enlace de cada uno de sus perfiles.",
          "Publique.",
        ],
      },
    },
    speed: {
      url: "https://support.wix.com/en/article/improving-your-site-speed",
      verifiedAt: V,
      steps: {
        en: [
          "Open the Site Speed dashboard in your Wix dashboard (it shows data once your site has 10+ visits in 7 days).",
          "Follow its tips: fewer elements on heavy pages, photos as JPG rather than PNG, and 1–3 font families.",
          "Publish, then re-check your website here.",
        ],
        es: [
          "Abra el panel de Velocidad del sitio en su panel de Wix (muestra datos cuando su sitio tiene más de 10 visitas en 7 días).",
          "Siga sus consejos: menos elementos en las páginas pesadas, fotos en JPG en lugar de PNG y de 1 a 3 familias de fuentes.",
          "Publique y vuelva a revisar su sitio web aquí.",
        ],
      },
    },
  },
  squarespace: {
    ssl: {
      url: "https://support.squarespace.com/hc/en-us/articles/205815898-Understanding-SSL-certificates",
      verifiedAt: V,
      steps: {
        en: [
          "Squarespace gives your domain a free SSL certificate.",
          "Open your site's SSL settings and choose Secure (Preferred). Squarespace also recommends turning on HSTS Secure.",
          "Save. A newly connected domain can take a while to get its certificate.",
        ],
        es: [
          "Squarespace le da a su dominio un certificado SSL gratuito.",
          "Abra la configuración de SSL de su sitio y elija Seguro (preferido). Squarespace también recomienda activar HSTS seguro.",
          "Guarde. Un dominio recién conectado puede tardar un poco en recibir su certificado.",
        ],
      },
    },
    seo_meta: {
      url: "https://support.squarespace.com/hc/en-us/articles/206016198-Adding-SEO-descriptions",
      verifiedAt: V,
      steps: {
        en: [
          "In the Pages panel, open the page's settings (gear icon).",
          "In the SEO tab, fill in the SEO title (70 characters or fewer) and the SEO description.",
          "For your homepage, also fill in the site-wide SEO description.",
          "Save.",
        ],
        es: [
          "En el panel Páginas, abra la configuración de la página (icono de engranaje).",
          "En la pestaña SEO, complete el título SEO (70 caracteres o menos) y la descripción SEO.",
          "Para su página principal, complete también la descripción SEO de todo el sitio.",
          "Guarde.",
        ],
      },
    },
    phone_link: {
      url: "https://support.squarespace.com/hc/en-us/articles/206232858-Add-links-to-your-site",
      verifiedAt: V,
      steps: {
        en: [
          "Edit the page and select the text or button to link — for example your phone number or a “Call us” button.",
          "In the link editor, choose Phone, enter your number with country and area code, and pick Call.",
          "Save. Don't start the number with 0 — that can break the link.",
        ],
        es: [
          "Edite la página y seleccione el texto o el botón que desea enlazar — por ejemplo su número de teléfono o un botón “Llámenos”.",
          "En el editor de enlaces, elija Teléfono, ingrese su número con el código de país y de área, y elija Llamar.",
          "Guarde. No empiece el número con 0 — eso puede dañar el enlace.",
        ],
      },
    },
    social_links: {
      url: "https://support.squarespace.com/hc/en-us/articles/205814468-Social-Links-Blocks",
      verifiedAt: V,
      steps: {
        en: [
          "Edit a page (or your footer) and click Add Block or an insert point, then Social links.",
          "Add your profile links in the block's Content tab.",
          "Save.",
        ],
        es: [
          "Edite una página (o su pie de página) y haga clic en Agregar bloque o en un punto de inserción, luego en Enlaces sociales.",
          "Agregue los enlaces de sus perfiles en la pestaña Contenido del bloque.",
          "Guarde.",
        ],
      },
    },
    speed: {
      url: "https://support.squarespace.com/hc/en-us/articles/360022529371-Reducing-your-page-size-for-faster-loading",
      verifiedAt: V,
      steps: {
        en: [
          "Keep each page under about 60 blocks and each gallery under 50 images.",
          "If a page is over 5 MB, remove some content or upload smaller images.",
          "Save, then re-check your website here.",
        ],
        es: [
          "Mantenga cada página por debajo de unos 60 bloques y cada galería por debajo de 50 imágenes.",
          "Si una página pesa más de 5 MB, quite algo de contenido o suba imágenes más pequeñas.",
          "Guarde y vuelva a revisar su sitio web aquí.",
        ],
      },
    },
  },
  godaddy: {
    seo_meta: {
      // GoDaddy's own site (its resources section); its Help Center had no
      // article for this setting.
      url: "https://www.godaddy.com/resources/skills/how-to-improve-seo-fast",
      verifiedAt: V,
      steps: {
        en: [
          "In the GoDaddy website builder, open Settings (cog icon) → Get found on Google.",
          "Edit the page title and the description (keep it to about 155 characters).",
          "Publish.",
        ],
        es: [
          "En el creador de sitios web de GoDaddy, abra Configuración (icono de engranaje) → Get found on Google.",
          "Edite el título de la página y la descripción (de unos 155 caracteres como máximo).",
          "Publique.",
        ],
      },
    },
    add_page: {
      url: "https://www.godaddy.com/help/add-a-page-or-private-page-to-my-website-24072",
      verifiedAt: V,
      steps: {
        en: [
          "Go to your GoDaddy product page, expand Websites + Marketing and select Manage next to your site.",
          "Open the website builder and add a new page (up to 50 pages).",
          "Add your text, then Publish.",
        ],
        es: [
          "Vaya a su página de productos de GoDaddy, expanda Websites + Marketing y seleccione Administrar junto a su sitio.",
          "Abra el creador de sitios web y agregue una página nueva (hasta 50 páginas).",
          "Agregue su texto y publique.",
        ],
      },
    },
    phone_link: {
      url: "https://www.godaddy.com/help/edit-action-buttons-on-my-website-24710",
      verifiedAt: V,
      steps: {
        en: [
          "In the website builder, open the section with your action button (usually the top of the homepage).",
          "Select the button and turn on Show Action Button in the right panel, then set it to contact you.",
          "Publish.",
        ],
        es: [
          "En el creador de sitios web, abra la sección con su botón de acción (normalmente la parte superior de la página principal).",
          "Seleccione el botón y active Mostrar botón de acción en el panel derecho; luego configúrelo para que lo contacten.",
          "Publique.",
        ],
      },
    },
    social_links: {
      url: "https://www.godaddy.com/help/connect-to-social-media-32406",
      verifiedAt: V,
      steps: {
        en: [
          "In the website builder, add a section and choose the Social Links section type, then Add.",
          "Paste the link to each of your profiles in its field.",
          "Publish.",
        ],
        es: [
          "En el creador de sitios web, agregue una sección y elija el tipo de sección Enlaces sociales; luego Agregar.",
          "Pegue el enlace de cada uno de sus perfiles en su campo.",
          "Publique.",
        ],
      },
    },
  },
  shopify: {
    ssl: {
      url: "https://help.shopify.com/en/manual/domains/managing-domains/secure-connections",
      verifiedAt: V,
      steps: {
        en: [
          "Shopify provides SSL (TLS) certificates for free and turns them on for your domains.",
          "In your Shopify admin, open Domains and check that your domain shows as connected (a new domain can take up to 48 hours).",
          "Re-check your website here once it's connected.",
        ],
        es: [
          "Shopify ofrece certificados SSL (TLS) gratis y los activa para sus dominios.",
          "En el administrador de Shopify, abra Dominios y compruebe que su dominio aparezca como conectado (un dominio nuevo puede tardar hasta 48 horas).",
          "Vuelva a revisar su sitio web aquí cuando esté conectado.",
        ],
      },
      limitation: {
        en: "Shopify doesn't accept SSL certificates from other companies — only its own free one.",
        es: "Shopify no acepta certificados SSL de otras empresas — solo el suyo, que es gratuito.",
      },
    },
    seo_meta: {
      url: "https://help.shopify.com/en/manual/promoting-marketing/seo/adding-keywords",
      verifiedAt: V,
      steps: {
        en: [
          "Homepage: in your Shopify admin, go to Online Store → Preferences and fill in the title and meta description.",
          "Other pages: go to Online Store → Pages, open the page and click Edit website SEO, then fill in the page title (60 characters or fewer) and description.",
          "Save.",
        ],
        es: [
          "Página principal: en el administrador de Shopify, vaya a Tienda online → Preferencias y complete el título y la meta descripción.",
          "Otras páginas: vaya a Tienda online → Páginas, abra la página y haga clic en Editar SEO del sitio web; luego complete el título (60 caracteres o menos) y la descripción.",
          "Guarde.",
        ],
      },
    },
  },
  wordpress: {
    seo_meta: {
      url: "https://wordpress.com/support/seo/seo-tools/",
      verifiedAt: V,
      steps: {
        en: [
          "On WordPress.com, open your site's SEO tools and fill in the front page meta description.",
          "On a self-hosted WordPress site, your web person adds the title and description with the site's SEO plugin.",
        ],
        es: [
          "En WordPress.com, abra las herramientas de SEO de su sitio y complete la meta descripción de la página principal.",
          "En un sitio WordPress autoalojado, su encargado web agrega el título y la descripción con el plugin de SEO del sitio.",
        ],
      },
      limitation: {
        en: "WordPress itself has no meta description field: it comes from an SEO plugin, or WordPress.com's SEO tools (custom title tags need a higher WordPress.com plan).",
        es: "WordPress por sí solo no tiene un campo de meta descripción: viene de un plugin de SEO o de las herramientas de SEO de WordPress.com (los títulos personalizados requieren un plan superior de WordPress.com).",
      },
    },
    social_links: {
      url: "https://wordpress.org/documentation/article/social-icons/",
      verifiedAt: V,
      steps: {
        en: [
          "In the block editor (or the Site Editor, for your header or footer), add a Social Icons block.",
          "Add an icon for each profile and paste its link.",
          "Save or Update.",
        ],
        es: [
          "En el editor de bloques (o el Editor del sitio, para su encabezado o pie de página), agregue un bloque Iconos sociales.",
          "Agregue un icono para cada perfil y pegue su enlace.",
          "Guarde o actualice.",
        ],
      },
    },
  },
  square: {
    social_links: {
      url: "https://squareup.com/help/gb/en/article/6996-add-social-icons-for-facebook-twitter-instagram-and-more",
      verifiedAt: V,
      steps: {
        en: [
          "In the Square Online site editor, select your footer.",
          "Turn on the social icons, pick the networks to show and enter your usernames (an icon only appears once its username is filled in).",
          "Publish.",
        ],
        es: [
          "En el editor del sitio de Square Online, seleccione su pie de página.",
          "Active los iconos sociales, elija las redes que quiere mostrar e ingrese sus nombres de usuario (cada icono solo aparece cuando su nombre de usuario está completo).",
          "Publique.",
        ],
      },
    },
  },
  google_sites: {
    add_page: {
      url: "https://support.google.com/sites/answer/98216",
      verifiedAt: V,
      steps: {
        en: [
          "Open your site in Google Sites and open the Pages panel on the right.",
          "Add a page and name it — for example “About” or “Services”.",
          "Add your text, then click Publish.",
        ],
        es: [
          "Abra su sitio en Google Sites y abra el panel Páginas a la derecha.",
          "Agregue una página y póngale nombre — por ejemplo “Quiénes somos” o “Servicios”.",
          "Agregue su texto y haga clic en Publicar.",
        ],
      },
    },
    social_links: {
      url: "https://support.google.com/sites/answer/90538",
      verifiedAt: V,
      steps: {
        en: [
          "On the right, click Insert → Social links.",
          "Add the link to each profile — Google Sites adds the icons for popular networks.",
          "Click Insert, then Publish.",
        ],
        es: [
          "A la derecha, haga clic en Insertar → Enlaces sociales.",
          "Agregue el enlace de cada perfil — Google Sites agrega los iconos de las redes más populares.",
          "Haga clic en Insertar y luego en Publicar.",
        ],
      },
    },
    edit_text: {
      url: "https://support.google.com/sites/answer/90538",
      verifiedAt: V,
      steps: {
        en: ["Open your site in Google Sites and click the text you want to change.", "Edit it, then click Publish."],
        es: ["Abra su sitio en Google Sites y haga clic en el texto que quiere cambiar.", "Edítelo y haga clic en Publicar."],
      },
    },
    seo_meta: {
      url: "https://support.google.com/sites/answer/98216",
      verifiedAt: V,
      steps: {
        en: [
          "Give each page a clear name in the Pages panel — for example “Services” rather than “Page 2”.",
          "Start each page with a sentence that says what you do and where.",
          "Click Publish.",
        ],
        es: [
          "Ponga a cada página un nombre claro en el panel Páginas — por ejemplo “Servicios” en lugar de “Página 2”.",
          "Empiece cada página con una frase que diga qué hace y dónde.",
          "Haga clic en Publicar.",
        ],
      },
      limitation: {
        en: "Google Sites has no setting for a page's search title or meta description. The closest option: clear page names and a first sentence that says what you do.",
        es: "Google Sites no tiene una opción para el título de búsqueda ni la meta descripción de una página. Lo más parecido: nombres de página claros y una primera frase que diga a qué se dedica.",
      },
    },
  },
  webflow: {
    seo_meta: {
      url: "https://university.webflow.com/videos/seo-tools-in-webflow",
      verifiedAt: V,
      steps: {
        en: [
          "In the Webflow Designer, open the Pages panel, hover the page and click its settings (cog).",
          "Under SEO settings, fill in the Title tag and the Meta description.",
          "Save, then Publish.",
        ],
        es: [
          "En el Webflow Designer, abra el panel Pages, pase el cursor sobre la página y haga clic en su configuración (engranaje).",
          "En SEO settings, complete el Title tag y la Meta description.",
          "Guarde y publique.",
        ],
      },
    },
  },
  duda: {
    seo_meta: {
      url: "https://support.duda.co/hc/en-us/articles/26519956078103-Site-SEO-AEO-Settings",
      verifiedAt: V,
      steps: {
        en: [
          "In the Duda editor, open the page's settings and choose Edit Page SEO.",
          "Fill in the page title (about 60 characters) and description (about 160 characters).",
          "Save, then republish the site.",
        ],
        es: [
          "En el editor de Duda, abra la configuración de la página y elija Edit Page SEO.",
          "Complete el título de la página (unos 60 caracteres) y la descripción (unos 160 caracteres).",
          "Guarde y vuelva a publicar el sitio.",
        ],
      },
    },
  },
};

/** The guide task for one fix (a check, and the missing item when known);
 * null when there's nothing an owner does in a site editor (no website
 * at all, a hacked site, the phone-layout tag). */
export function guideTaskFor(checkId: string, gap: string | null): GuideTask | null {
  switch (checkId) {
    case "website.https":
      return "ssl";
    case "website.performance_mobile":
      return "speed";
    case "website.content_depth":
      if (gap === "title" || gap === "meta") return "seo_meta";
      if (gap === "viewport") return null;
      return "edit_text";
    case "website.contact_conversion":
      return "phone_link";
    case "website.about_presence":
    case "website.services_presence":
      return "add_page";
    case "website.social_links":
      return "social_links";
    case "website.info_consistency":
    case "website.notice_freshness":
    case "website.site_freshness":
      return "edit_text";
    default:
      return null;
  }
}

/** The builder's guide for a fix, or null (→ the generic guide). */
export function builderGuideFor(builder: WebsiteBuilderId | null, checkId: string, gap: string | null): BuilderGuide | null {
  if (!builder) return null;
  const task = guideTaskFor(checkId, gap);
  return task ? BUILDER_GUIDES[builder]?.[task] ?? null : null;
}

/** What to ask a web person for, per check (and missing item). */
const ASK: Record<string, Text> = {
  "website.https": {
    en: "make the site load over HTTPS: install a free SSL certificate (for example Let's Encrypt) and redirect every http:// address to https://",
    es: "hacer que el sitio cargue con HTTPS: instalar un certificado SSL gratuito (por ejemplo Let's Encrypt) y redirigir cada dirección http:// a https://",
  },
  "website.performance_mobile": {
    en: "speed up the site on phones: compress and resize large images, remove unused scripts and plugins, and turn on caching. PageSpeed Insights (pagespeed.web.dev) shows exactly what's slow",
    es: "hacer el sitio más rápido en teléfonos: comprimir y reducir las imágenes grandes, quitar scripts y plugins que no se usan y activar la caché. PageSpeed Insights (pagespeed.web.dev) muestra exactamente qué es lento",
  },
  "website.content_depth:title": {
    en: "add a clear page title (the <title> tag) to the homepage that says what we do and where",
    es: "agregar un título de página claro (la etiqueta <title>) a la página principal que diga qué hacemos y dónde",
  },
  "website.content_depth:meta": {
    en: "add a meta description (about 150 characters) to the homepage that says what we do and where",
    es: "agregar una meta descripción (de unos 150 caracteres) a la página principal que diga qué hacemos y dónde",
  },
  "website.content_depth:headings": {
    en: "add clear headings (H1 and H2) for the homepage's main sections",
    es: "agregar encabezados claros (H1 y H2) a las secciones principales de la página principal",
  },
  "website.content_depth:thin": {
    en: "add more real text to the homepage: what we sell or do, where we are, our hours, and why to choose us",
    es: "agregar más texto real a la página principal: qué vendemos o hacemos, dónde estamos, nuestro horario y por qué elegirnos",
  },
  "website.content_depth:viewport": {
    en: 'add the mobile viewport tag (<meta name="viewport" content="width=device-width, initial-scale=1">) so the site fits phone screens',
    es: 'agregar la etiqueta viewport para móviles (<meta name="viewport" content="width=device-width, initial-scale=1">) para que el sitio se ajuste a las pantallas de teléfono',
  },
  "website.content_depth": {
    en: "add more real text and a clear title and description to the homepage",
    es: "agregar más texto real y un título y una descripción claros a la página principal",
  },
  "website.contact_conversion:contact": {
    en: "make our phone number a tap-to-call link (tel:) near the top of the homepage",
    es: "convertir nuestro número de teléfono en un enlace para llamar (tel:) cerca de la parte superior de la página principal",
  },
  "website.contact_conversion:cta": {
    en: "add a clear button near the top of the homepage, like “Call us”, “Get directions” or “Book now”",
    es: "agregar un botón claro cerca de la parte superior de la página principal, como “Llámenos”, “Cómo llegar” o “Reserve ahora”",
  },
  "website.contact_conversion": {
    en: "make our phone number a tap-to-call link and add a clear “Call us” button near the top of the homepage",
    es: "convertir nuestro número en un enlace para llamar y agregar un botón claro “Llámenos” cerca de la parte superior de la página principal",
  },
  "website.about_presence": {
    en: "add an About page (or section) with our story: who we are and how long we've been in business",
    es: "agregar una página (o sección) Quiénes somos con nuestra historia: quiénes somos y cuánto tiempo llevamos en el negocio",
  },
  "website.services_presence": {
    en: "add a Services (or Menu / Products) page listing what we offer, with prices where we can",
    es: "agregar una página de Servicios (o Menú / Productos) con lo que ofrecemos y los precios cuando sea posible",
  },
  "website.social_links": {
    en: "add links to our social media profiles in the header or footer",
    es: "agregar enlaces a nuestros perfiles de redes sociales en el encabezado o el pie de página",
  },
  "website.security": {
    en: "check the site for hacked or spam content and clean it up — PostScore found signs of it — then ask Google to review the site in Search Console if it was flagged",
    es: "revisar el sitio en busca de contenido hackeado o spam y limpiarlo — PostScore encontró señales — y luego pedir a Google que revise el sitio en Search Console si fue marcado",
  },
  "website.info_consistency": {
    en: "update the address, phone number and hours on the website so they match our Google listing exactly",
    es: "actualizar la dirección, el teléfono y el horario del sitio web para que coincidan exactamente con nuestra ficha de Google",
  },
  "website.notice_freshness": {
    en: "remove or update the old notice on the website (for example a past holiday or event)",
    es: "quitar o actualizar el aviso antiguo del sitio web (por ejemplo un feriado o evento pasado)",
  },
  "website.site_freshness": {
    en: "update the website with something current — this season's hours, a new photo or an announcement — so it doesn't look abandoned",
    es: "actualizar el sitio web con algo reciente — el horario de esta temporada, una foto nueva o un anuncio — para que no parezca abandonado",
  },
};

/** The generic "ask your web person" request for a fix (null when there's
 * nothing to ask, e.g. no website at all — the starter site covers it). */
export function webPersonAsk(checkId: string, gap: string | null, locale: "en" | "es"): string | null {
  const text = (gap ? ASK[`${checkId}:${gap}`] : undefined) ?? ASK[checkId];
  return text ? text[locale] : null;
}

/** The copyable message for a web person. */
export function webPersonMessage(asks: string[], siteUrl: string | null, locale: "en" | "es"): string {
  const site = siteUrl ? ` (${siteUrl})` : "";
  const list = asks.length === 1 ? asks[0] : asks.map((a, i) => `${i + 1}. ${a}`).join("\n");
  return locale === "es"
    ? `Hola — PostScore revisó nuestro sitio web${site} y encontró algo que arreglar. ¿Podría ${asks.length === 1 ? list : `hacer lo siguiente?\n${list}`}${asks.length === 1 ? "?" : ""}\n¡Gracias!`
    : `Hi — PostScore checked our website${site} and found something to fix. Could you ${asks.length === 1 ? list : `do the following?\n${list}`}${asks.length === 1 ? "?" : ""}\nThanks!`;
}

/** Every check a guide can be shown for (has_website is covered by the
 * starter site). */
export function hasGuide(check: Pick<CheckResult, "id">): boolean {
  return check.id.startsWith("website.") && check.id !== "website.has_website";
}
