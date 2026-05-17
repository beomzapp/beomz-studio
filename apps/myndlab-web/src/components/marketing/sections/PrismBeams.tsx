import type { CSSProperties } from "react";

export type PrismVariant = "cyan" | "magenta";

interface Props {
  variant: PrismVariant;
  className?: string;
  style?: CSSProperties;
}

interface BeamConfig {
  left: string;
  width: number;
  height: number;
  alphaStop: string;
  delay: string;
}

const CYAN_BEAMS: BeamConfig[] = [
  { left: "8%",  width: 90,  height: 580, alphaStop: "rgba(0,213,216,0.20)", delay: "0s" },
  { left: "22%", width: 140, height: 680, alphaStop: "rgba(0,213,216,0.34)", delay: "1.2s" },
  { left: "38%", width: 70,  height: 520, alphaStop: "rgba(0,213,216,0.18)", delay: "2.4s" },
  { left: "50%", width: 200, height: 760, alphaStop: "rgba(0,213,216,0.46)", delay: "0.6s" },
  { left: "68%", width: 100, height: 600, alphaStop: "rgba(0,213,216,0.26)", delay: "1.8s" },
  { left: "82%", width: 80,  height: 540, alphaStop: "rgba(0,213,216,0.22)", delay: "3s" },
];

const MAGENTA_BEAMS: BeamConfig[] = [
  { left: "8%",  width: 90,  height: 580, alphaStop: "rgba(255,47,179,0.20)", delay: "0s" },
  { left: "22%", width: 140, height: 680, alphaStop: "rgba(255,47,179,0.34)", delay: "1.2s" },
  { left: "38%", width: 70,  height: 520, alphaStop: "rgba(255,47,179,0.18)", delay: "2.4s" },
  { left: "50%", width: 200, height: 760, alphaStop: "rgba(255,47,179,0.46)", delay: "0.6s" },
  { left: "68%", width: 100, height: 600, alphaStop: "rgba(255,47,179,0.26)", delay: "1.8s" },
  { left: "82%", width: 80,  height: 540, alphaStop: "rgba(255,47,179,0.22)", delay: "3s" },
];

export function PrismBeams({ variant, className, style }: Props) {
  const beams = variant === "cyan" ? CYAN_BEAMS : MAGENTA_BEAMS;

  return (
    <>
      <style>{`
        @keyframes prism-breathe {
          0%, 100% { opacity: 0.75; transform: translateY(0); }
          50%       { opacity: 1.0;  transform: translateY(-8px); }
        }
      `}</style>
      <div
        className={className}
        style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 1100,
          height: "100%",
          pointerEvents: "none",
          zIndex: 0,
          ...style,
        }}
      >
        {beams.map((beam, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: beam.left,
              width: beam.width,
              height: beam.height,
              background: `linear-gradient(180deg, transparent, ${beam.alphaStop})`,
              filter: "blur(50px)",
              opacity: 0.85,
              mixBlendMode: "screen",
              animation: "prism-breathe 8s ease-in-out infinite",
              animationDelay: beam.delay,
            }}
          />
        ))}
      </div>
    </>
  );
}
