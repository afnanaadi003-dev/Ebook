#!/usr/bin/env node
/**
 * build.mjs — generate the static site into dist/
 * Usage: node scripts/build.mjs
 */
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data', 'books.jsonl');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const SITE = { name: 'OpenBook', url: '', perPage: 36 };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const year = (r) => (r.y ? String(r.y) : 'n.d.');
const authorLine = (r) => (r.a?.length ? r.a.join(', ') : 'Unknown author');
const coverUrl = (id) => `https://archive.org/services/img/${enc(id)}`;
const bookUrl = (id) => `/book/${enc(id)}/`;
const langName = { eng: 'English', fre: 'French', ger: 'German', spa: 'Spanish', ita: 'Italian', rus: 'Russian', lat: 'Latin', gre: 'Greek', dut: 'Dutch', por: 'Portuguese', ara: 'Arabic', hin: 'Hindi', chi: 'Chinese', jpn: 'Japanese', swe: 'Swedish', dan: 'Danish', nor: 'Norwegian', pol: 'Polish', cze: 'Czech', hun: 'Hungarian', fin: 'Finnish', tur: 'Turkish', heb: 'Hebrew', grc: 'Ancient Greek', san: 'Sanskrit' };
const langs = (r) => (r.l || []).map((l) => langName[String(l).toLowerCase()] || l).join(', ');

function pager(current, total, base) {
  if (total <= 1) return '';
  const win = [];
  const push = (n) => win.push(`<a class="${n === current ? 'on' : ''}" href="${n === 1 ? '/' : base + n + '/'}">${n}</a>`);
  const from = Math.max(1, current - 3), to = Math.min(total, current + 3);
  if (from > 1) { push(1); if (from > 2) win.push('<span>…</span>'); }
  for (let n = from; n <= to; n++) push(n);
  if (to < total) { if (to < total - 1) win.push('<span>…</span>'); push(total); }
  const prev = current > 1 ? `<a class="pg-arrow" href="${current === 2 ? '/' : base + (current - 1) + '/'}">‹ Prev</a>` : '<span class="pg-arrow off">‹ Prev</span>';
  const next = current < total ? `<a class="pg-arrow" href="${base + (current + 1) + '/'}">Next ›</a>` : '<span class="pg-arrow off">Next ›</span>';
  return `<nav class="pager" aria-label="Pagination">${prev}${win.join('')}${next}</nav>`;
}

function card(r) {
  return `<a class="card" href="${bookUrl(r.id)}">
    <div class="cover"><img src="${coverUrl(r.id)}" alt="Cover of ${esc(r.t)}" loading="lazy" width="200" height="300"></div>
    <h3>${esc(r.t)}</h3>
    <p>${esc(r.a?.[0] || 'Unknown')} · ${year(r)}</p>
  </a>`;
}

function layout({ title, desc, body, canonical = '/', jsonld = '', bookJs = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE.url}${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ''}
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="logo" href="/"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>${SITE.name}</a>
    <input id="q" type="search" placeholder="Search 5,000+ free books… (press /)" autocomplete="off" aria-label="Search books">
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="foot"><div class="wrap">
  <p><strong>${SITE.name}</strong> — free public-domain books. Metadata &amp; files provided by the <a href="https://archive.org" rel="noopener">Internet Archive</a> and <a href="https://openlibrary.org" rel="noopener">Open Library</a>. Only items verified as public domain are listed.</p>
  <p class="muted">${new Date().toISOString().slice(0, 10)} · <a href="/sitemap.xml">Sitemap</a></p>
</div></footer>
<script src="/assets/search.js" defer></script>
${bookJs ? '<script src="/assets/book.js" defer></script>' : ''}
</body>
</html>`;
}

async function main() {
  if (!existsSync(DATA)) { console.error('data/books.jsonl not found — run harvest first'); process.exit(1); }
  const raw = await readFile(DATA, 'utf8');
  const books = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  books.sort((a, b) => (b.dl || 0) - (a.dl || 0) || a.t.localeCompare(b.t));
  console.log(`Loaded ${books.length} books`);

  await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, 'assets'), { recursive: true });
  await mkdir(path.join(DIST, 'data'), { recursive: true });

  // ---- search index: [id, title, authors, year, subjects] ----
  const index = books.map((r) => [r.id, r.t, (r.a || []).join(', '), r.y || '', (r.s || []).slice(0, 5).join(', ')]);
  await writeFile(path.join(DIST, 'data', 'index.json'), JSON.stringify(index));
  console.log(`index.json: ${(JSON.stringify(index).length / 1024).toFixed(0)} KB`);

  // ---- subject stats ----
  const subjMap = new Map();
  for (const r of books) for (const s of r.s || []) {
    const k = s.length > 60 ? s.slice(0, 60) : s;
    subjMap.set(k, (subjMap.get(k) || 0) + 1);
  }
  const subjects = [...subjMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 48);

  // ---- related books by subject ----
  const bySubject = new Map();
  for (const r of books) for (const s of (r.s || []).slice(0, 5)) {
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push(r);
  }

  const pages = Math.ceil(books.length / SITE.perPage);
  const latest = books[0];

  // ---- home ----
  const homeBody = `
<section class="hero">
  <h1>${SITE.name}</h1>
  <p class="tag">5,000+ public-domain books — read &amp; download free (EPUB · PDF · TXT)</p>
  <input id="hq" type="search" class="big" placeholder="Search by title, author, or subject…" autocomplete="off" aria-label="Search books">
  <div class="chips">${subjects.map(([s, n]) => `<a class="chip" href="/?q=${enc(s)}">${esc(s)} <span>${n}</span></a>`).join('')}</div>
</section>
<section id="results" hidden aria-live="polite"></section>
<section id="browse">
  <h2>Most downloaded</h2>
  <div class="grid">${books.slice(0, SITE.perPage * 2).map(card).join('')}</div>
  ${pager(1, pages, '/page/')}
  ${pages > 1 ? `<p class="browse-all"><a class="btn" href="/page/2/">Browse all ${books.length} books →</a></p>` : ''}
</section>`;
  await writeFile(path.join(DIST, 'index.html'), layout({
    title: `${SITE.name} — ${books.length}+ Free Public-Domain Books (EPUB/PDF)`,
    desc: `Download over ${books.length} free public-domain books as EPUB, PDF or TXT. Search by title, author or subject. Files hosted by the Internet Archive.`,
    body: homeBody,
  }));

  // ---- list pages ----
  for (let p = 2; p <= pages; p++) {
    const slice = books.slice((p - 1) * SITE.perPage, p * SITE.perPage);
    const body = `<h2>Browse books — page ${p}</h2>
<div class="grid">${slice.map(card).join('')}</div>
${pager(p, pages, '/page/')}`;
    await mkdir(path.join(DIST, 'page', String(p)), { recursive: true });
    await writeFile(path.join(DIST, 'page', String(p), 'index.html'), layout({
      title: `Browse books — page ${p} of ${pages} | ${SITE.name}`,
      desc: `Free public-domain book catalog, page ${p} of ${pages}.`,
      body, canonical: `/page/${p}/`,
    }));
  }

  // ---- book detail pages ----
  let n = 0;
  for (const r of books) {
    const dir = path.join(DIST, 'book', enc(r.id));
    await mkdir(dir, { recursive: true });
    const related = (r.s || []).length
      ? [...new Set((r.s || []).slice(0, 5).flatMap((s) => bySubject.get(s) || []))]
          .filter((x) => x.id !== r.id).slice(0, 6)
      : books.slice(1, 7);
    const jsonld = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Book',
      name: r.t, author: (r.a || []).map((a) => ({ '@type': 'Person', name: a })),
      datePublished: r.y || undefined, inLanguage: r.l || undefined,
      image: coverUrl(r.id), url: SITE.url + bookUrl(r.id),
    });
    const body = `
<nav class="crumbs"><a href="/">Home</a> › <span>${esc(r.t)}</span></nav>
<article class="book" data-ia="${esc(r.id)}">
  <div class="book-cover"><img src="${coverUrl(r.id)}" alt="Cover: ${esc(r.t)}" width="300" height="450"></div>
  <div class="book-info">
    <h1>${esc(r.t)}</h1>
    <p class="by">${(r.a || []).map((a) => `<a href="/?q=${enc(a)}">${esc(a)}</a>`).join(' · ')}</p>
    <div class="dl-card">
      <h2>Download</h2>
      <div id="dl" class="dl-buttons"><a class="btn primary" href="https://archive.org/details/${enc(r.id)}" rel="noopener">View &amp; download at Archive.org →</a></div>
      <p class="muted" id="dl-note">Public-domain file · hosted by Internet Archive</p>
    </div>
    <table class="meta">
      ${r.y ? `<tr><th>First published</th><td>${r.y}</td></tr>` : ''}
      ${r.p ? `<tr><th>Publisher</th><td>${esc(r.p)}</td></tr>` : ''}
      ${langs(r) ? `<tr><th>Language</th><td>${esc(langs(r))}</td></tr>` : ''}
      <tr><th>Format</th><td>EPUB · PDF · TXT (availability varies)</td></tr>
      <tr><th>Source</th><td><a href="https://archive.org/details/${enc(r.id)}" rel="noopener">Internet Archive</a>${r.w ? ` · <a href="https://openlibrary.org/works/${enc(r.w)}" rel="noopener">Open Library</a>` : ''}</td></tr>
    </table>
    ${(r.s || []).length ? `<div class="chips">${r.s.map((s) => `<a class="chip" href="/?q=${enc(s)}">${esc(s)}</a>`).join('')}</div>` : ''}
  </div>
</article>
${r.d ? `<section class="desc"><h2>About this book</h2><p>${esc(r.d)}</p></section>` : ''}
<section class="related"><h2>Related books</h2><div class="grid">${related.map(card).join('')}</div></section>`;
    await writeFile(path.join(dir, 'index.html'), layout({
      title: `${r.t} by ${(r.a?.[0] || 'Unknown')} (${year(r)}) — Free EPUB/PDF | ${SITE.name}`,
      desc: `Download “${r.t}” free — public-domain EPUB, PDF and TXT from the Internet Archive.`,
      body, canonical: bookUrl(r.id), jsonld, bookJs: true,
    }));
    if (++n % 500 === 0) console.log(`  ${n} book pages…`);
  }

  // ---- 404 ----
  await writeFile(path.join(DIST, '404.html'), layout({
    title: 'Page not found | ' + SITE.name, desc: 'Page not found.',
    body: `<section class="hero"><h1>404</h1><p class="tag">Page not found.</p><p><a class="btn" href="/">← Back to all books</a></p></section>`,
  }));

  // ---- robots + sitemap ----
  await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE.url}/sitemap.xml\n`);
  const urls = ['/', ...Array.from({ length: pages - 1 }, (_, i) => `/page/${i + 2}/`),
    ...books.map((r) => bookUrl(r.id))];
  const sm = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `<url><loc>${SITE.url}${u}</loc></url>`).join('\n') + `\n</urlset>\n`;
  await writeFile(path.join(DIST, 'sitemap.xml'), sm);

  // ---- assets ----
  await cp(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });

  console.log(`Built dist/: ${books.length} books, ${pages - 1} list pages, ${books.length} detail pages, sitemap ${urls.length} URLs`);
}

main().catch((e) => { console.error('Build failed:', e); process.exit(1); });
