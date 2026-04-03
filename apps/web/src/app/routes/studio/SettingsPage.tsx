import { User, CreditCard, Wallet, ExternalLink, Lock } from "lucide-react";

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-10">
      <h1 className="mb-8 text-2xl font-bold text-white">Settings</h1>

      {/* Account */}
      <section className="mb-8 rounded-2xl border border-border bg-bg-card p-6">
        <div className="mb-4 flex items-center gap-2 text-white">
          <User size={18} />
          <h2 className="text-lg font-semibold">Account</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-white/40">Name</label>
            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white/60">
              —
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/40">Email</label>
            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white/60">
              —
            </div>
          </div>
        </div>
      </section>

      {/* Billing */}
      <section className="mb-8 rounded-2xl border border-border bg-bg-card p-6">
        <div className="mb-4 flex items-center gap-2 text-white">
          <CreditCard size={18} />
          <h2 className="text-lg font-semibold">Billing</h2>
        </div>
        <p className="mb-4 text-sm text-white/40">
          Manage your subscription and payment methods
        </p>
        <button className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-white/60 hover:bg-white/5 transition-colors">
          <ExternalLink size={14} />
          Open Stripe Portal
        </button>
      </section>

      {/* Wallet */}
      <section className="rounded-2xl border border-border bg-bg-card p-6">
        <div className="mb-4 flex items-center gap-2 text-white">
          <Wallet size={18} />
          <h2 className="text-lg font-semibold">Wallet</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-white/40 opacity-50 cursor-not-allowed"
          >
            <Lock size={14} />
            Connect Wallet
          </button>
          <span className="text-xs text-white/30">
            Phase 2 — $BEOMZ staking
          </span>
        </div>
      </section>
    </div>
  );
}
