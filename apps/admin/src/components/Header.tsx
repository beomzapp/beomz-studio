import type { MeResponse } from "../lib/api.ts";

interface HeaderProps {
  user: MeResponse | null;
}

export default function Header({ user }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <h1 className="text-base font-semibold text-slate-800">Beomz Admin</h1>
      {user && (
        <span className="text-sm text-slate-500">{user.email}</span>
      )}
    </header>
  );
}
