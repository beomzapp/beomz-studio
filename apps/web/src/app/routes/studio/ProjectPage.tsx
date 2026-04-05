import { useState } from "react";
import { useParams } from "@tanstack/react-router";

import { BuilderView } from "../../../components/studio/BuilderView";
import { consumeProjectLaunchIntent } from "../../../lib/projectLaunchIntent";

export function ProjectPage() {
  const { id } = useParams({ from: "/studio/project/$id" });
  const [launchIntent] = useState(() =>
    id === "new" ? consumeProjectLaunchIntent() : null,
  );

  return (
    <BuilderView
      approvedPlan={launchIntent?.approvedPlan}
      initialPrompt={launchIntent?.prompt ?? ""}
      light
      projectId={id}
    />
  );
}
