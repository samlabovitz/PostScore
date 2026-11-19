"use client";

// Day 23 2d-5: a business's name and address in a long list (the home list,
// Settings → Businesses — lib/lazyNames.ts). Names already known come with
// the page; the rest load as the row scrolls into view, batched, at most 25
// live reads per page view. Past that, rows keep a small placeholder and
// "Load more names" (at the first waiting row) reads the next 25. "Your
// business" only when Google couldn't be read for that row — never a saved value.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { loadBusinessNames } from "@/app/actions/businesses";
import { firstWaiting, LIVE_NAMES_PER_VIEW, type ListName } from "@/lib/lazyNames";
import { t, type Locale } from "@/lib/i18n";

type Loader = {
  names: Record<string, ListName>;
  /** The row "Load more names" sits before; null when none waits. */
  waitingAt: string | null;
  loading: boolean;
  register: (id: string) => void;
  request: (id: string) => void;
  loadMore: () => void;
};
const LazyNames = createContext<Loader | null>(null);

/** One per list: batches the rows seen and keeps the view's live-read budget. */
export function LazyNamesProvider({ children }: { children: ReactNode }) {
  const [names, setNames] = useState<Record<string, ListName>>({});
  const [waiting, setWaiting] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const left = useRef(LIVE_NAMES_PER_VIEW);
  const order = useRef<string[]>([]);
  const queue = useRef<string[]>([]);
  const asked = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    timer.current = null;
    // In list order, so the budget goes to the rows nearest the top.
    const ids = order.current.filter((id) => queue.current.includes(id));
    queue.current = [];
    if (ids.length === 0) return;
    setLoading(true);
    const result = await loadBusinessNames(ids, left.current).catch(() => null);
    setLoading(false);
    if (result?.status === "ok") left.current = Math.max(0, left.current - result.liveUsed);
    const got = result?.status === "ok" ? result.names : {};
    const read = ids.filter((id) => got[id] && !got[id].notRead);
    setNames((prev) => ({ ...prev, ...Object.fromEntries(read.map((id) => [id, got[id]])) }));
    // Not read (budget used, or the call failed): keep the placeholder until "Load more names".
    setWaiting((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (read.includes(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const enqueue = useCallback(
    (ids: string[]) => {
      queue.current.push(...ids);
      if (!timer.current) timer.current = setTimeout(flush, 120);
    },
    [flush]
  );

  const register = useCallback((id: string) => {
    if (!order.current.includes(id)) order.current.push(id);
  }, []);

  const request = useCallback(
    (id: string) => {
      if (asked.current.has(id)) return;
      asked.current.add(id);
      enqueue([id]);
    },
    [enqueue]
  );

  const loadMore = useCallback(() => {
    left.current = LIVE_NAMES_PER_VIEW;
    enqueue(order.current.filter((id) => waiting.has(id)));
  }, [enqueue, waiting]);

  return (
    <LazyNames.Provider value={{ names, waitingAt: firstWaiting(order.current, waiting), loading, register, request, loadMore }}>{children}</LazyNames.Provider>
  );
}

/** "Load more names", shown before the first row still waiting for its name. */
export function LoadMoreNames({ beforeId, locale, as: Tag = "div", className }: { beforeId: string; locale: Locale; as?: "div" | "li"; className?: string }) {
  const loader = useContext(LazyNames);
  if (!loader || loader.waitingAt !== beforeId) return null;
  return (
    <Tag className={className}>
      <button
        type="button"
        onClick={loader.loadMore}
        disabled={loader.loading}
        data-testid="load-more-names"
        className="inline-flex items-center rounded-lg border border-paper-deep bg-white px-[15px] py-[7px] text-[13px] font-medium text-ink hover:border-ink-soft disabled:opacity-60"
      >
        {t(locale, "dashboard.home.loadMoreNames")}
      </button>
    </Tag>
  );
}

export function LazyBusinessName({
  businessId,
  initial,
  locale,
  nameClassName,
  addressClassName,
  /** The line under the name when there's no address: "No address on file" (home list) or none (Settings). */
  noAddressLine = null,
}: {
  businessId: string;
  initial: ListName;
  locale: Locale;
  nameClassName: string;
  addressClassName: string;
  noAddressLine?: string | null;
}) {
  const loader = useContext(LazyNames);
  const ref = useRef<HTMLDivElement>(null);
  const loaded = loader?.names[businessId];
  const shown = initial.notRead ? loaded : initial;

  // Rows register in list order (where "Load more names" goes).
  if (initial.notRead) loader?.register(businessId);

  useEffect(() => {
    if (!initial.notRead || !loader || loaded) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return loader.request(businessId);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loader.request(businessId);
          io.disconnect();
        }
      },
      { rootMargin: "0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [businessId, initial.notRead, loader, loaded]);

  if (!shown) {
    return (
      <div ref={ref} aria-busy="true" data-testid="business-name-loading" className="flex flex-col gap-1.5 py-0.5">
        <span className="block h-3.5 w-40 max-w-full animate-pulse rounded bg-paper-deep" />
        <span className="block h-3 w-56 max-w-full animate-pulse rounded bg-paper" />
      </div>
    );
  }
  const addressLine = shown.address ?? (shown.unavailable ? t(locale, "dashboard.live.unavailable") : shown.name ? noAddressLine : null);
  return (
    <div ref={ref} className="min-w-0">
      <div className={nameClassName}>{shown.name ?? t(locale, "dashboard.home.untitledBusiness")}</div>
      {addressLine && <div className={addressClassName}>{addressLine}</div>}
    </div>
  );
}
