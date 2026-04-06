/**
 * DatabasePanel — V2 database connection wizard.
 * Provider picker: Beomz DB (recommended) / Supabase OAuth / Manual Keys.
 * Step 1: Connect → Step 2: Wire flow.
 */
import { useState } from "react";
import {
  Database,
  Check,
  Loader2,
  AlertCircle,
  ChevronRight,
  Zap,
  Key,
  Link2,
} from "lucide-react";
import { cn } from "../../lib/cn";

type DatabaseProvider = "beomz" | "supabase-oauth" | "manual";
type WizardStep = "pick-provider" | "connect" | "wire";

interface DatabasePanelProps {
  className?: string;
}

export function DatabasePanel({ className }: DatabasePanelProps) {
  const [step, setStep] = useState<WizardStep>("pick-provider");
  const [provider, setProvider] = useState<DatabaseProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [wiring, setWiring] = useState(false);
  const [wired, setWired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual keys form state
  const [manualUrl, setManualUrl] = useState("");
  const [manualAnonKey, setManualAnonKey] = useState("");

  const handleSelectProvider = (p: DatabaseProvider) => {
    setProvider(p);
    setStep("connect");
    setError(null);
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    // Simulate connection
    await new Promise((r) => setTimeout(r, 1500));
    setConnecting(false);
    setConnected(true);
    setStep("wire");
  };

  const handleWire = async () => {
    setWiring(true);
    setError(null);
    await new Promise((r) => setTimeout(r, 1200));
    setWiring(false);
    setWired(true);
  };

  const handleBack = () => {
    if (step === "wire") {
      setStep("connect");
      setWired(false);
    } else if (step === "connect") {
      setStep("pick-provider");
      setProvider(null);
      setConnected(false);
    }
  };

  return (
    <div className={cn("flex h-full flex-col overflow-y-auto", className)}>
      <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F97316]/10">
            <Database size={18} className="text-[#F97316]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1a1a1a]">Database</h2>
            <p className="text-xs text-[#9ca3af]">Connect a database to power your app with live data.</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs">
          {(["pick-provider", "connect", "wire"] as const).map((s, i) => {
            const labels = ["Choose provider", "Connect", "Wire to app"];
            const isDone = (s === "pick-provider" && step !== "pick-provider")
              || (s === "connect" && (step === "wire"))
              || (s === "wire" && wired);
            const isCurrent = s === step;

            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <ChevronRight size={12} className="text-[#d1d5db]" />}
                <div className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1",
                  isDone ? "bg-emerald-50 text-emerald-700"
                    : isCurrent ? "bg-[#F97316]/10 text-[#F97316]"
                      : "text-[#9ca3af]",
                )}>
                  {isDone ? <Check size={12} /> : <span className="font-semibold">{i + 1}</span>}
                  <span className="font-medium">{labels[i]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step 1: Provider picker */}
        {step === "pick-provider" && (
          <div className="space-y-3">
            {([
              {
                key: "beomz" as const,
                icon: Zap,
                label: "Beomz DB",
                desc: "Managed PostgreSQL. Zero config, instant setup.",
                badge: "Recommended",
                badgeClass: "bg-[#F97316]/10 text-[#F97316]",
              },
              {
                key: "supabase-oauth" as const,
                icon: Link2,
                label: "Supabase OAuth",
                desc: "Connect your existing Supabase project via OAuth.",
                badge: null,
                badgeClass: "",
              },
              {
                key: "manual" as const,
                icon: Key,
                label: "Manual Keys",
                desc: "Bring your own Supabase URL and anon key.",
                badge: null,
                badgeClass: "",
              },
            ]).map(({ key, icon: Icon, label, desc, badge, badgeClass }) => (
              <button
                key={key}
                onClick={() => handleSelectProvider(key)}
                className="flex w-full items-start gap-3 rounded-xl border border-[#e5e5e5] bg-white p-4 text-left transition-colors hover:border-[#F97316]/40 hover:bg-[#faf9f6]"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6]">
                  <Icon size={16} className="text-[#6b7280]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#1a1a1a]">{label}</p>
                    {badge && (
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", badgeClass)}>
                        {badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#9ca3af]">{desc}</p>
                </div>
                <ChevronRight size={16} className="mt-1 flex-shrink-0 text-[#d1d5db]" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Connect */}
        {step === "connect" && (
          <div className="space-y-4">
            <button onClick={handleBack} className="text-xs text-[#6b7280] hover:text-[#1a1a1a]">&larr; Back</button>

            <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
              <p className="text-sm font-semibold text-[#1a1a1a]">
                {provider === "beomz" ? "Beomz DB" : provider === "supabase-oauth" ? "Supabase OAuth" : "Manual Keys"}
              </p>

              {provider === "manual" && (
                <div className="mt-4 space-y-3">
                  <input
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    placeholder="https://YOUR-PROJECT.supabase.co"
                    className="h-9 w-full rounded-lg border border-[#e5e5e5] px-3 text-sm outline-none focus:border-[#F97316]/50"
                  />
                  <input
                    value={manualAnonKey}
                    onChange={(e) => setManualAnonKey(e.target.value)}
                    placeholder="Supabase anon key"
                    className="h-9 w-full rounded-lg border border-[#e5e5e5] px-3 text-sm outline-none focus:border-[#F97316]/50"
                  />
                </div>
              )}

              {provider === "beomz" && (
                <p className="mt-3 text-xs text-[#9ca3af]">
                  A managed PostgreSQL database will be provisioned automatically for your project.
                </p>
              )}

              {provider === "supabase-oauth" && (
                <p className="mt-3 text-xs text-[#9ca3af]">
                  You will be redirected to Supabase to authorize access to your project.
                </p>
              )}

              <div className="mt-4 flex items-center gap-3">
                {connected ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <Check size={14} />
                    Connected
                  </div>
                ) : (
                  <button
                    onClick={() => void handleConnect()}
                    disabled={connecting || (provider === "manual" && (!manualUrl.trim() || !manualAnonKey.trim()))}
                    className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#ea6c10] disabled:opacity-50"
                  >
                    {connecting ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                    {connecting ? "Connecting..." : "Connect"}
                  </button>
                )}
              </div>

              {error && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-red-500">
                  <AlertCircle size={12} /> {error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Wire */}
        {step === "wire" && (
          <div className="space-y-4">
            <button onClick={handleBack} className="text-xs text-[#6b7280] hover:text-[#1a1a1a]">&larr; Back</button>

            <div className="rounded-xl border border-[#e5e5e5] bg-white p-5">
              <p className="text-sm font-semibold text-[#1a1a1a]">Wire database to your app</p>
              <p className="mt-1 text-xs text-[#9ca3af]">
                Generate data bindings so your app can read and write to the database.
              </p>

              <div className="mt-4">
                {wired ? (
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <Check size={14} />
                    Database wired &mdash; live data active
                  </div>
                ) : (
                  <button
                    onClick={() => void handleWire()}
                    disabled={wiring}
                    className="flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#333] disabled:opacity-50"
                  >
                    {wiring ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    {wiring ? "Wiring..." : "Wire to app"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
