import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = new URL('../api/', import.meta.url);
const MAX_TARGET = 8;
const HARD_LIMIT = 12;

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryUrl));
      continue;
    }
    if (/\.(js|ts|py)$/.test(entry.name)) {
      files.push(fileURLToPath(entryUrl));
    }
  }
  return files;
}

const files = await collectFiles(API_DIR);
console.log(`API function files: ${files.length}`);
for (const file of files.sort()) {
  console.log(`- ${path.relative(process.cwd(), file)}`);
}

if (files.length > HARD_LIMIT) {
  console.error(`Function count exceeds Hobby hard limit (${HARD_LIMIT}).`);
  process.exit(1);
}

if (files.length > MAX_TARGET) {
  console.error(`Function count exceeds HomeHub target (${MAX_TARGET}). Consolidate routes before shipping.`);
  process.exit(1);
}

console.log('Function count is within HomeHub limits.');
