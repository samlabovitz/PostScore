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

function getApiKey(): string {
  if (typeof window !== "undefined") {
    throw new Error("Anthropic API calls must run on the server.");
  }
  const key = process.env.ANTHROPIC_API_KEY;
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
    const body = await res.text();
    throw new Error(`Anthropic API request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as RawMessageResponse;
  const text = data.content?.find((block) => block.type === "text")?.text;
  if (!text) {
    throw new Error("Anthropic API returned no text content.");
  }
  return text;
}
