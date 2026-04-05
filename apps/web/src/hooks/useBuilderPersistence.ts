import { useCallback } from "react";

interface PersistedBuilderState {
  buildId?: string | null;
  lastEventId?: string | null;
  previewGenerationId?: string | null;
}

function getStorageKey(projectId: string): string {
  return `beomz.builder-v3.${projectId}`;
}

export function useBuilderPersistence(projectId: string | null) {
  const restoreState = useCallback((): PersistedBuilderState | null => {
    if (typeof window === "undefined" || !projectId) {
      return null;
    }

    const raw = window.sessionStorage.getItem(getStorageKey(projectId));
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as PersistedBuilderState;
    } catch {
      return null;
    }
  }, [projectId]);

  const saveState = useCallback((state: PersistedBuilderState) => {
    if (typeof window === "undefined" || !projectId) {
      return;
    }

    window.sessionStorage.setItem(getStorageKey(projectId), JSON.stringify(state));
  }, [projectId]);

  const clearState = useCallback(() => {
    if (typeof window === "undefined" || !projectId) {
      return;
    }

    window.sessionStorage.removeItem(getStorageKey(projectId));
  }, [projectId]);

  return {
    clearState,
    restoreState,
    saveState,
  };
}
