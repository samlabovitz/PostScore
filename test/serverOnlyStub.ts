// Tests run in plain Node, outside Next's server build, where
// `import "server-only"` would throw. Every test resolves it to this
// (vitest.config.mts) — the guard itself is checked in the source
// (lib/clientBoundary.test.ts, lib/gbpConnect.test.tsx).
export {};
