import type { ReactNode } from "react";
import type { PrismVariant } from "./PrismBeams";

interface Props {
  variant?: PrismVariant;
  children: ReactNode;
}

export function Eyebrow({ variant = "cyan", children }: Props) {
  const dotColor = variant === "cyan" ? "#00D5D8" : "#FF2FB3";

  return (
    <div
      style={{
        fontSize: 12,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.50)",
        marginBottom: 20,
        display: "flex",
        alignItems: "center",
        gap: 0,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 6,
          height: 6,
          background: dotColor,
          borderRadius: "50%",
          marginRight: 8,
          flexShrink: 0,
        }}
      />
      {children}
    </div>
  );
}
