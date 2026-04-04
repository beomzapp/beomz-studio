import { useCallback, useRef, useState } from "react";
import type {
  ClarifyQuestion,
  PlanGenerateRequest,
  PlanPhase,
  PlanSession,
} from "@beomz-studio/contracts";

import {
  createPlanSession,
  streamPlanClarify,
  streamPlanGenerate,
  updatePlanSession,
} from "./planSession";
import {
  toEditablePlanSteps,
  toPlanSteps,
  type EditablePlanStep,
} from "./planSteps";

export interface PlanConversationState {
  phase: PlanPhase | "idle";
  prompt: string;
  intro: string;
  streamingText: string;
  questions: readonly ClarifyQuestion[];
  answers: Record<string, string>;
  visibleUpTo: number;
  summary: string;
  steps: EditablePlanStep[];
  sessionId: string | null;
  error: string | null;
}

export interface ApprovedPlanContext {
  prompt: string;
  sessionId: string;
  steps: ReturnType<typeof toPlanSteps>;
  summary: string;
}

const INITIAL_STATE: PlanConversationState = {
  phase: "idle",
  prompt: "",
  intro: "",
  streamingText: "",
  questions: [],
  answers: {},
  visibleUpTo: 0,
  summary: "",
  steps: [],
  sessionId: null,
  error: null,
};

function buildAnsweredCount(questions: readonly ClarifyQuestion[], answers: Record<string, string>): number {
  return questions.filter((question) => Boolean(answers[question.id])).length;
}

function hydrateState(session: PlanSession): PlanConversationState {
  const answeredCount = buildAnsweredCount(session.questions, session.answers);
  const isQuestionPhase =
    session.phase === "awaiting_answers" || session.phase === "streaming_intro";
  const isSummaryPhase =
    session.phase === "streaming_summary"
    || session.phase === "ready"
    || session.phase === "approved";

  return {
    phase: session.phase,
    prompt: session.prompt,
    intro: isQuestionPhase ? (session.summary ?? "") : "",
    streamingText: "",
    questions: session.questions,
    answers: session.answers,
    visibleUpTo: Math.max(0, Math.min(answeredCount, Math.max(session.questions.length - 1, 0))),
    summary: isSummaryPhase ? (session.summary ?? "") : "",
    steps: toEditablePlanSteps(session.steps),
    sessionId: session.id,
    error: null,
  };
}

export function useConversationalPlanMode() {
  const [state, setState] = useState<PlanConversationState>(INITIAL_STATE);
  const streamTokenRef = useRef(0);

  const reset = useCallback(() => {
    streamTokenRef.current += 1;
    setState(INITIAL_STATE);
  }, []);

  const runGenerate = useCallback(
    async (
      prompt: string,
      questions: readonly ClarifyQuestion[],
      answers: Record<string, string>,
      sessionId: string,
    ) => {
      const streamToken = ++streamTokenRef.current;

      setState((prev) => ({
        ...prev,
        error: null,
        phase: "streaming_summary",
        streamingText: "",
        summary: "",
      }));

      await updatePlanSession(sessionId, {
        answers,
        phase: "streaming_summary",
        summary: null,
        steps: [],
      });

      const response = await streamPlanGenerate(
        prompt,
        questions
          .filter((question) => Boolean(answers[question.id]))
          .map((question) => ({
            answer: answers[question.id],
            questionId: question.id,
          })) satisfies PlanGenerateRequest["answers"],
        (partialSummary) => {
          if (streamToken !== streamTokenRef.current) return;
          setState((prev) => ({
            ...prev,
            streamingText: partialSummary,
          }));
        },
      );

      if (streamToken !== streamTokenRef.current) return;

      await updatePlanSession(sessionId, {
        answers,
        phase: "ready",
        steps: response.steps,
        summary: response.summary,
      });

      setState((prev) => ({
        ...prev,
        error: null,
        phase: "ready",
        steps: toEditablePlanSteps(response.steps),
        streamingText: "",
        summary: response.summary,
      }));
    },
    [],
  );

  const runClarify = useCallback(
    async (prompt: string, existingSessionId?: string) => {
      const sessionId = existingSessionId
        ?? (await createPlanSession({ prompt })).sessionId;
      const streamToken = ++streamTokenRef.current;

      setState({
        answers: {},
        error: null,
        intro: "",
        phase: "streaming_intro",
        prompt,
        questions: [],
        sessionId,
        steps: [],
        streamingText: "",
        summary: "",
        visibleUpTo: 0,
      });

      await updatePlanSession(sessionId, {
        answers: {},
        phase: "streaming_intro",
        questions: [],
        steps: [],
        summary: null,
      });

      const response = await streamPlanClarify(prompt, (partialIntro) => {
        if (streamToken !== streamTokenRef.current) return;
        setState((prev) => ({
          ...prev,
          intro: partialIntro,
          streamingText: partialIntro,
        }));
      });

      if (streamToken !== streamTokenRef.current) return;

      await updatePlanSession(sessionId, {
        answers: {},
        phase: "awaiting_answers",
        questions: response.questions,
        steps: [],
        summary: response.intro,
      });

      setState({
        answers: {},
        error: null,
        intro: response.intro,
        phase: "awaiting_answers",
        prompt,
        questions: response.questions,
        sessionId,
        steps: [],
        streamingText: "",
        summary: "",
        visibleUpTo: 0,
      });
    },
    [],
  );

  const start = useCallback(async (prompt: string) => {
    try {
      await runClarify(prompt.trim());
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to start plan mode.",
      }));
    }
  }, [runClarify]);

  const answerQuestion = useCallback(
    async (questionId: string, answer: string) => {
      const nextAnswers = { ...state.answers, [questionId]: answer };
      const answeredCount = buildAnsweredCount(state.questions, nextAnswers);
      const nextVisible = Math.max(
        0,
        Math.min(answeredCount, Math.max(state.questions.length - 1, 0)),
      );

      setState((prev) => ({
        ...prev,
        answers: nextAnswers,
        error: null,
        visibleUpTo: nextVisible,
      }));

      if (!state.sessionId) return;

      await updatePlanSession(state.sessionId, {
        answers: nextAnswers,
        phase: "awaiting_answers",
      });

      if (answeredCount === state.questions.length && state.questions.length > 0) {
        try {
          await runGenerate(state.prompt, state.questions, nextAnswers, state.sessionId);
        } catch (error) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Failed to generate plan.",
          }));
        }
      }
    },
    [runGenerate, state.answers, state.prompt, state.questions, state.sessionId],
  );

  const setSteps = useCallback((steps: EditablePlanStep[]) => {
    setState((prev) => ({ ...prev, steps }));
  }, []);

  const revise = useCallback(async () => {
    if (!state.prompt || !state.sessionId) return;

    try {
      await runClarify(state.prompt, state.sessionId);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to revise plan.",
      }));
    }
  }, [runClarify, state.prompt, state.sessionId]);

  const approve = useCallback(async (): Promise<ApprovedPlanContext | null> => {
    if (!state.sessionId) return null;

    const steps = toPlanSteps(state.steps);
    await updatePlanSession(state.sessionId, {
      phase: "approved",
      steps,
      summary: state.summary,
    });

    setState((prev) => ({ ...prev, phase: "approved" }));

    return {
      prompt: state.prompt,
      sessionId: state.sessionId,
      steps,
      summary: state.summary,
    };
  }, [state.prompt, state.sessionId, state.steps, state.summary]);

  const hydrate = useCallback(
    async (session: PlanSession) => {
      setState(hydrateState(session));

      if (session.phase === "streaming_intro") {
        await runClarify(session.prompt, session.id);
        return;
      }

      if (session.phase === "streaming_summary") {
        try {
          await runGenerate(
            session.prompt,
            session.questions,
            session.answers,
            session.id,
          );
        } catch (error) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Failed to resume plan generation.",
          }));
        }
      }
    },
    [runClarify, runGenerate],
  );

  return {
    approve,
    answerQuestion,
    hydrate,
    reset,
    revise,
    setSteps,
    start,
    state,
  };
}
