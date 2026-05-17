import type { ReactNode } from "react";
import { Eyebrow } from "./Eyebrow";
import { CheckList } from "./CheckList";
import type { PrismVariant } from "./PrismBeams";

interface Props {
  reverse?: boolean;
  eyebrow: { variant?: PrismVariant; label: string };
  h2: ReactNode;
  body: string;
  checks?: string[];
  visual: ReactNode;
}

export function SectionRow({ reverse = false, eyebrow, h2, body, checks, visual }: Props) {
  return (
    <>
      <style>{`
        @media (max-width: 980px) {
          .section-row-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
          }
          .section-row-grid.reverse > div:first-child {
            order: 0 !important;
          }
        }
      `}</style>
      <div
        style={{
          maxWidth: 1280,
          margin: "120px auto 0",
          padding: "0 56px",
        }}
      >
        <div
          className={`section-row-grid${reverse ? " reverse" : ""}`}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
            alignItems: "center",
          }}
        >
          <div style={reverse ? { order: 2 } : {}}>
            <Eyebrow variant={eyebrow.variant}>{eyebrow.label}</Eyebrow>
            <h2
              style={{
                fontSize: "clamp(32px, 4vw, 48px)",
                fontWeight: 600,
                letterSpacing: "-0.024em",
                lineHeight: 1.08,
                marginBottom: 20,
                color: "#ffffff",
              }}
            >
              {h2}
            </h2>
            <p
              style={{
                fontSize: 17,
                color: "rgba(255,255,255,0.70)",
                marginBottom: 24,
                maxWidth: 480,
                lineHeight: 1.55,
              }}
            >
              {body}
            </p>
            {checks && checks.length > 0 && (
              <CheckList variant={eyebrow.variant} items={checks} />
            )}
          </div>
          <div style={reverse ? { order: 1 } : {}}>
            {visual}
          </div>
        </div>
      </div>
    </>
  );
}
