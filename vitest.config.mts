import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Only needed for the .tsx tests under emails/ (server-rendering the
  // React Email templates via @react-email/render) — every other test
  // in this project is plain .ts and unaffected.
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "."),
      // Tests only: Next's "server-only" guard throws outside its server build.
      "server-only": path.resolve(dirname, "test/serverOnlyStub.ts"),
    },
  },
  test: {
    environment: "node",
    // Never a live Google call from a test (test/noLiveGoogle.ts).
    setupFiles: ["test/noLiveGoogle.ts"],
  },
});
