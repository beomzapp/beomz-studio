import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState } = React;
import { Check, Star, Zap, Shield, BarChart3, Users, ArrowRight, Globe } from "lucide-react";

const FEATURES = [
  { icon: Zap, title: "Lightning Fast", desc: "Sub-100ms response times with edge computing and intelligent caching." },
  { icon: Shield, title: "Enterprise Security", desc: "SOC 2 compliant with end-to-end encryption and role-based access." },
  { icon: BarChart3, title: "Real-time Analytics", desc: "Live dashboards with custom metrics, funnels, and cohort analysis." },
  { icon: Users, title: "Team Collaboration", desc: "Shared workspaces, comments, and multiplayer editing in real-time." },
  { icon: Globe, title: "Global Scale", desc: "Deploy to 30+ regions. Auto-scaling handles any traffic spike." },
  { icon: Star, title: "AI-Powered", desc: "Built-in AI assistant that helps you work smarter, not harder." },
];

const PLANS = [
  { name: "Starter", price: "0", period: "Free forever", desc: "For individuals getting started", features: ["Up to 3 projects", "1,000 API calls/mo", "Community support", "Basic analytics"], cta: "Get Started", popular: false },
  { name: "Pro", price: "29", period: "/month", desc: "For growing teams", features: ["Unlimited projects", "100,000 API calls/mo", "Priority support", "Advanced analytics", "Team collaboration", "Custom domains"], cta: "Start Free Trial", popular: true },
  { name: "Enterprise", price: "99", period: "/month", desc: "For large organizations", features: ["Everything in Pro", "Unlimited API calls", "Dedicated support", "Custom integrations", "SSO & SAML", "SLA guarantee", "On-premise option"], cta: "Contact Sales", popular: false },
];

const TESTIMONIALS = [
  { name: "Sarah Chen", role: "CTO, TechStart", quote: "This completely transformed how our team builds products. We shipped 3x faster in the first month.", avatar: "SC" },
  { name: "Alex Rivera", role: "Founder, Pixel Studio", quote: "The best developer tool I've used in years. Clean API, great docs, and the AI features are incredible.", avatar: "AR" },
  { name: "Jordan Lee", role: "VP Eng, DataFlow", quote: "We migrated our entire stack in a weekend. The performance gains alone justified the switch.", avatar: "JL" },
];

export function App() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-lg font-bold text-[#111827]">Acme<span className="text-blue-600">.io</span></span>
          <div className="flex items-center gap-6">
            {["Features", "Pricing", "Docs"].map((l) => (
              <a key={l} className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors cursor-pointer">{l}</a>
            ))}
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">Get Started</button>
          </div>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-xs font-medium text-blue-600 mb-6">
          <Zap size={12} /> Now with AI-powered features
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-[#111827] leading-tight mb-4">
          Build better products<br /><span className="text-blue-600">10x faster</span>
        </h1>
        <p className="text-lg text-[#6b7280] max-w-xl mx-auto mb-8">
          The all-in-one platform for modern teams. Ship faster, collaborate better, and scale with confidence.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-colors flex items-center gap-2">
            Start Free Trial <ArrowRight size={14} />
          </button>
          <button className="rounded-lg border border-gray-200 px-6 py-3 text-sm font-medium text-[#374151] hover:bg-gray-50 transition-colors">
            View Demo
          </button>
        </div>
        <p className="text-xs text-[#6b7280] mt-4">No credit card required. 14-day free trial.</p>
      </section>

      <section className="bg-[#f8fafc] py-16">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-[#111827] mb-2">Everything you need to ship</h2>
            <p className="text-sm text-[#6b7280]">Powerful features that help your team move faster</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 mb-4">
                  <f.icon size={20} className="text-blue-600" />
                </div>
                <h3 className="text-sm font-semibold text-[#111827] mb-1">{f.title}</h3>
                <p className="text-xs text-[#6b7280] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#111827] mb-2">Simple, transparent pricing</h2>
            <p className="text-sm text-[#6b7280] mb-4">Start free, scale as you grow</p>
            <div className="flex items-center justify-center gap-3">
              <span className={"text-sm " + (!annual ? "text-[#111827] font-medium" : "text-[#6b7280]")}>Monthly</span>
              <button onClick={() => setAnnual((a) => !a)} className={"w-11 h-6 rounded-full flex items-center px-0.5 transition-colors " + (annual ? "bg-blue-600 justify-end" : "bg-gray-300 justify-start")}>
                <div className="h-5 w-5 rounded-full bg-white shadow-sm" />
              </button>
              <span className={"text-sm " + (annual ? "text-[#111827] font-medium" : "text-[#6b7280]")}>Annual <span className="text-green-600 text-xs">Save 20%</span></span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => (
              <div key={plan.name} className={"rounded-xl border p-6 " + (plan.popular ? "border-blue-300 bg-blue-50/30 shadow-md relative" : "border-gray-200 bg-white")}>
                {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-[10px] font-medium text-white">Most Popular</span>}
                <h3 className="text-lg font-semibold text-[#111827]">{plan.name}</h3>
                <p className="text-xs text-[#6b7280] mt-0.5 mb-4">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-5">
                  <span className="text-3xl font-bold text-[#111827]">{"$" + (annual && plan.price !== "0" ? Math.round(parseInt(plan.price) * 0.8) : plan.price)}</span>
                  <span className="text-sm text-[#6b7280]">{plan.period}</span>
                </div>
                <button className={"w-full rounded-lg py-2.5 text-sm font-medium transition-colors mb-5 " + (plan.popular ? "bg-blue-600 text-white hover:bg-blue-500" : "border border-gray-200 text-[#374151] hover:bg-gray-50")}>
                  {plan.cta}
                </button>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-[#374151]">
                      <Check size={14} className="text-green-500 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f8fafc] py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-[#111827] text-center mb-10">Loved by teams everywhere</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex gap-0.5 mb-3">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={12} className="text-amber-400" fill="currentColor" />)}</div>
                <p className="text-sm text-[#374151] mb-4 leading-relaxed">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">{t.avatar}</div>
                  <div>
                    <p className="text-xs font-semibold text-[#111827]">{t.name}</p>
                    <p className="text-[10px] text-[#6b7280]">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-[#111827] mb-3">Ready to get started?</h2>
          <p className="text-sm text-[#6b7280] mb-6">Join thousands of teams already building with Acme.</p>
          <button className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-medium text-white hover:bg-blue-500 transition-colors inline-flex items-center gap-2">
            Start Building for Free <ArrowRight size={14} />
          </button>
        </div>
      </section>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs text-[#6b7280]">
          Built with Beomz
        </div>
      </footer>
    </div>
  );
}

export default App;
`,
  },
];
