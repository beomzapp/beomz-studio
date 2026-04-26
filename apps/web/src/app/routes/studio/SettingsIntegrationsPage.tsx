import { GitBranch, Database, CreditCard, Globe } from "lucide-react";
import type { ComponentType } from "react";

interface Integration {
  icon: ComponentType<{ size?: number; className?: string }>;
  name: string;
  description: string;
  connected: boolean;
  badge?: string;
}

const INTEGRATIONS: Integration[] = [
  {
    icon: GitBranch,
    name: "GitHub",
    description: "Sync your generated code to a repository on every build.",
    connected: false,
    badge: "Coming soon",
  },
  {
    icon: Database,
    name: "Supabase",
    description: "Bring your own database — connect inside any project settings.",
    connected: false,
    badge: "Per project",
  },
  {
    icon: CreditCard,
    name: "Stripe",
    description: "Add payments to your generated apps with one click.",
    connected: false,
    badge: "Coming soon",
  },
  {
    icon: Globe,
    name: "Vercel",
    description: "Deploy to custom domains — connect inside any project settings.",
    connected: false,
    badge: "Per project",
  },
];

export function SettingsIntegrationsPage() {
  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Integrations</h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Connect external services to enhance your builds.
          </p>
        </div>

        <section className="rounded-2xl border border-[#e5e5e5] bg-white">
          {INTEGRATIONS.map((integration, idx) => (
            <div
              key={integration.name}
              className={`flex items-center gap-4 px-5 py-4 ${
                idx < INTEGRATIONS.length - 1 ? "border-b border-[#f0eeeb]" : ""
              }`}
            >
              <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-[#e5e5e5] bg-[#faf9f6]">
                <integration.icon size={18} className="text-[#374151]" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#1a1a1a]">{integration.name}</p>
                  {integration.badge && (
                    <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
                      {integration.badge}
                    </span>
                  )}
                  {integration.connected && (
                    <span className="rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[10px] font-medium text-[#16a34a]">
                      Connected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[#6b7280]">{integration.description}</p>
              </div>

              <button
                type="button"
                disabled={!!integration.badge && !integration.connected}
                className={`flex-none rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  integration.connected
                    ? "border-red-200 text-red-500 hover:bg-red-50"
                    : integration.badge
                      ? "cursor-not-allowed border-[#e5e5e5] text-[#9ca3af] opacity-60"
                      : "border-[#F97316]/30 text-[#F97316] hover:bg-[#FFF3EC]"
                }`}
              >
                {integration.connected ? "Disconnect" : "Connect"}
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
