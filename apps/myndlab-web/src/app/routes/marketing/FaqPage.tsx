import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../../lib/cn";
import { MarketingPageLayout } from "../../../components/marketing/MarketingPageLayout";

// ── Data ────────────────────────────────────────────────────────

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: "what-is-myndlab",
    question: "What is Myndlab?",
    answer:
      "Myndlab turns your ideas into real, working, deployable apps using simple, natural language prompts—handling everything from code to deployment automatically.",
  },
  {
    id: "what-can-i-build",
    question: "What can I build with Myndlab?",
    answer:
      "With Myndlab, you can build everything from landing pages and websites to SaaS apps, internal tools, e-commerce platforms, and full-stack applications with frontend and backend logic. It works for both quick prototypes and real, production-ready apps you can keep improving over time.",
  },
  {
    id: "mobile-apps",
    question: "Can I build mobile apps with Myndlab?",
    answer:
      "Right now, Myndlab is optimized for building web apps. Every app is mobile-first and responsive by default. Stay tuned for mobile app build capabilities coming soon.",
  },
  {
    id: "coding-experience",
    question: "Do I need coding experience to build with Myndlab?",
    answer:
      "No. Just describe what you want, and Myndlab builds it for you. Developers can go deeper by customizing and extending their apps.",
  },
  {
    id: "create-project",
    question: "How do I create a project?",
    answer:
      "Go to your dashboard, enter your app idea in the prompt box, and submit. Myndlab generates your project and opens it in the Builder, where you can refine it with chat, preview changes, and publish when ready.",
  },
  {
    id: "reuse-project",
    question: "Can I reuse an existing project?",
    answer:
      "Yes. You can reopen any project from Your Projects and continue working on it in the Builder.",
  },
];

// ── Component ────────────────────────────────────────────────────

export function FaqPage() {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      return (
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q)
      );
    });
  }, [search]);

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <MarketingPageLayout hideCta>
    <div className="min-h-screen" style={{ background: "#0e0e10" }}>

      {/* Hero */}
      <section className="px-6 pb-8 pt-16 text-center">
        <h1
          className="text-4xl font-bold text-white"
          style={{ fontFamily: "DM Sans, sans-serif" }}
        >
          Everything you need to know.
        </h1>
        <p className="mx-auto mt-3 max-w-md text-white/50">
          Answers to common questions about building apps, managing projects, account settings, security, and how Myndlab works.
        </p>
      </section>

      {/* Search */}
      <div className="sticky top-[76px] z-10 border-b border-white/10 bg-[#0e0e10]/90 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
            />
            <input
              type="text"
              placeholder="Search questions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#00D5D8] focus:ring-2 focus:ring-[#00D5D8]/20 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-10">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-white/40">No results for &ldquo;{search}&rdquo;.</p>
            <button
              onClick={() => setSearch("")}
              className="mt-3 text-sm text-[#00D5D8] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {filtered.map((item, idx) => {
              const isOpen = openId === item.id;
              const isLast = idx === filtered.length - 1;
              return (
                <div
                  key={item.id}
                  className={cn(!isLast && "border-b border-white/10")}
                >
                  <button
                    onClick={() => toggle(item.id)}
                    className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span
                      className={cn(
                        "text-sm font-medium leading-snug transition-colors",
                        isOpen ? "text-[#00D5D8]" : "text-white"
                      )}
                    >
                      {item.question}
                    </span>
                    <span className="mt-0.5 flex-none text-white/30">
                      {isOpen ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-white/10 bg-white/[0.02] px-5 py-4">
                      <p className="text-sm leading-relaxed text-white/60">
                        {item.answer}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer CTA */}
        <div className="mt-14 rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center">
          <p className="text-sm font-medium text-white">
            Still have questions?
          </p>
          <p className="mt-1 text-sm text-white/50">
            We&apos;re here to help.{" "}
            <a
              href="mailto:support@beomz.com"
              className="font-medium text-[#00D5D8] underline-offset-2 hover:underline"
            >
              Contact support
            </a>
          </p>
        </div>
      </main>
    </div>
    </MarketingPageLayout>
  );
}
