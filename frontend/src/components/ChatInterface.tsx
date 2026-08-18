import React, { useState } from 'react';
import { Send, Terminal, Cpu } from 'lucide-react';
import { queryCodebase, Citation } from '../services/api';

interface ChatInterfaceProps {
  onCitationClick: (nodeIds: string[]) => void;
}

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
}

export default function ChatInterface({ onCitationClick }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: "Hello! I am your DevRamp Onboarding assistant. Ask me anything about this codebase's architecture, dependencies, or function call logic.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input;
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setLoading(true);

    try {
      const res = await queryCodebase(userMsg);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: res.answer,
          citations: res.citations,
        },
      ]);
      // Trigger node highlighting on dashboard if citations exist
      if (res.citations && res.citations.length > 0) {
        onCitationClick(res.citations.map((c) => c.id));
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: 'Sorry, I encountered an error searching the codebase index.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden border border-accent/10 bg-zinc-950/20">
      {/* Header */}
      <div className="px-4 py-3 bg-zinc-900 border-b border-border flex items-center gap-2">
        <Cpu className="text-accent w-4 h-4 animate-pulse" />
        <span className="font-bold text-xs tracking-wider uppercase text-zinc-200">Agentic RAG Assistant</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm shadow-md leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-accent text-white rounded-br-none font-medium'
                  : 'bg-zinc-900 border border-border text-zinc-100 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-line">{msg.text}</div>
              
              {/* Citations */}
              {msg.citations && msg.citations.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-zinc-800 space-y-2">
                  <div className="text-[10px] font-bold text-accent flex items-center gap-1 uppercase tracking-wider">
                    <Terminal className="w-3 h-3" /> Referenced Entities:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((cite) => (
                      <button
                        key={cite.id}
                        onClick={() => onCitationClick([cite.id])}
                        className="text-[9px] bg-zinc-950 hover:bg-accent/10 hover:text-accent border border-zinc-800 px-2 py-0.5 rounded transition duration-150 font-mono max-w-[180px] truncate"
                        title={`Score: ${cite.score.toFixed(2)}`}
                      >
                        {cite.name} ({cite.type})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-900 border border-border text-zinc-400 rounded-xl rounded-bl-none px-4 py-2.5 text-xs shadow-md flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-ping"></span>
              Analyzing AST references...
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 bg-zinc-900/60 border-t border-border flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about components, imports, or files..."
          className="flex-1 bg-zinc-950 border border-border rounded-lg px-3.5 py-2 text-xs focus:outline-none focus:border-accent/40 text-zinc-100 placeholder-zinc-500"
        />
        <button
          type="submit"
          className="bg-accent hover:bg-orange-600 text-white rounded-lg p-2.5 transition duration-150 hover:scale-[1.03]"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
