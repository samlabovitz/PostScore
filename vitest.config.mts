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
    },
  },
  test: {
    environment: "node",
  },
});
