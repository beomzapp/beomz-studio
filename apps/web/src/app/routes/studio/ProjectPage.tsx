import { useParams } from "@tanstack/react-router";
import { BuilderView } from "../../../components/studio/BuilderView";

export function ProjectPage() {
  const { id } = useParams({ from: "/studio/project/$id" });

  return (
    <BuilderView
      initialPrompt="a SaaS dashboard"
      projectId={id}
      light
    />
  );
}
