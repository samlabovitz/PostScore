// Scripts run outside Next's server build, where a module's
// `import "server-only"` guard throws. Call this before a dynamic
// import() of server code (the same workaround scripts/rescan-all.ts uses).
import { createRequire } from "module";

let installed = false;
export function allowServerOnly(): void {
  if (installed) return;
  installed = true;
  const Module = createRequire(import.meta.url)("module") as { _load: (request: string, ...rest: unknown[]) => unknown };
  const originalLoad = Module._load;
  Module._load = function (this: unknown, request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, ...rest);
  };
}
