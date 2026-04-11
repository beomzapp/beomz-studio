import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Users, Calendar, DollarSign, X, Check, PartyPopper } from "lucide-react";

let nextId = 20;

export function App() {
  const [eventName, setEventName] = useState("Summer Party");
  const [eventDate, setEventDate] = useState("");
  const [tab, setTab] = useState("guests");
  const [guests, setGuests] = useState([
    { id: 1, name: "Sarah Chen", rsvp: "yes" },
    { id: 2, name: "Alex Rivera", rsvp: "yes" },
    { id: 3, name: "Jordan Lee", rsvp: "maybe" },
    { id: 4, name: "Morgan Park", rsvp: "no" },
    { id: 5, name: "Casey Kim", rsvp: "pending" },
  ]);
  const [schedule, setSchedule] = useState([
    { id: 6, time: "18:00", activity: "Guests arrive" },
    { id: 7, time: "18:30", activity: "Welcome drinks" },
    { id: 8, time: "19:00", activity: "Dinner served" },
    { id: 9, time: "20:30", activity: "Speeches & toasts" },
    { id: 10, time: "21:00", activity: "Music & dancing" },
  ]);
  const [expenses, setExpenses] = useState([
    { id: 11, item: "Venue rental", amount: 500 },
    { id: 12, item: "Catering", amount: 350 },
    { id: 13, item: "Decorations", amount: 120 },
  ]);
  const [newGuest, setNewGuest] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newActivity, setNewActivity] = useState("");
  const [newExpItem, setNewExpItem] = useState("");
  const [newExpAmt, setNewExpAmt] = useState("");

  const addGuest = useCallback(() => { if (!newGuest.trim()) return; setGuests((prev) => [...prev, { id: nextId++, name: newGuest.trim(), rsvp: "pending" }]); setNewGuest(""); }, [newGuest]);
  const removeGuest = useCallback((id) => { setGuests((prev) => prev.filter((g) => g.id !== id)); }, []);
  const setRsvp = useCallback((id, rsvp) => { setGuests((prev) => prev.map((g) => g.id === id ? { ...g, rsvp } : g)); }, []);

  const addScheduleItem = useCallback(() => { if (!newActivity.trim()) return; setSchedule((prev) => [...prev, { id: nextId++, time: newTime, activity: newActivity.trim() }]); setNewTime(""); setNewActivity(""); }, [newTime, newActivity]);
  const removeScheduleItem = useCallback((id) => { setSchedule((prev) => prev.filter((s) => s.id !== id)); }, []);

  const addExpense = useCallback(() => { const a = parseFloat(newExpAmt); if (!newExpItem.trim() || !a) return; setExpenses((prev) => [...prev, { id: nextId++, item: newExpItem.trim(), amount: a }]); setNewExpItem(""); setNewExpAmt(""); }, [newExpItem, newExpAmt]);
  const removeExpense = useCallback((id) => { setExpenses((prev) => prev.filter((e) => e.id !== id)); }, []);

  const guestStats = useMemo(() => ({
    yes: guests.filter((g) => g.rsvp === "yes").length,
    maybe: guests.filter((g) => g.rsvp === "maybe").length,
    no: guests.filter((g) => g.rsvp === "no").length,
    pending: guests.filter((g) => g.rsvp === "pending").length,
  }), [guests]);

  const totalBudget = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const rsvpColor = { yes: "bg-green-600 text-white", maybe: "bg-amber-600 text-white", no: "bg-red-600 text-white", pending: "bg-zinc-700 text-zinc-300" };

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-2 mb-1">
          <PartyPopper size={20} className="text-pink-400" />
          <input value={eventName} onChange={(e) => setEventName(e.target.value)} className="text-xl font-semibold text-white bg-transparent outline-none flex-1" />
        </div>
        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="text-xs text-zinc-500 bg-transparent outline-none mb-4 block" />

        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-5">
          {[{ k: "guests", icon: Users }, { k: "schedule", icon: Calendar }, { k: "budget", icon: DollarSign }].map(({ k, icon: Icon }) => (
            <button key={k} onClick={() => setTab(k)} className={"flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium capitalize transition-all " + (tab === k ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300")}>
              <Icon size={13} />{k}
            </button>
          ))}
        </div>

        {tab === "guests" && (
          <div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[["yes", "Going"], ["maybe", "Maybe"], ["no", "Declined"], ["pending", "Waiting"]].map(([key, label]) => (
                <div key={key} className="rounded-xl bg-zinc-900 border border-white/5 p-2.5 text-center">
                  <span className="text-lg font-bold text-white">{guestStats[key]}</span>
                  <p className="text-[10px] text-zinc-500">{label}</p>
                </div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addGuest(); }} className="flex gap-2 mb-3">
              <input value={newGuest} onChange={(e) => setNewGuest(e.target.value)} placeholder="Add guest..." className="flex-1 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-pink-600 px-4 py-2 text-sm text-white font-medium"><Plus size={15} /></button>
            </form>
            <div className="space-y-1.5">
              {guests.map((g) => (
                <div key={g.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5">
                  <span className="flex-1 text-sm text-white">{g.name}</span>
                  <div className="flex gap-1">
                    {(["yes", "maybe", "no"]).map((r) => (
                      <button key={r} onClick={() => setRsvp(g.id, r)} className={"rounded-full px-2 py-0.5 text-[10px] font-medium transition-all " + (g.rsvp === r ? rsvpColor[r] : "bg-zinc-800 text-zinc-600 hover:text-zinc-400")}>
                        {r === "yes" ? "Yes" : r === "maybe" ? "Maybe" : "No"}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => removeGuest(g.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "schedule" && (
          <div>
            <div className="space-y-1.5 mb-4">
              {schedule.map((s) => (
                <div key={s.id} className="group flex items-center gap-3 rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5">
                  <span className="text-xs text-pink-400 font-mono w-12">{s.time || "--:--"}</span>
                  <span className="flex-1 text-sm text-white">{s.activity}</span>
                  <button onClick={() => removeScheduleItem(s.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addScheduleItem(); }} className="flex gap-2">
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="w-24 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white outline-none" />
              <input value={newActivity} onChange={(e) => setNewActivity(e.target.value)} placeholder="Activity..." className="flex-1 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-pink-600 px-3 py-2 text-white"><Plus size={15} /></button>
            </form>
          </div>
        )}

        {tab === "budget" && (
          <div>
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4 text-center">
              <span className="text-xs text-zinc-500">Total Budget</span>
              <p className="text-3xl font-bold text-white mt-1">{"$" + totalBudget.toFixed(2)}</p>
              <p className="text-xs text-zinc-600 mt-1">{"$" + (guests.filter((g) => g.rsvp === "yes").length > 0 ? (totalBudget / guests.filter((g) => g.rsvp === "yes").length).toFixed(2) : "0.00")} per attending guest</p>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); addExpense(); }} className="flex gap-2 mb-3">
              <input value={newExpItem} onChange={(e) => setNewExpItem(e.target.value)} placeholder="Item" className="flex-1 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <input type="number" value={newExpAmt} onChange={(e) => setNewExpAmt(e.target.value)} placeholder="$" className="w-20 rounded-xl bg-zinc-900 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-pink-600 px-3 py-2 text-white"><Plus size={15} /></button>
            </form>
            <div className="space-y-1.5">
              {expenses.map((e) => (
                <div key={e.id} className="group flex items-center justify-between rounded-xl bg-zinc-900 border border-white/5 px-4 py-2.5">
                  <span className="text-sm text-zinc-300">{e.item}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{"$" + e.amount.toFixed(2)}</span>
                    <button onClick={() => removeExpense(e.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400"><Trash2 size={13} /></button>
                  </div>
                </div>
              ))}
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
