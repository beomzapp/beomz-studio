/**
 * ThinkingDots — three pulsing dots shown while we wait for the API to start
 * streaming. Used for both the build pipeline (between user message and
 * pre_build_ack) and the chat-mode pipeline.
 *
 * Contract (BEO-725):
 *   - Rendered for messages of type "thinking".
 *   - No avatar — keeps the indicator visually subtle.
 *   - Pure presentational; lifecycle is owned by useBuildChat.ts.
 */
export function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span
        className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}
