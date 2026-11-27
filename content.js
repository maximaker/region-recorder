// Page overlay, in three steps:
//   select  – drag to draw an area (Enter records the whole view)
//   adjust  – move/resize it, pick a shape, then Record
//   record  – red frame + Stop button just outside the area, and (optionally)
//             a cursor ring and click ripples drawn inside it so they show
//             up in the video (tab capture leaves out the real pointer).

(() => {
  if (window.__regionRecorder) window.__regionRecorder.destroy();

  const MIN = 16;
  const RATIOS = [['Free', null], ['16:9', 16 / 9], ['1:1', 1], ['9:16', 9 / 16]];
  const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

  const host = document.createElement('region-recorder-ui');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; }
      .ui { position: fixed; inset: 0; }
      .layer { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: rgba(0,0,0,.45); }
      .layer.clear { background: transparent; }
      .box { position: fixed; display: none; outline: 1px solid #fff; box-shadow: 0 0 0 100vmax rgba(0,0,0,.45); }
      .adjust .box { pointer-events: auto; cursor: move; }
      .size { position: absolute; left: 0; top: -26px; color: #fff; background: rgba(20,20,20,.85); padding: 3px 7px; border-radius: 5px; white-space: nowrap; pointer-events: none; }
      .handle { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; background: #fff; border: 2px solid #d93025; border-radius: 3px; display: none; }
      .adjust .handle { display: block; }
      .handle[data-dir=n]  { left: 50%;  top: 0;    cursor: ns-resize; }
      .handle[data-dir=s]  { left: 50%;  top: 100%; cursor: ns-resize; }
      .handle[data-dir=e]  { left: 100%; top: 50%;  cursor: ew-resize; }
      .handle[data-dir=w]  { left: 0;    top: 50%;  cursor: ew-resize; }
      .handle[data-dir=ne] { left: 100%; top: 0;    cursor: nesw-resize; }
      .handle[data-dir=sw] { left: 0;    top: 100%; cursor: nesw-resize; }
      .handle[data-dir=nw] { left: 0;    top: 0;    cursor: nwse-resize; }
      .handle[data-dir=se] { left: 100%; top: 100%; cursor: nwse-resize; }
      .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); color: #fff; background: rgba(20,20,20,.88); padding: 8px 14px; border-radius: 8px; white-space: nowrap; }
      .bar { position: fixed; display: none; align-items: center; gap: 6px; padding: 6px; border-radius: 10px; background: rgba(20,20,20,.92); color: #fff; pointer-events: auto; box-shadow: 0 4px 16px rgba(0,0,0,.35); white-space: nowrap; }
      .adjust .bar { display: flex; }
      .bar.hidden { display: none !important; }
      .seg { display: flex; background: rgba(255,255,255,.1); border-radius: 7px; padding: 2px; }
      button { font: inherit; border: 0; border-radius: 6px; cursor: pointer; height: 30px; padding: 0 10px; color: #fff; }
      .seg button { background: transparent; height: 26px; color: #ddd; }
      .seg button[aria-pressed=true] { background: #fff; color: #111; }
      .ghost { background: transparent; border: 1px solid rgba(255,255,255,.35); }
      .ghost:hover { background: rgba(255,255,255,.1); }
      .rec { background: #d93025; display: flex; align-items: center; gap: 7px; font-weight: 600; }
      .rec:hover { background: #b3261e; }
      .rec .dot { width: 9px; height: 9px; border-radius: 50%; background: #fff; }
      .keys { color: #aaa; padding: 0 4px; }
      .frame { position: fixed; border: 2px solid #d93025; pointer-events: none; }
      .stop { position: fixed; pointer-events: auto; height: 32px; padding: 0 12px; background: #d93025; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
      .stop:hover { background: #b3261e; }
      .stop i { width: 10px; height: 10px; background: #fff; border-radius: 2px; }
      .ring { position: fixed; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; pointer-events: none; display: none;
              background: rgba(255, 196, 0, .28); border: 2px solid rgba(255, 170, 0, .9); transition: transform .08s ease-out; }
      .ring.down { transform: scale(.75); background: rgba(255, 170, 0, .5); }
      .ripple { position: fixed; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; pointer-events: none;
                border: 3px solid rgba(255, 150, 0, .95); animation: ripple .5s ease-out forwards; }
      @keyframes ripple { from { transform: scale(.2); opacity: 1; } to { transform: scale(1); opacity: 0; } }
    </style>`;
  document.documentElement.appendChild(host);

  const el = (cls, tag = 'div', text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
  const viewport = () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  let cleanup = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  };

  let showClicks = true;
  chrome.storage?.sync.get({ showClicks: true }).then((s) => { showClicks = s.showClicks; }).catch(() => {});

  // ---------- elements ----------

  const ui = el('ui');
  const layer = el('layer');
  const box = el('box');
  const size = el('size');
  const hint = el('hint', 'div', 'Drag to choose an area · Enter records the whole view · Esc cancels');
  box.append(size);
  for (const dir of DIRS) {
    const h = el('handle');
    h.dataset.dir = dir;
    box.append(h);
  }

  const bar = el('bar');
  const seg = el('seg');
  const ratioButtons = RATIOS.map(([label, value]) => {
    const b = el('', 'button', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(value === null));
    b.addEventListener('click', () => setRatio(value));
    seg.append(b);
    return [b, value];
  });
  const cancelBtn = el('ghost', 'button', 'Cancel');
  const recBtn = el('rec', 'button');
  recBtn.append(el('dot', 'span'), document.createTextNode('Record'));
  bar.append(seg, el('keys', 'span', 'Enter ↵'), cancelBtn, recBtn);
  cancelBtn.addEventListener('click', cancel);
  recBtn.addEventListener('click', () => rect && record(rect));
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());

  ui.append(layer, box, bar, hint);
  root.append(ui);

  // ---------- geometry ----------

  let phase = 'select';
  let rect = null;
  let ratio = null;
  let drag = null;

  function fitsViewport(r) {
    return r.x >= 0 && r.y >= 0 && r.x + r.w <= innerWidth + 0.5 && r.y + r.h <= innerHeight + 0.5;
  }

  function drawRect(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    let w = Math.abs(dx), h = Math.abs(dy);
    if (ratio) { w = Math.max(w, h * ratio); h = w / ratio; }
    const r = { x: dx < 0 ? x0 - w : x0, y: dy < 0 ? y0 - h : y0, w, h };
    if (ratio) return fitsViewport(r) ? r : null;
    const x = clamp(r.x, 0, innerWidth), y = clamp(r.y, 0, innerHeight);
    return { x, y, w: clamp(r.x + r.w, 0, innerWidth) - x, h: clamp(r.y + r.h, 0, innerHeight) - y };
  }

  function resizeRect(s, dir, dx, dy) {
    let l = s.x, t = s.y, r = s.x + s.w, b = s.y + s.h;
    if (dir.includes('w')) l = Math.min(l + dx, r - MIN);
    if (dir.includes('e')) r = Math.max(r + dx, l + MIN);
    if (dir.includes('n')) t = Math.min(t + dy, b - MIN);
    if (dir.includes('s')) b = Math.max(b + dy, t + MIN);
    l = Math.max(0, l); t = Math.max(0, t); r = Math.min(innerWidth, r); b = Math.min(innerHeight, b);
    let w = r - l, h = b - t;
    if (!ratio) return { x: l, y: t, w, h };

    const horiz = /[ew]/.test(dir), vert = /[ns]/.test(dir);
    if (horiz && vert) { if (w / h > ratio) w = h * ratio; else h = w / ratio; }
    else if (horiz) h = w / ratio;
    else w = h * ratio;
    const x = dir.includes('w') ? r - w : dir.includes('e') ? l : s.x + s.w / 2 - w / 2;
    const y = dir.includes('n') ? b - h : dir.includes('s') ? t : s.y + s.h / 2 - h / 2;
    const out = { x, y, w, h };
    return fitsViewport(out) && w >= MIN && h >= MIN ? out : null;
  }

  function moveRect(s, dx, dy) {
    return { ...s, x: clamp(s.x + dx, 0, innerWidth - s.w), y: clamp(s.y + dy, 0, innerHeight - s.h) };
  }

  function withRatio(s, value) {
    if (!value) return s;
    let w = s.w, h = s.w / value;
    if (h > innerHeight) { h = innerHeight; w = h * value; }
    if (w > innerWidth) { w = innerWidth; h = w / value; }
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    return { x: clamp(cx - w / 2, 0, innerWidth - w), y: clamp(cy - h / 2, 0, innerHeight - h), w, h };
  }

  function setRatio(value) {
    ratio = value;
    ratioButtons.forEach(([b, v]) => b.setAttribute('aria-pressed', String(v === value)));
    if (rect) { rect = withRatio(rect, value); render(); }
  }

  // ---------- rendering ----------

  function render() {
    ui.className = `ui ${phase}`;
    layer.classList.toggle('clear', !!rect);
    hint.style.display = phase === 'select' && !drag ? '' : 'none';
    if (!rect) { box.style.display = 'none'; return; }
    Object.assign(box.style, { display: 'block', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    size.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
    size.style.top = rect.y >= 30 ? '-26px' : '6px';
    size.style.left = rect.y >= 30 ? '0' : '6px';

    bar.classList.toggle('hidden', !!drag);
    if (phase !== 'adjust' || drag) return;
    const bw = bar.offsetWidth || 360, bh = bar.offsetHeight || 42, GAP = 10;
    let top;
    if (rect.y + rect.h + GAP + bh <= innerHeight) top = rect.y + rect.h + GAP;
    else if (rect.y - GAP - bh >= 0) top = rect.y - GAP - bh;
    else top = rect.y + rect.h - bh - GAP;
    bar.style.top = `${top}px`;
    bar.style.left = `${clamp(rect.x + rect.w / 2 - bw / 2, 8, innerWidth - bw - 8)}px`;
  }

  // ---------- pointer ----------

  on(layer, 'pointerdown', (e) => {
    if (e.button !== 0 || phase === 'record') return;
    e.preventDefault();
    drag = { type: 'draw', x0: e.clientX, y0: e.clientY, prev: rect };
    rect = null;
    render();
  });

  on(box, 'pointerdown', (e) => {
    if (e.button !== 0 || phase !== 'adjust') return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.target.dataset?.dir;
    drag = { type: dir ? 'resize' : 'move', dir, start: { ...rect }, px: e.clientX, py: e.clientY };
    render();
  });

  on(window, 'pointermove', (e) => {
    if (!drag) return;
    let next = null;
    if (drag.type === 'draw') next = drawRect(drag.x0, drag.y0, e.clientX, e.clientY);
    else if (drag.type === 'resize') next = resizeRect(drag.start, drag.dir, e.clientX - drag.px, e.clientY - drag.py);
    else next = moveRect(drag.start, e.clientX - drag.px, e.clientY - drag.py);
    if (next) { rect = next; render(); }
  }, true);

  on(window, 'pointerup', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.type === 'draw' && !(rect && rect.w >= MIN && rect.h >= MIN)) rect = d.prev;
    phase = rect ? 'adjust' : 'select';
    render();
  }, true);

  // ---------- keyboard ----------

  on(window, 'keydown', (e) => {
    if (phase === 'record') return;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { stop(); cancel(); return; }
    if (e.key === 'Enter') { stop(); record(rect || { x: 0, y: 0, w: innerWidth, h: innerHeight }); return; }
    if (phase === 'adjust' && e.key.startsWith('Arrow')) {
      stop();
      const n = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
      const dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
      rect = moveRect(rect, dx, dy);
      render();
    }
  }, true);

  on(window, 'resize', () => {
    if (phase === 'adjust' && rect) {
      rect = withRatio(moveRect({ ...rect, w: Math.min(rect.w, innerWidth), h: Math.min(rect.h, innerHeight) }, 0, 0), ratio);
      render();
    }
  });

  function cancel() {
    destroy();
    send({ type: 'selection-cancelled' });
  }

  // ---------- recording ----------

  function record(r) {
    r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    phase = 'record';
    ui.remove();

    const frame = el('frame');
    Object.assign(frame.style, { left: `${r.x - 2}px`, top: `${r.y - 2}px`, width: `${r.w + 4}px`, height: `${r.h + 4}px` });
    root.append(frame);

    // Stop button below the area, or above; left out when neither fits
    // (whole view) so it doesn't end up in the video.
    const BTN = 32, GAP = 8;
    let top = null;
    if (r.y + r.h + GAP + BTN + 4 <= innerHeight) top = r.y + r.h + GAP;
    else if (r.y - GAP - BTN - 4 >= 0) top = r.y - GAP - BTN;
    if (top !== null) {
      const stopBtn = el('stop', 'button');
      const label = el('', 'span', 'Stop · 0:00');
      stopBtn.append(document.createElement('i'), label);
      stopBtn.style.top = `${top}px`;
      stopBtn.style.left = `${clamp(r.x + r.w - 120, 4, innerWidth - 124)}px`;
      on(stopBtn, 'click', () => { stopBtn.disabled = true; label.textContent = 'Saving…'; send({ type: 'stop-request' }); });
      root.append(stopBtn);
      const t0 = Date.now();
      const id = setInterval(() => {
        if (stopBtn.disabled) return;
        const s = Math.floor((Date.now() - t0) / 1000);
        label.textContent = `Stop · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 1000);
      cleanup.push(() => clearInterval(id));
    }

    if (showClicks) showPointer(r);
    on(window, 'resize', () => send({ type: 'viewport', viewport: viewport() }));

    // Let the dimmed overlay leave the screen before recording starts.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      send({ type: 'region-selected', rect: r, viewport: viewport() });
    }));
  }

  // Drawn inside the area on purpose, so it is part of the video.
  function showPointer(r) {
    const ring = el('ring');
    root.append(ring);
    const inside = (e) => e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h;
    on(window, 'pointermove', (e) => {
      if (!inside(e)) { ring.style.display = 'none'; return; }
      Object.assign(ring.style, { display: 'block', left: `${e.clientX}px`, top: `${e.clientY}px` });
    }, { capture: true, passive: true });
    on(document.documentElement, 'mouseleave', () => { ring.style.display = 'none'; });
    on(window, 'pointerdown', (e) => {
      if (!inside(e)) return;
      ring.classList.add('down');
      const rip = el('ripple');
      Object.assign(rip.style, { left: `${e.clientX}px`, top: `${e.clientY}px` });
      rip.addEventListener('animationend', () => rip.remove());
      root.append(rip);
    }, { capture: true, passive: true });
    on(window, 'pointerup', () => ring.classList.remove('down'), { capture: true, passive: true });
  }

  // ---------- teardown ----------

  function destroy() {
    cleanup.forEach((fn) => fn());
    cleanup = [];
    host.remove();
    chrome.runtime.onMessage.removeListener(onMessage);
    if (window.__regionRecorder?.destroy === destroy) delete window.__regionRecorder;
  }

  function onMessage(msg) {
    if (msg.type === 'rr-cleanup') destroy();
  }
  chrome.runtime.onMessage.addListener(onMessage);

  window.__regionRecorder = { destroy };
  render();
})();
