import { MarketingPageLayout } from "../../../components/marketing/MarketingPageLayout";

export function AboutPage() {
  return (
    <MarketingPageLayout>
      <section
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "96px 40px",
        }}
      >
        <p
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.4)",
            marginBottom: 20,
          }}
        >
          About
        </p>
        <h1
          style={{
            fontSize: 56,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: "#fff",
            maxWidth: 800,
            margin: "0 0 20px",
          }}
        >
          Built on trust.{" "}
          <span style={{ color: "#00D5D8" }}>Certified for the future.</span>
        </h1>
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", maxWidth: 520, lineHeight: 1.65 }}>
          Permus / ISO content lands in MN3.
        </p>
      </section>
    </MarketingPageLayout>
  );
}
