import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback } = React;
import { Send, Plus, Trash2, Clock, Copy, Check } from "lucide-react";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const METHOD_COLOR = { GET: "bg-green-50 text-green-600", POST: "bg-blue-50 text-blue-600", PUT: "bg-amber-50 text-amber-600", PATCH: "bg-purple-50 text-purple-600", DELETE: "bg-red-50 text-red-600" };

let histId = 0;

export function App() {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("/api/users");
  const [body, setBody] = useState('{"name": "John", "email": "john@example.com"}');
  const [headers, setHeaders] = useState([{ key: "Content-Type", value: "application/json" }]);
  const [tab, setTab] = useState("body");
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);

  const addHeader = useCallback(() => setHeaders((prev) => [...prev, { key: "", value: "" }]), []);
  const updateHeader = useCallback((idx, field, val) => setHeaders((prev) => prev.map((h, i) => i === idx ? { ...h, [field]: val } : h)), []);
  const removeHeader = useCallback((idx) => setHeaders((prev) => prev.filter((_, i) => i !== idx)), []);

  const send = useCallback(() => {
    setLoading(true);
    const status = method === "DELETE" ? 204 : method === "POST" ? 201 : 200;
    const mockBody = method === "GET" ? '{"users": [{"id": 1, "name": "John"}, {"id": 2, "name": "Jane"}]}' : method === "POST" ? '{"id": 3, "name": "John", "email": "john@example.com"}' : method === "DELETE" ? "" : '{"updated": true}';
    setTimeout(() => {
      const res = { status, statusText: status === 200 ? "OK" : status === 201 ? "Created" : "No Content", body: mockBody, time: Math.round(50 + Math.random() * 200), size: mockBody.length + " B" };
      setResponse(res);
      setHistory((prev) => [{ id: histId++, method, url, status, time: res.time, timestamp: new Date().toLocaleTimeString() }, ...prev].slice(0, 10));
      setLoading(false);
    }, 300 + Math.random() * 500);
  }, [method, url]);

  const copyResponse = useCallback(() => {
    if (response?.body) { navigator.clipboard.writeText(response.body).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  }, [response]);

  const statusColor = (s) => s < 300 ? "text-green-600 bg-green-50" : s < 400 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-[#111827] max-w-4xl mx-auto flex items-center gap-2"><Send size={20} className="text-blue-500" /> API Tester</h1>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex gap-2 mb-4">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={"rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium outline-none " + (METHOD_COLOR[method] || "")}>
              {METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/api/endpoint" className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-[#111827] font-mono placeholder-[#6b7280] outline-none focus:border-blue-300" />
            <button onClick={send} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors disabled:opacity-60">
              <Send size={14} /> {loading ? "Sending..." : "Send"}
            </button>
          </div>

          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-3 w-fit">
            {["body", "headers"].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={"rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all " + (tab === t ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280]")}>
                {t} {t === "headers" ? "(" + headers.length + ")" : ""}
              </button>
            ))}
          </div>

          {tab === "body" && (method === "POST" || method === "PUT" || method === "PATCH") && (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-mono text-[#111827] outline-none focus:border-blue-300 resize-none" />
          )}
          {tab === "body" && method === "GET" && (
            <p className="text-sm text-[#6b7280] py-4 text-center">GET requests don't have a body</p>
          )}

          {tab === "headers" && (
            <div>
              <div className="space-y-2 mb-2">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={h.key} onChange={(e) => updateHeader(i, "key", e.target.value)} placeholder="Header name" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#111827] placeholder-[#6b7280] outline-none" />
                    <input value={h.value} onChange={(e) => updateHeader(i, "value", e.target.value)} placeholder="Value" className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#111827] placeholder-[#6b7280] outline-none" />
                    <button onClick={() => removeHeader(i)} className="text-[#6b7280] hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={addHeader} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500"><Plus size={13} /> Add Header</button>
            </div>
          )}
        </div>

        {response && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + statusColor(response.status)}>{response.status} {response.statusText}</span>
                <span className="text-xs text-[#6b7280] flex items-center gap-1"><Clock size={10} />{response.time}ms</span>
                <span className="text-xs text-[#6b7280]">{response.size}</span>
              </div>
              <button onClick={copyResponse} className="text-[#6b7280] hover:text-[#111827]">
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
            {response.body ? (
              <pre className="rounded-lg bg-gray-50 border border-gray-100 p-4 text-sm font-mono text-[#374151] overflow-x-auto whitespace-pre-wrap">{response.body}</pre>
            ) : (
              <p className="text-sm text-[#6b7280] text-center py-4">No response body</p>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-medium text-[#111827] mb-3">History</h2>
            <div className="space-y-1.5">
              {history.map((h) => (
                <button key={h.id} onClick={() => { setMethod(h.method); setUrl(h.url); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 transition-colors">
                  <span className={"rounded px-1.5 py-0.5 text-[10px] font-bold " + (METHOD_COLOR[h.method] || "")}>{h.method}</span>
                  <span className="flex-1 text-sm font-mono text-[#374151] truncate">{h.url}</span>
                  <span className={"rounded-full px-1.5 py-0.5 text-[10px] font-medium " + statusColor(h.status)}>{h.status}</span>
                  <span className="text-[10px] text-[#6b7280]">{h.time}ms</span>
                  <span className="text-[10px] text-[#6b7280]">{h.timestamp}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
`,
  },
];
