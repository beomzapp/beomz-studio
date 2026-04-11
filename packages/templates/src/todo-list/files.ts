import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Plus, Trash2, Check, Circle } from "lucide-react";

let nextId = 1;

export function App() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState("");
  const [filter, setFilter] = useState("all");

  const addTodo = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTodos((prev) => [...prev, { id: nextId++, text: trimmed, done: false }]);
    setText("");
  }, [text]);

  const toggleTodo = useCallback((id) => {
    setTodos((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  }, []);

  const deleteTodo = useCallback((id) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const filtered = useMemo(() => {
    if (filter === "active") return todos.filter((t) => !t.done);
    if (filter === "completed") return todos.filter((t) => t.done);
    return todos;
  }, [todos, filter]);

  const remaining = useMemo(() => todos.filter((t) => !t.done).length, [todos]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-zinc-900 p-6 shadow-2xl border border-white/5">
          <h1 className="text-xl font-semibold text-white mb-5">Todo List</h1>

          <form
            onSubmit={(e) => { e.preventDefault(); addTodo(); }}
            className="flex gap-2 mb-5"
          >
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What needs to be done?"
              className="flex-1 rounded-xl bg-zinc-800 border border-white/5 px-4 py-2.5 text-white placeholder-zinc-600 outline-none focus:border-indigo-500/40 text-sm"
            />
            <button
              type="submit"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white transition-all hover:bg-indigo-500"
            >
              <Plus size={18} />
            </button>
          </form>

          <div className="flex gap-1 mb-4">
            {["all", "active", "completed"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={"rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all " +
                  (filter === f ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300")}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 mb-4 max-h-80 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-zinc-600 py-6">
                {filter === "all" ? "Add your first task above" : "No " + filter + " tasks"}
              </p>
            )}
            {filtered.map((todo) => (
              <div
                key={todo.id}
                className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-800/60"
              >
                <button onClick={() => toggleTodo(todo.id)} className="flex-shrink-0">
                  {todo.done
                    ? <Check size={18} className="text-indigo-400" />
                    : <Circle size={18} className="text-zinc-600" />}
                </button>
                <span className={"flex-1 text-sm " + (todo.done ? "text-zinc-600 line-through" : "text-white")}>
                  {todo.text}
                </span>
                <button
                  onClick={() => deleteTodo(todo.id)}
                  className="flex-shrink-0 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-400"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="text-xs text-zinc-600">
            {remaining} {remaining === 1 ? "item" : "items"} remaining
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
