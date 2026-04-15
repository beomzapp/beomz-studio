import { Outlet, useRouterState } from "@tanstack/react-router";
import { PageTransition } from "./PageTransition";
import { PricingModalProvider } from "../../contexts/PricingModalContext";
import { PricingModal } from "../PricingModal";

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <PricingModalProvider>
      <PageTransition routeKey={pathname}>
        <Outlet />
      </PageTransition>
      <PricingModal />
    </PricingModalProvider>
  );
}
