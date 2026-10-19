// "Confused? Ask PostAI →" on the designers: a link to the Overview with
// an allowlisted question id (never free text in the URL). The Overview
// opens PostAI with that question typed in — the owner presses Send.

import type { MessageKey } from "@/lib/i18n";

export const POSTAI_ASK_QUESTIONS = {
  referral_cards: "dashboard.postaiAsk.question.referralCards",
  coupon_cards: "dashboard.postaiAsk.question.couponCards",
  review_sign: "dashboard.postaiAsk.question.reviewSign",
} as const satisfies Record<string, MessageKey>;

export type PostaiAskId = keyof typeof POSTAI_ASK_QUESTIONS;

export function isPostaiAskId(value: unknown): value is PostaiAskId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POSTAI_ASK_QUESTIONS, value);
}

export function postaiAskHref(businessId: string, id: PostaiAskId): string {
  return `/business/${encodeURIComponent(businessId)}?ask=${id}`;
}
