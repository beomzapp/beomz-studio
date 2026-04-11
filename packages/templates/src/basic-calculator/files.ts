import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useEffect } = React;

export function App() {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [reset, setReset] = useState(false);

  const inputDigit = useCallback((d) => {
    setDisplay((cur) => {
      if (reset || cur === "0") { setReset(false); return d; }
      return cur + d;
    });
  }, [reset]);

  const inputDecimal = useCallback(() => {
    if (reset) { setReset(false); setDisplay("0."); return; }
    setDisplay((cur) => cur.includes(".") ? cur : cur + ".");
  }, [reset]);

  const calculate = useCallback((a, b, operator) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (operator === "+") return na + nb;
    if (operator === "-") return na - nb;
    if (operator === "*") return na * nb;
    if (operator === "/") return nb !== 0 ? na / nb : NaN;
    return nb;
  }, []);

  const handleOp = useCallback((nextOp) => {
    const current = parseFloat(display);
    if (prev !== null && op && !reset) {
      const result = calculate(prev, display, op);
      const str = isNaN(result) ? "Error" : String(parseFloat(result.toFixed(10)));
      setDisplay(str);
      setPrev(str === "Error" ? null : str);
    } else {
      setPrev(display);
    }
    setOp(nextOp);
    setReset(true);
  }, [display, prev, op, reset, calculate]);

  const handleEquals = useCallback(() => {
    if (prev === null || !op) return;
    const result = calculate(prev, display, op);
    const str = isNaN(result) ? "Error" : String(parseFloat(result.toFixed(10)));
    setDisplay(str);
    setPrev(null);
    setOp(null);
    setReset(true);
  }, [prev, op, display, calculate]);

  const handleClear = useCallback(() => {
    setDisplay("0");
    setPrev(null);
    setOp(null);
    setReset(false);
  }, []);

  const handlePercent = useCallback(() => {
    setDisplay((cur) => String(parseFloat(cur) / 100));
  }, []);

  const handleSign = useCallback(() => {
    setDisplay((cur) => cur.startsWith("-") ? cur.slice(1) : cur === "0" ? cur : "-" + cur);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.key >= "0" && e.key <= "9") inputDigit(e.key);
      else if (e.key === ".") inputDecimal();
      else if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") handleOp(e.key);
      else if (e.key === "Enter" || e.key === "=") handleEquals();
      else if (e.key === "Escape") handleClear();
      else if (e.key === "Backspace") setDisplay((cur) => cur.length > 1 ? cur.slice(0, -1) : "0");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inputDigit, inputDecimal, handleOp, handleEquals, handleClear]);

  const Btn = ({ label, onClick, className = "" }) => (
    <button
      onClick={onClick}
      className={"flex items-center justify-center rounded-2xl text-lg font-medium transition-all active:scale-95 " + className}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xs">
        <div className="rounded-3xl bg-zinc-900 p-5 shadow-2xl border border-white/5">
          <div className="mb-4 rounded-2xl bg-zinc-800 px-5 py-4 text-right">
            {op && prev !== null && (
              <div className="text-xs text-zinc-500 mb-1">{prev} {op}</div>
            )}
            <div className="text-3xl font-light text-white truncate">{display}</div>
          </div>
          <div className="grid grid-cols-4 gap-2.5">
            <Btn label="AC" onClick={handleClear} className="bg-zinc-700 text-orange-400 h-14" />
            <Btn label="+/-" onClick={handleSign} className="bg-zinc-700 text-orange-400 h-14" />
            <Btn label="%" onClick={handlePercent} className="bg-zinc-700 text-orange-400 h-14" />
            <Btn label="÷" onClick={() => handleOp("/")} className={"h-14 text-white " + (op === "/" ? "bg-orange-300 text-orange-900" : "bg-orange-500")} />

            <Btn label="7" onClick={() => inputDigit("7")} className="bg-zinc-800 text-white h-14" />
            <Btn label="8" onClick={() => inputDigit("8")} className="bg-zinc-800 text-white h-14" />
            <Btn label="9" onClick={() => inputDigit("9")} className="bg-zinc-800 text-white h-14" />
            <Btn label="×" onClick={() => handleOp("*")} className={"h-14 text-white " + (op === "*" ? "bg-orange-300 text-orange-900" : "bg-orange-500")} />

            <Btn label="4" onClick={() => inputDigit("4")} className="bg-zinc-800 text-white h-14" />
            <Btn label="5" onClick={() => inputDigit("5")} className="bg-zinc-800 text-white h-14" />
            <Btn label="6" onClick={() => inputDigit("6")} className="bg-zinc-800 text-white h-14" />
            <Btn label="-" onClick={() => handleOp("-")} className={"h-14 text-white " + (op === "-" ? "bg-orange-300 text-orange-900" : "bg-orange-500")} />

            <Btn label="1" onClick={() => inputDigit("1")} className="bg-zinc-800 text-white h-14" />
            <Btn label="2" onClick={() => inputDigit("2")} className="bg-zinc-800 text-white h-14" />
            <Btn label="3" onClick={() => inputDigit("3")} className="bg-zinc-800 text-white h-14" />
            <Btn label="+" onClick={() => handleOp("+")} className={"h-14 text-white " + (op === "+" ? "bg-orange-300 text-orange-900" : "bg-orange-500")} />

            <Btn label="0" onClick={() => inputDigit("0")} className="col-span-2 bg-zinc-800 text-white h-14" />
            <Btn label="." onClick={inputDecimal} className="bg-zinc-800 text-white h-14" />
            <Btn label="=" onClick={handleEquals} className="bg-orange-500 text-white h-14" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
