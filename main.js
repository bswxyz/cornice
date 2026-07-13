/* ============================================================
   CORNICE — interactions
   Progressive enhancement: the page reads fully without JS.
   Signature: a live lift-status board (counting wait times +
   pulsing status pills) linked to an interactive SVG piste map
   (grade filter + hover/focus highlight). A falling-snow canvas
   drifts behind everything. No libraries.
   ============================================================ */
(() => {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const root = document.documentElement;

  /* ---------- theme toggle ---------- */
  const themeBtn = document.getElementById('themeBtn');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const syncTheme = () => {
    const dark = root.dataset.theme !== 'light';
    if (themeBtn) {
      themeBtn.setAttribute('aria-pressed', String(dark));
      themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    if (metaTheme) metaTheme.setAttribute('content', dark ? '#0e1620' : '#eef3f6');
  };
  syncTheme();
  themeBtn?.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('cornice-theme', root.dataset.theme); } catch (e) {}
    syncTheme();
  });

  /* ---------- hero intro ---------- */
  const hero = document.querySelector('.hero');
  requestAnimationFrame(() => { if (hero) hero.classList.add('loaded'); });

  /* ---------- reveals ---------- */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---------- animated counters (conditions + lift wait times) ---------- */
  const cio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target, to = parseFloat(el.dataset.to), dec = +(el.dataset.dec || 0);
      cio.unobserve(el);
      if (reduce) { el.textContent = to.toFixed(dec); continue; }
      const dur = 1300, t0 = performance.now();
      const tick = (t) => {
        const p = clamp((t - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);          /* cubic-out — a settle */
        el.textContent = (to * eased).toFixed(dec);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.6 });
  document.querySelectorAll('.c-num, .c-wait').forEach(el => cio.observe(el));

  /* ---------- board "updated" clock ---------- */
  const boardTime = document.getElementById('boardTime');
  if (boardTime) {
    const two = (n) => String(n).padStart(2, '0');
    const setTime = () => {
      const d = new Date();
      boardTime.textContent = two(d.getHours()) + ':' + two(d.getMinutes());
    };
    setTime();
    setInterval(setTime, 30000);
  }

  /* ============================================================
     Piste map — filter + linked hover/focus highlight
     ============================================================ */
  const pmap = document.getElementById('pistemap');
  const readout = document.getElementById('readout');
  if (pmap && readout) {
    const paths = pmap.querySelectorAll('.run');
    const rows = document.querySelectorAll('.run-row');
    const byId = new Map();
    paths.forEach(p => byId.set(p.dataset.run, { path: p, row: null, name: p.dataset.name, diff: p.dataset.diff, len: p.dataset.len }));
    rows.forEach(r => { const rec = byId.get(r.dataset.run); if (rec) rec.row = r; });

    const hint = readout.innerHTML;
    const activate = (id) => {
      const rec = byId.get(id); if (!rec) return;
      byId.forEach((o) => { o.path.classList.remove('is-active'); o.row && o.row.classList.remove('is-active'); });
      rec.path.classList.add('is-active');
      rec.path.parentNode.appendChild(rec.path);       /* bring highlighted run to front */
      if (rec.row) rec.row.classList.add('is-active');
      readout.innerHTML =
        '<span class="readout-name">' + rec.name + '</span>' +
        '<span class="readout-diff">' + rec.diff + '</span>' +
        '<span class="readout-len">' + rec.len + '</span>';
    };
    const clear = () => {
      byId.forEach((o) => { o.path.classList.remove('is-active'); o.row && o.row.classList.remove('is-active'); });
      readout.innerHTML = hint;
    };

    byId.forEach((rec, id) => {
      const hookP = rec.path, hookR = rec.row;
      hookP.addEventListener('pointerenter', () => activate(id));
      hookP.addEventListener('pointerleave', clear);
      if (hookR) {
        hookR.addEventListener('pointerenter', () => activate(id));
        hookR.addEventListener('pointerleave', clear);
        hookR.addEventListener('focus', () => activate(id));
        hookR.addEventListener('blur', clear);
      }
    });

    /* difficulty filter */
    const filters = document.querySelectorAll('.pf');
    filters.forEach(btn => {
      btn.addEventListener('click', () => {
        filters.forEach(b => { b.classList.remove('is-on'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('is-on'); btn.setAttribute('aria-pressed', 'true');
        pmap.dataset.filter = btn.dataset.filter;
        clear();
      });
    });
  }

  /* ---------- lift-pass demo picker (no checkout — see README) ---------- */
  const passFine = document.getElementById('passFine');
  document.querySelectorAll('[data-pass]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!passFine) return;
      passFine.textContent = '“' + btn.dataset.pass + '” selected — demo checkout, nothing is charged and no pass is issued.';
      passFine.classList.add('is-picked');
    });
  });

  /* ============================================================
     Falling snow — 2D canvas, DPR-capped, paused off-screen.
     Reduced motion draws a single settled frame (no rAF loop).
     ============================================================ */
  const canvas = document.getElementById('snow');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;                                     /* graceful: backdrop gradient remains */

  const DPR = Math.min(devicePixelRatio || 1, 1.5);
  let W = 0, H = 0, flakes = [];

  const build = () => {
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(W * DPR));
    canvas.height = Math.max(1, Math.floor(H * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const count = clamp(Math.round(W * H / 16000), 40, 150);
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.7,
      sp: Math.random() * 0.5 + 0.25,                   /* fall speed */
      dr: Math.random() * 0.6 - 0.3,                    /* horizontal drift */
      ph: Math.random() * Math.PI * 2
    }));
  };

  const paint = (sway) => {
    ctx.clearRect(0, 0, W, H);
    const light = root.dataset.theme === 'light';
    ctx.fillStyle = light ? 'rgba(120,150,175,0.55)' : 'rgba(231,238,244,0.85)';
    for (const f of flakes) {
      ctx.globalAlpha = clamp(f.r / 2.5, .3, 1);
      ctx.beginPath();
      ctx.arc(f.x + Math.sin(f.ph + sway) * 6, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const step = (dt) => {
    for (const f of flakes) {
      f.y += f.sp * dt;
      f.x += f.dr * dt * 0.4;
      f.ph += 0.01 * dt;
      if (f.y - f.r > H) { f.y = -4; f.x = Math.random() * W; }
      if (f.x < -12) f.x = W + 8; else if (f.x > W + 12) f.x = -8;
    }
  };

  build();
  addEventListener('resize', build);

  if (reduce) {
    paint(0);                                           /* one static, settled frame */
    return;
  }

  let running = true, visible = true, last = 0, acc = 0;
  const io2 = new IntersectionObserver((es) => {
    running = es[0].isIntersecting;
    if (running && visible) requestAnimationFrame(loop);
  }, { threshold: 0 });
  io2.observe(canvas);
  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
    if (visible && running) { last = 0; requestAnimationFrame(loop); }
  });

  function loop(t) {
    if (!running || !visible) return;
    if (!last) last = t;
    const delta = Math.min(t - last, 60);               /* clamp long gaps (bg tab) */
    last = t;
    acc += delta;
    if (acc >= 33) {                                    /* ~30fps */
      const frames = acc / 16.7;
      step(frames);
      paint(t / 1600);
      acc = 0;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
