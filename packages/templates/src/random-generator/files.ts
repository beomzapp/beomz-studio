import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Shuffle, Coins, Hash, Lightbulb, User } from "lucide-react";

const FIRST_NAMES = ["Alex", "Jordan", "Morgan", "Casey", "Taylor", "Riley", "Quinn", "Sage", "Phoenix", "Emery", "Skyler", "Reese", "Harper", "Avery", "Dakota", "Rowan", "Blake", "Parker", "Finley", "Sawyer"];
const LAST_NAMES = ["Smith", "Chen", "Rivera", "Kim", "Patel", "Nakamura", "Anderson", "Singh", "Williams", "Murphy", "Garcia", "Tanaka", "Brown", "Lee", "Martinez", "Nguyen", "Wilson", "Ali", "Johnson", "Park"];
const IDEAS = [
  "A habit tracker that uses a garden metaphor",
  "A recipe app that suggests meals from leftover ingredients",
  "A daily journaling app with AI-generated prompts",
  "A collaborative playlist builder for road trips",
  "A micro-learning platform for coding concepts",
  "A neighborhood exchange board for lending tools",
  "A time capsule app that delivers messages to your future self",
  "A workout generator based on available equipment",
  "A mood-based music recommendation engine",
  "An AI-powered flashcard creator from photos of textbooks",
  "A personal finance app gamified like an RPG",
  "A virtual study room with ambient sounds",
  "A meal-prep planner with automatic grocery lists",
  "A bookmark manager with automatic tagging",
  "A side project idea validator with market research",
];

let historyId = 0;

export function App() {
  const [tab, setTab] = useState("names");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const addToHistory = useCallback((type, value) => {
    setHistory((prev) => [{ id: historyId++, type, value, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 15));
  }, []);

  const generateName = useCallback(() => {
    const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const name = first + " " + last;
    setResult(name);
    addToHistory("Name", name);
  }, [addToHistory]);

  const generateNumber = useCallback(() => {
    const min = 1;
    const max = 100;
    const num = Math.floor(Math.random() * (max - min + 1)) + min;
    const str = String(num);
    setResult(str);
    addToHistory("Number", str);
  }, [addToHistory]);

  const generateIdea = useCallback(() => {
    const idea = IDEAS[Math.floor(Math.random() * IDEAS.length)];
    setResult(idea);
    addToHistory("Idea", idea);
  }, [addToHistory]);

  const flipCoin = useCallback(() => {
    const side = Math.random() < 0.5 ? "Heads" : "Tails";
    setResult(side);
    addToHistory("Coin", side);
  }, [addToHistory]);

  const generate = useCallback(() => {
    if (tab === "names") generateName();
    else if (tab === "numbers") generateNumber();
    else if (tab === "ideas") generateIdea();
    else flipCoin();
  }, [tab, generateName, generateNumber, generateIdea, flipCoin]);

  const tabs = [
    { id: "names", label: "Names", icon: User },
    { id: "numbers", label: "Numbers", icon: Hash },
    { id: "ideas", label: "Ideas", icon: Lightbulb },
    { id: "coin", label: "Coin", icon: Coins },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2">
            <Shuffle size={20} /> Random Generator
          </h1>

          <div className="flex gap-1 bg-zinc-800/60 rounded-xl p-1 mb-5">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setResult(null); }}
                className={"flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all " +
                  (tab === id ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                <Icon size={13} />{label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl bg-zinc-800/40 border border-white/5 p-6 mb-5 min-h-[100px] flex items-center justify-center text-center">
            {result ? (
              <p className={"font-semibold text-white " + (tab === "ideas" ? "text-base leading-relaxed" : tab === "coin" ? "text-5xl" : "text-3xl")}>
                {result}
              </p>
            ) : (
              <p className="text-sm text-zinc-600">Press Generate to get started</p>
            )}
          </div>

          <button
            onClick={generate}
            className="w-full rounded-xl bg-violet-600 py-3 text-white font-medium hover:bg-violet-500 transition-colors flex items-center justify-center gap-2"
          >
            <Shuffle size={16} /> Generate
          </button>

          {history.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">Recent</span>
                <button onClick={() => setHistory([])} className="text-[10px] text-zinc-600 hover:text-zinc-400">Clear</button>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 hover:bg-zinc-800/40">
                    <span className="text-[10px] text-zinc-600 w-12">{h.type}</span>
                    <span className="text-sm text-zinc-300 flex-1 truncate">{h.value}</span>
                    <span className="text-[10px] text-zinc-700">{h.time}</span>
                  </div>
                ))}
              </div>
            </div>
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
