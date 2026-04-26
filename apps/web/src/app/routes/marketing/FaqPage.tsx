import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../../lib/cn";
import BeomzLogo from "../../../assets/beomz-logo.svg?react";

// ── Data ────────────────────────────────────────────────────────

type Category =
  | "Getting Started"
  | "Credits & Billing"
  | "Building Apps"
  | "Referrals"
  | "Account";

interface FaqItem {
  id: string;
  category: Category;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  // Getting Started
  {
    id: "gs-1",
    category: "Getting Started",
    question: "What is Beomz? How do I get started?",
    answer:
      "Beomz is an AI app builder — describe the app you want and Beomz generates a full working React application with a live preview instantly. To get started, sign up for free, type your idea into the prompt box, and click Build. No coding required.",
  },
  {
    id: "gs-2",
    category: "Getting Started",
    question: "What can I build with Beomz?",
    answer:
      "Anything that runs in a browser: SaaS dashboards, landing pages, CRMs, task managers, e-commerce stores, booking systems, portfolio sites, internal tools, and more. If you can describe it, Beomz can build it.",
  },
  {
    id: "gs-3",
    category: "Getting Started",
    question: "How much does it cost to get started?",
    answer:
      "The free plan includes 100 credits to start. No credit card required.",
  },
  {
    id: "gs-4",
    category: "Getting Started",
    question: "What are credits?",
    answer:
      "Credits are used each time you build or edit an app. A full build uses 40–55 credits. Small edits use 2–10 credits.",
  },

  // Credits & Billing
  {
    id: "cb-1",
    category: "Credits & Billing",
    question: "How many credits do I get for free?",
    answer: "100 credits on signup, one-time. No credit card required.",
  },
  {
    id: "cb-2",
    category: "Credits & Billing",
    question: "Do credits expire?",
    answer:
      "Free credits don't expire. Paid plan credits reset monthly. Purchased top-up packs never expire.",
  },
  {
    id: "cb-3",
    category: "Credits & Billing",
    question: "What happens when I run out of credits?",
    answer:
      "You'll be prompted to upgrade to a paid plan or buy a top-up credit pack. Your apps and projects are never deleted — you just need credits to build or edit.",
  },
  {
    id: "cb-4",
    category: "Credits & Billing",
    question: "Can I earn free credits?",
    answer:
      "Yes — invite friends. Earn 50 credits when a friend signs up using your referral link (first 3 signups only), and 200 credits whenever any referral upgrades to a paid plan (no limit on upgrade rewards).",
  },
  {
    id: "cb-5",
    category: "Credits & Billing",
    question: "What are the paid plans?",
    answer:
      "Pro Starter at $19/mo includes 300 credits. Pro Builder at $39/mo includes 750 credits. Business at $199/mo includes 4,000 credits. All paid plans include unlimited projects, custom domains, and rollover credits.",
  },

  // Building Apps
  {
    id: "ba-1",
    category: "Building Apps",
    question: "What kind of apps can I build?",
    answer:
      "Beomz generates full React apps — single-page apps, multi-page apps, apps with databases, apps with authentication, dashboards, forms, e-commerce flows, and more. You can iterate with follow-up prompts to extend, redesign, or add features.",
  },
  {
    id: "ba-2",
    category: "Building Apps",
    question: "Can I add a database to my app?",
    answer:
      "Yes — Beomz provides a built-in database, or you can connect your own Supabase project. Just describe the data model you need and Beomz handles the schema, queries, and UI.",
  },
  {
    id: "ba-3",
    category: "Building Apps",
    question: "Can I add authentication or login to my app?",
    answer:
      "Yes — just ask Beomz to add it. Auth adapts to whichever database you have connected: mock auth for quick demos, full JWT auth for Neon databases, or native Supabase Auth for BYO Supabase projects.",
  },
  {
    id: "ba-4",
    category: "Building Apps",
    question: "How do I publish my app?",
    answer:
      "Click Publish in the top bar. Your app gets a free beomz.app subdomain instantly — shareable with anyone, no login required.",
  },
  {
    id: "ba-5",
    category: "Building Apps",
    question: "Can I use a custom domain?",
    answer:
      "Yes — on all plans. Go to Publish › Custom domain and point your domain's DNS to Beomz. Free SSL is included.",
  },
  {
    id: "ba-6",
    category: "Building Apps",
    question: "Can I export my code?",
    answer:
      "Yes — use the Export button in the builder to download a ZIP of your app's source code. It's standard React / TypeScript, so you can host it anywhere.",
  },

  // Referrals
  {
    id: "ref-1",
    category: "Referrals",
    question: "How does the referral program work?",
    answer:
      "Share your unique referral link. Earn 50 credits for each of the first 3 friends who sign up using your link. Earn 200 credits whenever any referral upgrades to a paid plan — no limit on upgrade rewards.",
  },
  {
    id: "ref-2",
    category: "Referrals",
    question: "Is there a limit on referrals?",
    answer:
      "You can share your link with unlimited people. The 50-credit signup reward is capped at your first 3 successful signups (150 credits max). Upgrade rewards — 200 credits per converted referral — are unlimited.",
  },
  {
    id: "ref-3",
    category: "Referrals",
    question: "Where is my referral link?",
    answer:
      "In Settings › Referrals or on your studio dashboard. It looks like beomz.ai/signup?ref=yourcode.",
  },

  // Account
  {
    id: "acc-1",
    category: "Account",
    question: "How do I delete my account?",
    answer:
      "Contact support@beomz.com with the subject 'Delete my account'. We'll process your request within 48 hours.",
  },
  {
    id: "acc-2",
    category: "Account",
    question: "Is my data secure?",
    answer:
      "Yes. All data is stored in encrypted databases, served over HTTPS, and never sold or shared with third parties. Projects and files are isolated per account.",
  },
  {
    id: "acc-3",
    category: "Account",
    question: "What happens if I cancel my plan?",
    answer:
      "Your account moves to the free tier at the end of the billing period. All your projects stay intact. You keep any rollover credits you've accumulated (up to the rollover cap), and any purchased top-up credits never expire.",
  },
];

const CATEGORIES: Array<"All" | Category> = [
  "All",
  "Getting Started",
  "Credits & Billing",
  "Building Apps",
  "Referrals",
  "Account",
];

// ── Component ────────────────────────────────────────────────────

export function FaqPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<"All" | Category>("All");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      const matchCategory =
        activeCategory === "All" || item.category === activeCategory;
      const matchSearch =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q);
      return matchCategory && matchSearch;
    });
  }, [search, activeCategory]);

  // Group filtered items by category preserving order
  const grouped = useMemo(() => {
    const map = new Map<Category, FaqItem[]>();
    for (const item of filtered) {
      const arr = map.get(item.category) ?? [];
      arr.push(item);
      map.set(item.category, arr);
    }
    return map;
  }, [filtered]);

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen" style={{ background: "#faf9f6" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-white/90 px-6 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BeomzLogo className="h-6 w-auto text-[#1a1a1a]" />
          </Link>
          <Link
            to="/"
            className="text-sm text-[#6b7280] transition-colors hover:text-[#1a1a1a]"
          >
            ← Back to home
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pb-8 pt-12 text-center">
        <h1
          className="text-4xl font-bold text-[#1a1a1a]"
          style={{ fontFamily: "DM Sans, sans-serif" }}
        >
          Frequently asked questions
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[#6b7280]">
          Everything you need to know about Beomz.
        </p>
      </section>

      {/* Search + filters */}
      <div className="sticky top-[57px] z-10 border-b border-[#e5e5e5] bg-white/90 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]"
            />
            <input
              type="text"
              placeholder="Search questions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#e5e5e5] bg-white py-2.5 pl-9 pr-4 text-sm text-[#1a1a1a] outline-none placeholder:text-[#9ca3af] focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/20 transition-all"
            />
          </div>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "rounded-full px-3.5 py-1 text-xs font-medium transition-all",
                  activeCategory === cat
                    ? "bg-[#F97316] text-white shadow-sm"
                    : "border border-[#e5e5e5] bg-white text-[#6b7280] hover:border-[#F97316]/40 hover:text-[#F97316]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-10">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[#9ca3af]">No results for "{search}".</p>
            <button
              onClick={() => { setSearch(""); setActiveCategory("All"); }}
              className="mt-3 text-sm text-[#F97316] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {Array.from(grouped.entries()).map(([category, items]) => (
              <section key={category}>
                {/* Category label */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-widest text-[#F97316]">
                    {category}
                  </span>
                  <div className="h-px flex-1 bg-[#e5e5e5]" />
                </div>

                {/* Accordion */}
                <div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
                  {items.map((item, idx) => {
                    const isOpen = openId === item.id;
                    const isLast = idx === items.length - 1;
                    return (
                      <div
                        key={item.id}
                        className={cn(!isLast && "border-b border-[#e5e5e5]")}
                      >
                        <button
                          onClick={() => toggle(item.id)}
                          className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[#faf9f6]"
                        >
                          <span
                            className={cn(
                              "text-sm font-medium leading-snug transition-colors",
                              isOpen ? "text-[#F97316]" : "text-[#1a1a1a]"
                            )}
                          >
                            {item.question}
                          </span>
                          <span className="mt-0.5 flex-none text-[#9ca3af]">
                            {isOpen ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="border-t border-[#f0eeeb] bg-[#faf9f6] px-5 py-4">
                            <p className="text-sm leading-relaxed text-[#374151]">
                              {item.answer}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-14 rounded-2xl border border-[#e5e5e5] bg-white px-6 py-8 text-center">
          <p className="text-sm font-medium text-[#1a1a1a]">
            Still have questions?
          </p>
          <p className="mt-1 text-sm text-[#6b7280]">
            We're here to help.{" "}
            <a
              href="mailto:support@beomz.com"
              className="font-medium text-[#F97316] underline-offset-2 hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
