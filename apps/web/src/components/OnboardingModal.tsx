/**
 * OnboardingModal — BEO-276
 * 2-step slide-up modal shown to new users whose onboarding_completed = false.
 * Step 1: Welcome screen with credit balance.
 * Step 2: Profile setup form (name, display name, avatar, building_for, referral_source).
 */
import { useState, useEffect, useRef } from "react";
import { CheckCircle, ArrowRight, Upload, X } from "lucide-react";
import {
  getCredits,
  patchMe,
  completeOnboarding,
  uploadUserAvatar,
} from "../lib/api";

interface Props {
  /** Called after onboarding is completed or skipped */
  onClose: () => void;
}

const BUILDING_FOR_OPTIONS = [
  { value: "SaaS", label: "SaaS product" },
  { value: "Agency", label: "Agency / client work" },
  { value: "Personal", label: "Personal project" },
  { value: "Side project", label: "Side project" },
  { value: "Other", label: "Other" },
];

const REFERRAL_OPTIONS = [
  { value: "Twitter/X", label: "Twitter / X" },
  { value: "ProductHunt", label: "ProductHunt" },
  { value: "Friend", label: "Friend / word of mouth" },
  { value: "Google", label: "Google search" },
  { value: "Other", label: "Other" },
];

export function OnboardingModal({ onClose }: Props) {
  const [step, setStep] = useState(1);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isSkipping, setIsSkipping] = useState(false);

  // Form state
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [buildingFor, setBuildingFor] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; displayName?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getCredits()
      .then((data) => setCreditBalance(data.balance))
      .catch(() => setCreditBalance(50));
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  };

  const getInitials = () => {
    const name = fullName.trim();
    if (!name) return "?";
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? "")
      .join("");
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    await completeOnboarding().catch(() => {});
    onClose();
  };

  const validate = () => {
    const errs: typeof errors = {};
    if (!fullName.trim()) errs.fullName = "Full name is required";
    if (!displayName.trim()) {
      errs.displayName = "Display name is required";
    } else if (!/^[A-Za-z0-9-]{3,30}$/.test(displayName.trim())) {
      errs.displayName = "3–30 characters, letters, numbers, and hyphens only";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      let avatar_url: string | undefined;
      if (avatarFile) {
        const result = await uploadUserAvatar(avatarFile).catch(() => null);
        if (result) avatar_url = result.avatar_url;
      }
      await patchMe({
        full_name: fullName.trim(),
        display_name: displayName.trim(),
        ...(avatar_url ? { avatar_url } : {}),
        ...(buildingFor ? { building_for: buildingFor } : {}),
        ...(referralSource ? { referral_source: referralSource } : {}),
      });
      await completeOnboarding();
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={handleSkip} />

      {/* Card — slide up */}
      <div
        className="relative w-full max-w-[480px] animate-slide-up rounded-t-2xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step indicator */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span
            className={`h-2 w-2 rounded-full transition-colors ${step === 1 ? "bg-[#F97316]" : "bg-[#e5e5e5]"}`}
          />
          <span
            className={`h-2 w-2 rounded-full transition-colors ${step === 2 ? "bg-[#F97316]" : "bg-[#e5e5e5]"}`}
          />
        </div>

        {step === 1 ? (
          <Step1
            creditBalance={creditBalance}
            onNext={() => setStep(2)}
            onSkip={handleSkip}
            isSkipping={isSkipping}
          />
        ) : (
          <Step2
            fullName={fullName}
            displayName={displayName}
            avatarPreview={avatarPreview}
            buildingFor={buildingFor}
            referralSource={referralSource}
            errors={errors}
            isSubmitting={isSubmitting}
            fileInputRef={fileInputRef}
            getInitials={getInitials}
            onFullNameChange={setFullName}
            onDisplayNameChange={setDisplayName}
            onAvatarChange={handleAvatarChange}
            onAvatarRemove={() => {
              setAvatarFile(null);
              setAvatarPreview(null);
            }}
            onBuildingForChange={setBuildingFor}
            onReferralSourceChange={setReferralSource}
            onSubmit={handleSubmit}
          />
        )}
      </div>

      {/* Slide-up keyframe */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </div>
  );
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────

interface Step1Props {
  creditBalance: number | null;
  onNext: () => void;
  onSkip: () => void;
  isSkipping: boolean;
}

function Step1({ creditBalance, onNext, onSkip, isSkipping }: Step1Props) {
  const balance = creditBalance ?? 50;
  return (
    <div>
      {/* Header */}
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF7ED]">
        <span className="text-2xl">👋</span>
      </div>
      <h2 className="mt-4 text-xl font-bold text-[#1a1a1a]" style={{ fontFamily: "DM Sans, sans-serif" }}>
        Welcome to Beomz!
      </h2>
      <p className="mt-1 text-sm text-[#6b7280]">
        You have{" "}
        <span className="font-semibold text-[#F97316]">
          {balance} free credits
        </span>{" "}
        ready to use.
      </p>

      {/* Bullets */}
      <div className="mt-5 space-y-3">
        {[
          { text: `${balance} credits added to your account — start building now` },
          { text: "Daily bonus credits when you come back and build" },
          { text: "Free plan includes 30 credits every month, forever" },
          {
            text: "Invite friends — earn 50 credits per signup (first 3), 200 when they upgrade",
          },
        ].map(({ text }, i) => (
          <div key={i} className="flex items-start gap-3">
            <CheckCircle size={16} className="mt-0.5 flex-none text-[#F97316]" />
            <p className="text-sm text-[#374151]">{text}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onNext}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
      >
        Let&rsquo;s set up your profile
        <ArrowRight size={16} />
      </button>

      {/* Skip */}
      <button
        type="button"
        onClick={onSkip}
        disabled={isSkipping}
        className="mt-3 w-full text-center text-sm text-[#9ca3af] transition-colors hover:text-[#6b7280]"
      >
        {isSkipping ? "Saving…" : "Skip for now"}
      </button>
    </div>
  );
}

// ─── Step 2: Profile form ─────────────────────────────────────────────────────

interface Step2Props {
  fullName: string;
  displayName: string;
  avatarPreview: string | null;
  buildingFor: string;
  referralSource: string;
  errors: { fullName?: string; displayName?: string };
  isSubmitting: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  getInitials: () => string;
  onFullNameChange: (v: string) => void;
  onDisplayNameChange: (v: string) => void;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAvatarRemove: () => void;
  onBuildingForChange: (v: string) => void;
  onReferralSourceChange: (v: string) => void;
  onSubmit: () => void;
}

function Step2({
  fullName,
  displayName,
  avatarPreview,
  buildingFor,
  referralSource,
  errors,
  isSubmitting,
  fileInputRef,
  getInitials,
  onFullNameChange,
  onDisplayNameChange,
  onAvatarChange,
  onAvatarRemove,
  onBuildingForChange,
  onReferralSourceChange,
  onSubmit,
}: Step2Props) {
  return (
    <div>
      <h2 className="mb-1 text-xl font-bold text-[#1a1a1a]" style={{ fontFamily: "DM Sans, sans-serif" }}>
        Set up your profile
      </h2>
      <p className="mb-5 text-sm text-[#6b7280]">
        Tell us a bit about yourself.
      </p>

      {/* Avatar */}
      <div className="mb-5 flex items-center gap-4">
        <div className="relative">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Avatar preview"
              className="h-16 w-16 rounded-full object-cover ring-2 ring-[#F97316]/20"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F97316] text-lg font-bold text-white">
              {getInitials()}
            </div>
          )}
          {avatarPreview && (
            <button
              type="button"
              onClick={onAvatarRemove}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#e5e5e5]"
            >
              <X size={10} className="text-[#6b7280]" />
            </button>
          )}
        </div>
        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-medium text-[#374151] transition-colors hover:bg-[#f3f4f6]"
          >
            <Upload size={12} />
            {avatarPreview ? "Change photo" : "Upload photo"}
          </button>
          <p className="mt-1 text-[11px] text-[#9ca3af]">Optional. PNG, JPEG, WebP.</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onAvatarChange}
        />
      </div>

      {/* Full name */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-[#374151]">
          Full name <span className="text-[#F97316]">*</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => onFullNameChange(e.target.value)}
          placeholder="Your full name"
          className={`w-full rounded-lg border px-3 py-2 text-sm text-[#1a1a1a] outline-none transition-colors placeholder:text-[#9ca3af] focus:ring-1 focus:ring-[#F97316] ${errors.fullName ? "border-red-400 bg-red-50" : "border-[#e5e5e5] bg-white focus:border-[#F97316]"}`}
        />
        {errors.fullName && (
          <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>
        )}
      </div>

      {/* Display name */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-[#374151]">
          Display name <span className="text-[#F97316]">*</span>
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="e.g. omar-builds"
          className={`w-full rounded-lg border px-3 py-2 text-sm text-[#1a1a1a] outline-none transition-colors placeholder:text-[#9ca3af] focus:ring-1 focus:ring-[#F97316] ${errors.displayName ? "border-red-400 bg-red-50" : "border-[#e5e5e5] bg-white focus:border-[#F97316]"}`}
        />
        {errors.displayName ? (
          <p className="mt-1 text-xs text-red-500">{errors.displayName}</p>
        ) : (
          <p className="mt-1 text-[11px] text-[#9ca3af]">3–30 chars, letters, numbers, hyphens</p>
        )}
      </div>

      {/* Building for */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-[#374151]">
          What are you building?
        </label>
        <select
          value={buildingFor}
          onChange={(e) => onBuildingForChange(e.target.value)}
          className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
        >
          <option value="">Select…</option>
          {BUILDING_FOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Referral source */}
      <div className="mb-6">
        <label className="mb-1 block text-xs font-medium text-[#374151]">
          How did you hear about us?
        </label>
        <select
          value={referralSource}
          onChange={(e) => onReferralSourceChange(e.target.value)}
          className="w-full rounded-lg border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
        >
          <option value="">Select…</option>
          {REFERRAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97316] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
      >
        {isSubmitting ? "Saving…" : (
          <>
            Start building
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}
