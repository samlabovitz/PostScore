import { afterEach, describe, expect, test, vi } from "vitest";
import { saveFailureReason, withDevReason } from "./saveFailure";

// A short reason for a failed save, for development only.
describe("save failure reasons", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("the real errors: missing column (select and update), missing table, RLS, constraint, no row", () => {
    const col = (e: { code?: string; message?: string } | null) => saveFailureReason(e, "starter_site_hours", "supabase/hours.sql");
    expect(col({ code: "PGRST204", message: "Could not find the 'starter_site_hours' column of 'businesses' in the schema cache" })).toBe("column starter_site_hours missing — run supabase/hours.sql");
    expect(col({ code: "42703", message: "column businesses.starter_site_hours does not exist" })).toBe("column starter_site_hours missing — run supabase/hours.sql");
    expect(col({ code: "42P01", message: 'relation "public.businesses" does not exist' })).toBe("table missing");
    expect(col({ code: "42501", message: "new row violates row-level security policy" })).toBe("blocked by RLS policy");
    expect(col({ code: "23514", message: "violates check constraint" })).toBe("rejected by a constraint (23514)");
    expect(col(null)).toBe("no row updated — not your business, or blocked by RLS");
  });

  test("dev shows the reason; production keeps only the friendly message", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(withDevReason("Couldn't be saved.", "table missing")).toBe("Couldn't be saved. (table missing)");
    vi.stubEnv("NODE_ENV", "production");
    expect(withDevReason("Couldn't be saved.", "table missing")).toBe("Couldn't be saved.");
  });
});
