import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useEffect, useRef } = React;
import { Timer, Trophy, RotateCcw } from "lucide-react";

const QUESTIONS = [
  { q: "What planet is known as the Red Planet?", options: ["Venus", "Mars", "Jupiter", "Saturn"], answer: 1 },
  { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1 },
  { q: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], answer: 2 },
  { q: "Which ocean is the largest?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
  { q: "What year did the first iPhone launch?", options: ["2005", "2006", "2007", "2008"], answer: 2 },
  { q: "What gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
  { q: "How many bones are in the adult human body?", options: ["186", "196", "206", "216"], answer: 2 },
  { q: "What is the smallest country in the world?", options: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], answer: 1 },
  { q: "Which element has the atomic number 1?", options: ["Helium", "Hydrogen", "Lithium", "Carbon"], answer: 1 },
  { q: "What is the speed of light (approx)?", options: ["300,000 km/s", "150,000 km/s", "500,000 km/s", "1,000,000 km/s"], answer: 0 },
];

export function App() {
  const [phase, setPhase] = useState("start");
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [answers, setAnswers] = useState([]);
  const timerRef = useRef(null);

  const startGame = useCallback(() => {
    setPhase("playing");
    setCurrentQ(0);
    setScore(0);
    setSelected(null);
    setTimeLeft(15);
    setAnswers([]);
  }, []);

  useEffect(() => {
    if (phase !== "playing" || selected !== null) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          setAnswers((prev) => [...prev, { question: currentQ, selected: -1, correct: QUESTIONS[currentQ].answer }]);
          setSelected(-1);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, currentQ, selected]);

  const handleAnswer = useCallback((idx) => {
    if (selected !== null) return;
    clearInterval(timerRef.current);
    setSelected(idx);
    const correct = QUESTIONS[currentQ].answer === idx;
    if (correct) setScore((s) => s + 1);
    setAnswers((prev) => [...prev, { question: currentQ, selected: idx, correct: QUESTIONS[currentQ].answer }]);
  }, [selected, currentQ]);

  const nextQuestion = useCallback(() => {
    if (currentQ + 1 >= QUESTIONS.length) {
      setPhase("results");
    } else {
      setCurrentQ((q) => q + 1);
      setSelected(null);
      setTimeLeft(15);
    }
  }, [currentQ]);

  const question = QUESTIONS[currentQ];
  const pct = Math.round((score / QUESTIONS.length) * 100);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {phase === "start" && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 text-center">
            <div className="text-5xl mb-4">🧠</div>
            <h1 className="text-2xl font-bold text-white mb-2">Trivia Challenge</h1>
            <p className="text-sm text-zinc-400 mb-6">{QUESTIONS.length} questions · 15 seconds each</p>
            <button onClick={startGame} className="rounded-xl bg-purple-600 px-8 py-3 text-white font-medium hover:bg-purple-500 transition-colors">
              Start Game
            </button>
          </div>
        )}

        {phase === "playing" && question && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6">
            <div className="flex items-center justify-between mb-5">
              <span className="text-xs text-zinc-500">Question {currentQ + 1}/{QUESTIONS.length}</span>
              <div className="flex items-center gap-2">
                <Trophy size={13} className="text-amber-400" />
                <span className="text-sm font-medium text-white">{score}</span>
              </div>
              <div className={"flex items-center gap-1.5 text-sm font-medium " + (timeLeft <= 5 ? "text-red-400" : "text-zinc-400")}>
                <Timer size={14} />
                {timeLeft}s
              </div>
            </div>

            <div className="w-full bg-zinc-800 rounded-full h-1 mb-6">
              <div className="bg-purple-500 h-1 rounded-full transition-all" style={{ width: ((currentQ) / QUESTIONS.length * 100) + "%" }} />
            </div>

            <h2 className="text-lg font-medium text-white mb-5">{question.q}</h2>

            <div className="space-y-2.5 mb-5">
              {question.options.map((opt, i) => {
                let cls = "rounded-xl border px-4 py-3 text-sm text-left w-full transition-all ";
                if (selected === null) {
                  cls += "border-white/5 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 hover:border-white/10 cursor-pointer";
                } else if (i === question.answer) {
                  cls += "border-green-500/40 bg-green-600/20 text-green-300";
                } else if (i === selected && i !== question.answer) {
                  cls += "border-red-500/40 bg-red-600/20 text-red-300";
                } else {
                  cls += "border-white/5 bg-zinc-800/30 text-zinc-600";
                }
                return (
                  <button key={i} onClick={() => handleAnswer(i)} className={cls} disabled={selected !== null}>
                    <span className="font-medium mr-2 text-zinc-500">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {selected !== null && (
              <button onClick={nextQuestion} className="w-full rounded-xl bg-purple-600 py-2.5 text-white text-sm font-medium hover:bg-purple-500 transition-colors">
                {currentQ + 1 >= QUESTIONS.length ? "See Results" : "Next Question"}
              </button>
            )}
          </div>
        )}

        {phase === "results" && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-8 text-center">
            <div className="text-5xl mb-4">{pct >= 70 ? "🏆" : pct >= 40 ? "👏" : "💪"}</div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {pct >= 70 ? "Great job!" : pct >= 40 ? "Not bad!" : "Keep practicing!"}
            </h2>
            <p className="text-4xl font-bold text-purple-400 mb-1">{score}/{QUESTIONS.length}</p>
            <p className="text-sm text-zinc-500 mb-6">{pct}% correct</p>
            <button onClick={startGame} className="flex items-center gap-2 mx-auto rounded-xl bg-purple-600 px-6 py-2.5 text-white font-medium hover:bg-purple-500 transition-colors">
              <RotateCcw size={15} /> Play Again
            </button>
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
