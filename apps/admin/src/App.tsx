import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { fetchMe, type MeResponse } from "./lib/api.ts";
import { supabase } from "./lib/supabase.ts";
import Layout from "./components/Layout.tsx";
import UsersPage from "./pages/Users.tsx";
import BuildsPage from "./pages/Builds.tsx";
import CreditsPage from "./pages/Credits.tsx";
import HeatmapPage from "./pages/Heatmap.tsx";

type AuthState = "loading" | "forbidden" | "allowed";

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        window.location.href = "https://beomz.ai";
        return;
      }

      const me = await fetchMe(token);
      if (!me || me.is_admin !== true) {
        window.location.href = "https://beomz.ai";
        return;
      }

      setUser(me);
      setAuthState("allowed");
    }

    void check();
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (authState === "forbidden") {
    return null;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout user={user} />}>
          <Route index element={<Navigate to="/users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="builds" element={<BuildsPage />} />
          <Route path="credits" element={<CreditsPage />} />
          <Route path="heatmap" element={<HeatmapPage />} />
          <Route path="*" element={<Navigate to="/users" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
