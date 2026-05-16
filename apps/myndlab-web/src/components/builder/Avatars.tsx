/**
 * Shared avatar primitives for the chat panel.
 *
 * - BAvatar: orange "B" mark on a near-black circle (Beomz / AI).
 * - UserAvatar: profile image with initials fallback.
 *
 * BEO-725: extracted from the legacy ChatMessage.tsx so AIIntroMessage,
 * AIMessage, ThinkingDots, BuildProgressCard, BuildSummary, and UserBubble
 * all share the same visual language.
 */
import { useState } from "react";

export function BAvatar() {
  return (
    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-zinc-900">
      <span className="text-[9px] font-bold leading-none text-[#F97316]">B</span>
    </div>
  );
}

interface UserAvatarProps {
  avatarUrl?: string;
  initials?: string;
}

export function UserAvatar({ avatarUrl, initials }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt="You"
        className="mt-0.5 h-5 w-5 flex-shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-[#F97316] text-[8px] font-bold text-white">
      {initials || "U"}
    </div>
  );
}
