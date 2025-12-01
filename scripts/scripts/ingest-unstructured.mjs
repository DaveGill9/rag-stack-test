// scripts/ingest-unstructured.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DIR = path.join(__dirname, '..', 'data', 'raw');
const STRUCTURED_DIR = path.join(__dirname, '..', 'data', 'structured');

const readDir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);
const writeFile = promisify(fs.writeFile);

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function ingestFile(filename) {
  const filePath = path.join(RAW_DIR, filename);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return;

  console.log(`Ingesting ${filename} with Unstructured...`);

  const fileStream = fs.createReadStream(filePath);
  const form = new FormData();
  form.append('files', fileStream);
  form.append('strategy', 'auto');
  form.append('output_format', 'application/json');

  const headers = {
    ...form.getHeaders(),
    'unstructured-api-key': process.env.UNSTRUCTURED_API_KEY,
  };

  const url = process.env.UNSTRUCTURED_API_URL;
  if (!url) {
    throw new Error('UNSTRUCTURED_API_URL is not set in .env');
  }

  const response = await axios.post(url, form, { headers });

  const outputPath = path.join(
    STRUCTURED_DIR,
    filename + '.json'
  );

  await writeFile(outputPath, JSON.stringify(response.data, null, 2), 'utf-8');
  console.log(`  → wrote ${outputPath}`);
}

async function main() {
  await ensureDir(STRUCTURED_DIR);

  const files = await readDir(RAW_DIR);
  if (files.length === 0) {
    console.log('No files in data/raw/. Drop 5–10 docs in there first.');
    return;
  }

  for (const file of files) {
    try {
      await ingestFile(file);
    } catch (err) {
      console.error(`Error ingesting ${file}:`, err.response?.data ?? err);
    }
  }

  console.log('Ingestion complete.');
}

main().catch((err) => {
  console.error('Fatal error in ingest script:', err);
  process.exit(1);
});
