// Request-scoped memoization for read-only data loaders: within ONE server
// render, a second call with the same arguments reuses the first call's
// result instead of querying again (the Overview's PostAI loader, the
// local benchmark and the page itself all ask for the same business,
// score history and competitor scan). React's cache() is scoped to a
// single request, so nothing is shared between requests or users.
// Outside a server render (scripts, tests, server actions called from
// the browser) it simply calls the loader.

import * as React from "react";

type AsyncFn<A extends unknown[], R> = (...args: A) => Promise<R>;

export function requestCache<A extends unknown[], R>(fn: AsyncFn<A, R>): AsyncFn<A, R> {
  const reactCache = (React as unknown as { cache?: <F>(f: F) => F }).cache;
  return typeof reactCache === "function" ? reactCache(fn) : fn;
}
