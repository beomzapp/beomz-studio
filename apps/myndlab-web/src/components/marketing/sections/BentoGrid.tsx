import type { ReactNode } from "react";

export interface Tile {
  icon: ReactNode | string;
  title: string;
  body: string;
  wide?: boolean;
}

interface Props {
  tiles: Tile[];
}

function BentoTile({ tile }: { tile: Tile }) {
  return (
    <div
      className="bento-tile"
      style={{
        position: "relative",
        padding: 28,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 20,
        overflow: "hidden",
        transition: "border-color 200ms, transform 200ms",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gridColumn: tile.wide ? "span 2" : undefined,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(0,213,216,0.4)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.10)";
        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
      }}
    >
      <div>
        <div
          style={{
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,213,216,0.10)",
            color: "#00D5D8",
            borderRadius: 8,
            fontSize: 18,
            marginBottom: 20,
          }}
        >
          {tile.icon}
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            marginBottom: 6,
            color: "#ffffff",
          }}
        >
          {tile.title}
        </div>
        <div
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.70)",
            lineHeight: 1.5,
          }}
        >
          {tile.body}
        </div>
      </div>
    </div>
  );
}

export function BentoGrid({ tiles }: Props) {
  return (
    <>
      <style>{`
        @media (max-width: 980px) {
          .bento-grid {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto !important;
          }
          .bento-tile {
            grid-column: span 1 !important;
          }
        }
      `}</style>
      <div
        className="bento-grid"
        style={{
          maxWidth: 1280,
          margin: "96px auto 0",
          padding: "0 56px",
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gridTemplateRows: "240px 240px",
          gap: 16,
        }}
      >
        {tiles.map((tile, i) => (
          <BentoTile key={i} tile={tile} />
        ))}
      </div>
    </>
  );
}
