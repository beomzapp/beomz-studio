import type { PrismVariant } from "./PrismBeams";

interface Props {
  variant?: PrismVariant;
  items: string[];
}

export function CheckList({ variant = "cyan", items }: Props) {
  const checkColor = variant === "cyan" ? "#00D5D8" : "#FF2FB3";

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            fontSize: 15,
            color: "rgba(255,255,255,0.70)",
            padding: "6px 0",
          }}
        >
          <span
            style={{
              color: checkColor,
              fontWeight: 700,
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            ✓
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}
