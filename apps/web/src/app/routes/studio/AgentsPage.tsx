import { useState } from "react";
import { Bot, Plus, Workflow } from "lucide-react";

export function AgentsPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("manual");

  const resetForm = () => {
    setName("");
    setDescription("");
    setTrigger("manual");
    setShowForm(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] px-6 py-4">
        <h1 className="text-lg font-semibold text-white">Agents</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange/90"
          >
            <Plus size={14} />
            New agent
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showForm && (
        <div className="border-b border-[rgba(255,255,255,0.08)] px-6 py-5">
          <div className="mx-auto max-w-lg space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/40">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Weekly report generator"
                className="w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/40">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this agent do?"
                rows={2}
                className="w-full resize-none rounded-lg border border-[rgba(255,255,255,0.08)] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/25 outline-none focus:border-orange/40"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/40">
                Trigger type
              </label>
              <select
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                className="w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-orange/40"
              >
                <option value="manual" className="bg-[#060612]">
                  Manual
                </option>
                <option value="scheduled" className="bg-[#060612]">
                  Scheduled
                </option>
                <option value="webhook" className="bg-[#060612]">
                  Webhook
                </option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={resetForm}
                className="rounded-lg border border-[rgba(255,255,255,0.08)] px-4 py-2 text-sm text-white/50 transition-colors hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled
                className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent list — empty state */}
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-white/[0.03]">
          <Bot size={28} className="text-white/20" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-white/50">
          No agents yet
        </h3>
        <p className="mt-1 max-w-xs text-center text-xs text-white/25">
          Create your first agent to automate workflows and tasks.
        </p>
      </div>

      {/* Footer banner */}
      <div className="border-t border-[rgba(255,255,255,0.08)] px-6 py-3">
        <div className="flex items-center justify-center gap-2 text-xs text-white/20">
          <Workflow size={12} />
          <span>Visual canvas builder</span>
          <span className="ml-2 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/15">
            coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
