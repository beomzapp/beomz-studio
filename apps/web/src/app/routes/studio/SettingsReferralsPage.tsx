/**
 * SettingsReferralsPage — BEO-438
 * Referral program settings at /studio/settings/referrals.
 * Loads stats from GET /api/referrals. Gracefully handles missing endpoint
 * while the backend (BEO-438) is not yet shipped.
 */
import { useState, useEffect, useCallback } from "react";
import { Copy, Check, Gift, Users, TrendingUp, Zap, AlertCircle } from "lucide-react";
import { getReferrals, type ReferralStats } from "../../../lib/api";

const MAX_SIGNUP_REWARDS = 3;
const SIGNUP_REWARD_CR = 50;
const UPGRADE_REWARD_CR = 200;

export function SettingsReferralsPage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getReferrals()
      .then((data) => {
        setStats(data);
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const referralLink =
    stats?.referral_link ??
    (stats?.referral_code ? `https://beomz.ai/signup?ref=${stats.referral_code}` : null);
  const displayLink = referralLink ?? "beomz.ai/signup?ref=yourcode";

  const handleCopy = useCallback(() => {
    const text = referralLink ?? displayLink;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [referralLink, displayLink]);

  const signupCount = stats?.signup_count ?? 0;
  const upgradeCount = stats?.upgrade_count ?? 0;
  const creditsEarned = stats?.credits_earned ?? 0;

  const signupsUsed = Math.min(signupCount, MAX_SIGNUP_REWARDS);
  const signupRewardsExhausted = signupsUsed >= MAX_SIGNUP_REWARDS;
  const signupPct = (signupsUsed / MAX_SIGNUP_REWARDS) * 100;

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl font-bold text-[#1a1a1a]"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            Refer friends, earn credits
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6b7280]">
            Share your link and earn{" "}
            <span className="font-medium text-[#1a1a1a]">{SIGNUP_REWARD_CR} credits</span> for each of your first{" "}
            {MAX_SIGNUP_REWARDS} signups.
            <br />
            Earn{" "}
            <span className="font-medium text-[#1a1a1a]">{UPGRADE_REWARD_CR} credits</span> whenever any referral
            upgrades to a paid plan — no cap.
          </p>
        </div>

        {/* Referral link card */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <Gift size={18} />
            <h2 className="text-base font-semibold" style={{ fontFamily: "DM Sans, sans-serif" }}>
              Your referral link
            </h2>
          </div>

          {isLoading ? (
            /* Skeleton */
            <div className="space-y-3">
              <div className="h-10 animate-pulse rounded-xl bg-[#f0eeeb]" />
              <div className="h-9 w-28 animate-pulse rounded-xl bg-[#f0eeeb]" />
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={displayLink}
                  className="flex-1 rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-3 py-2 font-mono text-sm text-[#374151] outline-none select-all focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 transition-all"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!referralLink && fetchError}
                  className="flex items-center gap-1.5 rounded-xl bg-[#F97316] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50"
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy link
                    </>
                  )}
                </button>
              </div>

              {fetchError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <AlertCircle size={14} className="mt-0.5 flex-none text-amber-500" />
                  <p className="text-xs text-amber-700">
                    Your unique referral code is coming soon. In the meantime, share the
                    link above with friends and we'll attribute your referrals retroactively.
                  </p>
                </div>
              )}
            </>
          )}
        </section>

        {/* Stats row */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Signups */}
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Users size={16} className="text-[#F97316]" />
              <p className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">
                Signups
              </p>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                <div className="h-6 w-16 animate-pulse rounded bg-[#f0eeeb]" />
                <div className="h-1.5 w-full animate-pulse rounded-full bg-[#f0eeeb]" />
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-[#1a1a1a]">
                  {signupsUsed}{" "}
                  <span className="text-sm font-medium text-[#9ca3af]">
                    / {MAX_SIGNUP_REWARDS}
                  </span>
                </p>
                <div className="mt-2.5">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f0eeeb]">
                    <div
                      className="h-full rounded-full bg-[#F97316] transition-all duration-500"
                      style={{ width: `${signupPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-[#9ca3af]">
                    {MAX_SIGNUP_REWARDS - signupsUsed > 0
                      ? `${MAX_SIGNUP_REWARDS - signupsUsed} signup reward${MAX_SIGNUP_REWARDS - signupsUsed === 1 ? "" : "s"} remaining`
                      : "All signup rewards earned"}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Upgrade referrals */}
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp size={16} className="text-[#F97316]" />
              <p className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">
                Upgrades
              </p>
            </div>
            {isLoading ? (
              <div className="h-6 w-16 animate-pulse rounded bg-[#f0eeeb]" />
            ) : (
              <>
                <p className="text-2xl font-bold text-[#1a1a1a]">{upgradeCount}</p>
                <p className="mt-1 text-[11px] text-[#9ca3af]">
                  No cap on upgrade rewards
                </p>
              </>
            )}
          </div>

          {/* Credits earned */}
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Zap size={16} className="text-[#F97316]" />
              <p className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">
                Credits earned
              </p>
            </div>
            {isLoading ? (
              <div className="h-6 w-20 animate-pulse rounded bg-[#f0eeeb]" />
            ) : (
              <>
                <p className="text-2xl font-bold text-[#F97316]">{creditsEarned} cr</p>
                <p className="mt-1 text-[11px] text-[#9ca3af]">Total from referrals</p>
              </>
            )}
          </div>
        </section>

        {/* All 3 signup rewards used — callout */}
        {!isLoading && signupRewardsExhausted && (
          <div className="mb-6 rounded-2xl border border-[#F97316]/20 bg-[#fff7ed] px-5 py-4">
            <p className="text-sm font-semibold text-[#c2410c]">
              You've earned all 3 signup rewards 🎉
            </p>
            <p className="mt-1 text-sm text-[#9a3412]">
              Keep sharing — earn {UPGRADE_REWARD_CR} credits every time a referral upgrades
              to a paid plan. No limit.
            </p>
          </div>
        )}

        {/* How it works */}
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <h2
            className="mb-5 text-base font-semibold text-[#1a1a1a]"
            style={{ fontFamily: "DM Sans, sans-serif" }}
          >
            How it works
          </h2>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F97316]/10 text-sm font-bold text-[#F97316]">
                1
              </div>
              <div>
                <p className="text-sm font-medium text-[#1a1a1a]">Share your link</p>
                <p className="mt-0.5 text-sm text-[#6b7280]">
                  Copy your unique referral link and share it anywhere — Twitter, Discord,
                  email, wherever.
                </p>
              </div>
            </div>

            {/* Connector */}
            <div className="ml-4 h-4 w-px bg-[#e5e5e5]" />

            {/* Step 2 */}
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F97316]/10 text-sm font-bold text-[#F97316]">
                2
              </div>
              <div>
                <p className="text-sm font-medium text-[#1a1a1a]">
                  Friend signs up → you earn{" "}
                  <span className="font-semibold text-[#F97316]">
                    {SIGNUP_REWARD_CR} credits
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-[#6b7280]">
                  Capped at your first {MAX_SIGNUP_REWARDS} signups (
                  {SIGNUP_REWARD_CR * MAX_SIGNUP_REWARDS} cr max from signups). New users receive
                  the standard {SIGNUP_REWARD_CR * 2} cr free account — no extra bonus.
                </p>
              </div>
            </div>

            {/* Connector */}
            <div className="ml-4 h-4 w-px bg-[#e5e5e5]" />

            {/* Step 3 */}
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F97316]/10 text-sm font-bold text-[#F97316]">
                3
              </div>
              <div>
                <p className="text-sm font-medium text-[#1a1a1a]">
                  Friend upgrades → you earn{" "}
                  <span className="font-semibold text-[#F97316]">
                    {UPGRADE_REWARD_CR} credits
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-[#6b7280]">
                  No cap — every referral that upgrades to any paid plan earns you{" "}
                  {UPGRADE_REWARD_CR} credits, unlimited.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
