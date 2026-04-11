import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useEffect, useCallback } = React;
import { Plus, X, Globe, Clock } from "lucide-react";

const CITIES = [
  { name: "New York", tz: "America/New_York", flag: "🇺🇸" },
  { name: "London", tz: "Europe/London", flag: "🇬🇧" },
  { name: "Tokyo", tz: "Asia/Tokyo", flag: "🇯🇵" },
  { name: "Dubai", tz: "Asia/Dubai", flag: "🇦🇪" },
  { name: "Sydney", tz: "Australia/Sydney", flag: "🇦🇺" },
  { name: "Paris", tz: "Europe/Paris", flag: "🇫🇷" },
  { name: "Singapore", tz: "Asia/Singapore", flag: "🇸🇬" },
  { name: "Los Angeles", tz: "America/Los_Angeles", flag: "🇺🇸" },
  { name: "Berlin", tz: "Europe/Berlin", flag: "🇩🇪" },
  { name: "Mumbai", tz: "Asia/Kolkata", flag: "🇮🇳" },
  { name: "Shanghai", tz: "Asia/Shanghai", flag: "🇨🇳" },
  { name: "Sao Paulo", tz: "America/Sao_Paulo", flag: "🇧🇷" },
];

function getTimeInTz(tz) {
  const now = new Date();
  const opts = { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
  const dateOpts = { timeZone: tz, weekday: "short", month: "short", day: "numeric" };
  return {
    time: now.toLocaleTimeString("en-US", opts),
    date: now.toLocaleDateString("en-US", dateOpts),
    hour: parseInt(now.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", hour12: false })),
  };
}

export function App() {
  const [selected, setSelected] = useState(["America/New_York", "Europe/London", "Asia/Tokyo", "Asia/Dubai"]);
  const [now, setNow] = useState(Date.now());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const addCity = useCallback((tz) => {
    if (!selected.includes(tz)) setSelected((prev) => [...prev, tz]);
    setAdding(false);
  }, [selected]);

  const removeCity = useCallback((tz) => {
    setSelected((prev) => prev.filter((t) => t !== tz));
  }, []);

  const available = CITIES.filter((c) => !selected.includes(c.tz));

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Globe size={20} /> World Clock</h1>
          <button onClick={() => setAdding((a) => !a)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors">
            <Plus size={14} /> Add
          </button>
        </div>

        {adding && available.length > 0 && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-3 mb-4 grid grid-cols-2 gap-2">
            {available.map((city) => (
              <button key={city.tz} onClick={() => addCity(city.tz)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors">
                <span>{city.flag}</span>{city.name}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {selected.map((tz) => {
            const city = CITIES.find((c) => c.tz === tz);
            if (!city) return null;
            const info = getTimeInTz(tz);
            const isDay = info.hour >= 6 && info.hour < 20;
            return (
              <div key={tz} className="group rounded-2xl bg-zinc-900 border border-white/5 p-4 flex items-center gap-4">
                <div className={"flex h-12 w-12 items-center justify-center rounded-xl text-xl " + (isDay ? "bg-amber-500/10" : "bg-indigo-500/10")}>
                  {city.flag}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{city.name}</span>
                    <span className={"text-[10px] rounded-full px-1.5 py-0.5 " + (isDay ? "bg-amber-500/20 text-amber-400" : "bg-indigo-500/20 text-indigo-400")}>
                      {isDay ? "Day" : "Night"}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500">{info.date}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-mono font-bold text-white">{info.time}</span>
                  <button onClick={() => removeCity(tz)} className="text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400">
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {selected.length === 0 && (
            <p className="text-center text-sm text-zinc-600 py-8">Add a city to get started</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
