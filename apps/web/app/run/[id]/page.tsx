import { notFound } from "next/navigation";
import { WorkerRunScreen } from "@/components/dragnet/WorkerRunScreen";
import { getBountyDetail } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The run screen shows the bounty facts but not the worker field log, so skip the
  // event scan that builds it: it keeps this page's render fast (the sweep itself reads
  // the target list separately, client-side).
  const result = await getBountyDetail(id, { includeFieldLog: false });
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
