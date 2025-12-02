import crypto from 'crypto';

export type Role = 'user' | 'assistant';

export type Turn = {
    role: Role;
    content: string;
    sources?: {
        id: string;
        score?: number;
        metadata?: any;
    }[];
}

export type Session = {
    id: string;
    turns: Turn[];
    createdAt: string;
    updatedAt: string;
}

export class SessionStore {
    private sessions: Map<string, Session> = new Map();
}

const sessions: Map<string, Session> = new Map();

export function createSession(): Session {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session: Session = {
        id,
        turns: [],
        createdAt: now,
        updatedAt: now,
    };
    sessions.set(id, session);
    return session;
}

export function getSession(id?: string | null): Session | null {
    if (!id) return null;
    const s = sessions.get(id);
    return s ?? null;
}

export function upsertSessionTurn(
    session: Session,
    turn: Turn
): Session {
    const updated: Session = {
        ...session,
        turns: [...session.turns, turn],
        updatedAt: new Date().toISOString(),
    };
    sessions.set(updated.id, updated);
    return updated;
}

export function getRecentTurns(session: Session, n: number): Turn[] {
    const { turns } = session;
    if (turns.length <= n) return turns;
    return turns.slice(turns.length - n);
}

