import type { AppShellProps } from "./AppShell.js";
import { AppShell } from "./AppShell.js";

export interface WebsiteShellProps extends Omit<AppShellProps, "variant"> {}

export function WebsiteShell(props: WebsiteShellProps) {
  return <AppShell variant="website" {...props} />;
}
