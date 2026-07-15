import type { Metadata } from "next";
import localFont from "next/font/local";
import { WalletProvider } from "@/components/dragnet/WalletProvider";
import "./globals.css";

// Self-hosted display face (Fontshare Gambarino), exposed as the --font-gambarino
// CSS variable the stylesheet reads. Body and UI stay on system-ui; mono is data
// only. The distinctive serif carries the identity, per the design system.
const gambarino = localFont({
  src: "./fonts/Gambarino-Regular.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-gambarino",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

export const metadata: Metadata = {
  title: "Dragnet · the keyspace ledger",
  description:
    "A verifiable exclusion market for secp256k1 keyspace. Tag canary keys in a range; a worker must drag the net through it and bring every canary back to be paid.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={gambarino.variable}>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
