import { useCallback, useState } from "react";

export type BuilderTransportState =
  | "idle"
  | "streaming"
  | "polling"
  | "reconnecting";

export function useBuilderSessionHealth() {
  const [lastError, setLastError] = useState<string | null>(null);
  const [transport, setTransport] = useState<BuilderTransportState>("idle");

  const resetHealth = useCallback(() => {
    setLastError(null);
    setTransport("idle");
  }, []);

  return {
    lastError,
    resetHealth,
    setLastError,
    setTransport,
    transport,
  };
}
