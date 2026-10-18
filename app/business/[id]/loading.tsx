import { PageSkeleton } from "@/components/layout/PageSkeleton";

// Shown the instant a link to this page is clicked (and prefetched behind
// links), while the page's data loads.
export default function Loading() {
  return <PageSkeleton variant="overview" />;
}
