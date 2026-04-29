import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, FolderOpen, Globe, MessageSquare, X } from "lucide-react";
import {
  DEFAULT_AI_MODELS,
  fetchAdminAiModels,
  fetchAdminProviders,
  postAdminAiModels,
  saveProviderKey,
  testProviderKey,
  deleteProvider,
  type AiModelKey,
  type AiModelSelections,
  type AiProvider,
  type AiProviderStatus,
} from "../lib/api.ts";
import { useAuthToken } from "../lib/useAuthToken.ts";

// ── Provider definitions ───────────────────────────────────────────────────────

interface ProviderDef {
  id: AiProvider;
  name: string;
  color: string;
  bgColor: string;
  textColor: string;
  alwaysConnected?: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    color: "#d97706",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    alwaysConnected: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    color: "#16a34a",
    bgColor: "bg-green-50",
    textColor: "text-green-700",
  },
  {
    id: "google",
    name: "Google Gemini",
    color: "#2563eb",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
  },
  {
    id: "moonshot",
    name: "Moonshot AI",
    color: "#7c3aed",
    bgColor: "bg-violet-50",
    textColor: "text-violet-700",
  },
  {
    id: "mistral",
    name: "Mistral",
    color: "#4338ca",
    bgColor: "bg-indigo-50",
    textColor: "text-indigo-700",
  },
  {
    id: "groq",
    name: "Groq",
    color: "#db2777",
    bgColor: "bg-pink-50",
    textColor: "text-pink-700",
  },
];

// ── Model definitions ──────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Toast ──────────────────────────────────────────────────────────────────────

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

// ── Model row ──────────────────────────────────────────────────────────────────

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

  const activeModel = allModels.find((m) => m.id === value) ?? null;
  const provider = activeModel ? activeModel.provider : getProvider(value);

  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-white border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-3 w-56 shrink-0">
        <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-slate-600" />
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-800">{name}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
        <span className="text-sm text-slate-700 font-mono truncate">
          {activeModel?.label ?? value}
        </span>
        <ProviderBadge provider={provider} />
      </div>

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

// ── Configure modal ────────────────────────────────────────────────────────────

type TestState = "idle" | "testing" | "success" | "error";

interface ConfigureModalProps {
  providerDef: ProviderDef;
  status: AiProviderStatus | undefined;
  token: string;
  onClose: () => void;
  onSaved: (updated: AiProviderStatus) => void;
  onDeleted: (provider: AiProvider) => void;
}

function ConfigureModal({
  providerDef,
  status,
  token,
  onClose,
  onSaved,
  onDeleted,
}: ConfigureModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isConnected = status?.connected ?? providerDef.alwaysConnected ?? false;
  const canSave = testState === "success" && apiKey.trim().length > 0;

  const handleTest = async () => {
    if (!apiKey.trim()) return;
    setTestState("testing");
    setTestMessage("");
    try {
      const result = await testProviderKey(token, providerDef.id, apiKey.trim());
      if (result.success) {
        setTestState("success");
        setTestMessage("Connection successful");
      } else {
        setTestState("error");
        setTestMessage(result.message ?? "Invalid key");
      }
    } catch (e) {
      setTestState("error");
      setTestMessage(e instanceof Error ? e.message : "Connection failed");
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const updated = await saveProviderKey(token, providerDef.id, apiKey.trim());
      onSaved(updated);
      onClose();
    } catch (e) {
      setTestState("error");
      setTestMessage(e instanceof Error ? e.message : "Failed to save key");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProvider(token, providerDef.id);
      onDeleted(providerDef.id);
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: providerDef.color }}
            />
            <h2 className="text-base font-semibold text-slate-800">
              Connect {providerDef.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex flex-col gap-4">
          {/* API Key input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">API Key</label>
            <input
              ref={inputRef}
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestState("idle");
                setTestMessage("");
              }}
              placeholder="sk-..."
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent font-mono"
            />
          </div>

          {/* Test result banner */}
          {testMessage && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium ${
                testState === "success"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {testState === "success" ? (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {testMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            {/* Test button */}
            <button
              type="button"
              onClick={handleTest}
              disabled={!apiKey.trim() || testState === "testing" || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testState === "testing" ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Testing…
                </>
              ) : (
                "Test connection"
              )}
            </button>

            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            {/* Remove button */}
            {isConnected && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="ml-auto px-3 py-1.5 text-sm border border-red-200 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Provider card ──────────────────────────────────────────────────────────────

interface ProviderCardProps {
  def: ProviderDef;
  status: AiProviderStatus | undefined;
  onConfigure: () => void;
}

function ProviderCard({ def, status, onConfigure }: ProviderCardProps) {
  const connected = status?.connected ?? def.alwaysConnected ?? false;
  const maskedKey = status?.masked_key;

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-5 py-4 flex items-center gap-4">
      {/* Color dot + name + badge */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: def.color }}
        />
        <span className="text-sm font-semibold text-slate-800 truncate">{def.name}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 ${def.bgColor} ${def.textColor}`}
        >
          {def.id}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-green-500" : "bg-slate-300"}`}
        />
        <span className={`text-sm ${connected ? "text-green-700 font-medium" : "text-slate-400"}`}>
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {/* Masked key */}
      {maskedKey && (
        <span className="text-xs text-slate-400 font-mono shrink-0">{maskedKey}</span>
      )}

      {/* Configure button */}
      {!def.alwaysConnected && (
        <button
          type="button"
          onClick={onConfigure}
          className="shrink-0 px-3 py-1.5 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Configure
        </button>
      )}
    </div>
  );
}

// ── Providers tab ──────────────────────────────────────────────────────────────

interface ProvidersTabProps {
  token: string;
  showToast: (message: string, type: "success" | "error") => void;
}

function ProvidersTab({ token, showToast }: ProvidersTabProps) {
  const [statuses, setStatuses] = useState<AiProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<AiProvider | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminProviders(token);
      setStatuses(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const getStatus = (id: AiProvider) => statuses.find((s) => s.provider === id);

  const handleSaved = (updated: AiProviderStatus) => {
    setStatuses((prev) => {
      const existing = prev.find((s) => s.provider === updated.provider);
      if (existing) return prev.map((s) => (s.provider === updated.provider ? updated : s));
      return [...prev, updated];
    });
    showToast(`${PROVIDERS.find((p) => p.id === updated.provider)?.name ?? updated.provider} connected`, "success");
  };

  const handleDeleted = (provider: AiProvider) => {
    setStatuses((prev) =>
      prev.map((s) => (s.provider === provider ? { ...s, connected: false, masked_key: undefined } : s)),
    );
    showToast(`${PROVIDERS.find((p) => p.id === provider)?.name ?? provider} removed`, "success");
  };

  const configuringDef = PROVIDERS.find((p) => p.id === configuring);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
        <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        Loading providers…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-4 py-3 rounded-md border border-red-200 bg-red-50 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {PROVIDERS.map((def) => (
          <ProviderCard
            key={def.id}
            def={def}
            status={getStatus(def.id)}
            onConfigure={() => setConfiguring(def.id)}
          />
        ))}
      </div>

      {configuringDef && (
        <ConfigureModal
          providerDef={configuringDef}
          status={getStatus(configuringDef.id)}
          token={token}
          onClose={() => setConfiguring(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}

// ── Models tab ─────────────────────────────────────────────────────────────────

interface ModelsTabProps {
  token: string;
  showToast: (message: string, type: "success" | "error") => void;
}

function ModelsTab({ token, showToast }: ModelsTabProps) {
  const [serverModels, setServerModels] = useState<AiModelSelections>(DEFAULT_AI_MODELS);
  const [draft, setDraft] = useState<AiModelSelections>(DEFAULT_AI_MODELS);
  const [openaiAvailable, setOpenaiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
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
    if (!isDirty) return;
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
    <>
      {/* Action bar */}
      <div className="flex items-center justify-end gap-2">
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
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type TabId = "providers" | "models";

export default function ModelsPage() {
  const token = useAuthToken();
  const [activeTab, setActiveTab] = useState<TabId>("providers");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  if (!token) return null;

  const tabs: { id: TabId; label: string }[] = [
    { id: "providers", label: "Providers" },
    { id: "models", label: "Models" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">AI Models</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          Manage AI provider keys and model assignments.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "providers" ? (
        <ProvidersTab token={token} showToast={showToast} />
      ) : (
        <ModelsTab token={token} showToast={showToast} />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
