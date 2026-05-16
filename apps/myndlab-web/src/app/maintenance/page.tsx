"use client";

declare const process: {
  env?: {
    NEXT_PUBLIC_MAINTENANCE_CODE?: string;
  };
};

import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from "react";
import MyndlabLogo from "../../assets/myndlab-logo.svg?react";

const ACCESS_CODE = process.env?.NEXT_PUBLIC_MAINTENANCE_CODE || "544054";

export function MaintenancePage() {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (!shake) return;
    const timeout = window.setTimeout(() => setShake(false), 450);
    return () => window.clearTimeout(timeout);
  }, [shake]);

  const focusIndex = (index: number) => {
    window.requestAnimationFrame(() => inputRefs.current[index]?.focus());
  };

  const handleChange = (index: number, rawValue: string) => {
    const value = rawValue.replace(/\D/g, "");
    if (!value) {
      setDigits((current) => {
        const next = [...current];
        next[index] = "";
        return next;
      });
      setError(null);
      return;
    }

    const chars = value.slice(0, 6 - index).split("");
    setDigits((current) => {
      const next = [...current];
      chars.forEach((char, offset) => {
        if (next[index + offset] !== undefined) next[index + offset] = char;
      });
      return next;
    });
    setError(null);
    focusIndex(Math.min(index + chars.length, 5));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      setDigits((current) => {
        const next = [...current];
        next[index - 1] = "";
        return next;
      });
      focusIndex(index - 1);
    }
    if (event.key === "Enter") {
      void handleVerify();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    setDigits(pasted.split("").concat(Array.from({ length: 6 - pasted.length }, () => "")));
    setError(null);
    focusIndex(Math.min(pasted.length, 5));
  };

  const clearAndFocus = () => {
    setDigits(["", "", "", "", "", ""]);
    focusIndex(0);
  };

  const handleVerify = async () => {
    const entered = digits.join("");
    if (entered.length < 6) {
      setError("Please enter all 6 digits.");
      setShake(true);
      return;
    }

    if (entered === ACCESS_CODE) {
      setSuccess(true);
      document.cookie = "beomz_access=1; path=/; max-age=86400";
      try {
        window.localStorage.setItem("beomz_access", "1");
      } catch {
        // ignore — cookie alone is enough for the gate
      }
      window.setTimeout(() => {
        window.location.assign("/");
      }, 250);
      return;
    }

    setShake(true);
    setError("Incorrect code. Please try again.");
    clearAndFocus();
  };

  return (
    <div style={styles.page}>
      <div style={styles.bgGlow} />
      <div style={styles.card}>
        <div style={{ ...styles.mainView, ...(success ? styles.mainViewHidden : null) }}>
          <div style={styles.logoRow}>
            <MyndlabLogo style={styles.logoWordmark} />
          </div>

          <h1 style={styles.heading}>Myndlab is being prepared</h1>
          <p style={styles.subheading}>
            This Myndlab playground is being prepared. We&apos;ll be back shortly.
          </p>

          <div style={styles.divider} />

          <div style={styles.codeLabel}>Team access - enter your code</div>

          <div style={{ ...styles.codeInputs, ...(shake ? styles.codeInputsShake : null) }}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                value={digit}
                onChange={(event) => handleChange(index, event.target.value)}
                onKeyDown={(event) => handleKeyDown(index, event)}
                onPaste={handlePaste}
                style={{
                  ...styles.codeInput,
                  ...(digit ? styles.codeInputFilled : null),
                  ...(error ? styles.codeInputError : null),
                }}
                aria-label={`Code digit ${index + 1}`}
              />
            ))}
          </div>

          <div style={{ ...styles.errorMsg, ...(error ? null : styles.errorMsgHidden) }}>{error ?? " "}</div>

          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={success}
            style={styles.button}
          >
            Continue →
          </button>

          <div style={styles.footer}>MYNDLAB · 2026</div>
        </div>

        <div style={{ ...styles.successView, ...(success ? styles.successViewVisible : null) }}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>M</div>
            <span style={styles.logoText}>Myndlab</span>
          </div>
          <div style={styles.successIcon}>✓</div>
          <h2 style={styles.successHeading}>Access granted</h2>
          <p style={styles.successText}>Redirecting you to the studio...</p>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "#131313",
    color: "#fff",
    fontFamily: '"Inter Tight", system-ui, sans-serif',
    WebkitFontSmoothing: "antialiased",
    position: "relative",
    overflow: "hidden",
  },
  bgGlow: {
    position: "fixed",
    inset: 0,
    background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,213,216,0.10) 0%, transparent 60%)",
    pointerEvents: "none",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "40px 36px",
    textAlign: "center",
    position: "relative",
    zIndex: 1,
  },
  mainView: {
    display: "block",
  },
  mainViewHidden: {
    display: "none",
  },
  logoRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "28px",
  },
  logoWordmark: {
    width: "140px",
    height: "auto",
    color: "#fff",
  },
  heading: {
    fontSize: "27px",
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: 1.2,
    marginBottom: "12px",
    color: "#fff",
  },
  subheading: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.45)",
    lineHeight: 1.6,
    marginBottom: "36px",
  },
  divider: {
    height: "1px",
    background: "rgba(255,255,255,0.07)",
    margin: "0 -36px 32px",
  },
  codeLabel: {
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.35)",
    marginBottom: "16px",
  },
  codeInputs: {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
    marginBottom: "10px",
  },
  codeInputsShake: {
    animation: "shake 0.4s ease",
  },
  codeInput: {
    width: "48px",
    height: "56px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    textAlign: "center",
    fontSize: "22px",
    fontWeight: 500,
    color: "#fff",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s, background 0.15s",
    caretColor: "transparent",
  },
  codeInputFilled: {
    borderColor: "rgba(0,213,216,0.5)",
  },
  codeInputError: {
    borderColor: "rgba(239,68,68,0.7)",
    background: "rgba(239,68,68,0.06)",
  },
  errorMsg: {
    fontSize: "13px",
    color: "#ef4444",
    minHeight: "20px",
    marginBottom: "24px",
    transition: "opacity 0.2s",
  },
  errorMsgHidden: {
    opacity: 0,
  },
  button: {
    width: "100%",
    height: "48px",
    background: "#00D5D8",
    color: "#131313",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: 500,
    fontFamily: "inherit",
    cursor: "pointer",
    transition: "background 0.15s, transform 0.1s",
    letterSpacing: "-0.01em",
  },
  footer: {
    marginTop: "28px",
    fontSize: "12px",
    color: "rgba(255,255,255,0.2)",
    letterSpacing: "0.02em",
  },
  successView: {
    display: "none",
    textAlign: "center",
  },
  successViewVisible: {
    display: "block",
  },
  successIcon: {
    width: "56px",
    height: "56px",
    background: "rgba(34,197,94,0.12)",
    border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 20px",
    fontSize: "24px",
  },
  successHeading: {
    fontSize: "20px",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    marginBottom: "8px",
  },
  successText: {
    fontSize: "14px",
    color: "rgba(255,255,255,0.45)",
  },
};
