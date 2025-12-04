import { MongoClient, Db, Collection } from 'mongodb';
import type { Session } from './chat/session-store';

let client: MongoClient | null = null;
let db: Db | null = null;

async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  client = new MongoClient(uri);
  await client.connect();

  db = client.db();
  return db;
}

export async function getSessionsCollection(): Promise<Collection<Session>> {
  const database = await getDb();
  return database.collection<Session>('sessions');
}
