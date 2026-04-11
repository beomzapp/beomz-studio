import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { RotateCcw, ChevronLeft, ChevronRight, Shuffle, Plus, X } from "lucide-react";

const SAMPLE_CARDS = [
  { id: 1, front: "What is React?", back: "A JavaScript library for building user interfaces" },
  { id: 2, front: "What is JSX?", back: "A syntax extension that lets you write HTML-like code in JavaScript" },
  { id: 3, front: "What is a Hook?", back: "A function that lets you use state and lifecycle features in function components" },
  { id: 4, front: "What does useState return?", back: "An array with the current state value and a function to update it" },
  { id: 5, front: "What is the virtual DOM?", back: "A lightweight copy of the real DOM that React uses to optimize updates" },
];

let nextId = 100;

export function App() {
  const [cards, setCards] = useState(SAMPLE_CARDS);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [score, setScore] = useState({ correct: 0, incorrect: 0 });
  const [adding, setAdding] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");

  const card = cards[index] || null;

  const flip = useCallback(() => setFlipped((f) => !f), []);

  const next = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i + 1) % cards.length);
  }, [cards.length]);

  const prev = useCallback(() => {
    setFlipped(false);
    setIndex((i) => (i - 1 + cards.length) % cards.length);
  }, [cards.length]);

  const shuffle = useCallback(() => {
    setCards((prev) => [...prev].sort(() => Math.random() - 0.5));
    setIndex(0);
    setFlipped(false);
    setScore({ correct: 0, incorrect: 0 });
  }, []);

  const markCorrect = useCallback(() => {
    setScore((s) => ({ ...s, correct: s.correct + 1 }));
    next();
  }, [next]);

  const markIncorrect = useCallback(() => {
    setScore((s) => ({ ...s, incorrect: s.incorrect + 1 }));
    next();
  }, [next]);

  const addCard = useCallback(() => {
    if (!newFront.trim() || !newBack.trim()) return;
    setCards((prev) => [...prev, { id: nextId++, front: newFront.trim(), back: newBack.trim() }]);
    setNewFront("");
    setNewBack("");
    setAdding(false);
  }, [newFront, newBack]);

  const total = score.correct + score.incorrect;
  const pct = total > 0 ? Math.round((score.correct / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white">Flashcards</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">{index + 1}/{cards.length}</span>
            <button onClick={() => setAdding(true)} className="text-zinc-500 hover:text-white transition-colors">
              <Plus size={18} />
            </button>
          </div>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Card</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Front (question)" value={newFront} onChange={(e) => setNewFront(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <input placeholder="Back (answer)" value={newBack} onChange={(e) => setNewBack(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-3" />
            <button onClick={addCard} className="w-full rounded-xl bg-amber-600 py-2.5 text-white text-sm font-medium hover:bg-amber-500 transition-colors">Add Card</button>
          </div>
        )}

        {card && (
          <button
            onClick={flip}
            className="w-full rounded-3xl bg-zinc-900 border border-white/5 p-8 mb-4 min-h-[200px] flex items-center justify-center text-center transition-all hover:border-white/10 cursor-pointer"
          >
            <div>
              <span className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3 block">
                {flipped ? "Answer" : "Question"}
              </span>
              <p className={"text-lg " + (flipped ? "text-amber-300" : "text-white")}>
                {flipped ? card.back : card.front}
              </p>
            </div>
          </button>
        )}

        {card && flipped && (
          <div className="flex gap-2 mb-4">
            <button onClick={markIncorrect} className="flex-1 rounded-xl bg-red-600/20 border border-red-600/30 py-2.5 text-sm font-medium text-red-400 hover:bg-red-600/30 transition-colors">
              Incorrect
            </button>
            <button onClick={markCorrect} className="flex-1 rounded-xl bg-green-600/20 border border-green-600/30 py-2.5 text-sm font-medium text-green-400 hover:bg-green-600/30 transition-colors">
              Correct
            </button>
          </div>
        )}

        <div className="flex items-center justify-between">
          <button onClick={prev} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition-colors">
            <ChevronLeft size={16} /> Prev
          </button>
          <div className="flex items-center gap-3">
            <button onClick={shuffle} className="text-zinc-500 hover:text-white transition-colors" title="Shuffle">
              <Shuffle size={16} />
            </button>
            <button onClick={() => { setFlipped(false); }} className="text-zinc-500 hover:text-white transition-colors" title="Flip back">
              <RotateCcw size={16} />
            </button>
          </div>
          <button onClick={next} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition-colors">
            Next <ChevronRight size={16} />
          </button>
        </div>

        {total > 0 && (
          <div className="mt-5 rounded-2xl bg-zinc-900 border border-white/5 p-4 flex items-center justify-between">
            <span className="text-xs text-zinc-500">Score</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-400">{score.correct} correct</span>
              <span className="text-xs text-red-400">{score.incorrect} wrong</span>
              <span className="text-sm font-semibold text-white">{pct}%</span>
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
