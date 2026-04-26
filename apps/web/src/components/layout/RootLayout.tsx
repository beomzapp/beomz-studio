import { Outlet, useRouterState } from "@tanstack/react-router";
import { PageTransition } from "./PageTransition";
import { PricingModalProvider } from "../../contexts/PricingModalContext";
import { PricingModal } from "../PricingModal";
import { CreditsProvider } from "../../lib/CreditsContext";

export function RootLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <PricingModalProvider>
      <CreditsProvider>
        <PageTransition routeKey={pathname}>
          <Outlet />
        </PageTransition>
        <PricingModal />
      </CreditsProvider>
    </PricingModalProvider>
  );
}
