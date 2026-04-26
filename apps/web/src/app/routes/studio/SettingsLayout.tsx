import { Outlet, Link, useMatchRoute } from "@tanstack/react-router";
import { cn } from "../../../lib/cn";

type SettingsNavItem = { to: string; label: string };
type SettingsSection = { label: string; items: SettingsNavItem[] };

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    label: "Account",
    items: [
      { to: "/studio/settings/profile", label: "Profile" },
      { to: "/studio/settings/billing", label: "Billing" },
      { to: "/studio/settings/integrations", label: "Integrations" },
    ],
  },
  {
    label: "Preferences",
    items: [
      { to: "/studio/settings/ai-personality", label: "AI personality" },
      { to: "/studio/settings/notifications", label: "Notifications" },
      { to: "/studio/settings/workspace-knowledge", label: "Workspace knowledge" },
    ],
  },
  {
    label: "Advanced",
    items: [
      { to: "/studio/settings/security", label: "Security" },
      { to: "/studio/settings/wallet", label: "Wallet" },
    ],
  },
];

export function SettingsLayout() {
  const matchRoute = useMatchRoute();

  return (
    <div className="flex min-h-full">
      {/* Settings sidebar — 200px, white bg, 0.5px right border */}
      <aside
        className="w-[200px] flex-none bg-white"
        style={{ borderRight: "0.5px solid #e5e5e5" }}
      >
        <nav className="px-3 py-4">
          {SETTINGS_SECTIONS.map((section) => (
            <div key={section.label} className="mb-5">
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-[#b0b7c3]">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = matchRoute({ to: item.to });
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "relative flex items-center rounded-lg px-3 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-[#FFF3EC] font-medium text-[#F97316]"
                          : "text-[#374151] hover:bg-[#f3f4f6] hover:text-[#1a1a1a]",
                      )}
                    >
                      {active && (
                        <span className="absolute right-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-l-sm bg-[#F97316]" />
                      )}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* Content area */}
      <div className="min-w-0 flex-1 bg-[#faf9f6]">
        <Outlet />
      </div>
    </div>
  );
}
