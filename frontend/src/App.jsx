import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Send, Bot, User, Loader2, PlusCircle, Bookmark } from "lucide-react";

const App = () => {
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    let sid = localStorage.getItem("sessionId");
    if (!sid) {
      sid = "session_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem("sessionId", sid);
    }
    setSessionId(sid);

    // Load history from session (optional, keeping it simple for now)
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim() || loading) return;

    const userMsg = { role: "user", text: message };
    setHistory((prev) => [...prev, userMsg]);
    setMessage("");
    setLoading(true);

    try {
      const response = await axios.post(
        "http://localhost:3001/api/chat",
        { sessionId, message, history },
        { timeout: 60000 }
      );

      const replyText = response.data?.reply ?? "No response received. Please try again.";
      const botMsg = {
        role: "bot",
        text: replyText,
        sources: response.data?.sources ?? [],
        chunks: response.data?.retrievedChunks ?? 0,
      };
      setHistory((prev) => [...prev, botMsg]);
    } catch (error) {
      if (error.response?.status !== 429) {
        console.error("Chat error:", error);
      }
      const data = error.response?.data;
      let errorText = data?.reply || data?.message;
      if (!errorText) {
        errorText =
          error.response?.status === 429 || data?.error === "rate_limited"
            ? `Rate limited. Please wait ${data?.retryAfter ?? 60} seconds.`
            : error.code === "ECONNABORTED"
              ? "Request timed out. Is the server running?"
              : "Could not connect to the assistant. Is the server running?";
      }
      setHistory((prev) => [...prev, { role: "bot", text: errorText }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setHistory([]);
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto border-x bg-white shadow-xl">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Bot className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-xl text-slate-800">RAG Assistant</h1>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Production Grade Base
            </p>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors text-sm font-medium"
        >
          <PlusCircle size={18} />
          New Chat
        </button>
      </header>

      {/* Chat Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth bg-slate-50/30"
      >
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
            <Bot size={48} className="opacity-20" />
            <p className="text-center max-w-xs">
              Ask me anything about our Refund, Shipping, or Privacy policies. I
              only use facts!
            </p>
          </div>
        )}

        {history.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
          >
            <div
              className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  msg.role === "user" ? "bg-slate-200" : "bg-indigo-100"
                }`}
              >
                {msg.role === "user" ? (
                  <User size={18} />
                ) : (
                  <Bot size={18} className="text-indigo-600" />
                )}
              </div>
              <div
                className={`p-4 rounded-2xl shadow-sm ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-none"
                    : "bg-white border rounded-tl-none"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {msg.text}
                </p>

                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2 text-[10px]">
                    <span className="text-slate-400 uppercase font-bold tracking-wider w-full">
                      Sources used:
                    </span>
                    {msg.sources.map((source, sIdx) => (
                      <span
                        key={sIdx}
                        className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded flex items-center gap-1"
                      >
                        <Bookmark size={10} /> {source}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-3 items-center">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                <Bot size={18} className="text-indigo-600" />
              </div>
              <div className="bg-white border p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                <Loader2 size={16} className="animate-spin text-indigo-600" />
                <span className="text-sm text-slate-500 italic">
                  Finding the best answer...
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSend}
        className="p-4 border-t bg-white bg-opacity-80 backdrop-blur-sm sticky bottom-0"
      >
        <div className="relative flex items-center">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Ask about policies..."
            className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
          />
          <button
            type="submit"
            disabled={!message.trim() || loading}
            className="absolute right-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all"
          >
            <Send size={20} />
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-2">
          Retrieval-Augmented Generation enabled. AI responses are grounded in
          our local documents.
        </p>
      </form>
    </div>
  );
};

export default App;
