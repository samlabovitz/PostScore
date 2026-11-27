// Day 25B, "one reply tool": run the background drafts once, on demand (this week's post, the answers'
// description and the review replies) — the
// SAME code the daily job runs (lib/replyBatch.server.ts writeReplyDrafts,
// app/api/cron/reply-drafts), so localhost doesn't wait for 10:00 UTC.
// Reads the business's unanswered reviews live from Business Profile (never
// Places), writes PostAI's drafts to review_reply_batch (our own text, never
// review text), keeps drafts that are still current or edited by the owner,
// and removes rows for reviews that now have a reply. Posts nothing to Google.
//
// Dev only: refuses to run with NODE_ENV=production.
//
//   npx --no-install tsx --env-file=.env.local scripts/draft-replies.ts --business=<id>
//   npx --no-install tsx --env-file=.env.local scripts/draft-replies.ts --business=<id> --dry   # what it would do
//   --plan=grow|premium   which plan to draft for (default premium): Premium drafts every unanswered review,
//                         Grow up to this week's allowance, Free none.
import { allowServerOnly } from "./allowServerOnly";

setTimeout(() => {
  console.error("timed out");
  process.exit(1);
}, 5 * 60_000);

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("dev only: refusing to run with NODE_ENV=production");
  const id = process.argv.find((a) => a.startsWith("--business="))?.slice("--business=".length);
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("usage: draft-replies.ts --business=<business id> [--plan=grow|premium] [--dry]");
  const plan = process.argv.find((a) => a.startsWith("--plan="))?.slice("--plan=".length) ?? "premium";
  const { isPlan } = await import("@/lib/plan");
  if (!isPlan(plan)) throw new Error(`unknown plan "${plan}"`);
  allowServerOnly();
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: biz } = await admin.from("businesses").select("id").eq("id", id).maybeSingle();
  if (!biz) throw new Error(`no business ${id}`);
  // Business names come from Google and aren't saved: the id it is.
  const name = id;
  if (process.argv.includes("--dry")) {
    const { count } = await admin.from("review_reply_batch").select("review_id", { count: "exact", head: true }).eq("business_id", id);
    console.log(`DRY RUN · ${name}: ${count ?? 0} saved drafts now. Nothing written. Re-run without --dry to draft.`);
    process.exit(0);
  }
  const { writeReplyDrafts, loadSavedReplyDrafts } = await import("@/lib/replyBatch.server");
  const { loadReplyVoice } = await import("@/lib/reviewReplyDraft.server");
  const started = Date.now();
  // The same as the daily job: this week's post and the answers' description first, then the replies.
  const { writeWeekDrafts } = await import("@/lib/postDrafts.server");
  const w = await writeWeekDrafts(admin, id, plan);
  console.log(`${name} (${plan}): post draft ${w.post}, description draft ${w.description}`);
  const r = await writeReplyDrafts(admin, id, plan);
  if (r.status !== "ok") {
    console.log(`${name}: skipped (${r.reason})`);
    process.exit(1);
  }
  const saved = await loadSavedReplyDrafts(admin, id, await loadReplyVoice(admin, id));
  const drafts = saved.ok ? saved.drafts : [];
  const ready = drafts.filter((d) => d.status === "ready" && d.reply).length;
  console.log(`${name} (${plan}): ${r.written} written, ${r.kept} kept, ${r.removed} removed · ${ready} of ${drafts.length} ready · ${Math.round((Date.now() - started) / 1000)} s`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
