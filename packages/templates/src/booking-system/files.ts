import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Calendar, Clock, Check, ChevronLeft, ChevronRight, User } from "lucide-react";

const SERVICES = [
  { id: "haircut", name: "Haircut", duration: 30, price: 35 },
  { id: "color", name: "Hair Coloring", duration: 90, price: 120 },
  { id: "facial", name: "Facial Treatment", duration: 60, price: 80 },
  { id: "massage", name: "Massage", duration: 60, price: 95 },
  { id: "manicure", name: "Manicure", duration: 45, price: 40 },
];

const TIMES = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];

function getDaysInMonth(year, month) {
  const days = [];
  const count = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= count; d++) days.push(new Date(year, month, d));
  return days;
}

export function App() {
  const [step, setStep] = useState(1);
  const [service, setService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  const days = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);
  const firstDow = days[0].getDay();
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const bookedSlots = useMemo(() => new Set(["10:00", "14:00", "15:30"]), []);

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }, [viewMonth]);

  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }, [viewMonth]);

  const confirm = useCallback(() => {
    if (!name.trim() || !email.trim()) return;
    setConfirmed(true);
  }, [name, email]);

  const reset = useCallback(() => {
    setStep(1); setService(null); setSelectedDate(null); setSelectedTime(null);
    setName(""); setEmail(""); setConfirmed(false);
  }, []);

  const dateStr = selectedDate ? selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "";
  const svc = SERVICES.find((s) => s.id === service);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-1 flex items-center gap-2"><Calendar size={20} /> Book Appointment</h1>
          <div className="flex gap-1 mb-5 mt-3">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={"h-1 flex-1 rounded-full " + (step >= s ? "bg-cyan-500" : "bg-zinc-800")} />
            ))}
          </div>

          {confirmed ? (
            <div className="text-center py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600/20 mx-auto mb-4">
                <Check size={28} className="text-green-400" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-1">Booking Confirmed!</h2>
              <p className="text-sm text-zinc-400 mb-1">{svc?.name} — {svc?.duration} min</p>
              <p className="text-sm text-zinc-400">{dateStr} at {selectedTime}</p>
              <p className="text-xs text-zinc-500 mt-2">Confirmation sent to {email}</p>
              <button onClick={reset} className="mt-5 rounded-xl bg-cyan-600 px-6 py-2.5 text-white text-sm font-medium hover:bg-cyan-500 transition-colors">Book Another</button>
            </div>
          ) : step === 1 ? (
            <div>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Select a service</h2>
              <div className="space-y-2">
                {SERVICES.map((s) => (
                  <button key={s.id} onClick={() => { setService(s.id); setStep(2); }} className={"w-full flex items-center justify-between rounded-xl border px-4 py-3 transition-all " + (service === s.id ? "border-cyan-500/40 bg-cyan-600/10" : "border-white/5 hover:border-white/10")}>
                    <div className="text-left">
                      <span className="text-sm text-white">{s.name}</span>
                      <span className="block text-xs text-zinc-500">{s.duration} min</span>
                    </div>
                    <span className="text-sm font-medium text-cyan-400">\${s.price}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : step === 2 ? (
            <div>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Pick a date</h2>
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMonth} className="text-zinc-500 hover:text-white"><ChevronLeft size={18} /></button>
                <span className="text-sm font-medium text-white">{monthName}</span>
                <button onClick={nextMonth} className="text-zinc-500 hover:text-white"><ChevronRight size={18} /></button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-3">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <span key={d} className="text-[10px] text-zinc-600 py-1">{d}</span>
                ))}
                {Array.from({ length: firstDow }).map((_, i) => <div key={"e" + i} />)}
                {days.map((d) => {
                  const past = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const sel = selectedDate && d.toDateString() === selectedDate.toDateString();
                  return (
                    <button key={d.getDate()} disabled={past} onClick={() => { setSelectedDate(d); setStep(3); }}
                      className={"h-9 rounded-lg text-xs font-medium transition-all " + (sel ? "bg-cyan-600 text-white" : past ? "text-zinc-700 cursor-not-allowed" : "text-zinc-300 hover:bg-zinc-800")}>
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setStep(1)} className="text-xs text-zinc-500 hover:text-zinc-300">← Back</button>
            </div>
          ) : step === 3 ? (
            <div>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Pick a time — {dateStr}</h2>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {TIMES.map((t) => {
                  const booked = bookedSlots.has(t);
                  return (
                    <button key={t} disabled={booked} onClick={() => { setSelectedTime(t); setStep(4); }}
                      className={"rounded-lg py-2 text-xs font-medium transition-all " + (selectedTime === t ? "bg-cyan-600 text-white" : booked ? "bg-zinc-800/40 text-zinc-700 cursor-not-allowed line-through" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}>
                      {t}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setStep(2)} className="text-xs text-zinc-500 hover:text-zinc-300">← Back</button>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-medium text-zinc-400 mb-3">Your details</h2>
              <div className="rounded-xl bg-zinc-800/60 p-3 mb-4 text-sm">
                <p className="text-white">{svc?.name} — \${svc?.price}</p>
                <p className="text-zinc-400">{dateStr} at {selectedTime}</p>
              </div>
              <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-2" />
              <input placeholder="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl bg-zinc-800 border border-white/5 px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none mb-4" />
              <button onClick={confirm} className="w-full rounded-xl bg-cyan-600 py-2.5 text-white text-sm font-medium hover:bg-cyan-500 transition-colors">Confirm Booking</button>
              <button onClick={() => setStep(3)} className="block mt-2 text-xs text-zinc-500 hover:text-zinc-300">← Back</button>
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
