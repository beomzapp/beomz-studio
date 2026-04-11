import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, Trash2, Play, RotateCcw, Check, X, Edit3 } from "lucide-react";

let nextId = 20;

const SAMPLE = [
  { id: 1, question: "What is the capital of France?", options: ["London", "Berlin", "Paris", "Madrid"], answer: 2 },
  { id: 2, question: "Which planet is closest to the Sun?", options: ["Venus", "Mercury", "Mars", "Earth"], answer: 1 },
  { id: 3, question: "What is 7 x 8?", options: ["48", "54", "56", "64"], answer: 2 },
];

export function App() {
  const [questions, setQuestions] = useState(SAMPLE);
  const [mode, setMode] = useState("build");
  const [quizIdx, setQuizIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);

  const [editQ, setEditQ] = useState("");
  const [editOpts, setEditOpts] = useState(["", "", "", ""]);
  const [editAnswer, setEditAnswer] = useState(0);
  const [editing, setEditing] = useState(false);

  const addQuestion = useCallback(() => {
    if (!editQ.trim() || editOpts.some((o) => !o.trim())) return;
    setQuestions((prev) => [...prev, { id: nextId++, question: editQ.trim(), options: editOpts.map((o) => o.trim()), answer: editAnswer }]);
    setEditQ(""); setEditOpts(["", "", "", ""]); setEditAnswer(0); setEditing(false);
  }, [editQ, editOpts, editAnswer]);

  const removeQuestion = useCallback((id) => { setQuestions((prev) => prev.filter((q) => q.id !== id)); }, []);

  const startQuiz = useCallback(() => {
    if (questions.length === 0) return;
    setMode("quiz"); setQuizIdx(0); setSelected(null); setScore(0); setAnswered(false);
  }, [questions]);

  const handleAnswer = useCallback((idx) => {
    if (answered) return;
    setSelected(idx);
    setAnswered(true);
    if (idx === questions[quizIdx].answer) setScore((s) => s + 1);
  }, [answered, questions, quizIdx]);

  const nextQuestion = useCallback(() => {
    if (quizIdx + 1 >= questions.length) { setMode("results"); return; }
    setQuizIdx((i) => i + 1); setSelected(null); setAnswered(false);
  }, [quizIdx, questions]);

  const q = questions[quizIdx];
  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {mode === "build" && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-xl font-semibold text-white flex items-center gap-2"><Edit3 size={20} /> Quiz Builder</h1>
              <button onClick={startQuiz} disabled={questions.length === 0} className="flex items-center gap-1 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors disabled:opacity-40">
                <Play size={13} /> Take Quiz ({questions.length})
              </button>
            </div>

            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {questions.map((q, i) => (
                <div key={q.id} className="group flex items-center gap-3 rounded-xl bg-zinc-800/60 px-3 py-2.5">
                  <span className="text-xs text-zinc-600 w-5">{i + 1}.</span>
                  <span className="flex-1 text-sm text-zinc-300 truncate">{q.question}</span>
                  <span className="text-[10px] text-green-400">{q.options[q.answer]}</span>
                  <button onClick={() => removeQuestion(q.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>

            {editing ? (
              <div className="rounded-xl bg-zinc-800/60 p-4">
                <input placeholder="Question" value={editQ} onChange={(e) => setEditQ(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
                {editOpts.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2 mb-1.5">
                    <button onClick={() => setEditAnswer(i)} className={"flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0 text-[10px] " + (editAnswer === i ? "bg-green-600 text-white" : "border border-zinc-700 text-zinc-600")}>
                      {editAnswer === i ? <Check size={10} /> : String.fromCharCode(65 + i)}
                    </button>
                    <input value={opt} onChange={(e) => { const next = [...editOpts]; next[i] = e.target.value; setEditOpts(next); }} placeholder={"Option " + String.fromCharCode(65 + i)} className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-1.5 text-sm text-white placeholder-zinc-600 outline-none" />
                  </div>
                ))}
                <div className="flex gap-2 mt-3">
                  <button onClick={addQuestion} className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs text-white font-medium">Add Question</button>
                  <button onClick={() => setEditing(false)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setEditing(true)} className="w-full rounded-xl border border-dashed border-zinc-800 py-3 text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors flex items-center justify-center gap-1">
                <Plus size={14} /> Add Question
              </button>
            )}
          </div>
        )}

        {mode === "quiz" && q && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-zinc-500">Question {quizIdx + 1}/{questions.length}</span>
              <span className="text-sm font-medium text-purple-400">{score} pts</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1 mb-5">
              <div className="bg-purple-500 h-1 rounded-full transition-all" style={{ width: (quizIdx / questions.length * 100) + "%" }} />
            </div>
            <h2 className="text-lg font-medium text-white mb-5">{q.question}</h2>
            <div className="space-y-2 mb-5">
              {q.options.map((opt, i) => {
                let cls = "w-full text-left rounded-xl border px-4 py-3 text-sm transition-all ";
                if (!answered) cls += "border-white/5 text-zinc-300 hover:border-white/10 cursor-pointer";
                else if (i === q.answer) cls += "border-green-500/40 bg-green-600/20 text-green-300";
                else if (i === selected) cls += "border-red-500/40 bg-red-600/20 text-red-300";
                else cls += "border-white/5 text-zinc-600";
                return (
                  <button key={i} onClick={() => handleAnswer(i)} className={cls} disabled={answered}>
                    <span className="font-medium mr-2 text-zinc-500">{String.fromCharCode(65 + i)}.</span>{opt}
                  </button>
                );
              })}
            </div>
            {answered && (
              <button onClick={nextQuestion} className="w-full rounded-xl bg-purple-600 py-2.5 text-white text-sm font-medium hover:bg-purple-500 transition-colors">
                {quizIdx + 1 >= questions.length ? "See Results" : "Next Question"}
              </button>
            )}
          </div>
        )}

        {mode === "results" && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 shadow-2xl text-center">
            <div className="text-5xl mb-4">{pct >= 80 ? "🏆" : pct >= 50 ? "👏" : "📚"}</div>
            <h2 className="text-xl font-bold text-white mb-1">{pct >= 80 ? "Excellent!" : pct >= 50 ? "Good effort!" : "Keep studying!"}</h2>
            <p className="text-3xl font-bold text-purple-400 mb-1">{score}/{questions.length}</p>
            <p className="text-sm text-zinc-500 mb-5">{pct}% correct</p>
            <div className="flex gap-2 justify-center">
              <button onClick={startQuiz} className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-5 py-2.5 text-white font-medium hover:bg-purple-500 transition-colors"><RotateCcw size={15} /> Retry</button>
              <button onClick={() => setMode("build")} className="rounded-xl bg-zinc-800 px-5 py-2.5 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors">Edit Quiz</button>
            </div>
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
