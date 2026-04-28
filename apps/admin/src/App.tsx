import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { fetchMe, type MeResponse } from "./lib/api.ts";
import { supabase } from "./lib/supabase.ts";
import Layout from "./components/Layout.tsx";
import UsersPage from "./pages/Users.tsx";
import BuildsPage from "./pages/Builds.tsx";
import CreditsPage from "./pages/Credits.tsx";
import HeatmapPage from "./pages/Heatmap.tsx";
import ModulesPage from "./pages/Modules.tsx";
import LoginPage from "./pages/Login.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";

type AuthState = "loading" | "unauthenticated" | "forbidden" | "allowed";

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<MeResponse | null>(null);

  const checkAuth = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setAuthState("unauthenticated");
      return;
    }

    const me = await fetchMe(token);
    if (!me || me.is_admin !== true) {
      setAuthState("forbidden");
      return;
    }

    setUser(me);
    setAuthState("allowed");
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Loading…</span>
        </div>
      </div>
    );
  }

  if (authState === "forbidden") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-sm w-full shadow-sm">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-slate-900">Access denied</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your account does not have admin privileges.
          </p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            authState === "allowed" ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage onSuccess={checkAuth} />
            )
          }
        />

        <Route path="/auth/callback" element={<AuthCallback />} />

        {authState === "unauthenticated" ? (
          <Route path="*" element={<Navigate to="/login" replace />} />
        ) : (
          <Route path="/" element={<Layout user={user} />}>
            <Route index element={<Navigate to="/users" replace />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="builds" element={<BuildsPage />} />
            <Route path="credits" element={<CreditsPage />} />
            <Route path="heatmap" element={<HeatmapPage />} />
            <Route path="modules" element={<ModulesPage />} />
            <Route path="*" element={<Navigate to="/users" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
