// A short, plain reason a save failed ("column missing — run
// supabase/hours.sql"), for development only: the actions log it to the
// dev server terminal, and the UI appends it to the friendly message when
// not in production. Production users only ever see the friendly message.

export interface SupabaseErrorLike {
  code?: string;
  message?: string;
}

/** The short reason for a Supabase error on `column` (sqlFile: the fix). */
export function saveFailureReason(error: SupabaseErrorLike | null | undefined, column: string, sqlFile: string): string {
  if (!error) return "no row updated — not your business, or blocked by RLS";
  const code = error.code ?? "";
  const message = error.message ?? "";
  if (code === "42703" || code === "PGRST204" || message.includes(column)) return `column ${column} missing — run ${sqlFile}`;
  if (code === "42P01" || /relation .* does not exist/.test(message)) return "table missing";
  if (code === "42501" || /row-level security|permission denied/i.test(message)) return "blocked by RLS policy";
  if (code === "23514" || code === "23502" || code === "22P02") return `rejected by a constraint (${code})`;
  return `${code || "error"}: ${message}`.slice(0, 160);
}

/** Dev only: the friendly message plus the short reason. */
export function withDevReason(friendly: string, reason: string | undefined): string {
  return process.env.NODE_ENV !== "production" && reason ? `${friendly} (${reason})` : friendly;
}

/** Dev only: one line in the dev server terminal. */
export function logSaveFailure(action: string, reason: string, error?: SupabaseErrorLike | null): void {
  if (process.env.NODE_ENV === "production") return;
  console.warn(`[${action}] save failed: ${reason}${error ? ` (${error.code ?? "?"}: ${error.message ?? ""})` : ""}`);
}
