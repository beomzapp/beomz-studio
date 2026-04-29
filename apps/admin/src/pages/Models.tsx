import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, FolderOpen, Globe, MessageSquare } from "lucide-react";
import {
  DEFAULT_AI_MODELS,
  fetchAdminAiModels,
  postAdminAiModels,
  type AiModelKey,
  type AiModelSelections,
} from "../lib/api.ts";
import { useAuthToken } from "../lib/useAuthToken.ts";

// ── Model definitions ─────────────────────────────────────────────────────────

interface ModelOption {
  id: string;
  label: string;
  provider: "anthropic" | "openai";
  description: string;
}

const ANTHROPIC_MODELS: ModelOption[] = [
  {
    id: "claude-opus-4-5-20251001",
    label: "claude-opus-4-5",
    provider: "anthropic",
    description: "Opus — most capable, slowest",
  },
  {
    id: "claude-sonnet-4-5-20251001",
    label: "claude-sonnet-4-5",
    provider: "anthropic",
    description: "Sonnet — balanced",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "claude-haiku-4-5",
    provider: "anthropic",
    description: "Haiku — fastest, cheapest",
  },
];

const OPENAI_MODELS: ModelOption[] = [
  {
    id: "gpt-4o",
    label: "gpt-4o",
    provider: "openai",
    description: "GPT-4o — flagship",
  },
  {
    id: "gpt-4o-mini",
    label: "gpt-4o-mini",
    provider: "openai",
    description: "GPT-4o mini — faster, cheaper",
  },
];

// ── Builder row definitions ───────────────────────────────────────────────────

interface BuilderDef {
  key: AiModelKey;
  name: string;
  description: string;
  icon: React.ElementType;
}

const BUILDERS: BuilderDef[] = [
  {
    key: "web_apps",
    name: "Web Apps",
    description: "AI-built React web applications",
    icon: FolderOpen,
  },
  {
    key: "websites",
    name: "Websites",
    description: "Marketing sites & landing pages",
    icon: Globe,
  },
  {
    key: "agents",
    name: "Agents",
    description: "Autonomous AI workflows",
    icon: Bot,
  },
  {
    key: "chat_plan",
    name: "Chat / Plan",
    description: "Planning & chat interactions",
    icon: MessageSquare,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getProvider(modelId: string): "anthropic" | "openai" | null {
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt")) return "openai";
  return null;
}

function ProviderBadge({ provider }: { provider: "anthropic" | "openai" | null }) {
  if (!provider) return null;
  const isAnthropic = provider === "anthropic";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
        isAnthropic
          ? "bg-orange-100 text-orange-700"
          : "bg-green-100 text-green-700"
      }`}
    >
      {isAnthropic ? "Anthropic" : "OpenAI"}
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
        type === "success"
          ? "bg-green-600 text-white"
          : "bg-red-600 text-white"
      }`}
    >
      {type === "success" ? (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {message}
    </div>
  );
}

// ── Model row ─────────────────────────────────────────────────────────────────

interface ModelRowProps {
  builder: BuilderDef;
  value: string;
  openaiAvailable: boolean;
  onChange: (key: AiModelKey, model: string) => void;
}

function ModelRow({ builder, value, openaiAvailable, onChange }: ModelRowProps) {
  const { key, name, description, icon: Icon } = builder;
  const allModels = openaiAvailable
    ? [...ANTHROPIC_MODELS, ...OPENAI_MODELS]
    : ANTHROPIC_MODELS;

  const activeModel =
    allModels.find((m) => m.id === value) ?? null;
  const provider = activeModel ? activeModel.provider : getProvider(value);

  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-white border-b border-slate-100 last:border-0">
      {/* Builder info */}
      <div className="flex items-center gap-3 w-56 shrink-0">
        <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-slate-600" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{name}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
      </div>

      {/* Current model */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        <span className="text-sm text-slate-700 font-mono truncate">
          {activeModel?.label ?? value}
        </span>
        <ProviderBadge provider={provider} />
      </div>

      {/* Dropdown */}
      <div className="shrink-0">
        <select
          value={value}
          onChange={(e) => onChange(key, e.target.value)}
          className="text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent cursor-pointer"
        >
          <optgroup label="Anthropic">
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.description}
              </option>
            ))}
          </optgroup>
          {openaiAvailable && (
            <optgroup label="OpenAI">
              {OPENAI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.description}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const token = useAuthToken();

  const [serverModels, setServerModels] = useState<AiModelSelections>(DEFAULT_AI_MODELS);
  const [draft, setDraft] = useState<AiModelSelections>(DEFAULT_AI_MODELS);
  const [openaiAvailable, setOpenaiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminAiModels(token);
      const { openai_available, ...models } = data;
      const selections: AiModelSelections = {
        ...DEFAULT_AI_MODELS,
        web_apps: models.web_apps ?? DEFAULT_AI_MODELS.web_apps,
        websites: models.websites ?? DEFAULT_AI_MODELS.websites,
        agents: models.agents ?? DEFAULT_AI_MODELS.agents,
        chat_plan: models.chat_plan ?? DEFAULT_AI_MODELS.chat_plan,
      };
      setServerModels(selections);
      setDraft(selections);
      setOpenaiAvailable(openai_available ?? false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load AI model settings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(() => {
    return BUILDERS.some(({ key }) => draft[key] !== serverModels[key]);
  }, [draft, serverModels]);

  const handleChange = (key: AiModelKey, model: string) => {
    setDraft((prev) => ({ ...prev, [key]: model }));
  };

  const handleReset = () => {
    setDraft(serverModels);
  };

  const handleSave = async () => {
    if (!token || !isDirty) return;
    const previousServer = serverModels;
    setSaving(true);
    setServerModels(draft);
    try {
      const data = await postAdminAiModels(token, draft);
      const { openai_available, ...models } = data;
      const saved: AiModelSelections = {
        ...DEFAULT_AI_MODELS,
        web_apps: models.web_apps ?? draft.web_apps,
        websites: models.websites ?? draft.websites,
        agents: models.agents ?? draft.agents,
        chat_plan: models.chat_plan ?? draft.chat_plan,
      };
      setServerModels(saved);
      setDraft(saved);
      if (openai_available !== undefined) setOpenaiAvailable(openai_available);
      showToast("Model settings saved — changes apply to all new builds immediately", "success");
    } catch (e) {
      setServerModels(previousServer);
      showToast(e instanceof Error ? e.message : "Failed to save model settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">AI Models</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Select which AI model powers each builder type.
          </p>
        </div>

        <div className="flex items-center gap-2">
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
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800">
        <svg
          className="w-4 h-4 mt-0.5 shrink-0 text-amber-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <span>
          <strong>Warning:</strong> Changing model affects all new builds immediately.
        </span>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="px-4 py-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
          <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          Loading model settings…
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-5 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="w-56 shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Builder
            </div>
            <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Current Model
            </div>
            <div className="shrink-0 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Change
            </div>
          </div>

          {BUILDERS.map((builder) => (
            <ModelRow
              key={builder.key}
              builder={builder}
              value={draft[builder.key]}
              openaiAvailable={openaiAvailable}
              onChange={handleChange}
            />
          ))}
        </div>
      )}

      {/* Provider legend */}
      {!loading && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-semibold uppercase tracking-wide">
              Anthropic
            </span>
            Claude models
          </span>
          {openaiAvailable && (
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-semibold uppercase tracking-wide">
                OpenAI
              </span>
              GPT models (OPENAI_API_KEY detected)
            </span>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
