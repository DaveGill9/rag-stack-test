import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import dotenv from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VECTORS_DIR = path.join(__dirname, '..', 'data', 'vectors_ready');

const readDir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);

const PINECONE_INDEX = process.env.PINECONE_INDEX;
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'v1';

if (!PINECONE_INDEX) {
  throw new Error('PINECONE_INDEX not set in .env');
}

async function main() {
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const index = pc.index(PINECONE_INDEX);
  const ns = index.namespace(PINECONE_NAMESPACE);

  const files = await readDir(VECTORS_DIR);
  const vectorFiles = files.filter((f) => f.endsWith('.vectors.ndjson'));

  if (vectorFiles.length === 0) {
    console.log('No vector files in data/vectors_ready/. Run npm run embed first.');
    return;
  }

  for (const f of vectorFiles) {
    const filePath = path.join(VECTORS_DIR, f);
    const raw = await readFile(filePath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);

    console.log(`Upserting ${lines.length} vectors from ${f}...`);

    const BATCH_SIZE = 100;
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const batchLines = lines.slice(i, i + BATCH_SIZE);
      const records = batchLines.map((line) => {
        const parsed = JSON.parse(line);
        return {
          id: parsed.id,
          values: parsed.values,
          metadata: {
            ...parsed.metadata,
            text: parsed.text, 
          },
        };
      });

      await ns.upsert(records);
      console.log(
        `  → upserted ${Math.min(i + BATCH_SIZE, lines.length)}/${lines.length}`
      );
    }
  }

  console.log('Upsert complete.');
}

main().catch((err) => {
  console.error('Fatal error in upsert script:', err);
  process.exit(1);
});
