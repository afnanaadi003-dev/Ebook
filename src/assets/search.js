/* OpenBook — instant client-side search over data/index.json */
(() => {
  const hdr = document.getElementById('q');
  const home = document.getElementById('hq');
  const results = document.getElementById('results');
  const browse = document.getElementById('browse');
  const isHome = !!(results && browse);
  const BASE = document.documentElement.dataset.base || '';
  const path = (p) => BASE + p;

  let idx = null, loading = null, q = '', shown = 0;
  const PAGE = 100;

  const loadIndex = () => (loading ||= fetch(path('/data/index.json')).then((r) => r.json()).then((d) => (idx = d)));

  const norm = (s) => (s || '').toLowerCase();

  function score(row, tokens) {
    const title = norm(row[1]), by = norm(row[2]), rest = norm(row[3] + ' ' + row[4]);
    let sc = 0;
    for (const t of tokens) {
      if (title.startsWith(t)) sc += 5;
      else if (title.includes(' ' + t)) sc += 4;
      else if (title.includes(t)) sc += 3;
      else if (by.includes(t)) sc += 2;
      else if (rest.includes(t)) sc += 1;
      else return -1;
    }
    return sc;
  }

  function search(query) {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (!tokens.length || !idx) return [];
    const out = [];
    idx.forEach((row, i) => {
      const s = score(row, tokens);
      if (s >= 0) out.push([s, i, row]);
    });
    out.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    return out.map((x) => x[2]);
  }

  function card(r) {
    const [id, title, authors, y] = r;
    return `<a class="card" href="${path('/book/' + encodeURIComponent(id) + '/')}">
      <div class="cover"><img src="https://archive.org/services/img/${encodeURIComponent(id)}" alt="Cover of ${esc(title)}" loading="lazy" width="200" height="300"></div>
      <h3>${esc(title)}</h3><p>${esc(authors.split(',')[0] || 'Unknown')} · ${y || 'n.d.'}</p></a>`;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let matches = [];
  function render(reset) {
    if (reset) { matches = search(q); shown = 0; }
    if (!q) {
      results.hidden = true;
      document.body.classList.remove('searching');
      if (browse) browse.hidden = false;
      results.innerHTML = '';
      return;
    }
    document.body.classList.add('searching');
    if (browse) browse.hidden = true;
    results.hidden = false;
    const slice = matches.slice(shown, shown + PAGE);
    const head = `<p class="res-count">${matches.length} result${matches.length === 1 ? '' : 's'} for “${esc(q)}”</p>`;
    const grid = `<div class="grid">${slice.map(card).join('')}</div>`;
    const more = shown + PAGE < matches.length
      ? `<div class="more"><button class="btn" id="moreBtn">Load ${Math.min(PAGE, matches.length - shown)} more</button></div>`
      : (matches.length === 0 ? '<p class="res-count">No books found. Try fewer/different words.</p>' : '');
    results.innerHTML = head + (matches.length ? grid : '') + more;
    shown += slice.length;
    const mb = document.getElementById('moreBtn');
    if (mb) mb.onclick = () => render(false);
  }

  async function onInput(v, submit) {
    q = v.trim();
    if (isHome) {
      if (q && !idx) await loadIndex();
      render(true);
      const u = new URL(location.href);
      q ? u.searchParams.set('q', q) : u.searchParams.delete('q');
      history.replaceState(null, '', u);
    } else if (submit && q) {
      location = path('/?q=') + encodeURIComponent(q);
    }
  }

  const bind = (el) => {
    if (!el) return;
    let timer;
    el.addEventListener('input', () => {
      if (!isHome) return;
      clearTimeout(timer);
      timer = setTimeout(() => onInput(el.value, false), 120);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(timer); e.preventDefault(); onInput(el.value, true); }
      if (e.key === 'Escape') { el.value = ''; onInput('', false); }
    });
    el.addEventListener('focus', () => { if (!idx && isHome) loadIndex(); }, { once: true });
  };
  bind(hdr); bind(home);

  // "/" focuses search
  addEventListener('keydown', (e) => {
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      e.preventDefault();
      hdr.focus();
    }
  });

  // deep link ?q=
  const init = new URL(location.href).searchParams.get('q');
  if (init) {
    const target = home || hdr;
    target.value = init;
    if (isHome) loadIndex().then(() => { q = init.trim(); render(true); });
    else location = path('/?q=') + encodeURIComponent(init);
  }
})();
