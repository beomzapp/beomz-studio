import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MarketingNav } from "./MarketingNav";
import { FinalCtaBanner } from "./FinalCtaBanner";
import { MarketingFooter } from "./MarketingFooter";
import { AuthModal } from "../auth/AuthModal";

interface MarketingPageLayoutProps {
  children: ReactNode;
  /** Skip FinalCtaBanner (e.g. on LandingPage which has its own hero CTA). */
  hideCta?: boolean;
}

export function MarketingPageLayout({ children, hideCta = false }: MarketingPageLayoutProps) {
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  const openSignIn = () => {
    setAuthMode("signin");
    setShowAuthModal(true);
  };

  const openGetStarted = () => {
    setAuthMode("signup");
    setShowAuthModal(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#131313", color: "#fff" }}>
      <MarketingNav
        onSignInClick={openSignIn}
        onGetStartedClick={openGetStarted}
      />
      <main>{children}</main>
      {!hideCta && <FinalCtaBanner onGetStartedClick={openGetStarted} />}
      <MarketingFooter />

      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={() => void navigate({ to: "/studio/home" })}
        initialMode={authMode}
      />
    </div>
  );
}
