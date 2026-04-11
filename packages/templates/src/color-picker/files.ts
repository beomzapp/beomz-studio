import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useMemo } = React;
import { Copy, Check, Palette } from "lucide-react";

function hexToRgb(hex) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[0], 16), g: parseInt(m[1], 16), b: parseInt(m[2], 16) };
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1/6) return p + (q - p) * 6 * t; if (t < 1/2) return q; if (t < 2/3) return p + (q - p) * (2/3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: Math.round(hue2rgb(p, q, h + 1/3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1/3) * 255) };
}

export function App() {
  const [hex, setHex] = useState("#D946EF");
  const [saved, setSaved] = useState([]);
  const [copied, setCopied] = useState(null);

  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const hsl = useMemo(() => rgbToHsl(rgb.r, rgb.g, rgb.b), [rgb]);

  const updateFromHex = useCallback((v) => {
    const clean = v.startsWith("#") ? v : "#" + v;
    if (/^#[0-9a-fA-F]{0,6}$/.test(clean)) setHex(clean.length === 7 ? clean : v);
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) setHex(clean);
  }, []);

  const updateFromRgb = useCallback((channel, val) => {
    const v = Math.max(0, Math.min(255, parseInt(val) || 0));
    const next = { ...rgb, [channel]: v };
    setHex(rgbToHex(next.r, next.g, next.b));
  }, [rgb]);

  const updateFromHsl = useCallback((channel, val) => {
    const max = channel === "h" ? 360 : 100;
    const v = Math.max(0, Math.min(max, parseInt(val) || 0));
    const next = { ...hsl, [channel]: v };
    const { r, g, b } = hslToRgb(next.h, next.s, next.l);
    setHex(rgbToHex(r, g, b));
  }, [hsl]);

  const saveColor = useCallback(() => {
    if (saved.includes(hex) || saved.length >= 10) return;
    setSaved((prev) => [hex, ...prev]);
  }, [hex, saved]);

  const copyText = useCallback((text) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }, []);

  const CopyBtn = ({ text }) => (
    <button onClick={() => copyText(text)} className="text-zinc-600 hover:text-white transition-colors">
      {copied === text ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl bg-zinc-900 border border-white/5 p-6 shadow-2xl">
          <h1 className="text-xl font-semibold text-white mb-5 flex items-center gap-2"><Palette size={20} /> Color Picker</h1>

          <div className="rounded-2xl h-32 mb-5 border border-white/5" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#000" }} />

          <div className="space-y-3 mb-5">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">HEX</label>
              <div className="flex items-center gap-2">
                <input value={hex} onChange={(e) => updateFromHex(e.target.value)} className="flex-1 rounded-lg bg-zinc-800 border border-white/5 px-3 py-2 text-sm text-white font-mono outline-none" />
                <CopyBtn text={hex} />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">RGB</label>
              <div className="flex gap-2 items-center">
                {(["r", "g", "b"]).map((ch) => (
                  <div key={ch} className="flex-1">
                    <input type="number" min={0} max={255} value={rgb[ch]} onChange={(e) => updateFromRgb(ch, e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-center" />
                  </div>
                ))}
                <CopyBtn text={"rgb(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ")"} />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 block">HSL</label>
              <div className="flex gap-2 items-center">
                {(["h", "s", "l"]).map((ch) => (
                  <div key={ch} className="flex-1">
                    <input type="number" min={0} max={ch === "h" ? 360 : 100} value={hsl[ch]} onChange={(e) => updateFromHsl(ch, e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-white/5 px-2 py-2 text-sm text-white outline-none text-center" />
                  </div>
                ))}
                <CopyBtn text={"hsl(" + hsl.h + ", " + hsl.s + "%, " + hsl.l + "%)"} />
              </div>
            </div>
          </div>

          <button onClick={saveColor} disabled={saved.includes(hex) || saved.length >= 10} className="w-full rounded-xl bg-fuchsia-600 py-2.5 text-white text-sm font-medium hover:bg-fuchsia-500 transition-colors disabled:opacity-40 mb-4">
            Save to Palette
          </button>

          {saved.length > 0 && (
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Saved ({saved.length}/10)</p>
              <div className="flex flex-wrap gap-2">
                {saved.map((c) => (
                  <button key={c} onClick={() => setHex(c)} className="h-8 w-8 rounded-lg border border-white/10 transition-transform hover:scale-110" style={{ backgroundColor: c }} title={c} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
