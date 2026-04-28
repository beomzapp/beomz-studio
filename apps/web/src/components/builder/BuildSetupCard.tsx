/**
 * BEO-704: Setup card shown before the first build when DB/auth signals are detected.
 * Asks the user whether they need persistent data and/or user login, then fires the build.
 */
import { useState } from "react";
import { Database, Lock, HelpCircle, ArrowRight } from "lucide-react";
import { cn } from "../../lib/cn";

interface BuildSetupCardProps {
  needsDb: boolean;
  needsAuth: boolean;
  onConfirm: (withDatabase: boolean, withAuth: boolean) => void;
  onSkip: () => void;
}

interface YesNoToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

function YesNoToggle({ value, onChange }: YesNoToggleProps) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange(true)}
        className={cn(
          "rounded-lg border px-4 py-1.5 text-sm font-medium transition-all",
          value
            ? "border-[#F97316] bg-[#F97316] text-white"
            : "border-[#e5e5e5] bg-white text-[#6b7280] hover:border-[#F97316]/50 hover:text-[#1a1a1a]",
        )}
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => onChange(false)}
        className={cn(
          "rounded-lg border px-4 py-1.5 text-sm font-medium transition-all",
          !value
            ? "border-[#e5e5e5] bg-[#f3f4f6] text-[#1a1a1a]"
            : "border-[#e5e5e5] bg-white text-[#6b7280] hover:border-[#e5e5e5] hover:text-[#1a1a1a]",
        )}
      >
        No
      </button>
    </div>
  );
}

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center">
      <span
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="cursor-pointer"
      >
        {children}
      </span>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg bg-[#1a1a1a] px-3 py-2 text-xs text-white shadow-lg">
          {text}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]" />
        </span>
      )}
    </span>
  );
}

export function BuildSetupCard({ needsDb, needsAuth, onConfirm, onSkip }: BuildSetupCardProps) {
  // Pre-select "Yes" for detected signals, "No" for undetected
  const [withDatabase, setWithDatabase] = useState(needsDb || needsAuth);
  const [withAuth, setWithAuth] = useState(needsAuth);

  const showAuthQuestion = needsAuth;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-[#e5e5e5] bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-[#e5e5e5] px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9ca3af]">
            Before I build
          </p>
          <h2 className="mt-0.5 text-base font-semibold text-[#1a1a1a]">
            Quick setup
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Database question */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff7ed]">
                <Database className="h-3.5 w-3.5 text-[#F97316]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-[#1a1a1a]">
                  Save data permanently?
                </span>
                <Tooltip text="A database saves your app's data permanently. Without one, everything resets when you close the browser.">
                  <HelpCircle className="h-3.5 w-3.5 text-[#9ca3af]" />
                </Tooltip>
              </div>
            </div>
            <p className="pl-9 text-xs text-[#6b7280]">
              Without a database, data resets every time you refresh.
            </p>
            <div className="pl-9">
              <YesNoToggle value={withDatabase} onChange={setWithDatabase} />
            </div>
          </div>

          {/* Auth question — only shown when auth signals are detected */}
          {showAuthQuestion && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0fdf4]">
                  <Lock className="h-3.5 w-3.5 text-[#16a34a]" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-[#1a1a1a]">
                    Add user login?
                  </span>
                  <Tooltip text="Authentication lets users create accounts and log in. Each user sees only their own data.">
                    <HelpCircle className="h-3.5 w-3.5 text-[#9ca3af]" />
                  </Tooltip>
                </div>
              </div>
              <p className="pl-9 text-xs text-[#6b7280]">
                Users can create accounts and log in.
              </p>
              <div className="pl-9">
                <YesNoToggle value={withAuth} onChange={setWithAuth} />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#e5e5e5] px-6 py-4 space-y-2">
          <button
            type="button"
            onClick={() => onConfirm(withDatabase, showAuthQuestion ? withAuth : false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
          >
            Build
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-1.5 text-center text-xs text-[#9ca3af] transition-colors hover:text-[#6b7280]"
          >
            Skip, just build →
          </button>
        </div>
      </div>
    </div>
  );
}
