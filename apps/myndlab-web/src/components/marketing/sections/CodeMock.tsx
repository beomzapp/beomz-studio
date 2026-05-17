interface Token {
  kind: "kw" | "str" | "com" | "txt";
  text: string;
}

interface CodeLine {
  ln: number;
  tokens: Token[];
}

interface Props {
  filename: string;
  liveLabel?: boolean;
  lines: CodeLine[];
}

const TOKEN_COLORS: Record<Token["kind"], string> = {
  kw:  "#00D5D8",
  str: "#FFF500",
  com: "rgba(255,255,255,0.30)",
  txt: "rgba(255,255,255,0.70)",
};

export function CodeMock({ filename, liveLabel = false, lines }: Props) {
  return (
    <div
      style={{
        position: "relative",
        padding: 28,
        minHeight: 360,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.6,
        textAlign: "left",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingBottom: 12,
          borderBottom: "1px solid rgba(255,255,255,0.10)",
          marginBottom: 16,
          fontFamily: "inherit",
          fontSize: 12,
          color: "rgba(255,255,255,0.50)",
          width: "100%",
        }}
      >
        <span>{filename}</span>
        {liveLabel && (
          <>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#00D5D8",
                marginLeft: "auto",
                boxShadow: "0 0 8px #00D5D8",
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#00D5D8" }}>live</span>
          </>
        )}
      </div>

      {/* Code lines */}
      <div style={{ width: "100%" }}>
        {lines.map((line) => (
          <div key={line.ln} style={{ display: "flex", gap: 0 }}>
            <span
              style={{
                color: "rgba(255,255,255,0.30)",
                marginRight: 12,
                userSelect: "none",
                minWidth: 20,
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {line.ln}
            </span>
            <span>
              {line.tokens.map((tok, ti) => (
                <span key={ti} style={{ color: TOKEN_COLORS[tok.kind] }}>
                  {tok.text}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
