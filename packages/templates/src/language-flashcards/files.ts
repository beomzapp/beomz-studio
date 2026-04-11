import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { ChevronRight, ChevronLeft, RotateCcw, Check, X, Globe, Volume2 } from "lucide-react";

const PACKS = {
  spanish: { name: "Spanish", flag: "🇪🇸", cards: [
    { word: "Hola", meaning: "Hello", hint: "oh-lah" },
    { word: "Gracias", meaning: "Thank you", hint: "grah-see-ahs" },
    { word: "Por favor", meaning: "Please", hint: "por fah-vor" },
    { word: "Buenos dias", meaning: "Good morning", hint: "bweh-nos dee-ahs" },
    { word: "Amigo", meaning: "Friend", hint: "ah-mee-go" },
    { word: "Casa", meaning: "House", hint: "kah-sah" },
    { word: "Comida", meaning: "Food", hint: "ko-mee-dah" },
    { word: "Agua", meaning: "Water", hint: "ah-gwah" },
  ]},
  french: { name: "French", flag: "🇫🇷", cards: [
    { word: "Bonjour", meaning: "Hello/Good day", hint: "bon-zhoor" },
    { word: "Merci", meaning: "Thank you", hint: "mehr-see" },
    { word: "S'il vous plait", meaning: "Please", hint: "seel voo pleh" },
    { word: "Au revoir", meaning: "Goodbye", hint: "oh ruh-vwahr" },
    { word: "Oui", meaning: "Yes", hint: "wee" },
    { word: "Maison", meaning: "House", hint: "meh-zon" },
    { word: "Manger", meaning: "To eat", hint: "mon-zhay" },
    { word: "Eau", meaning: "Water", hint: "oh" },
  ]},
  japanese: { name: "Japanese", flag: "🇯🇵", cards: [
    { word: "Konnichiwa", meaning: "Hello", hint: "kohn-nee-chee-wah" },
    { word: "Arigatou", meaning: "Thank you", hint: "ah-ree-gah-toh" },
    { word: "Sumimasen", meaning: "Excuse me", hint: "soo-mee-mah-sen" },
    { word: "Hai", meaning: "Yes", hint: "hi" },
    { word: "Iie", meaning: "No", hint: "ee-eh" },
    { word: "Ohayou", meaning: "Good morning", hint: "oh-hah-yoh" },
    { word: "Mizu", meaning: "Water", hint: "mee-zoo" },
    { word: "Tomodachi", meaning: "Friend", hint: "toh-moh-dah-chee" },
  ]},
};

export function App() {
  const [packId, setPackId] = useState(null);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  const pack = packId ? PACKS[packId] : null;
  const card = pack ? pack.cards[idx] : null;
  const total = score.correct + score.wrong;
  const pct = total > 0 ? Math.round((score.correct / total) * 100) : 0;

  const next = useCallback((correct) => {
    setScore((s) => correct ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 });
    setFlipped(false);
    setShowHint(false);
    if (pack && idx + 1 >= pack.cards.length) {
      setPackId(null);
    } else {
      setIdx((i) => i + 1);
    }
  }, [pack, idx]);

  const startPack = useCallback((id) => {
    setPackId(id);
    setIdx(0);
    setFlipped(false);
    setShowHint(false);
    setScore({ correct: 0, wrong: 0 });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {!packId ? (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
            <h1 className="text-xl font-semibold text-white mb-2 flex items-center gap-2"><Globe size={20} /> Language Cards</h1>
            {total > 0 && (
              <div className="rounded-xl bg-zinc-800/60 p-3 mb-4 text-center">
                <p className="text-sm text-zinc-400">Last session: <span className="text-white font-medium">{pct}%</span> ({score.correct}/{total})</p>
              </div>
            )}
            <p className="text-sm text-zinc-500 mb-5">Choose a language pack</p>
            <div className="space-y-2">
              {Object.entries(PACKS).map(([id, p]) => (
                <button key={id} onClick={() => startPack(id)} className="w-full flex items-center gap-3 rounded-xl bg-zinc-800/60 border border-white/5 px-4 py-3 hover:border-white/10 transition-colors text-left">
                  <span className="text-2xl">{p.flag}</span>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <span className="block text-xs text-zinc-500">{p.cards.length} words</span>
                  </div>
                  <ChevronRight size={16} className="text-zinc-600" />
                </button>
              ))}
            </div>
          </div>
        ) : card && (
          <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-zinc-500">{pack.flag} {pack.name} — {idx + 1}/{pack.cards.length}</span>
              <div className="flex gap-3 text-xs">
                <span className="text-green-400">{score.correct}</span>
                <span className="text-red-400">{score.wrong}</span>
              </div>
            </div>

            <div className="w-full bg-zinc-800 rounded-full h-1 mb-5">
              <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: (idx / pack.cards.length * 100) + "%" }} />
            </div>

            <button
              onClick={() => setFlipped((f) => !f)}
              className="w-full rounded-2xl bg-zinc-800/60 border border-white/5 p-8 mb-4 min-h-[160px] flex flex-col items-center justify-center text-center cursor-pointer hover:border-white/10 transition-colors"
            >
              <span className="text-[10px] uppercase tracking-widest text-zinc-600 mb-3">
                {flipped ? "English" : pack.name}
              </span>
              <p className={"text-2xl font-bold " + (flipped ? "text-blue-400" : "text-white")}>
                {flipped ? card.meaning : card.word}
              </p>
              {showHint && !flipped && (
                <p className="text-sm text-zinc-500 mt-2 flex items-center gap-1">
                  <Volume2 size={13} /> {card.hint}
                </p>
              )}
            </button>

            {!flipped ? (
              <div className="flex gap-2">
                <button onClick={() => setShowHint(true)} disabled={showHint} className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-sm text-zinc-400 font-medium hover:bg-zinc-700 transition-colors disabled:opacity-40">
                  Hint
                </button>
                <button onClick={() => setFlipped(true)} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm text-white font-medium hover:bg-blue-500 transition-colors">
                  Reveal
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => next(false)} className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-red-600/20 border border-red-600/30 py-2.5 text-sm font-medium text-red-400">
                  <X size={15} /> Didn't know
                </button>
                <button onClick={() => next(true)} className="flex-1 flex items-center justify-center gap-1 rounded-xl bg-green-600/20 border border-green-600/30 py-2.5 text-sm font-medium text-green-400">
                  <Check size={15} /> Got it
                </button>
              </div>
            )}
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
