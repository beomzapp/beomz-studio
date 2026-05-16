import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  ALL_PERSONALITIES,
  PERSONALITY_LABELS,
  getPersonality,
  isRandomMode,
  setPersonality,
  setRandomPersonality,
  type PersonalityId,
} from "../../../lib/personalities";

export function SettingsAIPersonalityPage() {
  const [selectedId, setSelectedId] = useState<PersonalityId | "random">(() =>
    isRandomMode() ? "random" : getPersonality(),
  );

  const handleSelect = (id: PersonalityId | "random") => {
    setSelectedId(id);
    if (id === "random") {
      setRandomPersonality();
    } else {
      setPersonality(id);
    }
  };

  return (
    <div className="min-h-full bg-[#faf9f6] p-6 lg:p-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1a1a1a]">AI personality</h1>
          <p className="mt-1 text-sm text-[#6b7280]">Choose how Beomz talks to you while building.</p>
        </div>

        <section className="rounded-2xl border border-[#e5e5e5] bg-white p-6">
          <div className="mb-1 flex items-center gap-2 text-[#1a1a1a]">
            <Sparkles size={18} />
            <h2 className="text-base font-semibold">Chat personality</h2>
          </div>
          <p className="mb-5 text-sm text-[#6b7280]">
            Saved automatically when you select a personality.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {/* Random card */}
            <button
              onClick={() => handleSelect("random")}
              className={`rounded-xl border p-3.5 text-left transition-all ${
                selectedId === "random"
                  ? "border-[#F97316] bg-[#F97316]/5"
                  : "border-[#e5e5e5] bg-[#faf9f6] hover:border-[#F97316]/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#1a1a1a]">Random</span>
                {selectedId === "random" && (
                  <span className="text-xs text-[#F97316]">&#10003;</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#9ca3af]">Different personality each session</p>
              <p className="mt-2 text-xs italic text-[#c4b8a8]">Surprise me</p>
            </button>

            {ALL_PERSONALITIES.map((id) => {
              const label = PERSONALITY_LABELS[id];
              const isSelected = selectedId === id;
              return (
                <button
                  key={id}
                  onClick={() => handleSelect(id)}
                  className={`rounded-xl border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-[#F97316] bg-[#F97316]/5"
                      : "border-[#e5e5e5] bg-[#faf9f6] hover:border-[#F97316]/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#1a1a1a]">{label.name}</span>
                    {isSelected && (
                      <span className="text-xs text-[#F97316]">&#10003;</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[#9ca3af]">{label.tagline}</p>
                  <p className="mt-2 whitespace-pre-wrap text-xs italic text-[#c4b8a8]">
                    {label.preview}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
