import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Check, ChevronRight, User, Building2, Palette, Rocket } from "lucide-react";

const STEPS = [
  { id: 1, label: "Profile", icon: User },
  { id: 2, label: "Company", icon: Building2 },
  { id: 3, label: "Preferences", icon: Palette },
  { id: 4, label: "Launch", icon: Rocket },
];

const ROLES = ["Founder / CEO", "Product Manager", "Engineer", "Designer", "Marketing", "Other"];
const SIZES = ["Just me", "2-10", "11-50", "51-200", "200+"];
const FEATURES = ["Project Management", "Analytics", "CRM", "Invoicing", "Team Chat", "File Storage"];

export function App() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [size, setSize] = useState("");
  const [industry, setIndustry] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState([]);

  const next = useCallback(() => setStep((s) => Math.min(4, s + 1)), []);
  const prev = useCallback(() => setStep((s) => Math.max(1, s - 1)), []);

  const toggleFeature = useCallback((f) => {
    setSelectedFeatures((prev) => prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#111827]">Welcome to Acme</h1>
          <p className="text-sm text-[#6b7280] mt-1">Let's get you set up in just a few steps</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={"flex h-9 w-9 items-center justify-center rounded-full transition-all " + (step > s.id ? "bg-green-500 text-white" : step === s.id ? "bg-indigo-600 text-white" : "bg-gray-200 text-[#6b7280]")}>
                {step > s.id ? <Check size={16} /> : <s.icon size={16} />}
              </div>
              {i < STEPS.length - 1 && (
                <div className={"w-8 h-0.5 mx-1 " + (step > s.id ? "bg-green-500" : "bg-gray-200")} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {step === 1 && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-1">Your Profile</h2>
              <p className="text-sm text-[#6b7280] mb-5">Tell us about yourself</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">Full Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">Email</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">Your Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLES.map((r) => (
                      <button key={r} onClick={() => setRole(r)} className={"rounded-lg border px-3 py-2 text-xs font-medium transition-all " + (role === r ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-gray-200 text-[#374151] hover:border-gray-300")}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-1">Your Company</h2>
              <p className="text-sm text-[#6b7280] mb-5">Help us personalize your experience</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">Company Name</label>
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Inc." className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">Team Size</label>
                  <div className="flex gap-2">
                    {SIZES.map((s) => (
                      <button key={s} onClick={() => setSize(s)} className={"flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-all " + (size === s ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-gray-200 text-[#374151] hover:border-gray-300")}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#374151] mb-1 block">Industry</label>
                  <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Technology, Healthcare, Finance" className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-[#111827] placeholder-[#6b7280] outline-none focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200" />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-1">Preferences</h2>
              <p className="text-sm text-[#6b7280] mb-5">What features matter most to you?</p>
              <div className="grid grid-cols-2 gap-2">
                {FEATURES.map((f) => {
                  const sel = selectedFeatures.includes(f);
                  return (
                    <button key={f} onClick={() => toggleFeature(f)} className={"rounded-lg border px-4 py-3 text-sm font-medium transition-all text-left " + (sel ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-gray-200 text-[#374151] hover:border-gray-300")}>
                      <span className={"inline-flex h-4 w-4 items-center justify-center rounded border mr-2 text-[10px] " + (sel ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300")}>{sel ? <Check size={10} /> : null}</span>
                      {f}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50 mx-auto mb-4">
                <Rocket size={28} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-[#111827] mb-2">You're all set!</h2>
              <p className="text-sm text-[#6b7280] mb-4">Welcome{name ? ", " + name.split(" ")[0] : ""}! Your workspace is ready.</p>
              <div className="rounded-lg bg-gray-50 p-4 text-left text-sm mb-4">
                {company && <p className="text-[#374151]"><span className="text-[#6b7280]">Company:</span> {company}</p>}
                {role && <p className="text-[#374151]"><span className="text-[#6b7280]">Role:</span> {role}</p>}
                {selectedFeatures.length > 0 && <p className="text-[#374151]"><span className="text-[#6b7280]">Features:</span> {selectedFeatures.join(", ")}</p>}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
            {step > 1 && step < 4 ? (
              <button onClick={prev} className="text-sm text-[#6b7280] hover:text-[#111827] transition-colors">Back</button>
            ) : <div />}
            {step < 4 ? (
              <button onClick={next} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
                Continue <ChevronRight size={14} />
              </button>
            ) : (
              <button className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
                Go to Dashboard
              </button>
            )}
          </div>
        </div>

        <div className="text-center mt-4">
          <p className="text-xs text-[#6b7280]">Step {step} of {STEPS.length} — {STEPS[step - 1].label}</p>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
