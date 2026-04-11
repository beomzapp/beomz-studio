import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, Trash2, User, Briefcase, GraduationCap, Wrench, X, FileText } from "lucide-react";

let nextId = 20;

export function App() {
  const [name, setName] = useState("Alex Johnson");
  const [title, setTitle] = useState("Senior Frontend Engineer");
  const [email, setEmail] = useState("alex@example.com");
  const [phone, setPhone] = useState("+1 555-0123");
  const [summary, setSummary] = useState("Passionate engineer with 8+ years building scalable web applications. Focused on React, TypeScript, and design systems.");
  const [experience, setExperience] = useState([
    { id: 1, company: "TechCorp", role: "Senior Frontend Engineer", period: "2021 — Present", desc: "Led redesign of the core product dashboard, improving load time by 40%. Built component library used by 15+ teams." },
    { id: 2, company: "StartupXYZ", role: "Frontend Developer", period: "2018 — 2021", desc: "Built the customer-facing React app from scratch. Implemented real-time collaboration features." },
  ]);
  const [education, setEducation] = useState([
    { id: 3, school: "State University", degree: "B.S. Computer Science", period: "2014 — 2018" },
  ]);
  const [skills, setSkills] = useState(["React", "TypeScript", "Tailwind CSS", "Node.js", "GraphQL", "PostgreSQL", "Git", "Figma"]);
  const [newSkill, setNewSkill] = useState("");
  const [view, setView] = useState("edit");

  const addExperience = useCallback(() => { setExperience((prev) => [...prev, { id: nextId++, company: "", role: "", period: "", desc: "" }]); }, []);
  const updateExp = useCallback((id, field, val) => { setExperience((prev) => prev.map((e) => e.id === id ? { ...e, [field]: val } : e)); }, []);
  const removeExp = useCallback((id) => { setExperience((prev) => prev.filter((e) => e.id !== id)); }, []);

  const addEducation = useCallback(() => { setEducation((prev) => [...prev, { id: nextId++, school: "", degree: "", period: "" }]); }, []);
  const updateEdu = useCallback((id, field, val) => { setEducation((prev) => prev.map((e) => e.id === id ? { ...e, [field]: val } : e)); }, []);
  const removeEdu = useCallback((id) => { setEducation((prev) => prev.filter((e) => e.id !== id)); }, []);

  const addSkill = useCallback(() => { if (newSkill.trim() && !skills.includes(newSkill.trim())) { setSkills((prev) => [...prev, newSkill.trim()]); setNewSkill(""); } }, [newSkill, skills]);
  const removeSkill = useCallback((s) => { setSkills((prev) => prev.filter((sk) => sk !== s)); }, []);

  const Input = ({ value, onChange, placeholder, className = "" }) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={"rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none " + className} />
  );

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><FileText size={20} /> Resume Builder</h1>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-0.5">
            {["edit", "preview"].map((v) => (
              <button key={v} onClick={() => setView(v)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (view === v ? "bg-zinc-800 text-white" : "text-zinc-500")}>{v}</button>
            ))}
          </div>
        </div>

        {view === "edit" ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <h3 className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1"><User size={12} /> Personal Info</h3>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Input value={name} onChange={setName} placeholder="Full name" />
                <Input value={title} onChange={setTitle} placeholder="Job title" />
                <Input value={email} onChange={setEmail} placeholder="Email" />
                <Input value={phone} onChange={setPhone} placeholder="Phone" />
              </div>
              <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Professional summary..." rows={2} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none" />
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1"><Briefcase size={12} /> Experience</h3>
                <button onClick={addExperience} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={12} /> Add</button>
              </div>
              <div className="space-y-3">
                {experience.map((exp) => (
                  <div key={exp.id} className="rounded-xl bg-zinc-800/60 p-3 relative group">
                    <button onClick={() => removeExp(exp.id)} className="absolute top-2 right-2 text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={13} /></button>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <Input value={exp.company} onChange={(v) => updateExp(exp.id, "company", v)} placeholder="Company" />
                      <Input value={exp.role} onChange={(v) => updateExp(exp.id, "role", v)} placeholder="Role" />
                      <Input value={exp.period} onChange={(v) => updateExp(exp.id, "period", v)} placeholder="2020 — Present" />
                    </div>
                    <textarea value={exp.desc} onChange={(e) => updateExp(exp.id, "desc", e.target.value)} placeholder="Description..." rows={2} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none" />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-zinc-400 flex items-center gap-1"><GraduationCap size={12} /> Education</h3>
                <button onClick={addEducation} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={12} /> Add</button>
              </div>
              {education.map((edu) => (
                <div key={edu.id} className="group flex gap-2 items-center mb-2">
                  <Input value={edu.school} onChange={(v) => updateEdu(edu.id, "school", v)} placeholder="School" className="flex-1" />
                  <Input value={edu.degree} onChange={(v) => updateEdu(edu.id, "degree", v)} placeholder="Degree" className="flex-1" />
                  <Input value={edu.period} onChange={(v) => updateEdu(edu.id, "period", v)} placeholder="Year" className="w-28" />
                  <button onClick={() => removeEdu(edu.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><X size={13} /></button>
                </div>
              ))}
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <h3 className="text-xs font-medium text-zinc-400 mb-3 flex items-center gap-1"><Wrench size={12} /> Skills</h3>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {skills.map((s) => (
                  <span key={s} className="flex items-center gap-1 rounded-full bg-indigo-600/20 px-2.5 py-1 text-xs text-indigo-300">
                    {s}<button onClick={() => removeSkill(s)} className="text-indigo-500 hover:text-red-400"><X size={10} /></button>
                  </span>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); addSkill(); }} className="flex gap-2">
                <Input value={newSkill} onChange={setNewSkill} placeholder="Add skill..." className="flex-1" />
                <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs text-white font-medium">Add</button>
              </form>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-8 text-zinc-900">
            <div className="border-b border-zinc-200 pb-4 mb-5">
              <h2 className="text-2xl font-bold">{name || "Your Name"}</h2>
              <p className="text-sm text-indigo-600 font-medium">{title}</p>
              <div className="flex gap-3 mt-2 text-xs text-zinc-500">
                {email && <span>{email}</span>}
                {phone && <span>{phone}</span>}
              </div>
            </div>
            {summary && <div className="mb-5"><p className="text-sm text-zinc-600 leading-relaxed">{summary}</p></div>}
            {experience.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Experience</h3>
                {experience.map((exp) => (
                  <div key={exp.id} className="mb-3">
                    <div className="flex justify-between"><span className="text-sm font-semibold">{exp.role || "Role"}</span><span className="text-xs text-zinc-500">{exp.period}</span></div>
                    <p className="text-xs text-indigo-600">{exp.company}</p>
                    {exp.desc && <p className="text-sm text-zinc-600 mt-1">{exp.desc}</p>}
                  </div>
                ))}
              </div>
            )}
            {education.length > 0 && (
              <div className="mb-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">Education</h3>
                {education.map((edu) => (
                  <div key={edu.id} className="flex justify-between mb-2">
                    <div><span className="text-sm font-medium">{edu.degree}</span><p className="text-xs text-zinc-500">{edu.school}</p></div>
                    <span className="text-xs text-zinc-500">{edu.period}</span>
                  </div>
                ))}
              </div>
            )}
            {skills.length > 0 && (
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">Skills</h3>
                <div className="flex flex-wrap gap-1.5">
                  {skills.map((s) => <span key={s} className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">{s}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
`,
  },
];
