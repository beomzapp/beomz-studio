import { Outlet, useRouterState } from "@tanstack/react-router";
import { PageTransition } from "./PageTransition";

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <PageTransition routeKey={pathname}>
      <Outlet />
    </PageTransition>
  );
}
