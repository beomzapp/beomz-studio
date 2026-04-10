import { useCallback } from "react";

interface PersistedBuilderState {
  buildId?: string | null;
  lastEventId?: string | null;
  previewGenerationId?: string | null;
}

function normalizePersistedString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePersistedState(value: unknown): PersistedBuilderState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  return {
    buildId: normalizePersistedString(record.buildId),
    lastEventId: normalizePersistedString(record.lastEventId),
    previewGenerationId: normalizePersistedString(record.previewGenerationId),
  };
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
      return normalizePersistedState(JSON.parse(raw));
    } catch {
      return null;
    }
  }, [projectId]);

  const saveState = useCallback((state: PersistedBuilderState) => {
    if (typeof window === "undefined" || !projectId) {
      return;
    }

    const normalizedState = normalizePersistedState(state);
    if (!normalizedState) {
      return;
    }

    window.sessionStorage.setItem(getStorageKey(projectId), JSON.stringify(normalizedState));
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
