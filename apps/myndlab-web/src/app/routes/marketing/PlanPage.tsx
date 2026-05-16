/**
 * PlanPage — standalone route wrapper for the PlanItScreen.
 * Reads the prompt from the `?q=` search param and renders the planning conversation.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { PlanItScreen } from "./PlanItScreen";

export function PlanPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/plan" }) as { q?: string };
  const prompt = search.q ?? "";

  if (!prompt) {
    // No prompt — redirect back to landing
    navigate({ to: "/" });
    return null;
  }

  return (
    <PlanItScreen
      prompt={prompt}
      onBack={() => navigate({ to: "/" })}
    />
  );
}
