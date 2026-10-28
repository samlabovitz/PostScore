// Google's businessStatus for the owner's own business: OPERATIONAL,
// CLOSED_TEMPORARILY or CLOSED_PERMANENTLY. Pure.
//
// - Permanently closed: an urgent banner, the score "on hold" (not a
//   normal grade), and "Mark your business as open on Google" as the only
//   Growth step — until Google shows it open again.
// - Temporarily closed: an amber banner; the score still shows (the
//   status check is 0).

export type Closure = "temporary" | "permanent" | null;

export function closureOf(status: string | null | undefined): Closure {
  if (status === "CLOSED_PERMANENTLY") return "permanent";
  if (status === "CLOSED_TEMPORARILY") return "temporary";
  return null;
}

/** The score isn't graded while Google shows the business as gone. */
export function scoreOnHold(status: string | null | undefined): boolean {
  return closureOf(status) === "permanent";
}

/** The Growth plan's one step while permanently closed. */
export const MARK_OPEN_STEP_ID = "setup.mark_open";
