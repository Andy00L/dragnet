import Link from "next/link";
import { TopRail } from "@/components/dragnet/TopRail";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <TopRail crumb="Ledger" />
      <main className="page-prose">
        <div className="card" style={{ marginTop: 56, padding: "26px 28px" }}>
          <h1 className="h2">No such record</h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--ink)", margin: "8px 0 0" }}>
            This bounty is not in the ledger. It may never have been posted, or the id is wrong.
          </p>
          <Link href="/" style={{ display: "inline-block", fontSize: 15, fontWeight: 500, marginTop: 14, padding: "10px 2px", minHeight: 44 }}>
            Back to the ledger
          </Link>
        </div>
      </main>
    </div>
  );
}
