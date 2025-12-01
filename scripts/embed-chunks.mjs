import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHUNKS_DIR = path.join(__dirname, '..', 'data', 'chunks');
const VECTORS_DIR = path.join(__dirname, '..', 'data', 'vectors_ready');

const readDir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const BATCH_SIZE = 50;

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function embedChunksFile(filename) {
  const filePath = path.join(CHUNKS_DIR, filename);
  const raw = await readFile(filePath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const chunks = lines.map((line) => JSON.parse(line));

  console.log(`Embedding ${filename} (${chunks.length} chunks)...`);

  const outPath = path.join(
    VECTORS_DIR,
    filename.replace('.chunks.ndjson', '.vectors.ndjson')
  );

  const outStream = fs.createWriteStream(outPath, { encoding: 'utf-8' });

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((c) => c.text),
    });

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = response.data[j].embedding;

      const record = {
        id: chunk.id,
        values: embedding,
        metadata: chunk.metadata,
        text: chunk.text, // optional but handy for debugging
      };

      outStream.write(JSON.stringify(record) + '\n');
    }

    console.log(`  → embedded ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length}`);
  }

  outStream.end();
  console.log(`Wrote vectors to ${outPath}`);
}

async function main() {
  await ensureDir(VECTORS_DIR);

  const files = await readDir(CHUNKS_DIR);
  const ndjsonFiles = files.filter((f) => f.endsWith('.chunks.ndjson'));

  if (ndjsonFiles.length === 0) {
    console.log('No chunk files in data/chunks/. Run npm run chunk first.');
    return;
  }

  for (const f of ndjsonFiles) {
    try {
      await embedChunksFile(f);
    } catch (err) {
      console.error(`Error embedding ${f}:`, err.response?.data ?? err);
    }
  }

  console.log('Embedding complete.');
}

main().catch((err) => {
  console.error('Fatal error in embed script:', err);
  process.exit(1);
});
