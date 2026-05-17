interface FinalCtaBannerProps {
  onGetStartedClick?: () => void;
}

export function FinalCtaBanner({ onGetStartedClick }: FinalCtaBannerProps) {
  return (
    <section
      style={{
        position: "relative",
        padding: "96px 40px",
        textAlign: "center",
        overflow: "hidden",
        background: "#131313",
      }}
    >
      {/* Subtle cyan radial glow */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 600,
          height: 600,
          background: "radial-gradient(circle, rgba(0,213,216,0.15) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", maxWidth: 640, margin: "0 auto" }}>
        <h2
          style={{
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            color: "#fff",
            margin: "0 0 16px",
          }}
        >
          Stop being locked in.{" "}
          <span style={{ color: "#00D5D8" }}>Own your stack.</span>
        </h2>
        <p
          style={{
            fontSize: 15,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.65,
            margin: "0 0 36px",
          }}
        >
          Export clean code. Deploy anywhere. Myndlab gives you the app and hands you the keys.
        </p>
        <button
          type="button"
          onClick={onGetStartedClick}
          style={{
            background: "#00D5D8",
            color: "#131313",
            padding: "12px 28px",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            border: 0,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#00BCC0"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#00D5D8"; }}
        >
          Get started — it&apos;s free
        </button>
      </div>
    </section>
  );
}
