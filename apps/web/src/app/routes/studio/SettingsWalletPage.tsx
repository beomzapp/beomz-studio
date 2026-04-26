import { Wallet, Lock } from "lucide-react";

export function SettingsWalletPage() {
  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Wallet</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Connect your crypto wallet to stake $BEOMZ.</p>
        </div>

        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <Wallet size={18} />
            <h2 className="text-base font-semibold">Wallet</h2>
          </div>

          <div className="flex items-center gap-3">
            <button
              disabled
              className="flex cursor-not-allowed items-center gap-2 rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-4 py-2 text-sm text-[#9ca3af] opacity-50"
            >
              <Lock size={14} />
              Connect Wallet
            </button>
            <span className="text-xs text-[#9ca3af]">Phase 2 &mdash; $BEOMZ staking</span>
          </div>
        </section>
      </div>
    </div>
  );
}
