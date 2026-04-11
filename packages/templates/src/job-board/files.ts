import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useMemo } = React;
import { Search, MapPin, Clock, Briefcase, Building2, X } from "lucide-react";

const JOBS = [
  { id: 1, title: "Senior Frontend Engineer", company: "Acme Corp", location: "San Francisco, CA", type: "Full-time", salary: "$150k–$200k", posted: "2d ago", tags: ["React", "TypeScript", "Tailwind"], description: "Build next-gen product interfaces with React and TypeScript. 5+ years experience required." },
  { id: 2, title: "Product Designer", company: "Pixel Studio", location: "Remote", type: "Full-time", salary: "$120k–$160k", posted: "1d ago", tags: ["Figma", "Design Systems", "Prototyping"], description: "Design beautiful user experiences for our SaaS platform. Strong portfolio required." },
  { id: 3, title: "Backend Engineer", company: "DataFlow", location: "New York, NY", type: "Full-time", salary: "$140k–$190k", posted: "3d ago", tags: ["Go", "PostgreSQL", "AWS"], description: "Scale our data pipeline infrastructure. Experience with distributed systems a plus." },
  { id: 4, title: "DevOps Engineer", company: "CloudNine", location: "Remote", type: "Contract", salary: "$90/hr", posted: "5d ago", tags: ["Kubernetes", "Terraform", "CI/CD"], description: "Manage cloud infrastructure and deployment pipelines for our microservices architecture." },
  { id: 5, title: "Marketing Manager", company: "GrowthLab", location: "Austin, TX", type: "Full-time", salary: "$100k–$130k", posted: "1w ago", tags: ["SEO", "Content", "Analytics"], description: "Lead our content marketing strategy and grow organic acquisition channels." },
  { id: 6, title: "Mobile Developer", company: "AppWorks", location: "Remote", type: "Full-time", salary: "$130k–$170k", posted: "4d ago", tags: ["React Native", "iOS", "Android"], description: "Build cross-platform mobile experiences for millions of users." },
  { id: 7, title: "Data Scientist", company: "Insight AI", location: "Boston, MA", type: "Full-time", salary: "$145k–$185k", posted: "6d ago", tags: ["Python", "ML", "SQL"], description: "Develop predictive models and drive data-informed product decisions." },
  { id: 8, title: "Technical Writer", company: "DocuFlow", location: "Remote", type: "Part-time", salary: "$60/hr", posted: "2d ago", tags: ["Documentation", "API", "Markdown"], description: "Create clear, comprehensive developer documentation for our APIs." },
];

const TYPES = ["All", "Full-time", "Contract", "Part-time"];
const LOCATIONS = ["All", "Remote", "San Francisco, CA", "New York, NY", "Austin, TX", "Boston, MA"];

export function App() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [locationFilter, setLocationFilter] = useState("All");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => {
    return JOBS.filter((j) => {
      if (search && !j.title.toLowerCase().includes(search.toLowerCase()) && !j.company.toLowerCase().includes(search.toLowerCase()) && !j.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))) return false;
      if (typeFilter !== "All" && j.type !== typeFilter) return false;
      if (locationFilter !== "All" && j.location !== locationFilter) return false;
      return true;
    });
  }, [search, typeFilter, locationFilter]);

  const detail = selected ? JOBS.find((j) => j.id === selected) : null;

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Briefcase size={20} /> Job Board</h1>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search jobs, companies, skills..." className="w-full rounded-xl bg-zinc-900 border border-white/5 py-2.5 pl-9 pr-4 text-white text-sm placeholder-zinc-600 outline-none" />
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg bg-zinc-900 border border-white/5 px-3 py-1.5 text-xs text-white outline-none">
            {TYPES.map((t) => <option key={t} value={t}>{t === "All" ? "All Types" : t}</option>)}
          </select>
          <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="rounded-lg bg-zinc-900 border border-white/5 px-3 py-1.5 text-xs text-white outline-none">
            {LOCATIONS.map((l) => <option key={l} value={l}>{l === "All" ? "All Locations" : l}</option>)}
          </select>
          <span className="text-xs text-zinc-500 self-center ml-auto">{filtered.length} jobs</span>
        </div>

        {detail ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{detail.title}</h2>
                <p className="text-sm text-zinc-400 flex items-center gap-1 mt-1"><Building2 size={13} /> {detail.company}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 rounded-full px-2.5 py-1"><MapPin size={11} /> {detail.location}</span>
              <span className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 rounded-full px-2.5 py-1"><Briefcase size={11} /> {detail.type}</span>
              <span className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-800 rounded-full px-2.5 py-1"><Clock size={11} /> {detail.posted}</span>
            </div>
            <p className="text-sm text-green-400 font-medium mb-4">{detail.salary}</p>
            <p className="text-sm text-zinc-300 mb-4 leading-relaxed">{detail.description}</p>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {detail.tags.map((t) => <span key={t} className="rounded-full bg-blue-600/20 px-2.5 py-0.5 text-xs text-blue-400">{t}</span>)}
            </div>
            <button className="w-full rounded-xl bg-blue-600 py-2.5 text-white text-sm font-medium hover:bg-blue-500 transition-colors">Apply Now</button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-8">No jobs match your filters</p>}
            {filtered.map((job) => (
              <button key={job.id} onClick={() => setSelected(job.id)} className="w-full text-left rounded-2xl bg-zinc-900 border border-white/5 p-4 hover:border-white/10 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-medium text-white">{job.title}</h3>
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5"><Building2 size={11} /> {job.company}</p>
                  </div>
                  <span className="text-xs text-green-400 font-medium">{job.salary}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 mb-2">
                  <span className="flex items-center gap-1"><MapPin size={10} /> {job.location}</span>
                  <span>{job.type}</span>
                  <span>{job.posted}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {job.tags.map((t) => <span key={t} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{t}</span>)}
                </div>
              </button>
            ))}
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
