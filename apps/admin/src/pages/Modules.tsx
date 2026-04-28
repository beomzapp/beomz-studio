import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Smartphone,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_MODULES_FLAGS,
  fetchAdminFeatureFlags,
  patchAdminFeatureFlags,
  type ModuleFlagState,
  type ModuleKey,
  type ModulesFlags,
} from "../lib/api.ts";
import { useAuthToken } from "../lib/useAuthToken.ts";

interface ModuleDef {
  key: ModuleKey;
  name: string;
  description: string;
  icon: LucideIcon;
}

const MODULES: ModuleDef[] = [
  {
    key: "web_apps",
    name: "Web Apps",
    description: "AI-built React web applications.",
    icon: FolderOpen,
  },
  {
    key: "websites",
    name: "Websites",
    description: "Marketing sites & landing pages.",
    icon: Globe,
  },
  {
    key: "mobile_apps",
    name: "Mobile Apps",
    description: "Native iOS / Android (planned).",
    icon: Smartphone,
  },
  {
    key: "images",
    name: "Images",
    description: "AI image generation (planned).",
    icon: ImageIcon,
  },
  {
    key: "videos",
    name: "Videos",
    description: "AI video generation (planned).",
    icon: Video,
  },
  {
    key: "agents",
    name: "Agents",
    description: "Autonomous AI workflows.",
    icon: Bot,
  },
];

const STATE_OPTIONS: { value: ModuleFlagState; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "coming_soon", label: "Coming Soon" },
  { value: "disabled", label: "Disabled" },
];

const STATE_BADGE: Record<
  ModuleFlagState,
  { dot: string; bg: string; text: string; label: string }
> = {
  live: {
    dot: "bg-green-500",
    bg: "bg-green-50",
    text: "text-green-700",
    label: "Live",
  },
  coming_soon: {
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-700",
    label: "Coming Soon",
  },
  disabled: {
    dot: "bg-slate-400",
    bg: "bg-slate-100",
    text: "text-slate-600",
    label: "Disabled",
  },
};

function StatusBadge({ state }: { state: ModuleFlagState }) {
  const s = STATE_BADGE[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

interface SegmentedProps {
  value: ModuleFlagState;
  onChange: (next: ModuleFlagState) => void;
}

function StateToggle({ value, onChange }: SegmentedProps) {
  return (
    <div className="inline-flex p-0.5 bg-slate-100 rounded-md border border-slate-200">
      {STATE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        const colorClass =
          active && opt.value === "live"
            ? "bg-white text-green-700 shadow-sm"
            : active && opt.value === "coming_soon"
              ? "bg-white text-amber-700 shadow-sm"
              : active && opt.value === "disabled"
                ? "bg-white text-slate-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700";
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${colorClass}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function ModulesPage() {
  const token = useAuthToken();

  const [serverFlags, setServerFlags] = useState<ModulesFlags>(DEFAULT_MODULES_FLAGS);
  const [draft, setDraft] = useState<ModulesFlags>(DEFAULT_MODULES_FLAGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminFeatureFlags(token);
      const next = { ...DEFAULT_MODULES_FLAGS, ...(data.modules ?? {}) };
      setServerFlags(next);
      setDraft(next);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load feature flags");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(() => {
    return MODULES.some(({ key }) => draft[key] !== serverFlags[key]);
  }, [draft, serverFlags]);

  const handleChange = (key: ModuleKey, next: ModuleFlagState) => {
    setDraft((prev) => ({ ...prev, [key]: next }));
    setSavedAt(null);
    setSaveError(null);
  };

  const handleReset = () => {
    setDraft(serverFlags);
    setSaveError(null);
    setSavedAt(null);
  };

  const handleSave = async () => {
    if (!token || !isDirty) return;
    const previousServer = serverFlags;
    setSaving(true);
    setSaveError(null);
    setServerFlags(draft);
    try {
      const data = await patchAdminFeatureFlags(token, draft);
      const next = { ...DEFAULT_MODULES_FLAGS, ...(data.modules ?? {}) };
      setServerFlags(next);
      setDraft(next);
      setSavedAt(Date.now());
    } catch (e) {
      setServerFlags(previousServer);
      setSaveError(e instanceof Error ? e.message : "Failed to save feature flags");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Modules</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Toggle studio modules on/off globally without a deploy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedAt && !isDirty && !saveError && (
            <span className="text-xs text-green-600 font-medium">Saved</span>
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={!isDirty || saving}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving || loading}
            className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="px-4 py-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {saveError && (
        <div className="px-4 py-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
          {saveError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          Loading modules…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {MODULES.map(({ key, name, description, icon: Icon }) => {
            const state = draft[key];
            return (
              <div
                key={key}
                className="bg-white rounded-lg border border-slate-200 p-5 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                      <Icon size={18} className="text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800 truncate">
                        {name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{description}</div>
                    </div>
                  </div>
                  <StatusBadge state={state} />
                </div>

                <StateToggle
                  value={state}
                  onChange={(next) => handleChange(key, next)}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
