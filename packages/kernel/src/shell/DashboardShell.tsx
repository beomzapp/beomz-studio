import type { AppShellProps } from "./AppShell.js";
import { AppShell } from "./AppShell.js";

export interface DashboardShellProps extends Omit<AppShellProps, "variant"> {}

export function DashboardShell(props: DashboardShellProps) {
  return <AppShell variant="dashboard" {...props} />;
}
