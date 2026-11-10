import { beforeEach, describe, expect, test, vi } from "vitest";

// "Re-check my website" says why it didn't run or didn't finish — the
// real reason under the button, never a generic "failed" that hides it
// (the real JT's Sports Bar & Grill case: a re-check that never saved,
// with nothing on screen saying why).

const getUser = vi.fn(async () => ({ data: { user: { id: "u1" } } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ auth: { getUser } }) }));
const getPlan = vi.fn(async () => "grow");
vi.mock("@/lib/premium", () => ({ getPlan: () => getPlan() }));
const isBusinessArchived = vi.fn(async () => false);
vi.mock("@/lib/businessArchive.server", () => ({ isBusinessArchived: () => isBusinessArchived() }));
const recheckWebsiteWithClient = vi.fn();
vi.mock("@/lib/websiteRecheck.server", () => ({ recheckWebsiteWithClient: () => recheckWebsiteWithClient() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { recheckWebsite } from "@/app/actions/websiteRecheck";
import { recheckFailureMessage } from "./WebsiteRecheck";

beforeEach(() => {
  getPlan.mockResolvedValue("grow");
  isBusinessArchived.mockResolvedValue(false);
  recheckWebsiteWithClient.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the server action returns the real reason", () => {
  test("Free: plan_locked, before any site read", async () => {
    getPlan.mockResolvedValue("free");
    expect(await recheckWebsite("b1")).toEqual({ status: "plan_locked" });
    expect(recheckWebsiteWithClient).not.toHaveBeenCalled();
  });

  test("an archived business: archived", async () => {
    isBusinessArchived.mockResolvedValue(true);
    expect(await recheckWebsite("b1")).toEqual({ status: "archived" });
    expect(recheckWebsiteWithClient).not.toHaveBeenCalled();
  });

  test("a thrown error keeps its message (a server action's thrown error reaches the browser without one)", async () => {
    recheckWebsiteWithClient.mockRejectedValue(new Error("connection reset by the database"));
    expect(await recheckWebsite("b1")).toEqual({ status: "error", message: "connection reset by the database" });
  });
});

describe("the message under the button (EN + ES)", () => {
  const cases = [
    [{ status: "plan_locked" }, "Re-checks are on Grow and Premium. See plans in Settings → Plan & billing.", "Las revisiones están incluidas en Grow y Premium. Vea los planes en Configuración → Plan y facturación."],
    [{ status: "limit_reached", availability: { used: 3, left: 0, allowed: false } }, "You've used today's 3 re-checks — try again tomorrow.", "Ya usó las 3 revisiones de hoy; inténtelo de nuevo mañana."],
    [{ status: "archived" }, "This business is archived. Restore it on the Overview to re-check its website.", "Este negocio está archivado. Restáurelo en el Resumen para volver a revisar su sitio web."],
    [{ status: "error", message: "connection reset by the database" }, "Couldn't re-check your website: connection reset by the database", "No se pudo revisar su sitio web: connection reset by the database"],
  ] as const;
  for (const [result, en, es] of cases) {
    test(result.status, () => {
      expect(recheckFailureMessage(result, "en")).toBe(en);
      expect(recheckFailureMessage(result, "es")).toBe(es);
    });
  }

  test("an error with no message: the general one, never an empty line", () => {
    expect(recheckFailureMessage({ status: "error", message: "" }, "en")).toBe("Couldn't re-check your website — try again in a few minutes. This didn't use a re-check.");
  });
});
