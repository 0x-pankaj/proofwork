import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { activeChain, proofworkJobsAddress, addressUrl } from "@proofwork/chain";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Proofwork",
  description: "Trustless freelance platform settled on-chain",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const explorerLink = addressUrl(proofworkJobsAddress);

  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen flex flex-col bg-slate-950 text-slate-100`}>
        <div className="flex-1">
          {children}
        </div>
        <footer className="w-full border-t border-slate-800 bg-slate-900/60 py-4 px-6 text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Network: <strong className="text-slate-200">{activeChain.name}</strong> (Chain ID: {activeChain.id})</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Escrow Contract:</span>
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-cyan-400 hover:underline truncate max-w-[200px] sm:max-w-xs"
              title={proofworkJobsAddress}
            >
              {proofworkJobsAddress}
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}