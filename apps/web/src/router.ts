/**
 * Router — BEO-580: heavy routes are code-split via React.lazy() so the
 * landing/marketing entry doesn't ship the full builder, database panel,
 * code editor, and image/agent surfaces. Only the landing page, the public
 * preview embed, and the auth callback (smallest possible) sit in the main
 * chunk; everything else loads on demand.
 */

import { lazy, Suspense, createElement, type ComponentType, type FunctionComponent } from "react";
import {
  createRouter,
  createRootRoute,
  createRoute,
  redirect,
} from "@tanstack/react-router";
import { supabase } from "./lib/supabase";
import { RootLayout } from "./components/layout/RootLayout";
import { LandingPage } from "./app/routes/marketing/LandingPage";

// Eager imports above are kept in the main bundle. Everything below is
// lazy-loaded so it falls into its own chunk.
const PlanPage = lazy(() =>
  import("./app/routes/marketing/PlanPage").then(m => ({ default: m.PlanPage })),
);
const StudioLayout = lazy(() =>
  import("./app/routes/studio/StudioLayout").then(m => ({ default: m.StudioLayout })),
);
const HomePage = lazy(() =>
  import("./app/routes/studio/HomePage").then(m => ({ default: m.HomePage })),
);
const ProjectPage = lazy(() =>
  import("./app/routes/studio/ProjectPage").then(m => ({ default: m.ProjectPage })),
);
const ImagesPage = lazy(() =>
  import("./app/routes/studio/ImagesPage").then(m => ({ default: m.ImagesPage })),
);
const AgentsPage = lazy(() =>
  import("./app/routes/studio/AgentsPage").then(m => ({ default: m.AgentsPage })),
);
const SettingsPage = lazy(() =>
  import("./app/routes/studio/SettingsPage").then(m => ({ default: m.SettingsPage })),
);
const ProfilePage = lazy(() =>
  import("./app/routes/studio/ProfilePage").then(m => ({ default: m.ProfilePage })),
);
const VersionPreviewPage = lazy(() =>
  import("./app/routes/studio/VersionPreviewPage").then(m => ({ default: m.VersionPreviewPage })),
);
const LoginPage = lazy(() =>
  import("./app/routes/auth/login").then(m => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import("./app/routes/auth/signup").then(m => ({ default: m.SignupPage })),
);
const AuthCallback = lazy(() =>
  import("./app/routes/auth/callback").then(m => ({ default: m.AuthCallback })),
);
const PublicAppPage = lazy(() =>
  import("./app/routes/public/PublicAppPage").then(m => ({ default: m.PublicAppPage })),
);

/**
 * BEO-580: while a lazy chunk loads, show a transparent placeholder. The
 * inline app shell in index.html is still on screen for the very first
 * navigation, and on intra-app navigation the spinner inside individual
 * panels covers the gap. We deliberately avoid a heavyweight fallback so
 * the route swap feels instant.
 */
function withSuspense<P extends object>(
  Component: ComponentType<P>,
): FunctionComponent<P> {
  const Wrapped: FunctionComponent<P> = (props) =>
    createElement(
      Suspense,
      { fallback: null },
      createElement(Component, props as P & React.Attributes),
    );
  Wrapped.displayName = `Suspended(${Component.displayName ?? Component.name ?? "Component"})`;
  return Wrapped;
}

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
  component: withSuspense(PlanPage),
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
});

// /pricing is now served by a global modal (usePricingModal()), so the route
// redirects to home. The PricingModal component is mounted in RootLayout.
const pricingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pricing",
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});

const authLoginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/login",
  component: withSuspense(LoginPage),
});

const authSignupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/signup",
  component: withSuspense(SignupPage),
});

const authCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/callback",
  component: withSuspense(AuthCallback),
});

const publicAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$slug",
  component: () => {
    const { slug } = publicAppRoute.useParams();
    return createElement(
      Suspense,
      { fallback: null },
      createElement(PublicAppPage, { slug }),
    );
  },
});

const studioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/studio",
  component: withSuspense(StudioLayout),
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
  component: withSuspense(HomePage),
});

const projectRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/project/$id",
  component: withSuspense(ProjectPage),
});

const imagesRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/images",
  component: withSuspense(ImagesPage),
});

const agentsRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/agents",
  component: withSuspense(AgentsPage),
});

const settingsRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/settings",
  component: withSuspense(SettingsPage),
});

const profileRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/profile",
  component: withSuspense(ProfilePage),
});

const versionPreviewRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/version-preview",
  component: withSuspense(VersionPreviewPage),
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
    profileRoute,
    versionPreviewRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
