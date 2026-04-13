import { useState } from "react";
import { User, CreditCard, Wallet, ExternalLink, Lock, Sparkles } from "lucide-react";
import {
  ALL_PERSONALITIES,
  PERSONALITY_LABELS,
  getPersonality,
  isRandomMode,
  setPersonality,
  setRandomPersonality,
  type PersonalityId,
} from "../../../lib/personalities";

export function SettingsPage() {
  const [selectedId, setSelectedId] = useState<PersonalityId | "random">(() =>
    isRandomMode() ? "random" : getPersonality(),
  );

  const handleSelect = (id: PersonalityId | "random") => {
    setSelectedId(id);
    if (id === "random") {
      setRandomPersonality();
    } else {
      setPersonality(id);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-10">
      <h1 className="mb-8 text-2xl font-bold text-white">Settings</h1>

      {/* Chat Personality */}
      <section className="mb-8 rounded-2xl border border-border bg-bg-card p-6">
        <div className="mb-1 flex items-center gap-2 text-white">
          <Sparkles size={18} />
          <h2 className="text-lg font-semibold">Chat Personality</h2>
        </div>
        <p className="mb-5 text-sm text-white/40">
          Choose how Beomz talks to you while building.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Random card */}
          <button
            onClick={() => handleSelect("random")}
            className={`rounded-xl border p-3.5 text-left transition-all ${
              selectedId === "random"
                ? "border-[#F97316] bg-[#F97316]/10"
                : "border-border bg-bg hover:border-white/20"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Random</span>
              {selectedId === "random" && (
                <span className="text-xs text-[#F97316]">&#10003;</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-white/40">
              Different personality each session
            </p>
            <p className="mt-2 text-xs italic text-white/25">
              Surprise me
            </p>
          </button>

          {/* Personality cards */}
          {ALL_PERSONALITIES.map((id) => {
            const label = PERSONALITY_LABELS[id];
            const isSelected = selectedId === id;
            return (
              <button
                key={id}
                onClick={() => handleSelect(id)}
                className={`rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? "border-[#F97316] bg-[#F97316]/10"
                    : "border-border bg-bg hover:border-white/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {label.name}
                  </span>
                  {isSelected && (
                    <span className="text-xs text-[#F97316]">&#10003;</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-white/40">{label.tagline}</p>
                <p className="mt-2 whitespace-pre-wrap text-xs italic text-white/25">
                  {label.preview}
                </p>
              </button>
            );
          })}
        </div>
      </section>

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
              &mdash;
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/40">Email</label>
            <div className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-white/60">
              &mdash;
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
            Phase 2 &mdash; $BEOMZ staking
          </span>
        </div>
      </section>
    </div>
  );
}
