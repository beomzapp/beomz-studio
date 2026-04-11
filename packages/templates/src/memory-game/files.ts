import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useEffect, useRef } = React;
import { RotateCcw, Trophy } from "lucide-react";

const EMOJIS_4x4 = ["🐶", "🐱", "🐸", "🦊", "🐻", "🐼", "🐨", "🐯"];
const EMOJIS_6x6 = [...EMOJIS_4x4, "🦁", "🐮", "🐷", "🐵", "🐔", "🐧", "🐤", "🦆", "🦅", "🦉"];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildBoard(size) {
  const count = (size * size) / 2;
  const emojis = size === 4 ? EMOJIS_4x4.slice(0, count) : EMOJIS_6x6.slice(0, count);
  return shuffle([...emojis, ...emojis]).map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }));
}

export function App() {
  const [size, setSize] = useState(4);
  const [cards, setCards] = useState(() => buildBoard(4));
  const [first, setFirst] = useState(null);
  const [second, setSecond] = useState(null);
  const [moves, setMoves] = useState(0);
  const [won, setWon] = useState(false);
  const lockRef = useRef(false);

  const reset = useCallback((newSize) => {
    const s = newSize || size;
    setSize(s);
    setCards(buildBoard(s));
    setFirst(null);
    setSecond(null);
    setMoves(0);
    setWon(false);
    lockRef.current = false;
  }, [size]);

  const handleClick = useCallback((idx) => {
    if (lockRef.current) return;
    const card = cards[idx];
    if (card.flipped || card.matched) return;

    const updated = cards.map((c, i) => i === idx ? { ...c, flipped: true } : c);
    setCards(updated);

    if (first === null) {
      setFirst(idx);
    } else {
      setSecond(idx);
      setMoves((m) => m + 1);
      lockRef.current = true;

      if (cards[first].emoji === card.emoji) {
        setTimeout(() => {
          setCards((prev) => prev.map((c, i) => (i === first || i === idx) ? { ...c, matched: true } : c));
          setFirst(null);
          setSecond(null);
          lockRef.current = false;
        }, 400);
      } else {
        setTimeout(() => {
          setCards((prev) => prev.map((c, i) => (i === first || i === idx) ? { ...c, flipped: false } : c));
          setFirst(null);
          setSecond(null);
          lockRef.current = false;
        }, 800);
      }
    }
  }, [cards, first]);

  useEffect(() => {
    if (cards.length > 0 && cards.every((c) => c.matched)) setWon(true);
  }, [cards]);

  const pairs = cards.filter((c) => c.matched).length / 2;
  const totalPairs = cards.length / 2;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-4">Memory Game</h1>

          <div className="flex justify-center gap-2 mb-4">
            {[4, 6].map((s) => (
              <button key={s} onClick={() => reset(s)} className={"rounded-lg px-3 py-1.5 text-xs font-medium transition-all " + (size === s ? "bg-purple-600 text-white" : "bg-zinc-800 text-zinc-500 hover:text-zinc-300")}>
                {s}x{s}
              </button>
            ))}
            <button onClick={() => reset()} className="rounded-lg px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-all flex items-center gap-1">
              <RotateCcw size={12} /> Reset
            </button>
          </div>

          <div className="flex justify-between text-xs text-zinc-500 mb-3 px-1">
            <span>Moves: {moves}</span>
            <span>Pairs: {pairs}/{totalPairs}</span>
          </div>

          {won ? (
            <div className="py-10">
              <Trophy size={40} className="text-amber-400 mx-auto mb-3" />
              <p className="text-xl font-bold text-white mb-1">You won!</p>
              <p className="text-sm text-zinc-400 mb-4">Completed in {moves} moves</p>
              <button onClick={() => reset()} className="rounded-xl bg-purple-600 px-6 py-2.5 text-white text-sm font-medium hover:bg-purple-500 transition-colors">
                Play Again
              </button>
            </div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "repeat(" + size + ", minmax(0, 1fr))" }}
            >
              {cards.map((card, i) => (
                <button
                  key={card.id}
                  onClick={() => handleClick(i)}
                  className={"aspect-square rounded-xl text-2xl flex items-center justify-center transition-all " +
                    (card.matched ? "bg-purple-600/20 border border-purple-500/30 scale-95" :
                     card.flipped ? "bg-zinc-700 border border-white/10" :
                     "bg-zinc-800 border border-white/5 hover:bg-zinc-700 cursor-pointer")}
                >
                  {(card.flipped || card.matched) ? card.emoji : ""}
                </button>
              ))}
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
