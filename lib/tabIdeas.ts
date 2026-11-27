// The Google pages' ideas and this week's to-dos, from a page's props — pure,
// so the server can count this week's plan too (the Overview's Growth line,
// Day 25B step 6). components/gbp/googleTabParts.tsx useTabIdeas wraps it.

import type { GoogleProfileTabProps } from "@/components/gbp/googleTabParts";
import { ideaTypeOf, listingIdeas, townOf, type Idea } from "@/lib/listingIdeas";
import { recommendations, type Rec, type RecInputs } from "@/lib/googleRecommendations";
import { answersPlan } from "@/lib/googleAnswers";

export function tabIdeasFor(props: GoogleProfileTabProps, timeZone: string, now: number): { ideas: Idea[]; recs: Rec[]; type: ReturnType<typeof ideaTypeOf> } {
  const extras = props.extras ?? null;
  const type = ideaTypeOf(props.nicheId ?? null, extras?.categories ?? props.listing.categories ?? []);
  const ideas = listingIdeas({
    businessId: props.businessId,
    now,
    type,
    months: props.insights ?? [],
    listing: extras ? { services: extras.services, categories: extras.categories, description: extras.description ?? null, specialPeriods: extras.specialPeriods, attributeIds: extras.attributeIds ?? null, details: extras.details ?? null } : null,
    photos: props.media?.photos ?? null,
    posts: props.media?.posts ?? null,
    messagingOn: props.messagingOn,
    bookingTurnOn: props.booking?.tracking.kind === "turn_on" ? { provider: props.booking.tracking.provider } : null,
    town: townOf(props.business?.address),
  });
  const details = ideas.find((i): i is Extract<Idea, { id: "details" }> => i.id === "details");
  const services = ideas.find((i): i is Extract<Idea, { id: "services" }> => i.id === "services");
  const input: RecInputs = {
    type,
    now,
    timeZone,
    replies: props.replyCounts ? { replied: props.replyCounts.replied, inWindow: props.replyCounts.reviewsInWindow } : null,
    photos: props.media?.photos ?? null,
    posts: props.media?.posts ?? null,
    months: props.insights ?? [],
    specialPeriods: extras?.specialPeriods ?? null,
    description: extras && extras.description !== undefined ? extras.description : undefined,
    missingDetails: details?.missing ?? [],
    missingServices: services?.missing.map((m) => m.service) ?? [],
    // Day 23E: what Google needs to answer customers' questions (unread parts are skipped).
    answers: extras ? answersPlan({ description: extras.description, services: extras.services, pricedServices: extras.pricedServices, details: extras.details ?? null }) : null,
  };
  return { ideas, recs: recommendations(input), type };
}

/** This week's to-dos: the replies, photos, the post and the answers. */
export function weekKinds(recs: Rec[]): Rec[] {
  return recs.filter((r) => r.kind === "replies" || r.kind === "photos" || r.kind === "posts" || r.kind === "answers");
}
