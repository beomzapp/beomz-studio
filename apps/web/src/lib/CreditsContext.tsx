/**
 * CreditsContext — shared credits state across the studio.
 * Fetches GET /api/credits on mount, exposes balance/plan to all consumers.
 * Supports optimistic deduction after builds and manual refresh.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { CreditsResponse } from "./api";
import { getCredits } from "./api";

interface CreditsContextValue {
  /** Credits data, null while loading or if fetch failed */
  credits: CreditsResponse | null;
  isLoading: boolean;
  /** Re-fetch credits from the API */
  refresh: () => Promise<void>;
  /** Optimistically subtract from balance (e.g. after a build) */
  deductOptimistic: (amount: number) => void;
}

const CreditsContext = createContext<CreditsContextValue>({
  credits: null,
  isLoading: true,
  refresh: async () => {},
  deductOptimistic: () => {},
});

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState<CreditsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getCredits();
      setCredits(data);
    } catch {
      // Silently fail — user may not be authenticated yet
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deductOptimistic = useCallback((amount: number) => {
    if (amount <= 0) return;
    setCredits((prev) => {
      if (!prev) return prev;
      const topupDeduct = Math.min(prev.topup, amount);
      const monthlyDeduct = Math.max(0, amount - topupDeduct);
      return {
        ...prev,
        topup: Math.max(0, prev.topup - topupDeduct),
        monthly: Math.max(0, prev.monthly - monthlyDeduct),
        balance: Math.max(0, prev.balance - amount),
      };
    });
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void refresh();
  }, [refresh]);

  return (
    <CreditsContext.Provider value={{ credits, isLoading, refresh, deductOptimistic }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  return useContext(CreditsContext);
}
