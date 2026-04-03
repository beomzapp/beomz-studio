import { useState, useCallback, useRef } from "react";
import { useParams } from "@tanstack/react-router";
import {
  Rocket,
  FolderTree,
  MessageSquare,
  Monitor,
  Play,
} from "lucide-react";
import { GenerationTimeline, type TimelineStep } from "../../../components/studio";
import { getDeferredItems } from "../../../lib/getDeferredItems";

const INITIAL_STEPS: TimelineStep[] = [
  { label: "Planning", status: "pending" },
  { label: "Selecting approach", status: "pending" },
  { label: "Generating files", status: "pending" },
  { label: "Validating", status: "pending" },
  { label: "Complete", status: "pending" },
];

export function ProjectPage() {
  const { id } = useParams({ from: "/studio/project/$id" });
  const [prompt, setPrompt] = useState("a SaaS dashboard");
  const [phase, setPhase] = useState(1);
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [deferredItems, setDeferredItems] = useState<string[]>([]);
  const [buildSteps, setBuildSteps] = useState<TimelineStep[]>(INITIAL_STEPS);
  const [isComplete, setIsComplete] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const deferredPromise = useRef<Promise<string[]> | null>(null);

  const runBuild = useCallback(async () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setIsComplete(false);
    setBuildSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));

    // Fire deferred items API call in parallel (don't await yet)
    deferredPromise.current = getDeferredItems(prompt);

    // Run steps sequentially at 800ms each
    for (let i = 0; i < INITIAL_STEPS.length; i++) {
      setBuildSteps((prev) =>
        prev.map((s, j) =>
          j === i ? { ...s, status: "running" } : s
        )
      );
      await new Promise((r) => setTimeout(r, 800));
      setBuildSteps((prev) =>
        prev.map((s, j) =>
          j === i ? { ...s, status: "done" } : s
        )
      );
    }

    // Await deferred items (should be ready by now)
    try {
      const items = await deferredPromise.current;
      setDeferredItems(items);
    } catch {
      setDeferredItems([
        "Advanced settings",
        "User management",
        "Analytics dashboard",
      ]);
    }

    setIsComplete(true);
    setIsBuilding(false);
  }, [isBuilding, prompt]);

  const handleImplement = useCallback(
    (implementPrompt: string) => {
      // Extract item name from the prompt pattern "Build X for: Y"
      const match = implementPrompt.match(/^Build (.+) for:/);
      if (match) {
        setCompletedItems((prev) => [...prev, match[1]]);
      }
      setPhase((p) => p + 1);
      setChatInput(implementPrompt);
    },
    []
  );

  return (
    <div className="flex h-full flex-col">
      {/* Project header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Project {id}</h2>
        <button
          disabled
          className="flex items-center gap-2 rounded-lg bg-orange/20 px-3 py-1.5 text-xs font-semibold text-orange opacity-50 cursor-not-allowed"
        >
          <Rocket size={14} />
          Deploy
        </button>
      </div>

      {/* 3-panel layout */}
      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[240px_1fr_1fr]">
        {/* File tree */}
        <div className="hidden border-r border-border p-4 lg:block">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/30">
            <FolderTree size={14} />
            Files
          </div>
          <p className="mt-8 text-center text-xs text-white/20">No files</p>
        </div>

        {/* Chat panel */}
        <div className="flex flex-col border-r border-border">
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/30">
              <MessageSquare size={14} />
              Chat
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <div className="flex-1 p-4">
              {chatInput && (
                <div className="rounded-lg border border-border bg-white/[0.02] p-3 text-sm text-white/70">
                  {chatInput}
                </div>
              )}
            </div>
            <div className="border-t border-border p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput || prompt}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    setPrompt(e.target.value);
                  }}
                  placeholder="Describe what to build..."
                  className="flex-1 rounded-lg border border-border bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-orange/50"
                />
                <button
                  onClick={runBuild}
                  disabled={isBuilding}
                  className="flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={14} />
                  {isBuilding ? "Building…" : "Start Build"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview pane */}
        <div className="hidden flex-col lg:flex">
          <div className="border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/30">
              <Monitor size={14} />
              Preview
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {buildSteps.some((s) => s.status !== "pending") ? (
              <GenerationTimeline
                steps={buildSteps}
                isComplete={isComplete}
                deferredItems={deferredItems}
                originalPrompt={prompt}
                phase={phase}
                completedItems={completedItems}
                onImplement={handleImplement}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-white/20">
                  Click &quot;Start Build&quot; to begin
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
