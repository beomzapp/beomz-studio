/** Working styled scaffold for marketing-website template */
export function getMarketingFallback(): { path: string; content: string }[] {
  return [
    {
      path: "src/pages/Home.tsx",
      content: `export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-lg font-bold">Brand</span>
          <div className="flex gap-6 text-sm text-white/60">
            <a href="/" className="text-white">Home</a>
            <a href="/pricing" className="hover:text-white">Pricing</a>
            <a href="/contact" className="hover:text-white">Contact</a>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-5xl font-bold leading-tight">
          Build something <span className="text-orange-400">amazing</span>
        </h1>
        <p className="mt-4 text-lg text-white/50">
          A modern platform designed for your needs.
        </p>
        <button className="mt-8 rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600">
          Get Started
        </button>
      </main>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          {["Fast", "Secure", "Scalable"].map((f) => (
            <div key={f} className="rounded-xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold">{f}</h3>
              <p className="mt-2 text-sm text-white/40">
                Built with the latest technology for optimal performance.
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}`,
    },
    {
      path: "src/pages/Pricing.tsx",
      content: `export default function Pricing() {
  const plans = [
    { name: "Free", price: "$0", features: ["1 project", "Basic support"] },
    { name: "Pro", price: "$19/mo", features: ["Unlimited projects", "Priority support", "Custom domains"] },
    { name: "Enterprise", price: "Custom", features: ["Everything in Pro", "SLA", "Dedicated support"] },
  ];
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="/" className="text-lg font-bold">Brand</a>
          <div className="flex gap-6 text-sm text-white/60">
            <a href="/" className="hover:text-white">Home</a>
            <a href="/pricing" className="text-white">Pricing</a>
            <a href="/contact" className="hover:text-white">Contact</a>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-24">
        <h1 className="mb-12 text-center text-4xl font-bold">Pricing</h1>
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name} className="rounded-xl border border-white/10 p-6">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2 text-3xl font-bold text-orange-400">{p.price}</p>
              <ul className="mt-4 space-y-2 text-sm text-white/50">
                {p.features.map((f) => <li key={f}>• {f}</li>)}
              </ul>
              <button className="mt-6 w-full rounded-lg bg-orange-500 py-2 text-sm font-semibold text-white">
                Choose Plan
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}`,
    },
    {
      path: "src/pages/Contact.tsx",
      content: `export default function Contact() {
  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <a href="/" className="text-lg font-bold">Brand</a>
          <div className="flex gap-6 text-sm text-white/60">
            <a href="/" className="hover:text-white">Home</a>
            <a href="/pricing" className="hover:text-white">Pricing</a>
            <a href="/contact" className="text-white">Contact</a>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-xl px-6 py-24">
        <h1 className="mb-8 text-3xl font-bold">Contact Us</h1>
        <form className="space-y-4">
          <input type="text" placeholder="Name" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none" />
          <input type="email" placeholder="Email" className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none" />
          <textarea placeholder="Message" rows={4} className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none" />
          <button type="button" className="w-full rounded-lg bg-orange-500 py-3 font-semibold text-white">Send Message</button>
        </form>
      </main>
    </div>
  );
}`,
    },
  ];
}
