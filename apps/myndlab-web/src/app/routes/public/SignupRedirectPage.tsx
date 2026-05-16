/**
 * SignupRedirectPage — BEO-618
 * Handles /signup?ref=CODE referral entry point.
 * Saves ref code to localStorage (done in route beforeLoad), then redirects to /.
 */
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export function SignupRedirectPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/" });
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#faf9f6]">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F97316] border-t-transparent" />
    </div>
  );
}
