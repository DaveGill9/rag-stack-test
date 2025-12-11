import React from 'react';
import type { Message } from '../lib/chatTypes';

type ChatWindowProps = {
    messages: Message[];
    input: string;
    loading: boolean;
    onInputChange: (value: string) => void;
    onSend: (e?: React.FormEvent) => void;
};

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
                            m.sources &&
                            m.sources.length > 0 && (
                                <div className="sources">
                                    <div className="sources-header">Sources:</div>
                                    <ul className="sources-list">
                                        {m.sources.map((s: any, idx: number) => (
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
