# OpenBook — static book-download site (no database)

A fast, light, GitHub-hosted catalog of **5,000+ free public-domain books**
(EPUB · PDF · TXT), inspired by Open Library. Pure static HTML/CSS/JS —
no framework, no database, ~40 KB of code total.

## How it works

```
scripts/harvest.mjs  →  data/books.jsonl  →  scripts/build.mjs  →  dist/  →  GitHub Pages
   (Internet Archive      (single file,       (static pages +        (5,000 detail pages,
    metadata API,           committed)          search index)          138 list pages)
    public-domain only)
```

- **Metadata & files** come from the Internet Archive. Only items verified as
  public domain are included (`possible-copyright-status: NOT_IN_COPYRIGHT`,
  not access-restricted, scanned by library centers, published ≤ 1930).
- **Download buttons** are fetched live from `archive.org/metadata/{id}`
  (CORS-enabled), so the repo stays small and links stay fresh.
- **Search** is instant, client-side, over a lazy-loaded 1 MB index — works
  fully offline from the static host.

## Commands

```bash
node scripts/harvest.mjs --target 5000   # fetch/extend data/books.jsonl (incremental)
node scripts/build.mjs                   # generate dist/
node scripts/serve.mjs                   # preview at http://localhost:8080
```

Or: `npm run harvest`, `npm run build`, `npm run serve` (Node ≥ 20, zero deps).

## Adding more books later

```bash
node scripts/harvest.mjs --target 6000   # only the new ~1000 books are fetched
node scripts/build.mjs
git add -A && git commit -m "chore: grow catalog to 6000 books" && git push
```

## Publish on GitHub (one time)

1. Create a new **public** repo and push:
   ```bash
   git init && git add -A && git commit -m "OpenBook site"
   git branch -M main
   git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
   git push -u origin main
   ```
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on
   every push, and runs a **weekly top-up** (+200 books) automatically.

## Project layout

| Path | Purpose |
|---|---|
| `plan.md` | Architecture and decisions |
| `scripts/harvest.mjs` | Collects metadata → `data/books.jsonl` (incremental, deduped) |
| `scripts/build.mjs` | Generates all static pages into `dist/` |
| `scripts/serve.mjs` | Tiny local preview server |
| `src/assets/` | `site.css`, `search.js`, `book.js` (hand-written, no deps) |
| `data/books.jsonl` | The "database": one JSON book per line, committed |
| `.github/workflows/deploy.yml` | Build + deploy + weekly harvest |

## Legal

Only Internet Archive items flagged as public domain are listed; files are
**linked**, never re-hosted. Metadata © Internet Archive / Open Library
respective licenses.
