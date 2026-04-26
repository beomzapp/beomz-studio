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
const ProfilePage = lazy(() =>
  import("./app/routes/studio/ProfilePage").then(m => ({ default: m.ProfilePage })),
);
const VersionPreviewPage = lazy(() =>
  import("./app/routes/studio/VersionPreviewPage").then(m => ({ default: m.VersionPreviewPage })),
);
const SettingsLayout = lazy(() =>
  import("./app/routes/studio/SettingsLayout").then(m => ({ default: m.SettingsLayout })),
);
const SettingsProfilePage = lazy(() =>
  import("./app/routes/studio/SettingsProfilePage").then(m => ({ default: m.SettingsProfilePage })),
);
const SettingsBillingPage = lazy(() =>
  import("./app/routes/studio/SettingsBillingPage").then(m => ({ default: m.SettingsBillingPage })),
);
const SettingsIntegrationsPage = lazy(() =>
  import("./app/routes/studio/SettingsIntegrationsPage").then(m => ({ default: m.SettingsIntegrationsPage })),
);
const SettingsAIPersonalityPage = lazy(() =>
  import("./app/routes/studio/SettingsAIPersonalityPage").then(m => ({ default: m.SettingsAIPersonalityPage })),
);
const SettingsNotificationsPage = lazy(() =>
  import("./app/routes/studio/SettingsNotificationsPage").then(m => ({ default: m.SettingsNotificationsPage })),
);
const SettingsWorkspaceKnowledgePage = lazy(() =>
  import("./app/routes/studio/SettingsWorkspaceKnowledgePage").then(m => ({ default: m.SettingsWorkspaceKnowledgePage })),
);
const SettingsSecurityPage = lazy(() =>
  import("./app/routes/studio/SettingsSecurityPage").then(m => ({ default: m.SettingsSecurityPage })),
);
const SettingsWalletPage = lazy(() =>
  import("./app/routes/studio/SettingsWalletPage").then(m => ({ default: m.SettingsWalletPage })),
);
const SettingsReferralsPage = lazy(() =>
  import("./app/routes/studio/SettingsReferralsPage").then(m => ({ default: m.SettingsReferralsPage })),
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
const TermsPage = lazy(() =>
  import("./app/routes/marketing/TermsPage").then(m => ({ default: m.TermsPage })),
);
const PrivacyPage = lazy(() =>
  import("./app/routes/marketing/PrivacyPage").then(m => ({ default: m.PrivacyPage })),
);
const FaqPage = lazy(() =>
  import("./app/routes/marketing/FaqPage").then(m => ({ default: m.FaqPage })),
);
const SupportPage = lazy(() =>
  import("./app/routes/marketing/SupportPage").then(m => ({ default: m.SupportPage })),
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

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: withSuspense(TermsPage),
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: withSuspense(PrivacyPage),
});

const faqRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/faq",
  component: withSuspense(FaqPage),
});

const supportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/support",
  component: withSuspense(SupportPage),
});

// BEO-610: /signup?ref=CODE — save referral code then redirect to home
const signupRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
  }),
  beforeLoad: ({ search }) => {
    if (search.ref) {
      localStorage.setItem("referral_code", search.ref);
    }
    throw redirect({ to: "/" });
  },
  component: () => null,
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

// Settings layout route — renders SettingsLayout (sidebar + outlet).
// The beforeLoad redirect handles bare /studio/settings → /studio/settings/profile.
const settingsRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/settings",
  component: withSuspense(SettingsLayout),
  beforeLoad: ({ location }) => {
    const p = location.pathname;
    if (p === "/studio/settings" || p === "/studio/settings/") {
      throw redirect({ to: "/studio/settings/profile" });
    }
  },
});

// Settings sub-pages (all render inside SettingsLayout's <Outlet />)
const settingsProfileRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/profile",
  component: withSuspense(SettingsProfilePage),
});

const settingsBillingRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/billing",
  component: withSuspense(SettingsBillingPage),
});

const settingsIntegrationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/integrations",
  component: withSuspense(SettingsIntegrationsPage),
});

const settingsAIPersonalityRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/ai-personality",
  component: withSuspense(SettingsAIPersonalityPage),
});

const settingsNotificationsRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/notifications",
  component: withSuspense(SettingsNotificationsPage),
});

const settingsWorkspaceKnowledgeRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/workspace-knowledge",
  component: withSuspense(SettingsWorkspaceKnowledgePage),
});

const settingsSecurityRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/security",
  component: withSuspense(SettingsSecurityPage),
});

const settingsWalletRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: "/wallet",
  component: withSuspense(SettingsWalletPage),
});

// Referrals stays as a direct child of studioRoute (no settings sidebar)
const settingsReferralsRoute = createRoute({
  getParentRoute: () => studioRoute,
  path: "/settings/referrals",
  component: withSuspense(SettingsReferralsPage),
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
  signupRedirectRoute,
  publicAppRoute,
  authLoginRoute,
  authSignupRoute,
  authCallbackRoute,
  termsRoute,
  privacyRoute,
  faqRoute,
  supportRoute,
  studioRoute.addChildren([
    studioHomeRoute,
    projectRoute,
    imagesRoute,
    agentsRoute,
    settingsRoute.addChildren([
      settingsProfileRoute,
      settingsBillingRoute,
      settingsIntegrationsRoute,
      settingsAIPersonalityRoute,
      settingsNotificationsRoute,
      settingsWorkspaceKnowledgeRoute,
      settingsSecurityRoute,
      settingsWalletRoute,
    ]),
    settingsReferralsRoute,
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
