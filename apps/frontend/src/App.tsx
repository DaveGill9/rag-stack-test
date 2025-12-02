// src/App.tsx
import React, { useState } from 'react';
import './App.css';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
};

const BACKEND_URL = 'http://localhost:3000/chat';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem('sessionId');
  });

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId }),
      });

      if (!resp.ok) {
        throw new Error(`Backend error: ${resp.status}`);
      }

      const data = await resp.json();

      if (data.sessionId && data.sessionId !== sessionId) {
        setSessionId(data.sessionId);
        localStorage.setItem('sessionId', data.sessionId);
      }

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer ?? '',
        sources: data.sources ?? [],
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err.message}`,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="chat-container">
        <h1 className="chat-title">RAG Demo Chat</h1>

        <div className="messages">
          {messages.length === 0 && (
            <div className="messages-empty">
              Ask a question about the documents you loaded…
            </div>
          )}

          {messages.map((m) => (
            <div
              key={m.id}
              className={`message ${
                m.role === 'user' ? 'message--user' : 'message--assistant'
              }`}
            >
              <div className="message-role">
                {m.role === 'user' ? 'You' : 'Assistant'}
              </div>

              <div className="message-content">{m.content}</div>

              {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                <div className="sources">
                  <div className="sources-header">Sources:</div>
                  <ul className="sources-list">
                    {m.sources.map((s, idx) => (
                      <li key={idx} className="sources-item">
                        <strong>
                          {s.metadata?.source_path ||
                            s.metadata?.doc_id ||
                            s.id}
                        </strong>
                        {s.metadata?.page_from != null &&
                          s.metadata?.page_to != null && (
                            <span>
                              {' '}
                              (pages {s.metadata.page_from}-
                              {s.metadata.page_to})
                            </span>
                          )}
                        {s.score != null && (
                          <span> — score: {s.score.toFixed(3)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="input-row" onSubmit={handleSend}>
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something..."
          />
          <button className="button" type="submit" disabled={loading}>
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default App;
