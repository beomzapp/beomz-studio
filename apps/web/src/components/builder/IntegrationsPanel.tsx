/**
 * IntegrationsPanel — V2 integrations tab.
 * Supabase OAuth + BYO keys form.
 * Coming soon cards: Stripe, Twilio, SendGrid.
 */
import { useState } from "react";
import {
  Link2,
  Database,
  Loader2,
  CreditCard,
  MessageSquare,
  Mail,
} from "lucide-react";

interface IntegrationsPanelProps {
  className?: string;
}

export function IntegrationsPanel({ className }: IntegrationsPanelProps) {
  const [integrationUrl, setIntegrationUrl] = useState("");
  const [integrationAnonKey, setIntegrationAnonKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleConnectBYO = async () => {
    setConnecting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setConnecting(false);
  };

  const handleStartOAuth = async () => {
    setOauthLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setOauthLoading(false);
  };

  return (
    <div className={className}>
      <div className="mx-auto w-full max-w-2xl space-y-6 overflow-y-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50">
            <Link2 size={18} className="text-violet-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#1a1a1a]">Integrations</h2>
            <p className="text-xs text-[#9ca3af]">Connect services to power your app with live data.</p>
          </div>
        </div>

        {/* Database section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6b7280]">Database</h3>

          {/* Supabase OAuth */}
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-[#374151]">OAuth Connection</p>
              <button
                onClick={() => void handleStartOAuth()}
                disabled={oauthLoading}
                className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
              >
                {oauthLoading ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                Connect Supabase
              </button>
            </div>
          </div>

          {/* BYO keys */}
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1a1a1a]">Supabase (BYO)</p>
                <p className="mt-0.5 text-xs text-[#9ca3af]">Connect external Supabase project (URL + anon key).</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 border-t border-[#f3f4f6] pt-3">
              <input
                value={integrationUrl}
                onChange={(e) => setIntegrationUrl(e.target.value)}
                placeholder="https://YOUR-PROJECT.supabase.co"
                className="h-9 w-full rounded-lg border border-[#e5e5e5] px-3 text-sm outline-none focus:border-violet-300"
              />
              <input
                value={integrationAnonKey}
                onChange={(e) => setIntegrationAnonKey(e.target.value)}
                placeholder="Supabase anon key"
                className="h-9 w-full rounded-lg border border-[#e5e5e5] px-3 text-sm outline-none focus:border-violet-300"
              />
            </div>
            <div className="mt-3">
              <button
                onClick={() => void handleConnectBYO()}
                disabled={connecting || !integrationUrl.trim() || !integrationAnonKey.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
              >
                {connecting ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                {connecting ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>

        {/* Coming Soon section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[#6b7280]">Coming Soon</h3>
          {([
            { icon: CreditCard, label: "Stripe Payments", desc: "Accept payments, subscriptions, and one-time charges." },
            { icon: MessageSquare, label: "Twilio SMS", desc: "Send text messages and OTP verification." },
            { icon: Mail, label: "SendGrid Email", desc: "Transactional and marketing emails." },
          ]).map(({ icon: Icon, label, desc }) => (
            <div key={label} className="rounded-xl border border-[#e5e5e5] bg-white p-4 opacity-60">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#f3f4f6]">
                    <Icon size={14} className="text-[#9ca3af]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1a1a1a]">{label}</p>
                    <p className="mt-0.5 text-xs text-[#9ca3af]">{desc}</p>
                  </div>
                </div>
                <span className="flex-shrink-0 rounded-full border border-[#e5e5e5] bg-[#f3f4f6] px-2 py-1 text-[10px] text-[#9ca3af]">
                  Soon
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
