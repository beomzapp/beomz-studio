import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Star, ChevronRight, X, Briefcase, Brain, MessageSquare } from "lucide-react";

let nextId = 30;

const SAMPLE_QUESTIONS = [
  { id: 1, category: "Behavioral", question: "Tell me about a time you handled a conflict with a coworker", answer: "Use STAR method: Situation, Task, Action, Result", confidence: 3 },
  { id: 2, category: "Behavioral", question: "Describe a project you led from start to finish", answer: "Focus on leadership, delegation, and measurable outcomes", confidence: 4 },
  { id: 3, category: "Technical", question: "Explain the difference between REST and GraphQL", answer: "REST: resource-based endpoints. GraphQL: single endpoint, client specifies data shape", confidence: 5 },
  { id: 4, category: "Technical", question: "How would you optimize a slow database query?", answer: "Indexing, query analysis, caching, denormalization, pagination", confidence: 2 },
  { id: 5, category: "Situational", question: "How would you prioritize conflicting deadlines?", answer: "Impact analysis, stakeholder communication, negotiate timelines", confidence: 3 },
  { id: 6, category: "Culture", question: "Why do you want to work here?", answer: "Research company mission, connect to personal values and career goals", confidence: 4 },
];

const CATEGORIES = ["All", "Behavioral", "Technical", "Situational", "Culture"];

export function App() {
  const [questions, setQuestions] = useState(SAMPLE_QUESTIONS);
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ question: "", answer: "", category: "Behavioral", confidence: 3 });
  const [practicing, setPracticing] = useState(false);
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "All") return questions;
    return questions.filter((q) => q.category === filter);
  }, [questions, filter]);

  const avgConfidence = useMemo(() => {
    if (questions.length === 0) return 0;
    return (questions.reduce((s, q) => s + q.confidence, 0) / questions.length).toFixed(1);
  }, [questions]);

  const addQuestion = useCallback(() => {
    if (!form.question.trim()) return;
    setQuestions((prev) => [...prev, { id: nextId++, ...form, question: form.question.trim(), answer: form.answer.trim() }]);
    setForm({ question: "", answer: "", category: "Behavioral", confidence: 3 }); setAdding(false);
  }, [form]);

  const deleteQuestion = useCallback((id) => { setQuestions((prev) => prev.filter((q) => q.id !== id)); if (selected === id) setSelected(null); }, [selected]);

  const updateConfidence = useCallback((id, confidence) => {
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, confidence } : q));
  }, []);

  const startPractice = useCallback(() => {
    setPracticing(true); setPracticeIdx(0); setShowAnswer(false);
  }, []);

  const nextPractice = useCallback(() => {
    if (practiceIdx + 1 >= filtered.length) { setPracticing(false); return; }
    setPracticeIdx((i) => i + 1); setShowAnswer(false);
  }, [practiceIdx, filtered]);

  const detail = questions.find((q) => q.id === selected);
  const practiceQ = practicing ? filtered[practiceIdx] : null;
  const confidenceColor = (c) => c >= 4 ? "text-green-400" : c >= 3 ? "text-amber-400" : "text-red-400";

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Briefcase size={20} /> Interview Prep</h1>
          <div className="flex gap-2">
            <button onClick={startPractice} disabled={filtered.length === 0} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors disabled:opacity-40">
              <Brain size={13} /> Practice
            </button>
            <button onClick={() => { setAdding(true); setSelected(null); setPracticing(false); }} className="flex items-center gap-1 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700">
              <Plus size={13} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-white">{questions.length}</span>
            <p className="text-[10px] text-zinc-500">Questions</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className={"text-lg font-bold " + confidenceColor(parseFloat(avgConfidence))}>{avgConfidence}</span>
            <p className="text-[10px] text-zinc-500">Avg Confidence</p>
          </div>
          <div className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
            <span className="text-lg font-bold text-green-400">{questions.filter((q) => q.confidence >= 4).length}</span>
            <p className="text-[10px] text-zinc-500">Ready</p>
          </div>
        </div>

        {practicing && practiceQ ? (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-zinc-500">{practiceIdx + 1}/{filtered.length} — {practiceQ.category}</span>
              <button onClick={() => setPracticing(false)} className="text-xs text-zinc-500 hover:text-white">Exit</button>
            </div>
            <div className="rounded-xl bg-zinc-800/60 p-5 mb-4">
              <MessageSquare size={16} className="text-indigo-400 mb-2" />
              <p className="text-sm text-white leading-relaxed">{practiceQ.question}</p>
            </div>
            {showAnswer ? (
              <>
                <div className="rounded-xl bg-indigo-600/10 border border-indigo-500/20 p-4 mb-4">
                  <p className="text-sm text-indigo-300">{practiceQ.answer || "No notes yet"}</p>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-zinc-500">How confident?</span>
                  <div className="flex gap-1">{[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} onClick={() => updateConfidence(practiceQ.id, s)}><Star size={16} className={s <= practiceQ.confidence ? "text-amber-400" : "text-zinc-700"} fill={s <= practiceQ.confidence ? "currentColor" : "none"} /></button>
                  ))}</div>
                </div>
                <button onClick={nextPractice} className="w-full rounded-xl bg-indigo-600 py-2.5 text-white text-sm font-medium hover:bg-indigo-500 transition-colors">
                  {practiceIdx + 1 >= filtered.length ? "Finish" : "Next Question"}
                </button>
              </>
            ) : (
              <button onClick={() => setShowAnswer(true)} className="w-full rounded-xl bg-zinc-800 py-2.5 text-white text-sm font-medium hover:bg-zinc-700 transition-colors">
                Show Answer
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex gap-1.5 mb-4 overflow-x-auto">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => setFilter(c)} className={"rounded-lg px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-all " + (filter === c ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
                  {c}
                </button>
              ))}
            </div>

            {adding && (
              <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-white">New Question</span>
                  <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
                </div>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none mb-2">
                  {CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c}>{c}</option>)}
                </select>
                <textarea placeholder="Question" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} rows={2} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none mb-2" />
                <textarea placeholder="Your answer / notes" value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} rows={2} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none resize-none mb-2" />
                <button onClick={addQuestion} className="w-full rounded-xl bg-indigo-600 py-2 text-white text-sm font-medium">Add Question</button>
              </div>
            )}

            <div className="space-y-1.5">
              {filtered.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No questions in this category</p>}
              {filtered.map((q) => (
                <button key={q.id} onClick={() => { setSelected(selected === q.id ? null : q.id); setAdding(false); }} className={"w-full text-left rounded-xl border px-4 py-3 transition-all " + (selected === q.id ? "bg-zinc-900 border-indigo-500/30" : "bg-zinc-900 border-white/5 hover:border-white/10")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-500">{q.category}</span>
                    <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map((s) => <Star key={s} size={8} className={s <= q.confidence ? "text-amber-400" : "text-zinc-800"} fill={s <= q.confidence ? "currentColor" : "none"} />)}</div>
                  </div>
                  <p className="text-sm text-white">{q.question}</p>
                  {selected === q.id && q.answer && <p className="text-xs text-zinc-400 mt-2 border-t border-white/5 pt-2">{q.answer}</p>}
                  {selected === q.id && (
                    <div className="flex justify-end mt-2">
                      <button onClick={(e) => { e.stopPropagation(); deleteQuestion(q.id); }} className="text-xs text-red-400 hover:text-red-300">Delete</button>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
`,
  },
];
