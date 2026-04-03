import type { AppShellProps } from "./AppShell.js";
import { AppShell } from "./AppShell.js";

export interface WorkspaceShellProps extends Omit<AppShellProps, "variant"> {}

export function WorkspaceShell(props: WorkspaceShellProps) {
  return <AppShell variant="workspace" {...props} />;
}
