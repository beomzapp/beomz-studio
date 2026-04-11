import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Plus, Trash2, Check, Circle, Users, Clock, FileText, X } from "lucide-react";

let nextId = 20;

export function App() {
  const [meetings, setMeetings] = useState([
    { id: 1, title: "Sprint Planning", date: "2024-04-10", time: "10:00", attendees: ["Sarah", "Alex", "Jordan"],
      agenda: ["Review backlog", "Assign stories", "Set sprint goal"],
      notes: "Agreed on 3 main features for the sprint. Sarah takes auth, Alex takes dashboard, Jordan takes API.",
      actions: [{ id: 2, text: "Create design specs for auth flow", owner: "Sarah", done: false }, { id: 3, text: "Set up CI pipeline", owner: "Alex", done: true }, { id: 4, text: "Write API documentation", owner: "Jordan", done: false }],
    },
  ]);
  const [selected, setSelected] = useState(1);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const meeting = meetings.find((m) => m.id === selected);

  const addMeeting = useCallback(() => {
    if (!newTitle.trim()) return;
    const id = nextId++;
    const now = new Date();
    setMeetings((prev) => [{ id, title: newTitle.trim(), date: now.toISOString().slice(0, 10), time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), attendees: [], agenda: [], notes: "", actions: [] }, ...prev]);
    setSelected(id); setNewTitle(""); setAdding(false);
  }, [newTitle]);

  const deleteMeeting = useCallback((id) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    if (selected === id) setSelected(meetings[0]?.id !== id ? meetings[0]?.id : meetings[1]?.id || null);
  }, [selected, meetings]);

  const updateField = useCallback((field, value) => {
    setMeetings((prev) => prev.map((m) => m.id === selected ? { ...m, [field]: value } : m));
  }, [selected]);

  const addAction = useCallback(() => {
    if (!meeting) return;
    updateField("actions", [...meeting.actions, { id: nextId++, text: "", owner: "", done: false }]);
  }, [meeting, updateField]);

  const updateAction = useCallback((actionId, field, value) => {
    if (!meeting) return;
    updateField("actions", meeting.actions.map((a) => a.id === actionId ? { ...a, [field]: value } : a));
  }, [meeting, updateField]);

  const removeAction = useCallback((actionId) => {
    if (!meeting) return;
    updateField("actions", meeting.actions.filter((a) => a.id !== actionId));
  }, [meeting, updateField]);

  const addAttendee = useCallback((name) => {
    if (!meeting || !name.trim()) return;
    updateField("attendees", [...meeting.attendees, name.trim()]);
  }, [meeting, updateField]);

  const removeAttendee = useCallback((idx) => {
    if (!meeting) return;
    updateField("attendees", meeting.attendees.filter((_, i) => i !== idx));
  }, [meeting, updateField]);

  const [newAttendee, setNewAttendee] = useState("");

  return (
    <div className="min-h-screen bg-zinc-950 p-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><FileText size={20} /> Meeting Notes</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
            <Plus size={14} /> New Meeting
          </button>
        </div>

        {adding && (
          <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4 mb-4">
            <form onSubmit={(e) => { e.preventDefault(); addMeeting(); }} className="flex gap-2">
              <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Meeting title..." className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none" />
              <button type="submit" className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white font-medium">Create</button>
              <button type="button" onClick={() => setAdding(false)} className="text-zinc-500 hover:text-white"><X size={18} /></button>
            </form>
          </div>
        )}

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {meetings.map((m) => (
            <button key={m.id} onClick={() => setSelected(m.id)} className={"rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all " + (selected === m.id ? "bg-blue-600 text-white" : "bg-zinc-900 text-zinc-500 hover:text-zinc-300")}>
              {m.title}
            </button>
          ))}
        </div>

        {meeting && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-5">
              <input value={meeting.title} onChange={(e) => updateField("title", e.target.value)} className="w-full bg-transparent text-lg font-semibold text-white outline-none mb-2" />
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1"><Clock size={11} /> {meeting.date} {meeting.time}</span>
                <span className="flex items-center gap-1"><Users size={11} /> {meeting.attendees.length} attendees</span>
              </div>
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <h3 className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1"><Users size={11} /> Attendees</h3>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {meeting.attendees.map((a, i) => (
                  <span key={i} className="group flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                    {a}<button onClick={() => removeAttendee(i)} className="text-zinc-600 hover:text-red-400 hidden group-hover:inline"><X size={10} /></button>
                  </span>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); addAttendee(newAttendee); setNewAttendee(""); }} className="flex gap-2">
                <input value={newAttendee} onChange={(e) => setNewAttendee(e.target.value)} placeholder="Add attendee..." className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none" />
              </form>
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <h3 className="text-xs font-medium text-zinc-400 mb-2">Notes</h3>
              <textarea value={meeting.notes} onChange={(e) => updateField("notes", e.target.value)} placeholder="Meeting notes..." rows={4} className="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none resize-none leading-relaxed" />
            </div>

            <div className="rounded-2xl bg-zinc-900 border border-white/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-zinc-400">Action Items</h3>
                <button onClick={addAction} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={12} /> Add</button>
              </div>
              <div className="space-y-2">
                {meeting.actions.map((a) => (
                  <div key={a.id} className="group flex items-start gap-2">
                    <button onClick={() => updateAction(a.id, "done", !a.done)} className={"flex h-5 w-5 items-center justify-center rounded flex-shrink-0 mt-0.5 " + (a.done ? "bg-green-600 text-white" : "border border-zinc-700")}>
                      {a.done && <Check size={11} />}
                    </button>
                    <input value={a.text} onChange={(e) => updateAction(a.id, "text", e.target.value)} placeholder="Action item..." className={"flex-1 bg-transparent text-sm outline-none " + (a.done ? "text-zinc-600 line-through" : "text-white")} />
                    <input value={a.owner} onChange={(e) => updateAction(a.id, "owner", e.target.value)} placeholder="Owner" className="w-20 bg-transparent text-xs text-zinc-500 outline-none text-right" />
                    <button onClick={() => removeAction(a.id)} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400 mt-0.5"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={() => deleteMeeting(meeting.id)} className="text-xs text-red-400 hover:text-red-300">Delete meeting</button>
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
