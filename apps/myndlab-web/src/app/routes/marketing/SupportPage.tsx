import { MarketingPageLayout } from "../../../components/marketing/MarketingPageLayout";

export function SupportPage() {
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
        <h1
          style={{
            fontSize: 40,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: "#fff",
            marginBottom: 16,
          }}
        >
          Support
        </h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Coming soon</p>
      </section>
    </MarketingPageLayout>
  );
}
