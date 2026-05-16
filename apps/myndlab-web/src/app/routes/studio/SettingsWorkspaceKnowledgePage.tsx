import { useState, useEffect } from "react";
import { BookOpen, CheckCircle, AlertTriangle } from "lucide-react";
import { getMe, patchMe } from "../../../lib/api";

const LOCAL_KEY = "beomz_workspace_knowledge";
const MAX_CHARS = 500;

export function SettingsWorkspaceKnowledgePage() {
  const [knowledge, setKnowledge] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((profile) => {
        const apiValue = profile.workspace_knowledge;
        if (typeof apiValue === "string" && apiValue.length > 0) {
          setKnowledge(apiValue);
        } else {
          setKnowledge(localStorage.getItem(LOCAL_KEY) ?? "");
        }
      })
      .catch(() => {
        setKnowledge(localStorage.getItem(LOCAL_KEY) ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await patchMe({ workspace_knowledge: knowledge });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // API column not yet available — persist to localStorage
      localStorage.setItem(LOCAL_KEY, knowledge);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Workspace knowledge</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Rules Claude follows in every app you build.</p>
        </div>

        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <BookOpen size={18} />
            <h2 className="text-base font-semibold">Rules for all my projects</h2>
          </div>

          {loading ? (
            <div className="h-32 animate-pulse rounded-xl bg-[#f0eeeb]" />
          ) : (
            <>
              <textarea
                value={knowledge}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) setKnowledge(e.target.value);
                }}
                placeholder="Always use TypeScript. Use Tailwind for styling. My brand color is #F97316."
                rows={6}
                className="mb-1 w-full resize-none rounded-xl border border-[#e5e5e5] bg-white px-4 py-3 text-sm text-[#1a1a1a] outline-none transition-colors placeholder:text-[#9ca3af] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20"
              />

              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs text-[#9ca3af]">
                  Claude will follow these rules in every app you build
                </p>
                <p
                  className={`text-xs ${
                    knowledge.length >= MAX_CHARS
                      ? "font-medium text-[#F97316]"
                      : "text-[#9ca3af]"
                  }`}
                >
                  {knowledge.length} / {MAX_CHARS}
                </p>
              </div>

              {saveError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertTriangle size={14} className="flex-none text-red-500" />
                  <p className="text-xs text-red-600">{saveError}</p>
                </div>
              )}

              {saveSuccess && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                  <CheckCircle size={14} className="flex-none text-green-500" />
                  <p className="text-xs text-green-700">Workspace knowledge saved.</p>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-xl bg-[#F97316] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save rules"}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
