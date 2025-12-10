// apps/backend/src/session-store.ts
import crypto from 'crypto';
import { getSessionsCollection } from 'src/config/mongo';

export type Role = 'user' | 'assistant';

export type Turn = {
  role: Role;
  content: string;
  sources?: {
    id: string;
    score?: number;
    metadata?: any;
  }[];
};

export type Session = {
  id: string;
  turns: Turn[];
  createdAt: string;
  updatedAt: string;
};

//Create a new session in Mongo
export async function createSession(): Promise<Session> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const session: Session = {
    id,
    turns: [],
    createdAt: now,
    updatedAt: now,
  };

  const col = await getSessionsCollection();
  await col.insertOne(session);

  return session;
}

//Get an existing session from Mongo
export async function getSession(id?: string | null): Promise<Session | null> {
  if (!id) return null;
  const col = await getSessionsCollection();
  const session = await col.findOne({ id });
  return session ?? null;
}

//Append a turn and write back to Mongo
export async function upsertSessionTurn(
  session: Session,
  turn: Turn,
): Promise<Session> {
  const updated: Session = {
    ...session,
    turns: [...session.turns, turn],
    updatedAt: new Date().toISOString(),
  };

  const col = await getSessionsCollection();
  await col.updateOne(
    { id: session.id },
    {
      $set: {
        turns: updated.turns,
        updatedAt: updated.updatedAt,
      },
    },
    { upsert: true },
  );

  return updated;
}

//Just slices the turns array in memory
export function getRecentTurns(session: Session, n: number): Turn[] {
  const { turns } = session;
  if (turns.length <= n) return turns;
  return turns.slice(turns.length - n);
}
