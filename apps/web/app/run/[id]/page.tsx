import { notFound } from "next/navigation";
import { WorkerRunScreen } from "@/components/dragnet/WorkerRunScreen";
import { getBountyDetail } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getBountyDetail(id);
  if (result === null) {
    notFound();
  }
  const { detail } = result;
  return (
    <WorkerRunScreen
      context={{
        id: detail.id,
        rangeLabel: detail.rangeLabel,
        m: detail.m,
        payout: detail.payout,
        lo: detail.lo.toString(),
        hi: detail.hi.toString(),
      }}
    />
  );
}
