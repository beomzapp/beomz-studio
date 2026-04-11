import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Shuffle, Lightbulb, ArrowRight, RotateCcw } from "lucide-react";

const WORDS = [
  { word: "JAVASCRIPT", hint: "Popular programming language" },
  { word: "DESIGN", hint: "Creating visual solutions" },
  { word: "PUZZLE", hint: "A brain teaser" },
  { word: "ROCKET", hint: "Flies to space" },
  { word: "GUITAR", hint: "Six-stringed instrument" },
  { word: "PLANET", hint: "Orbits a star" },
  { word: "COFFEE", hint: "Morning energy drink" },
  { word: "BRIDGE", hint: "Connects two sides" },
  { word: "CASTLE", hint: "Medieval fortress" },
  { word: "OXYGEN", hint: "We breathe this" },
  { word: "PYTHON", hint: "A snake or a language" },
  { word: "GALAXY", hint: "Collection of stars" },
  { word: "JUNGLE", hint: "Dense tropical forest" },
  { word: "RHYTHM", hint: "Musical beat pattern" },
  { word: "MATRIX", hint: "Grid of numbers or a movie" },
];

function scramble(word) {
  const arr = word.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result = arr.join("");
  return result === word ? scramble(word) : result;
}

export function App() {
  const [wordIndex, setWordIndex] = useState(0);
  const [guess, setGuess] = useState("");
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [result, setResult] = useState(null);
  const [scrambled, setScrambled] = useState(() => scramble(WORDS[0].word));
  const [history, setHistory] = useState([]);
  const [gameOver, setGameOver] = useState(false);

  const current = WORDS[wordIndex];

  const checkAnswer = useCallback(() => {
    if (!guess.trim()) return;
    const correct = guess.toUpperCase().trim() === current.word;
    if (correct) setScore((s) => s + (showHint ? 5 : 10));
    setResult(correct ? "correct" : "wrong");
    setHistory((prev) => [...prev, { word: current.word, correct }]);
    setTimeout(() => {
      if (wordIndex + 1 >= WORDS.length) {
        setGameOver(true);
      } else {
        const next = wordIndex + 1;
        setWordIndex(next);
        setScrambled(scramble(WORDS[next].word));
        setGuess("");
        setResult(null);
        setShowHint(false);
      }
    }, 1200);
  }, [guess, current, wordIndex, showHint]);

  const reshuffle = useCallback(() => {
    setScrambled(scramble(current.word));
  }, [current]);

  const restart = useCallback(() => {
    setWordIndex(0);
    setGuess("");
    setScore(0);
    setShowHint(false);
    setResult(null);
    setScrambled(scramble(WORDS[0].word));
    setHistory([]);
    setGameOver(false);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-semibold text-white">Word Scramble</h1>
            <span className="text-sm font-medium text-blue-400">{score} pts</span>
          </div>

          {gameOver ? (
            <div className="text-center py-8">
              <div className="text-5xl mb-3">{score >= WORDS.length * 7 ? "🏆" : "👏"}</div>
              <p className="text-xl font-bold text-white mb-1">Game Over!</p>
              <p className="text-sm text-zinc-400 mb-1">Score: {score} / {WORDS.length * 10}</p>
              <p className="text-sm text-zinc-500 mb-5">{history.filter((h) => h.correct).length}/{WORDS.length} correct</p>
              <button onClick={restart} className="flex items-center gap-2 mx-auto rounded-xl bg-blue-600 px-6 py-2.5 text-white font-medium hover:bg-blue-500 transition-colors">
                <RotateCcw size={15} /> Play Again
              </button>
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-500 mb-4">
                Word {wordIndex + 1} of {WORDS.length}
              </div>

              <div className="flex justify-center gap-2 mb-5">
                {scrambled.split("").map((letter, i) => (
                  <div key={i} className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 border border-white/5 text-lg font-bold text-white">
                    {letter}
                  </div>
                ))}
              </div>

              {showHint && (
                <p className="text-center text-sm text-amber-400 mb-3">Hint: {current.hint}</p>
              )}

              <form onSubmit={(e) => { e.preventDefault(); checkAnswer(); }} className="flex gap-2 mb-3">
                <input
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  placeholder="Your answer..."
                  disabled={result !== null}
                  className={"flex-1 rounded-xl border px-4 py-2.5 text-white text-sm placeholder-zinc-600 outline-none bg-zinc-800 " +
                    (result === "correct" ? "border-green-500/40" : result === "wrong" ? "border-red-500/40" : "border-white/5")}
                  autoFocus
                />
                <button type="submit" disabled={result !== null} className="rounded-xl bg-blue-600 px-4 py-2.5 text-white text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-40">
                  <ArrowRight size={18} />
                </button>
              </form>

              {result && (
                <p className={"text-center text-sm font-medium mb-3 " + (result === "correct" ? "text-green-400" : "text-red-400")}>
                  {result === "correct" ? "Correct!" : "Wrong — it was " + current.word}
                </p>
              )}

              <div className="flex justify-center gap-3">
                <button onClick={reshuffle} disabled={result !== null} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40">
                  <Shuffle size={13} /> Reshuffle
                </button>
                <button onClick={() => setShowHint(true)} disabled={showHint || result !== null} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-40">
                  <Lightbulb size={13} /> Hint (-5 pts)
                </button>
              </div>
            </>
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
