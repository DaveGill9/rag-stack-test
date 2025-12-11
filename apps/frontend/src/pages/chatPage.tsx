import React, { useEffect, useState } from 'react';

import Sidebar from '../components/sidebar';
import ChatWindow from '../components/chatWindow';
import type { Message, SessionSummary } from '../lib/chatTypes';

const AGENT_CHAT_URL = 'http://localhost:3000/agent/chat';

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

  // helper to load one session's turns
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

  // restore last session on initial load
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

  // load session list on mount
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

  // selecting a session from the sidebar
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

    // add user message immediately
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch(AGENT_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Request failed: ${resp.status} ${text}`);
      }

      const data = await resp.json(); // { sessionId, answer, sources }

      // update / store sessionId from backend
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

      // refresh sidebar sessions list
      fetch('http://localhost:3000/chat/sessions')
        .then((r) => r.json())
        .then((list) => setSessions(list))
        .catch((err) =>
          console.error('Failed to refresh sessions list', err),
        );
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${err.message ?? String(err)}`,
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
