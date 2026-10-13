/* OpenBook — lazy download buttons from archive.org/metadata/{id} (CORS-enabled) */
(() => {
  const art = document.querySelector('article.book[data-ia]');
  if (!art) return;
  const id = art.dataset.ia;
  const box = document.getElementById('dl');
  const note = document.getElementById('dl-note');
  if (!box) return;

  const WANT = [
    ['EPUB', ['epub'], 'EPUB'],
    ['PDF', ['text pdf', 'pdf', 'additional pdf'], 'PDF'],
    ['TXT', ['djvutxt', 'plain text', 'text'], 'TXT'],
  ];
  const fmtSize = (b) => {
    if (!b) return '';
    b = +b;
    return b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
  };

  fetch('https://archive.org/metadata/' + encodeURIComponent(id))
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((meta) => {
      const files = (meta.files || []).filter((f) => f.name && !/\.gz$/i.test(f.name));
      const btns = [];
      for (const [label, fmts, ext] of WANT) {
        const f = files.find((f) => fmts.includes((f.format || '').toLowerCase()));
        if (f) btns.push({ label, name: f.name, size: f.size });
      }
      if (!btns.length) return;
      box.innerHTML =
        btns.map((b) =>
          `<a class="btn primary" href="https://archive.org/download/${encodeURIComponent(id)}/${encodeURIComponent(b.name)}" download>${b.label}${b.size ? ` <span class="size">${fmtSize(b.size)}</span>` : ''}</a>`
        ).join('') +
        `<a class="btn" href="https://archive.org/download/${encodeURIComponent(id)}/" rel="noopener">All files →</a>`;
      note.textContent = 'Free download · public-domain file hosted by Internet Archive';
    })
    .catch(() => { /* keep fallback link */ });
})();
