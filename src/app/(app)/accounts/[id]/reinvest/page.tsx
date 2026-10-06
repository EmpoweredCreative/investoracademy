import { redirect } from "next/navigation";

/** Reinvest signals now live on the Core Premium page. */
export default async function ReinvestRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/accounts/${id}/core`);
}
