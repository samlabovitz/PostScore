import { redirect } from "next/navigation";

/** Google Profile is a tab inside Growth now (docs/product-structure.md). */
export default function GoogleProfilePage({ params }: { params: { id: string } }) {
  redirect(`/business/${params.id}/growth?tab=google-profile`);
}
