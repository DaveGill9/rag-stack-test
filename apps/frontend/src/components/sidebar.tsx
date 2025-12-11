import React from 'react';
import type { SessionSummary } from '../lib/chatTypes';

type SidebarProps = {
    sessions: SessionSummary[];
    activeSessionId: string | null;
    onNewChat: () => void;
    onSelectSession: (id: string) => void;
};

const Sidebar: React.FC<SidebarProps> = ({
    sessions,
    activeSessionId,
    onNewChat,
    onSelectSession,
}) => {
    return (
        <aside className="sidebar">
            <h2 className="sidebar-title">Sessions</h2>

            <button
                className="sidebar-new-chat"
                type="button"
                onClick={onNewChat}
            >
                ➕ New Chat
            </button>

            <div className="sidebar-sessions">
                {sessions.map((s) => (
                    <div
                        key={s.id}
                        className={
                            'sidebar-session-item' +
                            (s.id === activeSessionId ? ' sidebar-session-item--active' : '')
                        }
                        onClick={() => onSelectSession(s.id)}
                    >
                        {s.title || 'New Chat'}
                    </div>
                ))}
            </div>
        </aside>
    );
};

export default Sidebar;
