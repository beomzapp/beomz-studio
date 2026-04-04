/**
 * BuilderView — 3-panel builder layout (Files | Chat | Preview).
 * Extracted from ProjectPage so it can render both as a route and
 * as an embedded floor inside LandingPage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlanStep as ApprovedPlanStep } from "@beomz-studio/contracts";
import {
  Rocket,
  FolderTree,
  MessageSquare,
  Monitor,
  Play,
  Brain,
  Layers,
  Code,
  ShieldCheck,
  CheckCircle,
  XCircle,
  ListChecks,
} from "lucide-react";
import {
  BuildLog,
  GenerationTimeline,
  PlanStepButton,
  PreviewPane,
  type TimelineStep,
} from ".";
import { ConversationalPlanPanel } from "./ConversationalPlanPanel";
import type { PlanStep as DeferredPlanStep } from "./PlanStepButton";
import type { LogEntryData } from "./LogEntry";
import {
  getBuildStatus,
  startBuild,
  type BuildPayload,
} from "../../lib/api";
import { getDeferredItems } from "../../lib/getDeferredItems";
import { serializeTaskPlan } from "../../lib/serializeTaskPlan";
import { useConversationalPlanMode } from "../../lib/useConversationalPlanMode";

const PHASE_LOG: Record<string, { label: string; icon: React.ReactNode }> = {
  planner: { label: "Planning architecture", icon: <Brain size={12} /> },
  "template-selector": { label: "Selecting template", icon: <Layers size={12} /> },
  generate: { label: "Generating files", icon: <Code size={12} /> },
  validate: { label: "Validating output", icon: <ShieldCheck size={12} /> },
  completed: { label: "Generation complete", icon: <CheckCircle size={12} /> },
  "fallback-completed": { label: "Generation complete (fallback)", icon: <CheckCircle size={12} /> },
};

const INITIAL_STEPS: TimelineStep[] = [
  { label: "Planning", status: "pending" },
  { label: "Selecting approach", status: "pending" },
  { label: "Generating files", status: "pending" },
  { label: "Validating", status: "pending" },
  { label: "Complete", status: "pending" },
];

interface BuilderViewProps {
  /** Initial prompt — e.g. from LandingPage or plan approval */
  initialPrompt: string;
  /** Approved plan context — if provided, generation starts immediately with serialized plan */
  approvedPlan?: {
    planSessionId?: string;
    summary?: string;
    steps?: readonly ApprovedPlanStep[];
  };
  /** Project id — "new" for fresh project */
  projectId?: string;
  /** Use light (off-white) theme */
  light?: boolean;
}

export function BuilderView({
  initialPrompt,
  approvedPlan: incomingApprovedPlan,
  projectId: initialProjectId,
  light,
}: BuilderViewProps) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    initialProjectId && initialProjectId !== "new" ? initialProjectId : null,
  );
  const [build, setBuild] = useState<BuildPayload | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [phase, setPhase] = useState(1);
  const [completedItems, setCompletedItems] = useState<string[]>([]);
  const [deferredItems, setDeferredItems] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [planSteps, setPlanSteps] = useState<DeferredPlanStep[]>([]);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntryData[]>([]);
  const lastLoggedPhase = useRef<string | null>(null);
  const deferredPromise = useRef<Promise<string[]> | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Plan mode state (for direct builder entry without pre-approved plan)
  const [planModeActive, setPlanModeActive] = useState(false);
  const planMode = useConversationalPlanMode();

  // Theming helpers
  const border = light ? "border-[rgba(0,0,0,0.07)]" : "border-border";
  const textPrimary = light ? "text-[#1a1a1a]" : "text-white";
  const textMuted = light ? "text-[rgba(0,0,0,0.3)]" : "text-white/30";
  const textSecondary = light ? "text-[rgba(0,0,0,0.5)]" : "text-white/55";
  const bg = light ? "bg-[#faf9f6]" : "bg-bg";
  const bgCard = light ? "bg-white" : "bg-white/[0.02]";
  const inputBg = light ? "bg-white" : "bg-white/[0.02]";
  const inputText = light ? "text-[#1a1a1a] placeholder-[rgba(0,0,0,0.3)]" : "text-white placeholder-white/20";

  const seedLogFromTasks = useCallback((tasks: readonly ApprovedPlanStep[]) => {
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    setLogEntries(
      tasks.map((t, i) => ({
        id: `log-task-${i}-${t.title.toLowerCase().replace(/\s+/g, "-")}`,
        icon: <ListChecks size={12} />,
        label: t.title,
        detail: t.description,
        timestamp: ts,
        status: i === 0 ? ("running" as const) : ("pending" as const),
      })),
    );
  }, []);

  const runBuild = useCallback(
    async (input?: {
      approvedPlan?: {
        sessionId?: string;
        summary?: string;
        steps?: readonly ApprovedPlanStep[];
      };
      overridePrompt?: string;
    }) => {
      if (isBuilding) return;
      const buildPrompt = input?.overridePrompt ?? prompt;
      setIsBuilding(true);
      setBuild(null);
      setBuildError(null);
      setDeferredItems([]);
      if (!input?.overridePrompt) setLogEntries([]);
      lastLoggedPhase.current = null;

      deferredPromise.current = getDeferredItems(buildPrompt);

      try {
        const response = await startBuild({
          planSessionId: input?.approvedPlan?.sessionId,
          prompt: buildPrompt,
          steps: input?.approvedPlan?.steps,
          summary: input?.approvedPlan?.summary,
        });
        setActiveProjectId(response.project.id);
        setBuild(response.build);
        setChatInput(buildPrompt);
      } catch (error) {
        setBuildError(
          error instanceof Error ? error.message : "Failed to start the build.",
        );
        setIsBuilding(false);
      }
    },
    [isBuilding, prompt],
  );

  // Auto-start build if approved plan context is provided
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (incomingApprovedPlan?.steps && incomingApprovedPlan.steps.length > 0) {
      autoStarted.current = true;
      const serialized = serializeTaskPlan(initialPrompt, incomingApprovedPlan.steps);
      setPrompt(serialized);
      setChatInput(initialPrompt);
      seedLogFromTasks(incomingApprovedPlan.steps);
      void runBuild({
        approvedPlan: {
          sessionId: incomingApprovedPlan.planSessionId,
          steps: incomingApprovedPlan.steps,
          summary: incomingApprovedPlan.summary,
        },
        overridePrompt: serialized,
      });
    }
  }, [incomingApprovedPlan, initialPrompt, runBuild, seedLogFromTasks]);

  const handlePlanApprove = useCallback(
    async () => {
      const approved = await planMode.approve();
      if (!approved) return;

      const serialized = serializeTaskPlan(approved.prompt, approved.steps);
      seedLogFromTasks(approved.steps);
      setPrompt(serialized);
      setChatInput(approved.prompt);
      void runBuild({
        approvedPlan: approved,
        overridePrompt: serialized,
      });
    },
    [planMode, runBuild, seedLogFromTasks],
  );

  const handleStartClick = useCallback(async () => {
    if (planModeActive) {
      if (planMode.state.phase === "idle") {
        await planMode.start(prompt);
      }
      return;
    }
    void runBuild();
  }, [planMode, planModeActive, prompt, runBuild]);

  const handleImplement = useCallback(
    (implementPrompt: string) => {
      const match = implementPrompt.match(/^Build (.+) for:/);
      if (match) {
        setCompletedItems((prev) => [...prev, match[1]]);
      }
      setPhase((p) => p + 1);
      setChatInput(implementPrompt);
    },
    [],
  );

  const handleStepClick = useCallback(
    (step: DeferredPlanStep) => {
      if (step.status === "done") {
        document.getElementById(step.id)?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      const buildPrompt = `Build ${step.label} for: ${prompt}`;
      setActiveStepId(step.id);
      setPlanSteps((prev) =>
        prev.map((s) =>
          s.id === step.id ? { ...s, status: "running" as const } : s,
        ),
      );
      setPrompt(buildPrompt);
      setChatInput(buildPrompt);
      handleImplement(buildPrompt);
    },
    [prompt, handleImplement],
  );

  // Polling effect for build status
  useEffect(() => {
    if (
      !build ||
      build.status === "completed" ||
      build.status === "failed" ||
      build.status === "cancelled"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await getBuildStatus(build.id);
        setBuild(response.build);

        const currentPhase = response.build.phase;
        if (currentPhase && currentPhase !== lastLoggedPhase.current) {
          // Advance task-based log entries
          setLogEntries((prev) => {
            const copy = prev.map((e) => ({ ...e }));
            const runningIdx = copy.findIndex((e) => e.status === "running");
            if (runningIdx >= 0) copy[runningIdx].status = "done";
            const nextPending = copy.findIndex((e) => e.status === "pending");
            if (nextPending >= 0) copy[nextPending].status = "running";
            return copy;
          });

          // Also add engine phase log entries
          const meta = PHASE_LOG[currentPhase];
          if (meta) {
            const now = new Date();
            const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
            setLogEntries((prev) => [
              ...prev,
              {
                id: `log-${currentPhase}-${Date.now()}`,
                icon: meta.icon,
                label: meta.label,
                detail: "",
                timestamp: ts,
                status:
                  currentPhase === "completed" || currentPhase === "fallback-completed"
                    ? "done"
                    : ("running" as const),
              },
            ]);
          }
          lastLoggedPhase.current = currentPhase;
        }

        if (response.build.status === "completed") {
          // Mark all remaining log entries as done
          setLogEntries((prev) =>
            prev.map((e) =>
              e.status === "running" || e.status === "pending"
                ? { ...e, status: "done" as const }
                : e,
            ),
          );

          let items: string[];
          try {
            items = (await deferredPromise.current) ?? [
              "Advanced settings",
              "User management",
              "Analytics dashboard",
            ];
          } catch {
            items = ["Advanced settings", "User management", "Analytics dashboard"];
          }

          setDeferredItems(items);
          setPlanSteps((prev) => {
            const doneIds = new Set(prev.filter((s) => s.status === "done").map((s) => s.id));
            return items.map((label) => ({
              id: `step-${label.toLowerCase().replace(/\s+/g, "-")}`,
              label,
              status: doneIds.has(`step-${label.toLowerCase().replace(/\s+/g, "-")}`)
                ? ("done" as const)
                : ("pending" as const),
            }));
          });

          if (activeStepId) {
            setPlanSteps((prev) =>
              prev.map((s) =>
                s.id === activeStepId ? { ...s, status: "done" as const } : s,
              ),
            );
            setActiveStepId(null);
          }

          setIsBuilding(false);
          return;
        }

        if (response.build.status === "failed" || response.build.status === "cancelled") {
          const now = new Date();
          const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
          setLogEntries((prev) => [
            ...prev.map((e) =>
              e.status === "running" ? { ...e, status: "done" as const } : e,
            ),
            {
              id: `log-error-${Date.now()}`,
              icon: <XCircle size={12} />,
              label: "Error",
              detail: response.build.error ?? "Build stopped",
              timestamp: ts,
              status: "error" as const,
            },
          ]);
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
  }, [build, activeStepId]);

  const buildSteps = useMemo<TimelineStep[]>(() => {
    if (!build) return INITIAL_STEPS;

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
      if (
        activePhaseIndex === index ||
        (activePhaseIndex === -1 && index === 0 && build.status !== "queued")
      ) {
        step.status = buildFailed ? "error" : "running";
      }
    });

    if (build.status === "queued") steps[0] = { ...steps[0], status: "running" };
    if (buildFailed && activePhaseIndex === -1) steps[0] = { ...steps[0], status: "error" };
    if (build.status === "completed")
      steps[steps.length - 1] = { ...steps[steps.length - 1], status: "done" };

    return steps;
  }, [build]);

  const isComplete = build?.status === "completed";
  const isThinking = isBuilding && (!build?.phase || build.phase === "planner");

  return (
    <div className={`flex h-full flex-col ${bg}`}>
      {/* Project header */}
      <div className={`flex items-center justify-between border-b ${border} px-4 py-3`}>
        <h2 className={`text-sm font-semibold ${textPrimary}`}>
          {activeProjectId ? `Project ${activeProjectId.slice(0, 8)}` : "New project"}
        </h2>
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
        <div className={`hidden border-r ${border} p-4 lg:block`}>
          <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${textMuted}`}>
            <FolderTree size={14} />
            Files
          </div>
          <p className={`mt-8 text-center text-xs ${light ? "text-[rgba(0,0,0,0.15)]" : "text-white/20"}`}>
            No files
          </p>
        </div>

        {/* Chat panel */}
        <div className={`flex flex-col border-r ${border}`}>
          <div className={`border-b ${border} px-4 py-2`}>
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${textMuted}`}>
              <MessageSquare size={14} />
              Chat
            </div>
          </div>
          <div className="flex flex-1 flex-col">
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4">
              {planMode.state.phase !== "idle" && (
                <div className="mb-4">
                  <ConversationalPlanPanel
                    answers={planMode.state.answers}
                    error={planMode.state.error}
                    intro={planMode.state.intro}
                    light={light}
                    onAnswer={(questionId, answer) => {
                      void planMode.answerQuestion(questionId, answer);
                    }}
                    onApprove={() => {
                      void handlePlanApprove();
                    }}
                    onRevise={() => {
                      void planMode.revise();
                    }}
                    onStepsChange={planMode.setSteps}
                    phase={planMode.state.phase}
                    questions={planMode.state.questions}
                    steps={planMode.state.steps}
                    streamingText={planMode.state.streamingText}
                    summary={planMode.state.summary}
                    visibleUpTo={planMode.state.visibleUpTo}
                  />
                </div>
              )}

              {chatInput && planMode.state.phase === "idle" && (
                <div
                  id="chat-user-prompt"
                  className={`rounded-lg border ${border} ${bgCard} p-3 text-sm ${light ? "text-[rgba(0,0,0,0.6)]" : "text-white/70"}`}
                >
                  {chatInput}
                </div>
              )}
              {build?.summary && (
                <div
                  id="chat-ai-response"
                  className={`mt-3 rounded-lg border ${border} ${bgCard} p-3 text-sm ${textSecondary}${isBuilding ? " streaming-shimmer" : ""}`}
                >
                  {build.summary}
                </div>
              )}
              {planSteps.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${textMuted}`}>
                    Plan
                  </p>
                  {planSteps.map((step) => (
                    <PlanStepButton
                      key={step.id}
                      step={step}
                      onClick={handleStepClick}
                      light={light}
                    />
                  ))}
                </div>
              )}
              {buildError && (
                <div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">
                  {buildError}
                </div>
              )}
            </div>
            <div className={`border-t ${border} p-4`}>
              <div className="flex gap-2">
                {/* Plan mode toggle */}
                <button
                  onClick={() => {
                    setPlanModeActive((value) => {
                      const nextValue = !value;
                      if (!nextValue) {
                        planMode.reset();
                      }
                      return nextValue;
                    });
                  }}
                  title="Review build plan before generating"
                  className={
                    planModeActive
                      ? "flex items-center gap-1.5 rounded-lg border border-orange/50 bg-orange/10 px-3 py-2 text-xs font-medium text-orange"
                      : `flex items-center gap-1.5 rounded-lg border ${border} px-3 py-2 text-xs font-medium ${textMuted} transition-colors hover:${textSecondary}`
                  }
                >
                  <ListChecks size={14} />
                </button>

                <input
                  type="text"
                  value={chatInput || prompt}
                  onChange={(e) => {
                    setChatInput(e.target.value);
                    setPrompt(e.target.value);
                  }}
                  placeholder="Describe what to build..."
                  className={`flex-1 rounded-lg border ${border} ${inputBg} px-3 py-2 text-sm ${inputText} outline-none focus:border-orange/50`}
                />
                <button
                  onClick={handleStartClick}
                  disabled={
                    isBuilding
                    || (planModeActive && planMode.state.phase !== "idle")
                  }
                  className="flex items-center gap-2 rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={14} />
                  {isBuilding ? "Building\u2026" : planModeActive ? "Plan" : "Start Build"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Preview pane */}
        <div className="hidden flex-col lg:flex">
          <div className={`border-b ${border} px-4 py-2`}>
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${textMuted}`}>
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
                light={light}
              />
            </div>
            <BuildLog entries={logEntries} light={light} />
          </div>
        </div>
      </div>
    </div>
  );
}
