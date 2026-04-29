/**
 * PostBuildDbPrompt — BEO-715 Track A · 2d (BEO-713 simplified)
 *
 * A subtle inline banner that appears below the FIRST completed build of a
 * brand-new project. Encourages adding a managed database without blocking
 * the build flow (replaces the previous BuildSetupCard interception).
 *
 * Visual contract:
 *   "💾 Data resets on refresh — [Add database] [×]"
 *
 * Render conditions (enforced by the parent ChatPanel):
 *   - exactly 1 build_summary message in the thread
 *   - project.database_enabled is false
 *   - localStorage.getItem(`db_prompt_dismissed_${projectId}`) is null
 *
 * Behaviour:
 *   - Add database  → calls onAddDatabase(); parent fires sendMessage("Add a
 *                     database", { withDatabase: true }) which provisions Neon
 *                     before the next iteration runs.
 *   - ✕            → writes localStorage flag and calls onDismiss so parent
 *                     hides the banner immediately.
 */
import { Database, X } from "lucide-react";

export interface PostBuildDbPromptProps {
  /** Fires the "Add a database" build with the withDatabase flag. */
  onAddDatabase: () => void;
  /** Fires after the dismissal flag is written to localStorage. */
  onDismiss: () => void;
}

export function PostBuildDbPrompt({ onAddDatabase, onDismiss }: PostBuildDbPromptProps) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2 text-xs text-[#6b7280]">
      <Database size={13} className="flex-shrink-0 text-[#9ca3af]" aria-hidden="true" />
      <span className="flex-1 truncate">Data resets on refresh</span>
      <button
        type="button"
        onClick={onAddDatabase}
        className="flex-shrink-0 rounded-md border border-[#e5e5e5] bg-[#faf9f6] px-2.5 py-1 text-[11px] font-medium text-[#374151] transition-colors hover:border-[#d1d5db] hover:text-[#1a1a1a]"
      >
        Add database
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss database prompt"
        className="flex-shrink-0 rounded-md p-1 text-[#9ca3af] transition-colors hover:bg-[#faf9f6] hover:text-[#6b7280]"
      >
        <X size={12} />
      </button>
    </div>
  );
}
