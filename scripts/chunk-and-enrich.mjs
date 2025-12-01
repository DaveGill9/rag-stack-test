import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STRUCTURED_DIR = path.join(__dirname, '..', 'data', 'structured');
const CHUNKS_DIR = path.join(__dirname, '..', 'data', 'chunks');

const readDir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);

const TARGET_WORDS_MIN = 250; 
const TARGET_WORDS_MAX = 600;

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

function hashText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function basenameNoExt(filename) {
  const ext = path.extname(filename);
  return path.basename(filename, ext);
}

function approxWordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function buildChunks(elements, docId, sourcePath) {
  const chunks = [];
  let currentText = '';
  let currentPages = [];
  let chunkIndex = 0;

  const flushChunk = () => {
    const trimmed = currentText.trim();
    if (!trimmed) return;

    const words = approxWordCount(trimmed);
    const pageFrom = currentPages.length ? Math.min(...currentPages) : null;
    const pageTo = currentPages.length ? Math.max(...currentPages) : null;
    const chunkId = `${docId}-chunk-${String(chunkIndex).padStart(4, '0')}`;

    const metadata = {
      doc_id: docId,
      chunk_id: chunkId,
      source_path: sourcePath,
      page_from: pageFrom,
      page_to: pageTo,
      created_at: new Date().toISOString(),
      version: 'v1',
      text_hash: hashText(trimmed),
    };

    chunks.push({
      id: chunkId,
      doc_id: docId,
      chunk_index: chunkIndex,
      text: trimmed,
      metadata,
    });

    chunkIndex += 1;
    currentText = '';
    currentPages = [];
  };

  for (const el of elements) {
    const text = el.text ?? '';
    if (!text.trim()) continue;

    const pageNumber = el.metadata?.page_number ?? el.page_number;
    if (pageNumber != null) currentPages.push(pageNumber);

    const prospective = (currentText + '\n\n' + text).trim();
    const wc = approxWordCount(prospective);

    if (wc > TARGET_WORDS_MAX && currentText) {
      flushChunk();
      currentText = text;
      currentPages = [];
      if (pageNumber != null) currentPages.push(pageNumber);
    } else {
      currentText = prospective;
    }

    if (approxWordCount(currentText) >= TARGET_WORDS_MIN) {
      flushChunk();
    }
  }

  flushChunk();
  return chunks;
}

async function processFile(filename) {
  const filePath = path.join(STRUCTURED_DIR, filename);
  const raw = await readFile(filePath, 'utf-8');
  let elements;

  try {
    elements = JSON.parse(raw);
  } catch (err) {
    console.error(`Could not parse JSON for ${filename}`, err);
    return;
  }

  if (!Array.isArray(elements)) {
    console.error(`Expected array in ${filename}, got`, typeof elements);
    return;
  }

  const docId = basenameNoExt(filename);
  const sourcePath = filename.replace(/\.json$/, '');
  const chunks = buildChunks(elements, docId, sourcePath);

  if (chunks.length === 0) {
    console.warn(`No chunks created for ${filename}`);
    return;
  }

  const outPath = path.join(CHUNKS_DIR, `${docId}.chunks.ndjson`);
  const lines = chunks.map((c) => JSON.stringify(c));
  await writeFile(outPath, lines.join('\n'), 'utf-8');

  console.log(`Chunked ${filename} → ${chunks.length} chunks → ${outPath}`);
}

async function main() {
  await ensureDir(CHUNKS_DIR);

  const files = await readDir(STRUCTURED_DIR);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('No JSON files in data/structured/. Run npm run ingest first.');
    return;
  }

  for (const f of jsonFiles) {
    try {
      await processFile(f);
    } catch (err) {
      console.error(`Error chunking ${f}:`, err);
    }
  }

  console.log('Chunking complete.');
}

main().catch((err) => {
  console.error('Fatal error in chunk script:', err);
  process.exit(1);
});
