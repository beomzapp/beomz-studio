import { useState } from "react";
import { Bell, CheckCircle } from "lucide-react";

const PREF_KEY = "beomz_notification_prefs";

interface NotifPrefs {
  referral_reward: boolean;
  build_completed: boolean;
  credits_low: boolean;
  product_updates: boolean;
}

function defaultPrefs(): NotifPrefs {
  return {
    referral_reward: true,
    build_completed: true,
    credits_low: true,
    product_updates: true,
  };
}

function loadPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return { ...defaultPrefs(), ...(JSON.parse(raw) as NotifPrefs) };
  } catch {
    // ignore
  }
  return defaultPrefs();
}

interface NotifItem {
  key: keyof NotifPrefs;
  label: string;
  description: string;
  channel: string;
}

const NOTIFICATIONS: NotifItem[] = [
  {
    key: "referral_reward",
    label: "Referral reward earned",
    description: "When someone you referred signs up or upgrades.",
    channel: "Email",
  },
  {
    key: "build_completed",
    label: "Build completed",
    description: "When your app finishes building.",
    channel: "In-app",
  },
  {
    key: "credits_low",
    label: "Credits low",
    description: "When your balance drops below 20 credits.",
    channel: "Email",
  },
  {
    key: "product_updates",
    label: "Product updates",
    description: "New features, improvements, and announcements.",
    channel: "Email",
  },
];

export function SettingsNotificationsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadPrefs);
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof NotifPrefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  };

  const handleSave = () => {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Notifications</h1>
          <p className="mt-1 text-sm text-[#6b7280]">
            Choose which notifications you want to receive.
          </p>
        </div>

        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white">
          {NOTIFICATIONS.map((item, idx) => (
            <div
              key={item.key}
              className={`flex items-center justify-between gap-4 px-5 py-4 ${
                idx < NOTIFICATIONS.length - 1 ? "border-b border-[#f0eeeb]" : ""
              }`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <Bell size={15} className="mt-0.5 flex-none text-[#9ca3af]" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#1a1a1a]">{item.label}</p>
                    <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] text-[#6b7280]">
                      {item.channel}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#6b7280]">{item.description}</p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={prefs[item.key]}
                onClick={() => toggle(item.key)}
                className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
                  prefs[item.key] ? "bg-[#F97316]" : "bg-[#d1d5db]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                    prefs[item.key] ? "left-4" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
          >
            Save preferences
          </button>
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle size={14} />
              Saved
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
