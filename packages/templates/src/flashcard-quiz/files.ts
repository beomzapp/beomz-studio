import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useEffect, useRef } = React;
import { RotateCcw, Clock, Check, X, ChevronRight, Layers } from "lucide-react";

const DECKS = {
  science: { name: "Science", emoji: "🔬", cards: [
    { q: "What is the powerhouse of the cell?", a: "Mitochondria" },
    { q: "What gas makes up about 78% of Earth's atmosphere?", a: "Nitrogen" },
    { q: "What is the hardest natural substance?", a: "Diamond" },
    { q: "What planet has the most moons?", a: "Saturn" },
    { q: "What is the chemical formula for water?", a: "H2O" },
  ]},
  history: { name: "History", emoji: "📜", cards: [
    { q: "In which year did World War II end?", a: "1945" },
    { q: "Who was the first president of the United States?", a: "George Washington" },
    { q: "What ancient wonder was located in Alexandria?", a: "The Lighthouse (Pharos)" },
    { q: "Which empire built the Colosseum?", a: "Roman Empire" },
    { q: "In what year did the Berlin Wall fall?", a: "1989" },
  ]},
  tech: { name: "Technology", emoji: "💻", cards: [
    { q: "Who created JavaScript?", a: "Brendan Eich" },
    { q: "What does HTML stand for?", a: "HyperText Markup Language" },
    { q: "What year was the first iPhone released?", a: "2007" },
    { q: "What does CPU stand for?", a: "Central Processing Unit" },
    { q: "Who founded Tesla?", a: "Martin Eberhard & Marc Tarpenning (Elon Musk joined later)" },
  ]},
};

export function App() {
  const [deckId, setDeckId] = useState(null);
  const [cardIdx, setCardIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [timeLeft, setTimeLeft] = useState(15);
  const [phase, setPhase] = useState("select");
  const timerRef = useRef(null);

  const deck = deckId ? DECKS[deckId] : null;
  const card = deck ? deck.cards[cardIdx] : null;

  useEffect(() => {
    if (phase !== "playing" || showAnswer) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setShowAnswer(true);
          setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, cardIdx, showAnswer]);

  const startDeck = useCallback((id) => {
    setDeckId(id);
    setCardIdx(0);
    setScore({ correct: 0, wrong: 0 });
    setShowAnswer(false);
    setTimeLeft(15);
    setPhase("playing");
  }, []);

  const markAnswer = useCallback((correct) => {
    clearInterval(timerRef.current);
    setShowAnswer(true);
    setScore((s) => correct ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 });
  }, []);

  const nextCard = useCallback(() => {
    if (!deck) return;
    if (cardIdx + 1 >= deck.cards.length) {
      setPhase("results");
    } else {
      setCardIdx((i) => i + 1);
      setShowAnswer(false);
      setTimeLeft(15);
    }
  }, [cardIdx, deck]);

  const restart = useCallback(() => {
    setPhase("select");
    setDeckId(null);
  }, []);

  const total = score.correct + score.wrong;
  const pct = total > 0 ? Math.round((score.correct / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {phase === "select" && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
            <h1 className="text-xl font-semibold text-white mb-2 flex items-center gap-2"><Layers size={20} /> Flashcard Quiz</h1>
            <p className="text-sm text-zinc-500 mb-5">Choose a deck to start</p>
            <div className="space-y-2">
              {Object.entries(DECKS).map(([id, d]) => (
                <button key={id} onClick={() => startDeck(id)} className="w-full flex items-center gap-3 rounded-xl bg-zinc-800/60 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors text-left">
                  <span className="text-2xl">{d.emoji}</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-white">{d.name}</span>
                    <span className="block text-xs text-zinc-500">{d.cards.length} cards</span>
                  </div>
                  <ChevronRight size={16} className="text-zinc-600" />
                </button>
              ))}
            </div>
          </div>
        )}

        {phase === "playing" && card && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-zinc-500">{deck.emoji} {deck.name} — {cardIdx + 1}/{deck.cards.length}</span>
              <div className={"flex items-center gap-1 text-sm font-medium " + (timeLeft <= 5 ? "text-red-400" : "text-zinc-400")}>
                <Clock size={14} /> {timeLeft}s
              </div>
            </div>

            <div className="w-full bg-zinc-800 rounded-full h-1 mb-5">
              <div className="bg-amber-500 h-1 rounded-full transition-all" style={{ width: ((cardIdx) / deck.cards.length * 100) + "%" }} />
            </div>

            <div className="rounded-2xl bg-zinc-800/60 border border-white/5 p-6 mb-5 min-h-[120px] flex items-center justify-center text-center">
              <p className="text-lg text-white">{card.q}</p>
            </div>

            {showAnswer ? (
              <div className="text-center mb-4">
                <p className="text-sm text-zinc-400 mb-1">Answer:</p>
                <p className="text-lg font-semibold text-amber-400">{card.a}</p>
              </div>
            ) : (
              <div className="flex gap-2 mb-4">
                <button onClick={() => setShowAnswer(true)} className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-sm text-zinc-300 font-medium hover:bg-zinc-700 transition-colors">Show Answer</button>
              </div>
            )}

            {showAnswer ? (
              <div className="flex gap-2">
                {timeLeft > 0 && (
                  <>
                    <button onClick={() => { markAnswer(false); nextCard(); }} className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-red-600/20 border border-red-600/30 py-2.5 text-sm font-medium text-red-400">
                      <X size={15} /> Wrong
                    </button>
                    <button onClick={() => { markAnswer(true); nextCard(); }} className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-green-600/20 border border-green-600/30 py-2.5 text-sm font-medium text-green-400">
                      <Check size={15} /> Correct
                    </button>
                  </>
                )}
                {timeLeft === 0 && (
                  <button onClick={nextCard} className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm text-white font-medium hover:bg-amber-500 transition-colors">
                    {cardIdx + 1 >= deck.cards.length ? "See Results" : "Next Card"}
                  </button>
                )}
              </div>
            ) : null}

            <div className="flex justify-center gap-4 mt-4 text-xs">
              <span className="text-green-400">{score.correct} correct</span>
              <span className="text-red-400">{score.wrong} wrong</span>
            </div>
          </div>
        )}

        {phase === "results" && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 shadow-2xl text-center">
            <div className="text-5xl mb-4">{pct >= 80 ? "🏆" : pct >= 50 ? "👏" : "📚"}</div>
            <h2 className="text-xl font-bold text-white mb-1">{pct >= 80 ? "Excellent!" : pct >= 50 ? "Good effort!" : "Keep studying!"}</h2>
            <p className="text-3xl font-bold text-amber-400 mb-1">{score.correct}/{total}</p>
            <p className="text-sm text-zinc-500 mb-5">{pct}% correct on {deck?.name}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => startDeck(deckId)} className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2.5 text-white font-medium hover:bg-amber-500 transition-colors">
                <RotateCcw size={15} /> Retry
              </button>
              <button onClick={restart} className="rounded-xl bg-zinc-800 px-5 py-2.5 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors">
                All Decks
              </button>
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
