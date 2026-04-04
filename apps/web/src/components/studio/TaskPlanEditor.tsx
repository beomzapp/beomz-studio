import { useCallback, useEffect, useRef } from "react";
import { ChevronUp, ChevronDown, Trash2, Plus, Rocket } from "lucide-react";
import type { PlanTask } from "../../lib/getTaskBreakdown";

interface TaskPlanEditorProps {
  tasks: PlanTask[];
  onTasksChange: (tasks: PlanTask[]) => void;
  onApprove: (tasks: PlanTask[]) => void;
  isLoading?: boolean;
}

export function TaskPlanEditor({
  tasks,
  onTasksChange,
  onApprove,
  isLoading,
}: TaskPlanEditorProps) {
  const newTaskRef = useRef<HTMLInputElement>(null);

  const updateTask = useCallback(
    (id: string, field: "label" | "description", value: string) => {
      onTasksChange(
        tasks.map((t) => (t.id === id ? { ...t, [field]: value } : t)),
      );
    },
    [tasks, onTasksChange],
  );

  const moveTask = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= tasks.length) return;
      const next = [...tasks];
      [next[index], next[target]] = [next[target], next[index]];
      onTasksChange(next);
    },
    [tasks, onTasksChange],
  );

  const deleteTask = useCallback(
    (id: string) => {
      if (tasks.length <= 1) return;
      onTasksChange(tasks.filter((t) => t.id !== id));
    },
    [tasks, onTasksChange],
  );

  const addTask = useCallback(() => {
    const newTask: PlanTask = {
      id: `task-new-${Date.now()}`,
      label: "",
      description: "",
    };
    onTasksChange([...tasks, newTask]);
    // Focus the new input after render
    setTimeout(() => newTaskRef.current?.focus(), 50);
  }, [tasks, onTasksChange]);

  // Keep ref pointed at last task's input
  const lastInputRef = useCallback(
    (el: HTMLInputElement | null) => {
      (newTaskRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    },
    [],
  );

  // Auto-focus first task label on mount
  useEffect(() => {
    if (!isLoading && tasks.length > 0) {
      const el = document.getElementById(`task-label-${tasks[0].id}`);
      if (el instanceof HTMLInputElement) el.focus();
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6">
        <div className="rounded-2xl border border-[rgba(0,0,0,0.07)] bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="h-5 w-36 animate-pulse rounded bg-[rgba(0,0,0,0.06)]" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-[rgba(0,0,0,0.04)]" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl bg-[rgba(0,0,0,0.02)] px-4 py-4"
              >
                <div className="h-6 w-6 animate-pulse rounded-full bg-[rgba(0,0,0,0.06)]" />
                <div className="flex-1 space-y-2">
                  <div
                    className="h-4 animate-pulse rounded bg-[rgba(0,0,0,0.06)]"
                    style={{ width: `${60 + i * 5}%` }}
                  />
                  <div
                    className="h-3 animate-pulse rounded bg-[rgba(0,0,0,0.03)]"
                    style={{ width: `${75 + i * 3}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6">
      <div className="rounded-2xl border border-[rgba(0,0,0,0.07)] bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[#1a1a1a]">
            Your build plan
          </h3>
          <span className="rounded-full bg-[rgba(0,0,0,0.05)] px-2.5 py-0.5 text-xs text-[rgba(0,0,0,0.4)]">
            {tasks.length} step{tasks.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="group flex items-start gap-3 rounded-xl border border-[rgba(0,0,0,0.05)] bg-[rgba(0,0,0,0.01)] px-4 py-3 transition-colors hover:border-[rgba(0,0,0,0.1)] hover:bg-[rgba(0,0,0,0.02)]"
            >
              {/* Step number */}
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8580a]/10 text-xs font-bold text-[#e8580a]">
                {index + 1}
              </span>

              {/* Editable content */}
              <div className="min-w-0 flex-1">
                <input
                  id={`task-label-${task.id}`}
                  ref={index === tasks.length - 1 ? lastInputRef : undefined}
                  type="text"
                  value={task.label}
                  onChange={(e) => updateTask(task.id, "label", e.target.value)}
                  placeholder="Task name..."
                  className="w-full bg-transparent text-sm font-medium text-[#1a1a1a] outline-none placeholder:text-[rgba(0,0,0,0.25)]"
                />
                <input
                  type="text"
                  value={task.description}
                  onChange={(e) =>
                    updateTask(task.id, "description", e.target.value)
                  }
                  placeholder="Brief description..."
                  className="mt-1 w-full bg-transparent text-xs text-[rgba(0,0,0,0.4)] outline-none placeholder:text-[rgba(0,0,0,0.15)]"
                />
              </div>

              {/* Action buttons — visible on hover */}
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => moveTask(index, -1)}
                  disabled={index === 0}
                  className="rounded p-1 text-[rgba(0,0,0,0.3)] transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[rgba(0,0,0,0.6)] disabled:invisible"
                  title="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => moveTask(index, 1)}
                  disabled={index === tasks.length - 1}
                  className="rounded p-1 text-[rgba(0,0,0,0.3)] transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-[rgba(0,0,0,0.6)] disabled:invisible"
                  title="Move down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
                  disabled={tasks.length <= 1}
                  className="rounded p-1 text-[rgba(0,0,0,0.3)] transition-colors hover:bg-red-50 hover:text-red-500 disabled:invisible"
                  title="Remove task"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-[rgba(0,0,0,0.07)] pt-4">
          <button
            onClick={addTask}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] px-3 py-1.5 text-xs font-medium text-[rgba(0,0,0,0.4)] transition-colors hover:border-[rgba(0,0,0,0.25)] hover:text-[rgba(0,0,0,0.6)]"
          >
            <Plus size={14} />
            Add step
          </button>
          <button
            onClick={() => onApprove(tasks)}
            disabled={tasks.length === 0 || tasks.every((t) => !t.label.trim())}
            className="flex items-center gap-2 rounded-xl bg-[#e8580a] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#d14e09] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Rocket size={14} />
            Build this plan
          </button>
        </div>
      </div>
    </div>
  );
}
