import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
} from "@tanstack/react-router";
import { supabase } from "./lib/supabase";
import { RootLayout } from "./components/layout/RootLayout";
import { LandingPage } from "./app/routes/marketing/LandingPage";
import { PlanPage } from "./app/routes/marketing/PlanPage";
import { StudioLayout } from "./app/routes/studio/StudioLayout";
import { HomePage } from "./app/routes/studio/HomePage";
import { ProjectPage } from "./app/routes/studio/ProjectPage";
import { ImagesPage } from "./app/routes/studio/ImagesPage";
import { AgentsPage } from "./app/routes/studio/AgentsPage";
import { SettingsPage } from "./app/routes/studio/SettingsPage";
import { PricingPage } from "./app/routes/marketing/PricingPage";
import { LoginPage } from "./app/routes/auth/login";
import { SignupPage } from "./app/routes/auth/signup";
import { AuthCallback } from "./app/routes/auth/callback";
import { PublicAppPage } from "./app/routes/public/PublicAppPage";

const rootRoute = createRootRoute({
  component: RootLayout,
});

const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const planRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/plan",
  component: PlanPage,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
});

const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pricing",
  component: PricingPage,
});

const authLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/login",
  component: LoginPage,
});

const authSignupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/signup",
  component: SignupPage,
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: AuthCallback,
});

const publicAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$slug",
  component: () => {
    const { slug } = publicAppRoute.useParams();
    return PublicAppPage({ slug });
  },
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
      throw redirect({ to: "/auth/login" });
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
  planRoute,
  pricingRoute,
  publicAppRoute,
  authLoginRoute,
  authSignupRoute,
  authCallbackRoute,
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
