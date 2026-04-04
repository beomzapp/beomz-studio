import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import {
  Rocket,
  FolderTree,
  MessageSquare,
  Monitor,
  Play,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  GenerationTimeline,
  PreviewPane,
  type TimelineStep,
} from "../../../components/studio";
import {
  getBuildStatus,
  startBuild,
  type BuildPayload,
} from "../../../lib/api";
import { getDeferredItems } from "../../../lib/getDeferredItems";

const INITIAL_STEPS: TimelineStep[] = [
  { label: "Planning", status: "pending" },
  { label: "Selecting approach", status: "pending" },
  { label: "Generating files", status: "pending" },
  { label: "Validating", status: "pending" },
  { label: "Complete", status: "pending" },
];

export function ProjectPage() {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/studio/project/$id" });
  const [activeProjectId, setActiveProjectId] = useState(id);
  const [build, setBuild] = useState<BuildPayload | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("a SaaS dashboard");
  const [phase, setPhase] = useState(1);
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [deferredItems, setDeferredItems] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const deferredPromise = useRef<Promise<string[]> | null>(null);

  const runBuild = useCallback(async () => {
    if (isBuilding) return;
    setIsBuilding(true);
    setBuild(null);
    setBuildError(null);
    setDeferredItems([]);

    deferredPromise.current = getDeferredItems(prompt);

    try {
      const response = await startBuild({
        prompt,
      });

      setActiveProjectId(response.project.id);
      setBuild(response.build);
      setChatInput(prompt);

      if (response.project.id !== id) {
        await navigate({
          params: {
            id: response.project.id,
          },
          to: "/studio/project/$id",
        });
      }
    } catch (error) {
      setBuildError(
        error instanceof Error ? error.message : "Failed to start the build.",
      );
      setIsBuilding(false);
    }
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

  useEffect(() => {
    setActiveProjectId(id);
  }, [id]);

  useEffect(() => {
    if (!build || build.status === "completed" || build.status === "failed" || build.status === "cancelled") {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await getBuildStatus(build.id);
        setBuild(response.build);

        if (response.build.status === "completed") {
          try {
            const items = await deferredPromise.current;
            setDeferredItems(
              items ?? [
                "Advanced settings",
                "User management",
                "Analytics dashboard",
              ],
            );
          } catch {
            setDeferredItems([
              "Advanced settings",
              "User management",
              "Analytics dashboard",
            ]);
          }

          setIsBuilding(false);
          return;
        }

        if (response.build.status === "failed" || response.build.status === "cancelled") {
          setIsBuilding(false);
          setBuildError(response.build.error ?? "The build stopped before completion.");
        }
      } catch (error) {
        setIsBuilding(false);
        setBuildError(
          error instanceof Error ? error.message : "Failed to refresh build status.",
        );
      }
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [build]);

  const buildSteps = useMemo<TimelineStep[]>(() => {
    if (!build) {
      return INITIAL_STEPS;
    }

    const steps: TimelineStep[] = INITIAL_STEPS.map((step) => ({ ...step }));
    const phaseOrder = [
      "planner",
      "template-selector",
      "generate",
      "validate",
      "completed",
      "fallback-completed",
    ];
    const activePhaseIndex = build.phase ? phaseOrder.indexOf(build.phase) : -1;
    const buildFailed = build.status === "failed" || build.status === "cancelled";

    steps.forEach((step, index) => {
      if (build.status === "completed") {
        step.status = "done";
        return;
      }

      if (activePhaseIndex > index) {
        step.status = "done";
        return;
      }

      if (activePhaseIndex === index || (activePhaseIndex === -1 && index === 0 && build.status !== "queued")) {
        step.status = buildFailed ? "error" : "running";
      }
    });

    if (build.status === "queued") {
      steps[0] = { ...steps[0], status: "running" };
    }

    if (buildFailed && activePhaseIndex === -1) {
      steps[0] = { ...steps[0], status: "error" };
    }

    if (build.status === "completed") {
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: "done" };
    }

    return steps;
  }, [build]);

  const isComplete = build?.status === "completed";
  const isThinking = isBuilding && (!build?.phase || build.phase === "planner");

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
              {build?.summary && (
                <div
                  className={`mt-3 rounded-lg border border-border bg-white/[0.02] p-3 text-sm text-white/55${isBuilding ? " streaming-shimmer" : ""}`}
                >
                  {build.summary}
                </div>
              )}
              {buildError && (
                <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {buildError}
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
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 border-b border-border">
              <PreviewPane
                generationId={build?.id}
                projectId={activeProjectId}
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              <GenerationTimeline
                steps={buildSteps}
                isComplete={isComplete}
                isThinking={isThinking}
                deferredItems={deferredItems}
                originalPrompt={prompt}
                phase={phase}
                completedItems={completedItems}
                onImplement={handleImplement}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
