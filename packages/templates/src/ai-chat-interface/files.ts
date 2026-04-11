import type { TemplateFile } from "@beomz-studio/contracts";

export const files: TemplateFile[] = [
  {
    path: "App.tsx",
    content: `const { useState, useCallback, useRef, useEffect } = React;
import { Send, Bot, User, Sparkles, Trash2 } from "lucide-react";

let nextId = 10;

const SUGGESTIONS = [
  "Explain quantum computing in simple terms",
  "Write a haiku about programming",
  "How do I center a div with CSS?",
  "Suggest 5 startup ideas for 2024",
];

const AI_RESPONSES = [
  "That's a great question! Let me break it down for you. The key concept here is understanding that complex systems can be decomposed into simpler parts. Each part has its own role, and together they create something greater than the sum of their parts.",
  "Here's my take on that: Think of it like building with LEGO blocks. Each piece is simple on its own, but when you combine them with intention and creativity, you can build anything you imagine.",
  "I'd be happy to help with that! The most effective approach involves three steps: first, understand the problem space; second, identify the constraints; and third, iterate on solutions until you find the best fit.",
  "Interesting question! There are several ways to approach this. The most common pattern involves breaking the problem into smaller sub-problems, solving each one independently, then combining the results.",
];

export function App() {
  const [messages, setMessages] = useState([
    { id: 1, role: "assistant", content: "Hello! I'm your AI assistant. How can I help you today?" },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  const sendMessage = useCallback((text) => {
    const content = text || input.trim();
    if (!content) return;
    setMessages((prev) => [...prev, { id: nextId++, role: "user", content }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const response = AI_RESPONSES[Math.floor(Math.random() * AI_RESPONSES.length)];
      setMessages((prev) => [...prev, { id: nextId++, role: "assistant", content: response }]);
      setTyping(false);
    }, 1000 + Math.random() * 1500);
  }, [input]);

  const clearChat = useCallback(() => {
    setMessages([{ id: nextId++, role: "assistant", content: "Chat cleared. How can I help you?" }]);
  }, []);

  return (
    <div className="min-h-screen bg-[#060612] flex flex-col">
      <div className="border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600">
            <Bot size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">AI Assistant</h1>
            <span className="text-[10px] text-green-400">Online</span>
          </div>
        </div>
        <button onClick={clearChat} className="text-zinc-600 hover:text-zinc-400 transition-colors" title="Clear chat">
          <Trash2 size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={"flex gap-3 " + (msg.role === "user" ? "justify-end" : "")}>
            {msg.role === "assistant" && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20 flex-shrink-0 mt-0.5">
                <Sparkles size={14} className="text-purple-400" />
              </div>
            )}
            <div className={"max-w-[80%] rounded-2xl px-4 py-3 " + (msg.role === "user" ? "bg-purple-600 text-white rounded-br-md" : "bg-zinc-900 border border-white/5 text-zinc-300 rounded-bl-md")}>
              <p className="text-sm leading-relaxed">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 flex-shrink-0 mt-0.5">
                <User size={14} className="text-zinc-400" />
              </div>
            )}
          </div>
        ))}

        {typing && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600/20 flex-shrink-0">
              <Sparkles size={14} className="text-purple-400" />
            </div>
            <div className="bg-zinc-900 border border-white/5 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1">
                <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {messages.length === 1 && !typing && (
          <div className="pt-4">
            <p className="text-xs text-zinc-600 text-center mb-3">Try asking:</p>
            <div className="grid grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => sendMessage(s)} className="rounded-xl border border-white/5 bg-zinc-900/50 px-3 py-2.5 text-xs text-zinc-400 text-left hover:border-purple-500/30 hover:text-zinc-300 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/5 p-4">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={typing}
            className="flex-1 rounded-xl bg-zinc-900 border border-white/5 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-purple-500/40 disabled:opacity-50"
          />
          <button type="submit" disabled={typing || !input.trim()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-600 text-white hover:bg-purple-500 transition-colors disabled:opacity-40">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default App;
`,
  },
];
