#!/usr/bin/env node
/**
 * harvest.mjs — collect public-domain book metadata from Internet Archive
 * into data/books.jsonl (incremental: only new books are fetched).
 *
 * Usage: node scripts/harvest.mjs [--target 5000]
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_FILE = path.join(ROOT, 'data', 'books.jsonl');
const PAGE_SIZE = 100;
const DELAY_MS = 300;

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const TARGET = parseInt(arg('target', '5000'), 10);

const QUERY =
  'mediatype:texts AND -access-restricted-item:true ' +
  'AND scanningcenter:[* TO *] AND year:[1400 TO 1930] AND creator:[* TO *] ' +
  'AND (possible-copyright-status:NOT_IN_COPYRIGHT OR possible-copyright-status:NOT_IN_CREGISTRY) ' +
  'AND (format:EPUB OR format:"Text PDF" OR format:PDF)';

const FIELDS = [
  'identifier', 'title', 'creator', 'year', 'subject', 'language',
  'downloads', 'publisher', 'description', 'openlibrary_work', 'openlibrary_edition',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clean = (v, max = 300) => {
  if (v == null) return null;
  const s = (Array.isArray(v) ? v[0] : v)
    .toString()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s ? s.slice(0, max) : null;
};
const list = (v, maxItems, maxLen = 80) => {
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return [...new Set(arr.map((x) => clean(x, maxLen)).filter(Boolean))].slice(0, maxItems);
};

const norm = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/g, ' ').trim();
function dedupeKey(rec) {
  const title = norm(rec.t).split(' ').slice(0, 8).join(' ');
  const author = rec.a?.[0] ? norm(rec.a[0]).split(' ')[0] : '';
  return rec.w ? 'w:' + rec.w : title + '|' + author;
}

async function fetchJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'OpenBookHarvester/1.0 (static book catalog)' } });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}

async function searchPage(page) {
  const p = new URLSearchParams();
  p.set('q', QUERY);
  FIELDS.forEach((f) => p.append('fl[]', f));
  p.append('rows', String(PAGE_SIZE));
  p.append('page', String(page));
  p.set('output', 'json');
  p.append('sort[]', 'downloads desc');
  const j = await fetchJson('https://archive.org/advancedsearch.php?' + p);
  return { docs: j.response?.docs || [], numFound: j.response?.numFound || 0 };
}

function toRecord(doc) {
  return {
    id: doc.identifier,
    t: clean(doc.title, 300),
    a: list(doc.creator, 4, 120),
    y: parseInt(doc.year, 10) || null,
    s: list(doc.subject, 8),
    l: list(doc.language, 3, 20),
    p: clean(doc.publisher, 160),
    d: clean(doc.description, 500),
    dl: doc.downloads | 0,
    w: clean(doc.openlibrary_work, 20),
    e: clean(doc.openlibrary_edition, 20),
  };
}

async function main() {
  const existing = [];
  if (existsSync(DATA_FILE)) {
    for (const line of (await readFile(DATA_FILE, 'utf8')).split('\n')) {
      if (line.trim()) {
        try { existing.push(JSON.parse(line)); } catch { /* skip */ }
      }
    }
  }
  const seenIds = new Set(existing.map((r) => r.id));
  const seenKeys = new Set(existing.map(dedupeKey));
  const needed = TARGET - existing.length;

  console.log(`Existing books: ${existing.length} | target: ${TARGET} | new needed: ${Math.max(0, needed)}`);
  if (needed <= 0) { console.log('Nothing to do.'); return; }

  const fresh = [];
  let page = 1, emptyStreak = 0;
  const maxPages = Math.ceil(needed / PAGE_SIZE) * 4 + 20;
  let numFound = 0;

  while (fresh.length < needed && emptyStreak < 25 && page <= maxPages) {
    const { docs, numFound: nf } = await searchPage(page);
    numFound = nf;
    if (!docs.length) break;
    let added = 0;
    for (const doc of docs) {
      if (!doc.identifier || seenIds.has(doc.identifier)) continue;
      const rec = toRecord(doc);
      if (!rec.t || !rec.a.length) continue;
      const key = dedupeKey(rec);
      if (seenKeys.has(key)) continue;
      seenIds.add(doc.identifier);
      seenKeys.add(key);
      fresh.push(rec);
      added++;
      if (fresh.length >= needed) break;
    }
    emptyStreak = added === 0 ? emptyStreak + 1 : 0;
    console.log(`page ${page}: +${added} (new total ${fresh.length}/${needed}) — pool ${numFound}`);
    page++;
    await sleep(DELAY_MS);
  }

  if (!fresh.length) { console.log('No new books found.'); return; }

  const all = existing.concat(fresh);
  const tmp = DATA_FILE + '.tmp';
  await writeFile(tmp, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
  await rename(tmp, DATA_FILE);
  console.log(`\nSaved ${fresh.length} new books → data/books.jsonl (total ${all.length})`);
}

main().catch((e) => { console.error('Harvest failed:', e.message); process.exit(1); });
