// Server-only. Never import this from a "use client" component — the
// API key must never reach the browser. Thin fetch wrapper around the
// Anthropic Messages API, mirroring lib/google/places.ts's hand-rolled
// style rather than pulling in the SDK for a single call site.

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Haiku 4.5 — the cheapest current Claude model — is deliberately used
// here instead of a Sonnet/Opus model: a pricing-tier assessment from a
// short, structured prompt (see buildPricingPrompt in lib/pricing.ts)
// doesn't need frontier reasoning, and this call can run every time an
// owner clicks "Assess my pricing".
const MODEL = "claude-haiku-4-5-20251001";

/**
 * Strips whitespace and a single matching pair of stray leading/
 * trailing quote characters from a raw env-var value. Harmless/no-op
 * for an already-clean key; fixes the case where some .env tooling, a
 * copy-paste, or a hosting dashboard's env-var UI leaves the value
 * wrapped in literal `"`/`'` characters or padded with whitespace —
 * which Anthropic's API rejects outright as an invalid x-api-key
 * (the literal quote/space characters become part of the header
 * value) rather than something it can tolerate or warn about.
 * Exported so this exact sanitization is directly testable.
 */
export function sanitizeApiKey(raw: string): string {
  let key = raw.trim();
  if (
    key.length >= 2 &&
    ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

function getApiKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("Anthropic API calls must run on the server.");
  }
  const raw = process.env.ANTHROPIC_API_KEY;
  const key = raw ? sanitizeApiKey(raw) : "";
  if (!key || key === "YOUR_KEY_HERE") {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add your real key to .env.local."
    );
  }
  return key;
}

interface RawMessageResponse {
  content?: Array<{ type: string; text?: string }>;
}

/**
 * A failed Anthropic API call, carrying the real technical details
 * structured (HTTP status, the API's own error `type`, and its
 * `request-id` response header, when present) rather than only as text
 * baked into `.message` — so a caller can branch on `status` (e.g. 429
 * rate-limited vs. anything else) without parsing a string, and can log
 * the full real detail server-side while showing the owner a short,
 * honest, translated message instead (see sendAssistantMessage in
 * app/actions/assistant.ts). `.message` itself stays in the original
 * `Anthropic API request failed (${status}): ${body}` shape, so any
 * existing caller that only ever read `.message` (e.g. assessPricing in
 * app/actions/pricing.ts) keeps working unchanged.
 */
export class AnthropicApiError extends Error {
  readonly status: number;
  /** The API's own real error type (e.g. "authentication_error",
   * "rate_limit_error") — null when the response body wasn't valid
   * JSON or didn't carry one. */
  readonly errorType: string | null;
  /** Anthropic's own `request-id` response header — null when absent
   * (e.g. the request never reached Anthropic at all). Worth logging
   * alongside any report to Anthropic support. */
  readonly requestId: string | null;

  constructor(status: number, errorType: string | null, requestId: string | null, rawBody: string) {
    super(`Anthropic API request failed (${status}): ${rawBody}`);
    this.name = "AnthropicApiError";
    this.status = status;
    this.errorType = errorType;
    this.requestId = requestId;
  }
}

/** Real status/type/request-id out of a failed response, for
 * AnthropicApiError above — shared by both call functions below so
 * they parse a failed response identically. `requestId` is read from
 * the response's own header (present on every real Anthropic response,
 * success or failure), not the body. */
async function throwAnthropicApiError(res: Response): Promise<never> {
  const requestId = res.headers.get("request-id");
  const rawBody = await res.text();
  let errorType: string | null = null;
  try {
    const parsed = JSON.parse(rawBody) as { error?: { type?: string } };
    errorType = parsed?.error?.type ?? null;
  } catch {
    // Not JSON (e.g. an upstream proxy error page) — errorType stays
    // null; rawBody is still captured in full for server-side logging.
  }
  throw new AnthropicApiError(res.status, errorType, requestId, rawBody);
}

/**
 * Sends a single-turn message to Claude and returns its full text reply.
 * `system` carries the role/constraints; `userMessage` carries the real
 * data for this call. Throws on any non-2xx response or a reply with no
 * text content — callers decide how to degrade honestly from there
 * (see assessPricing in app/actions/pricing.ts).
 */
export async function callAnthropicMessage(params: {
  system: string;
  userMessage: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: params.maxTokens ?? 400,
      system: params.system,
      messages: [{ role: "user", content: params.userMessage }],
    }),
  });

  if (!res.ok) {
    await throwAnthropicApiError(res);
  }

  const data = (await res.json()) as RawMessageResponse;
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error("Anthropic API returned no text content.");
  }
  return text;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Multi-turn variant of callAnthropicMessage, for the "Ask about your
 * presence" assistant (see app/actions/assistant.ts) — the pricing tool
 * above only ever needs one exchange, but a chat needs the real prior
 * turns sent back on every call so Claude has conversational context.
 * Same model, same honest-error-on-failure behavior; callers are
 * responsible for keeping `messages` short (see MAX_HISTORY_MESSAGES in
 * app/actions/assistant.ts) to keep input tokens — and cost — bounded.
 */
export async function callAnthropicChat(params: {
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: params.maxTokens ?? 400,
      system: params.system,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    await throwAnthropicApiError(res);
  }

  const data = (await res.json()) as RawMessageResponse;
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error("Anthropic API returned no text content.");
  }
  return text;
}
