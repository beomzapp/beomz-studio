/**
 * BuilderModals — V1 modal overlays ported to V2.
 * Share, Publish, Settings — all show "Coming soon" for now.
 * Light mode.
 */
import { X } from "lucide-react";

interface BuilderModalsProps {
  showShareModal: boolean;
  onCloseShareModal: () => void;
}

export function BuilderModals({
  showShareModal,
  onCloseShareModal,
}: BuilderModalsProps) {
  if (!showShareModal) return null;

  return (
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
  );
}
