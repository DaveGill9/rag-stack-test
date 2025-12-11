import React from 'react';
import type { Message } from '../lib/chatTypes';

type ChatWindowProps = {
    messages: Message[];
    input: string;
    loading: boolean;
    onInputChange: (value: string) => void;
    onSend: (e?: React.FormEvent) => void;
};

const MAX_SOURCES = 5;

const ChatWindow: React.FC<ChatWindowProps> = ({
    messages,
    input,
    loading,
    onInputChange,
    onSend,
}) => {
    return (
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
                        className={`message ${m.role === 'user' ? 'message--user' : 'message--assistant'
                            }`}
                    >
                        <div className="message-role">
                            {m.role === 'user' ? 'You' : 'Assistant'}
                        </div>

                        <div className="message-content">{m.content}</div>

                        {m.role === 'assistant' &&
                            Array.isArray(m.sources) &&
                            m.sources.length > 0 && (
                                <div className="sources">
                                    <div className="sources-header">Sources:</div>
                                    <ul className="sources-list">
                                        {m.sources.slice(0, MAX_SOURCES).map((s: any, idx: number) => {
                                            const meta = s.metadata ?? {};

                                            const isRag =
                                                meta.source_path ||
                                                meta.doc_id ||
                                                meta.title ||
                                                meta.filename;

                                            if (isRag) {
                                                const title =
                                                    meta.source_path ||
                                                    meta.doc_id ||
                                                    meta.title ||
                                                    meta.filename ||
                                                    s.id ||
                                                    `Source ${idx + 1}`;

                                                const hasPages =
                                                    meta.page_from != null &&
                                                    meta.page_to != null;

                                                const scoreText =
                                                    typeof s.score === 'number'
                                                        ? ` — score: ${s.score.toFixed(3)}`
                                                        : '';

                                                return (
                                                    <li key={idx} className="sources-item">
                                                        <strong>{title}</strong>

                                                        {hasPages && (
                                                            <span>
                                                                {' '}
                                                                (pages {meta.page_from}-{meta.page_to})
                                                            </span>
                                                        )}

                                                        {scoreText && <span>{scoreText}</span>}
                                                    </li>
                                                );
                                            }

                                            const url = s.url || meta.url;
                                            const label =
                                                s.title ||
                                                url ||
                                                s.id ||
                                                `Source ${idx + 1}`;

                                            return (
                                                <li key={idx} className="sources-item">
                                                    {url ? (
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                        >
                                                            <strong>{label}</strong>
                                                        </a>
                                                    ) : (
                                                        <strong>{label}</strong>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                    </div>
                ))}
            </div>

            <form className="input-row" onSubmit={onSend}>
                <input
                    className="input"
                    value={input}
                    onChange={(e) => onInputChange(e.target.value)}
                    placeholder="Ask something..."
                />
                <button className="button" type="submit" disabled={loading}>
                    {loading ? 'Thinking…' : 'Send'}
                </button>
            </form>
        </div>
    );
};

export default ChatWindow;
