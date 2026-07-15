import { notFound } from "next/navigation";
import { BountyDetailScreen } from "@/components/dragnet/BountyDetailScreen";
import { getBountyDetail } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getBountyDetail(id);
  if (result === null) {
    notFound();
  }
  return <BountyDetailScreen detail={result.detail} source={result.source} />;
}
