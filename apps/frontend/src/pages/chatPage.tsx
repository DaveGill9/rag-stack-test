import React, { useEffect, useState } from 'react';
import '../styles/global.css';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
};

const BACKEND_STREAM_URL = 'http://localhost:3000/chat/stream';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<{ id: string; title: string }[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem('sessionId');
  });

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem("sessionId");
  };

  useEffect(() => {
    const stored = localStorage.getItem('sessionId');
    if (!stored) return;

    (async () => {
      try {
        const resp = await fetch(`http://localhost:3000/chat/session/${stored}`);
        if (!resp.ok) return;

        const data = await resp.json();
        const turns = data.turns || [];

        const restoredMessages: Message[] = turns.map((t: any, idx: number) => ({
          id: `${data.sessionId}-${idx}`,
          role: t.role,
          content: t.content,
          sources: t.sources ?? [],
        }));

        setMessages(restoredMessages);
        setSessionId(data.sessionId);
      } catch (err) {
        console.error('Failed to restore session', err);
      }
    })();
  }, []);

  useEffect(() => {
    async function loadSessions() {
      const resp = await fetch("http://localhost:3000/chat/sessions");
      const list = await resp.json();
      setSessions(list);
    }
    loadSessions();
  }, []);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
  
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };
  
    const assistantId = crypto.randomUUID();
  
    setMessages((prev) => [
      ...prev,
      userMsg,
      {
        id: assistantId,
        role: 'assistant',
        content: '',
        sources: [],
      },
    ]);
  
    setInput('');
    setLoading(true);
  
    try {
      const resp = await fetch(BACKEND_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId }),
      });
  
      if (!resp.body) {
        throw new Error('No response body');
      }
  
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
  
      let done = false;
  
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        const chunkText = decoder.decode(value, { stream: true });
  
        const lines = chunkText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('data:'));
  
        for (const line of lines) {
          const jsonStr = line.replace(/^data:\s*/, '');
          if (!jsonStr) continue;
          const event = JSON.parse(jsonStr);
  
          if (event.type === 'meta') {
            if (event.sessionId && event.sessionId !== sessionId) {
              setSessionId(event.sessionId);
              localStorage.setItem('sessionId', event.sessionId);
            }

            fetch("http://localhost:3000/chat/sessions")
            .then((res) => res.json())
            .then((list) => setSessions(list));

            if (event.sources) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, sources: event.sources } : m
                )
              );
            }
          } else if (event.type === 'token') {
            let chunk: string = event.content ?? '';
            if (!chunk) continue;
          
            if (event.encoding === 'base64') {
              try {
                chunk = atob(chunk);
              } catch (e) {
                console.error("Base64 decode failed:", e);
                continue;
              }
            }
          
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk }
                  : m
              )
            );
          } else if (event.type === 'done') {
            done = true;
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${err.message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app app--with-sidebar">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <h2 className="sidebar-title">Sessions</h2>
  
        <button
          className="sidebar-new-chat"
          type="button"
          onClick={handleNewChat}
        >
          ➕ New Chat
        </button>
  
        <div className="sidebar-sessions">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={
                'sidebar-session-item' +
                (s.id === sessionId ? ' sidebar-session-item--active' : '')
              }
              onClick={() => {
                // save selection
                localStorage.setItem('sessionId', s.id);
                setSessionId(s.id);
  
                // load turns for that session
                fetch(`http://localhost:3000/chat/session/${s.id}`)
                  .then((r) => r.json())
                  .then((data) => {
                    const turns = data.turns || [];
                    const restored = turns.map((t: any, idx: number) => ({
                      id: `${s.id}-${idx}`,
                      role: t.role,
                      content: t.content,
                      sources: t.sources ?? [],
                    }));
                    setMessages(restored);
                  })
                  .catch((err) => {
                    console.error('Failed to load session', err);
                  });
              }}
            >
              {s.title || 'New Chat'}
            </div>
          ))}
        </div>
      </aside>
  
      {/* MAIN CHAT AREA */}
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
  
              {m.role === 'assistant' &&
                m.sources &&
                m.sources.length > 0 && (
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