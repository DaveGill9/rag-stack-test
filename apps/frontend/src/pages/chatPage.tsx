import React, { useEffect, useState } from 'react';
import Sidebar from '../components/sidebar';
import ChatWindow from '../components/chatWindow';
import type { Message, SessionSummary } from '../lib/chatTypes';

const BACKEND_STREAM_URL = 'http://localhost:3000/agent/chat/stream';

const ChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem('sessionId');
  });

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem('sessionId');
  };

  const loadSessionById = async (id: string) => {
    const resp = await fetch(`http://localhost:3000/chat/session/${id}`);
    if (!resp.ok) return;

    const data = await resp.json();
    const turns = data.turns || [];

    const restored: Message[] = turns.map((t: any, idx: number) => ({
      id: `${id}-${idx}`,
      role: t.role,
      content: t.content,
      sources: t.sources ?? [],
    }));

    setMessages(restored);
  };

  useEffect(() => {
    const stored = localStorage.getItem('sessionId');
    if (!stored) return;

    (async () => {
      try {
        await loadSessionById(stored);
        setSessionId(stored);
      } catch (err) {
        console.error('Failed to restore session', err);
      }
    })();
  }, []);

  useEffect(() => {
    async function loadSessions() {
      try {
        const resp = await fetch('http://localhost:3000/chat/sessions');
        const list = await resp.json();
        setSessions(list);
      } catch (err) {
        console.error('Failed to load sessions', err);
      }
    }
    loadSessions();
  }, []);

  const handleSelectSession = async (id: string) => {
    localStorage.setItem('sessionId', id);
    setSessionId(id);
    try {
      await loadSessionById(id);
    } catch (err) {
      console.error('Failed to load session', err);
    }
  };

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

            fetch('http://localhost:3000/chat/sessions')
              .then((res) => res.json())
              .then((list) => setSessions(list))
              .catch((err) =>
                console.error('Failed to refresh sessions list', err),
              );

            if (event.sources) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, sources: event.sources } : m,
                ),
              );
            }
          } else if (event.type === 'token') {
            let chunk: string = event.content ?? '';
            if (!chunk) continue;

            if (event.encoding === 'base64') {
              try {
                chunk = atob(chunk);
              } catch (e) {
                console.error('Base64 decode failed:', e);
                continue;
              }
            }

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + chunk }
                  : m,
              ),
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
      <Sidebar
        sessions={sessions}
        activeSessionId={sessionId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
      />

      <ChatWindow
        messages={messages}
        input={input}
        loading={loading}
        onInputChange={setInput}
        onSend={handleSend}
      />
    </div>
  );
};

export default ChatPage;

