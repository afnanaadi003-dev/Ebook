/* OpenBook — lazy download/read buttons (keeps user on-site; archive.org is only the file host) */
(() => {
  const art = document.querySelector('article.book[data-ia]');
  if (!art) return;
  const id = art.dataset.ia;
  const box = document.getElementById('dl');
  const note = document.getElementById('dl-note');
  if (!box) return;
  const BASE = document.documentElement.dataset.base || '';
  const enc = encodeURIComponent;
  const detailsUrl = `https://archive.org/details/${enc(id)}`;
  const dirUrl = `https://archive.org/download/${enc(id)}/`;
  const title = (art.querySelector('h1')?.textContent || id).trim();

  const WANT = [
    ['EPUB', ['epub']],
    ['PDF', ['text pdf', 'pdf', 'additional pdf']],
    ['TXT', ['djvutxt', 'plain text', 'text']],
  ];
  const fmtSize = (b) => {
    if (!b) return '';
    b = +b;
    return b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
  };

  // In-page download: fetch → blob → object URL (stays on our domain).
  // Returns false if CORS/size block it → caller falls back to a new tab.
  async function tryInPageDownload(url, filename, btn) {
    try {
      const ctl = new AbortController();
      const kill = setTimeout(() => ctl.abort(), 60000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(kill);
      if (!r.ok) return false;
      const len = +(r.headers.get('content-length') || 0);
      if (len > 90 * 1024 * 1024) return false;
      const orig = btn.innerHTML;
      btn.innerHTML = 'Preparing…';
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 120000);
      btn.innerHTML = orig;
      return true;
    } catch {
      return false;
    }
  }

  function bindDownload(a, url, filename) {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      if (a.classList.contains('busy')) return;
      a.classList.add('busy');
      const ok = await tryInPageDownload(url, filename, a);
      a.classList.remove('busy');
      if (!ok) window.open(url, '_blank', 'noopener'); // our tab never navigates away
    });
  }

  fetch('https://archive.org/metadata/' + enc(id))
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((meta) => {
      const files = (meta.files || []).filter((f) => f.name && !/\.gz$/i.test(f.name));
      const btns = [];
      for (const [label, fmts] of WANT) {
        const f = files.find((f) => fmts.includes((f.format || '').toLowerCase()));
        if (f) btns.push({ label, name: f.name, size: f.size });
      }
      if (!btns.length) return;
      const readable = files.find((f) => /text pdf|pdf/.test((f.format || '').toLowerCase()))
        || files.find((f) => /djvutxt|plain text|^text$/.test((f.format || '').toLowerCase()));
      const readHref = `${BASE}/read/?ia=${enc(id)}&t=${enc(title)}` + (readable ? `&f=${enc(readable.name)}` : '');

      box.innerHTML =
        `<a class="btn primary" href="${readHref}">Read online</a>` +
        btns.map((b) =>
          `<a class="btn primary" href="https://archive.org/download/${enc(id)}/${enc(b.name)}">${b.label}${b.size ? ` <span class="size">${fmtSize(b.size)}</span>` : ''}</a>`
        ).join('') +
        `<a class="btn" href="${dirUrl}" target="_blank" rel="noopener">All files ↗</a>`;
      note.textContent = 'Free download · public-domain file hosted by Internet Archive';

      const links = box.querySelectorAll('a');
      let i = 1; // links[0] = Read online
      for (const b of btns) bindDownload(links[i++], `https://archive.org/download/${enc(id)}/${enc(b.name)}`, b.name);
    })
    .catch(() => { /* keep no-JS fallback */ });
})();
