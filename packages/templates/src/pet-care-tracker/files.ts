import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, Trash2, Heart, X, Stethoscope, Pill, UtensilsCrossed } from "lucide-react";

let nextId = 20;
const SAMPLE_PETS = [
  { id: 1, name: "Luna", species: "Dog", breed: "Golden Retriever", emoji: "🐕", events: [
    { id: 2, type: "vet", text: "Annual checkup", date: "2024-03-15" },
    { id: 3, type: "med", text: "Heartworm pill", date: "2024-04-01" },
    { id: 4, type: "feed", text: "Switched to grain-free", date: "2024-03-20" },
  ]},
  { id: 5, name: "Mochi", species: "Cat", breed: "Siamese", emoji: "🐈", events: [
    { id: 6, type: "vet", text: "Vaccination booster", date: "2024-02-10" },
    { id: 7, type: "feed", text: "New wet food brand", date: "2024-03-01" },
  ]},
];

const EVENT_TYPES = [
  { id: "vet", label: "Vet Visit", icon: Stethoscope, color: "text-blue-400 bg-blue-600/20" },
  { id: "med", label: "Medication", icon: Pill, color: "text-purple-400 bg-purple-600/20" },
  { id: "feed", label: "Feeding", icon: UtensilsCrossed, color: "text-amber-400 bg-amber-600/20" },
];

export function App() {
  const [pets, setPets] = useState(SAMPLE_PETS);
  const [selected, setSelected] = useState(1);
  const [adding, setAdding] = useState(false);
  const [newPet, setNewPet] = useState({ name: "", species: "Dog", breed: "" });
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ type: "vet", text: "", date: "" });

  const pet = pets.find((p) => p.id === selected);

  const addPetHandler = useCallback(() => {
    if (!newPet.name.trim()) return;
    const id = nextId++;
    const emoji = newPet.species === "Dog" ? "🐕" : newPet.species === "Cat" ? "🐈" : "🐾";
    setPets((prev) => [...prev, { id, name: newPet.name.trim(), species: newPet.species, breed: newPet.breed.trim(), emoji, events: [] }]);
    setSelected(id);
    setNewPet({ name: "", species: "Dog", breed: "" });
    setAdding(false);
  }, [newPet]);

  const deletePet = useCallback((id) => {
    setPets((prev) => prev.filter((p) => p.id !== id));
    setSelected((s) => s === id ? (pets[0]?.id !== id ? pets[0]?.id : pets[1]?.id || null) : s);
  }, [pets]);

  const addEventHandler = useCallback(() => {
    if (!newEvent.text.trim() || !selected) return;
    setPets((prev) => prev.map((p) => p.id === selected ? { ...p, events: [{ id: nextId++, ...newEvent, text: newEvent.text.trim() }, ...p.events] } : p));
    setNewEvent({ type: "vet", text: "", date: "" });
    setAddingEvent(false);
  }, [newEvent, selected]);

  const deleteEvent = useCallback((eventId) => {
    setPets((prev) => prev.map((p) => p.id === selected ? { ...p, events: p.events.filter((e) => e.id !== eventId) } : p));
  }, [selected]);

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Heart size={20} /> Pet Care</h1>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {pets.map((p) => (
            <button key={p.id} onClick={() => setSelected(p.id)} className={"flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-all " + (selected === p.id ? "bg-amber-600 text-white" : "bg-zinc-900 border border-white/5 text-zinc-400 hover:text-white")}>
              <span>{p.emoji}</span>{p.name}
            </button>
          ))}
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-zinc-600 border border-dashed border-zinc-800 hover:border-zinc-600 hover:text-zinc-400 whitespace-nowrap">
            <Plus size={14} /> Add Pet
          </button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-white">New Pet</span>
              <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={16} /></button>
            </div>
            <input placeholder="Name" value={newPet.name} onChange={(e) => setNewPet({ ...newPet, name: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
            <div className="flex gap-2 mb-2">
              <select value={newPet.species} onChange={(e) => setNewPet({ ...newPet, species: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white outline-none">
                <option value="Dog">Dog</option><option value="Cat">Cat</option><option value="Other">Other</option>
              </select>
              <input placeholder="Breed" value={newPet.breed} onChange={(e) => setNewPet({ ...newPet, breed: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none" />
            </div>
            <button onClick={addPetHandler} className="w-full rounded-xl bg-amber-600 py-2.5 text-white text-sm font-medium hover:bg-amber-500 transition-colors">Add Pet</button>
          </div>
        )}

        {pet && (
          <>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4 flex items-center gap-4">
              <span className="text-4xl">{pet.emoji}</span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">{pet.name}</h2>
                <p className="text-xs text-zinc-500">{pet.breed || pet.species} · {pet.events.length} events</p>
              </div>
              <button onClick={() => deletePet(pet.id)} className="text-zinc-700 hover:text-red-400"><Trash2 size={16} /></button>
            </div>

            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-zinc-400">Care Log</span>
              <button onClick={() => setAddingEvent(true)} className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"><Plus size={13} /> Add Event</button>
            </div>

            {addingEvent && (
              <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-3">
                <div className="flex gap-1.5 mb-3">
                  {EVENT_TYPES.map((t) => (
                    <button key={t.id} onClick={() => setNewEvent({ ...newEvent, type: t.id })} className={"flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all " + (newEvent.type === t.id ? t.color : "bg-zinc-800 text-zinc-500")}>
                      <t.icon size={12} />{t.label}
                    </button>
                  ))}
                </div>
                <input placeholder="Description" value={newEvent.text} onChange={(e) => setNewEvent({ ...newEvent, text: e.target.value })} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
                <div className="flex gap-2">
                  <input type="date" value={newEvent.date} onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })} className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white outline-none" />
                  <button onClick={addEventHandler} className="rounded-xl bg-amber-600 px-4 py-2 text-sm text-white font-medium">Add</button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {pet.events.length === 0 && <p className="text-center text-sm text-zinc-600 py-6">No events yet</p>}
              {pet.events.map((ev) => {
                const type = EVENT_TYPES.find((t) => t.id === ev.type);
                const Icon = type?.icon || Heart;
                return (
                  <div key={ev.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5">
                    <div className={"flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 " + (type?.color || "bg-zinc-800 text-zinc-400")}>
                      <Icon size={13} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white">{ev.text}</span>
                      <p className="text-xs text-zinc-600">{ev.date || "No date"}</p>
                    </div>
                    <button onClick={() => deleteEvent(ev.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                );
              })}
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
