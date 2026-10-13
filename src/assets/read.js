/* OpenBook reader — embedded Internet Archive viewer under our own domain */
(() => {
  const p = new URLSearchParams(location.search);
  const ia = p.get('ia'), f = p.get('f'), t = p.get('t');
  const BASE = document.documentElement.dataset.base || '';
  const enc = encodeURIComponent;
  const frame = document.getElementById('rf');
  const back = document.getElementById('rback');
  const titleEl = document.getElementById('rtitle');
  const dl = document.getElementById('rdl');
  const iaLink = document.getElementById('ria');
  const note = document.getElementById('rnote');
  if (!frame) return;
  if (!ia) { if (note) note.textContent = 'Missing book id — go back and pick a book.'; return; }

  const detailsUrl = `https://archive.org/details/${enc(ia)}`;
  const fileUrl = f ? `https://archive.org/download/${enc(ia)}/${enc(f)}` : null;
  const renderable = fileUrl && !/\.epub$/i.test(f);

  titleEl.textContent = t || ia;
  frame.src = renderable ? fileUrl : detailsUrl;
  note.textContent = renderable
    ? `Viewing ${f} — public-domain file hosted by Internet Archive`
    : 'Reading in the Internet Archive viewer';
  iaLink.href = detailsUrl;
  dl.href = fileUrl || detailsUrl;
  if (f) dl.setAttribute('download', f.split('/').pop());

  back.href = document.referrer && new URL(document.referrer).origin === location.origin
    ? document.referrer : (BASE + '/');
  back.addEventListener('click', (e) => {
    if (back.getAttribute('href') !== BASE + '/') { e.preventDefault(); history.back(); }
  });

  async function inPage(url, filename, btn) {
    try {
      const ctl = new AbortController();
      const kill = setTimeout(() => ctl.abort(), 60000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(kill);
      if (!r.ok) return false;
      if (+(r.headers.get('content-length') || 0) > 90 * 1024 * 1024) return false;
      const orig = btn.textContent;
      btn.textContent = 'Preparing…';
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || url.split('/').pop();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 120000);
      btn.textContent = orig;
      return true;
    } catch { return false; }
  }

  dl.addEventListener('click', async (e) => {
    e.preventDefault();
    if (dl.classList.contains('busy')) return;
    dl.classList.add('busy');
    const ok = await inPage(dl.href, f ? f.split('/').pop() : '', dl);
    dl.classList.remove('busy');
    if (!ok) window.open(dl.href, '_blank', 'noopener');
  });
})();
