/**
 * BuilderModals — V1 modal overlays ported to V2.
 * Share, Publish, Settings, Out of Credits.
 * Light mode.
 */
import { X, Zap } from "lucide-react";
import { usePricingModal } from "../../contexts/PricingModalContext";

interface BuilderModalsProps {
  showShareModal: boolean;
  onCloseShareModal: () => void;
  showOutOfCreditsModal?: boolean;
  onCloseOutOfCreditsModal?: () => void;
  /** BEO-439: true = hard block (build blocked before starting); false = soft block (build completed, now out) */
  isHardBlock?: boolean;
}

export function BuilderModals({
  showShareModal,
  onCloseShareModal,
  showOutOfCreditsModal = false,
  onCloseOutOfCreditsModal,
  isHardBlock = false,
}: BuilderModalsProps) {
  const { openPricingModal } = usePricingModal();

  const handleBuyCredits = () => {
    onCloseOutOfCreditsModal?.();
    openPricingModal();
  };

  return (
    <>
      {/* Share modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-2xl">
            <button
              onClick={onCloseShareModal}
              className="absolute top-4 right-4 rounded-lg p-1 text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
            >
              <X size={16} />
            </button>

            <h3 className="mb-2 text-base font-semibold text-[#1a1a1a]">
              Share project
            </h3>
            <p className="text-sm text-[#6b7280]">
              Sharing and publishing are coming soon. Your project is saved
              and accessible from your studio.
            </p>

            <button
              onClick={onCloseShareModal}
              className="mt-6 w-full rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Out of credits modal */}
      {showOutOfCreditsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-2xl border border-[#e5e7eb] bg-white p-6 shadow-2xl">
            {!isHardBlock && (
              <button
                onClick={onCloseOutOfCreditsModal}
                className="absolute top-4 right-4 rounded-lg p-1 text-[#9ca3af] transition-colors hover:text-[#1a1a1a]"
              >
                <X size={16} />
              </button>
            )}

            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316]/10">
              <Zap size={24} className="text-[#F97316]" />
            </div>

            {isHardBlock ? (
              <>
                <h3 className="mb-2 text-lg font-bold text-[#1a1a1a]">
                  Credits required
                </h3>
                <p className="text-sm leading-relaxed text-[#6b7280]">
                  Add credits or upgrade your plan to continue building.
                </p>
              </>
            ) : (
              <>
                <h3 className="mb-2 text-lg font-bold text-[#1a1a1a]">
                  You're out of credits
                </h3>
                <p className="text-sm leading-relaxed text-[#6b7280]">
                  Your last build completed but you've run out of credits.
                  Top up or upgrade to keep building.
                </p>
              </>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={handleBuyCredits}
                className="flex w-full items-center justify-center rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#ea6c10]"
              >
                Buy credits
              </button>
              <a
                href="/studio/settings"
                className="flex w-full items-center justify-center rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-sm font-medium text-[#6b7280] transition-colors hover:bg-[#f3f4f6]"
              >
                Upgrade plan
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
