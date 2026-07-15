import { MarketScreen } from "@/components/dragnet/MarketScreen";
import { getLedger } from "@/lib/market-data";

// Read the ledger at request time: live from the chain when a market address is
// configured, otherwise the built-in demo records.
export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const { rows, source } = await getLedger();
  return <MarketScreen rows={rows} source={source} />;
}
