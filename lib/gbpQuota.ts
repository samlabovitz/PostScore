// Every Google Business Profile API call goes through gbpFetch: it counts
// the call (for the log) and keeps this server process under
// GBP_CALLS_PER_MINUTE — well inside Google's 300 requests/min per
// project, even when a bulk re-scan runs alongside owners connecting.
// Per process (a serverless instance or a script run), which is the only
// place a count can live without a shared store.

export const GBP_CALLS_PER_MINUTE = 120;
const WINDOW_MS = 60_000;

const recent: number[] = [];
let total = 0;

export function gbpCallsThisProcess(): number {
  return total;
}

/** For tests. */
export function resetGbpQuota() {
  recent.length = 0;
  total = 0;
}

async function takeSlot(now: () => number, sleep: (ms: number) => Promise<void>) {
  for (;;) {
    const t = now();
    while (recent.length && t - recent[0] >= WINDOW_MS) recent.shift();
    if (recent.length < GBP_CALLS_PER_MINUTE) {
      recent.push(t);
      total++;
      return;
    }
    await sleep(WINDOW_MS - (t - recent[0]) + 5);
  }
}

/** A fetch that counts each call into `counter.calls` and waits for a slot. */
export function gbpFetch(
  counter: { calls: number },
  fetchImpl: typeof fetch = fetch,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = { now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    await takeSlot(clock.now, clock.sleep);
    counter.calls++;
    return fetchImpl(input, init);
  }) as typeof fetch;
}

/** "[gbp-calls] reply-check: 2 calls (process total 14)" — no IDs beyond the step. */
export function logGbpCalls(step: string, counter: { calls: number }) {
  console.info(`[gbp-calls] ${step}: ${counter.calls} call${counter.calls === 1 ? "" : "s"} (process total ${total})`);
}
