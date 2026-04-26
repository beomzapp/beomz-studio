/**
 * OnboardingModal — shown once to first-time users with no projects.
 * Offers prompt suggestions to get started quickly.
 */
import { Sparkles, Building2, Hospital, Rocket, PenLine } from "lucide-react";

const SUGGESTIONS = [
  {
    icon: Rocket,
    label: "A SaaS dashboard for my startup",
    prompt: "Build a SaaS dashboard for my startup with user analytics, subscription management, and a settings page",
  },
  {
    icon: Building2,
    label: "A property management system",
    prompt: "Build a property management system with tenant directory, lease tracking, maintenance requests, and rent payment overview",
  },
  {
    icon: Hospital,
    label: "A hospital management system",
    prompt: "Build a hospital management system with patient admissions, ward management, appointment scheduling, pharmacy dispensing, and lab results",
  },
  {
    icon: PenLine,
    label: "Something else...",
    prompt: "",
  },
] as const;

const STORAGE_KEY = "beomz.onboarding_completed";

export function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch { /* localStorage unavailable */ }
}

interface OnboardingModalProps {
  onSelect: (prompt: string) => void;
  onDismiss: () => void;
}

export function OnboardingModal({ onSelect, onDismiss }: OnboardingModalProps) {
  const handlePick = (prompt: string) => {
    markOnboardingCompleted();
    onSelect(prompt);
  };

  const handleSkip = () => {
    markOnboardingCompleted();
    onDismiss();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-xl"
        style={{ fontFamily: "DM Sans, sans-serif" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#F97316]/10">
            <Sparkles size={20} className="text-[#F97316]" />
          </div>
          <h2 className="text-xl font-bold text-[#1a1a1a]">Welcome to Beomz</h2>
          <p className="mt-1 text-sm text-[#9ca3af]">What are you building today?</p>
          <p className="mt-2 text-xs text-[#9ca3af]">
            200 free credits to start building · Invite friends — earn 50 credits per signup
            (first 3), 200 when they upgrade
          </p>
        </div>

        {/* Suggestion cards */}
        <div className="space-y-2 px-6 py-4">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => handlePick(s.prompt)}
              className="flex w-full items-center gap-3 rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-4 py-3 text-left transition-all hover:border-[#F97316]/40 hover:bg-[#fff7ed]"
            >
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-white text-[#F97316] shadow-sm">
                <s.icon size={16} />
              </div>
              <span className="text-sm font-medium text-[#374151]">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Skip link */}
        <div className="border-t border-[#f0eeeb] px-6 py-3 text-center">
          <button
            onClick={handleSkip}
            className="text-xs text-[#9ca3af] transition-colors hover:text-[#6b7280]"
          >
            I'll start from scratch
          </button>
        </div>
      </div>
    </div>
  );
}
