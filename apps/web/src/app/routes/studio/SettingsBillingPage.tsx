import { useState, useEffect } from "react";
import { CreditCard, Zap, ExternalLink, ArrowUpRight } from "lucide-react";
import { getCredits, getBillingPortalUrl, type CreditsResponse } from "../../../lib/api";
import { usePricingModal } from "../../../contexts/PricingModalContext";

const PLAN_META: Record<string, { label: string; price: string; credits: number }> = {
  free: { label: "Free", price: "$0", credits: 100 },
  pro_starter: { label: "Pro Starter", price: "$19/mo", credits: 300 },
  pro_builder: { label: "Pro Builder", price: "$39/mo", credits: 750 },
  business: { label: "Business", price: "$199/mo", credits: 4000 },
};

function getPlanMeta(plan: string) {
  return PLAN_META[plan] ?? { label: plan, price: "", credits: 100 };
}

export function SettingsBillingPage() {
  const { openPricingModal } = usePricingModal();
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    getCredits()
      .then(setCredits)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const plan = credits?.plan ?? "free";
  const planMeta = getPlanMeta(plan);
  const isFree = plan === "free";
  const balance = credits?.balance ?? 0;
  const planCredits = credits?.planCredits ?? planMeta.credits;
  const creditsPct = Math.min(100, planCredits > 0 ? (balance / planCredits) * 100 : 0);

  const handleOpenPortal = async () => {
    setOpeningPortal(true);
    try {
      const { url } = await getBillingPortalUrl();
      window.open(url, "_blank", "noopener");
    } catch {
      // silently ignore
    } finally {
      setOpeningPortal(false);
    }
  };

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Billing</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Manage your plan and credits.</p>
        </div>

        {/* Plan card */}
        <section className="mb-6 rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <CreditCard size={18} />
            <h2 className="text-base font-semibold">Current plan</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-xl bg-[#f0eeeb]" />
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-[#faf9f6] px-4 py-3">
                <div>
                  <p className="text-xs text-[#9ca3af]">Plan</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#1a1a1a]">
                    {planMeta.label}
                    {planMeta.price && planMeta.price !== "$0" && (
                      <span className="ml-2 font-normal text-[#6b7280]">{planMeta.price}</span>
                    )}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isFree ? "bg-[#f3f4f6] text-[#6b7280]" : "bg-[#F97316]/10 text-[#F97316]"
                  }`}
                >
                  {isFree ? "Free" : "Active"}
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                {isFree && (
                  <button
                    type="button"
                    onClick={openPricingModal}
                    className="flex items-center gap-2 rounded-xl bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C]"
                  >
                    <ArrowUpRight size={14} />
                    Upgrade plan
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void handleOpenPortal()}
                  disabled={openingPortal}
                  className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:border-[#F97316]/30 hover:bg-[#faf9f6] disabled:opacity-50"
                >
                  <ExternalLink size={14} />
                  {openingPortal ? "Opening…" : "Open Stripe Portal"}
                </button>
              </div>
            </>
          )}
        </section>

        {/* Credits card */}
        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-4 flex items-center gap-2 text-[#1a1a1a]">
            <Zap size={18} />
            <h2 className="text-base font-semibold">Credits</h2>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-12 animate-pulse rounded-xl bg-[#f0eeeb]" />
              <div className="h-4 animate-pulse rounded bg-[#f0eeeb]" />
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <span className="text-2xl font-bold text-[#F97316]">{balance}</span>
                  <span className="ml-1 text-sm text-[#9ca3af]">/ {planCredits} cr</span>
                </div>
                <p className="text-xs text-[#9ca3af]">{planCredits - balance} used</p>
              </div>

              <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-[#f0eeeb]">
                <div
                  className="h-full rounded-full bg-[#F97316] transition-all duration-500"
                  style={{ width: `${creditsPct}%` }}
                />
              </div>

              {isFree && (
                <p className="mb-4 text-xs text-[#9ca3af]">
                  Free plan · one-time credits (100 cr on signup, never reset)
                </p>
              )}

              <button
                type="button"
                onClick={openPricingModal}
                className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-4 py-2.5 text-sm font-medium text-[#374151] transition-colors hover:border-[#F97316]/30 hover:bg-[#faf9f6]"
              >
                <Zap size={14} className="text-[#F97316]" />
                Buy credits
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
