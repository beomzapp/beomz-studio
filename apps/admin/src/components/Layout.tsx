import { Outlet } from "react-router-dom";
import type { MeResponse } from "../lib/api.ts";
import Header from "./Header.tsx";
import Sidebar from "./Sidebar.tsx";

interface LayoutProps {
  user: MeResponse | null;
}

export default function Layout({ user }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header user={user} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
