# Plan — OpenLibrary-style Book Download Site (static, no database)

## Goal
A fast, light, GitHub-hosted book site with **5000 books**: metadata + direct
download links (EPUB/PDF). No database. Easy to add more books later.

## Constraints & decisions
| Topic | Decision | Why |
|---|---|---|
| Database | **None** — single `data/books.jsonl` | User requirement; 5000 rows is small |
| Language | **Node.js 24 (zero npm deps)** | Only runtime on this machine; GH Actions has it too |
| Hosting | **GitHub Pages (Actions deploy)** | Free, fast CDN, custom domain ready |
| Data source | **Internet Archive APIs** | openlibrary.org unreachable from this network; IA serves the actual files & has the metadata |
| Legal | Only items flagged `possible-copyright-status: NOT_IN_CREGISTRY` (public domain) and not access-restricted | Never redistribute copyrighted books |
| Framework | **Hand-built HTML/CSS/JS** (no React/Jekyll) | Fastest possible payload: ~40 KB CSS/JS total |
| Download links | Fetched at page-view time from `archive.org/metadata/{id}` (CORS `*`) | Keeps repo/site tiny; always fresh |
| Covers | `archive.org/services/img/{id}` (external, lazy-loaded) | Zero storage cost |

## Data pipeline

```
harvest.mjs                          build.mjs                     GitHub Pages
IA advancedsearch ──► data/    ──►   render static pages  ──►  dist/  ──►  live site
(50 pages × 100 books)  books.jsonl   + search index
```

### 1. `scripts/harvest.mjs` — collect metadata
- Query: `mediatype:texts AND possible-copyright-status:"NOT_IN_CREGISTRY"
  AND -access-restricted-item:true AND (format:EPUB OR format:"Text PDF" OR format:PDF)`
  + filters to drop periodicals/junk; sorted by `downloads desc` (popular first).
- 100 rows/page → 50 pages = 5000 candidates.
- Fields: identifier, title, creator, year, subject, language, description,
  publisher, downloads, openlibrary_work/edition (when present).
- **Dedupe**: by `openlibrary_work` if present, else normalized `title+author`
  (IA has many duplicate scans of the same book).
- **Incremental**: existing ids in `books.jsonl` are kept; new books appended →
  "add more books later" = run harvest with higher target, only new rows are fetched.
- Polite rate: ~4 req/s, retries with backoff.

### 2. `scripts/build.mjs` — generate static site → `dist/`
- `index.html` — hero + search + grid of featured books (most downloaded).
- `page/N/index.html` — browse pagination, 36 covers/page (~140 pages).
- `book/{id}/index.html` — **one static detail page per book** (SEO, works w/o JS;
  download buttons appear after a tiny JS enhancement).
- `data/index.json` — minimal search index `[[id,title,author,year],…]` (~300 KB,
  loaded lazily on first keystroke, client-side fuzzy-ish search).
- `sitemap.xml` (split), `robots.txt`, 404 page.
- Detail page download logic: JS queries `https://archive.org/metadata/{id}`,
  renders EPUB/PDF/DJVU/TXT buttons with file sizes; no-JS fallback = "Open at
  Archive.org" button.

### 3. Front-end (static, no build step)
- `assets/site.css` — dark/light, mobile-first grid, system fonts.
- `assets/search.js` — instant search over index (title/author/subject), keyboard nav.
- `assets/book.js` — lazy download buttons on detail pages.
- Images: `loading="lazy"`, explicit dimensions → no layout shift (LCP fast).

### 4. `.github/workflows/deploy.yml`
- On push + weekly cron:
  1. `node scripts/harvest.mjs` (incremental top-up, e.g. target +200)
  2. `node scripts/build.mjs`
  3. Deploy `dist/` via `actions/deploy-pages`.

## Adding more books later
```
node scripts/harvest.mjs --target 6000   # fetches only the ~1000 new ones
node scripts/build.mjs                    # regenerates site
git add -A && git commit && git push      # site updates automatically
```

## Verification
1. Small harvest (`--target 30`) → inspect `data/books.jsonl`.
2. `build.mjs` → check `dist/` page counts + open `index.html` locally.
3. Full harvest → target 5000 unique books.
4. Validate: every detail page has ≥1 download link (runtime fetch works,
   CORS confirmed `*`).
