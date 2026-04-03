import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
} from "@tanstack/react-router";
import { supabase } from "./lib/supabase";
import { LandingPage } from "./app/routes/marketing/LandingPage";
import { StudioLayout } from "./app/routes/studio/StudioLayout";
import { HomePage } from "./app/routes/studio/HomePage";
import { ProjectPage } from "./app/routes/studio/ProjectPage";
import { ImagesPage } from "./app/routes/studio/ImagesPage";
import { AgentsPage } from "./app/routes/studio/AgentsPage";
import { SettingsPage } from "./app/routes/studio/SettingsPage";
import { PricingPage } from "./app/routes/marketing/PricingPage";

const rootRoute = createRootRoute();

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pricing",
  component: PricingPage,
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/studio",
  component: StudioLayout,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw redirect({ to: "/" });
    }
  },
});

const studioHomeRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/home",
  component: HomePage,
});

const projectRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/project/$id",
  component: ProjectPage,
});

const imagesRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/images",
  component: ImagesPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/agents",
  component: AgentsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  pricingRoute,
  studioRoute.addChildren([
    studioHomeRoute,
    projectRoute,
    imagesRoute,
    agentsRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
