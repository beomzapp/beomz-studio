import { Link } from "@tanstack/react-router";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

export function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
      <BeomzLogo className="mb-8 h-7 w-auto text-white" />
      <h1 className="text-2xl font-bold text-white">Terms of Service</h1>
      <p className="mt-3 text-sm text-white/40">Coming soon</p>
      <Link to="/" className="mt-8 text-sm text-white/30 transition-colors hover:text-white/60">
        ← Back to home
      </Link>
    </div>
  );
}
