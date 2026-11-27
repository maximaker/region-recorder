// Page overlay, in three steps:
//   select  – drag to draw an area (Enter records the whole view)
//   adjust  – move/resize it, pick a shape (incl. Full view), then Record
//   record  – red frame + Stop pill just outside the area, and (optionally)
//             a cursor ring and click ripples drawn inside it so they show
//             up in the video (tab capture leaves out the real pointer).

(() => {
  if (window.__regionRecorder) window.__regionRecorder.destroy();

  const MIN = 16;
  const SHAPES = [
    { id: 'free', label: 'Free', ratio: null },
    { id: 'full', label: 'Full view', ratio: null },
    { id: '16:9', label: '16:9', ratio: 16 / 9 },
    { id: '4:3', label: '4:3', ratio: 4 / 3 },
    { id: '1:1', label: '1:1', ratio: 1 },
    { id: '9:16', label: '9:16', ratio: 9 / 16 },
  ];
  const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

  const host = document.createElement('region-recorder-ui');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      :host { --accent: #dc2626; --accent-hover: #b91c1c; --glass: rgba(22,22,26,.82);
              --line: rgba(255,255,255,.09); --text: #fafafa; --muted: rgba(250,250,250,.55); }
      * { box-sizing: border-box; margin: 0; font: 500 13px/1 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          letter-spacing: -0.005em; -webkit-font-smoothing: antialiased; }
      .ui { position: fixed; inset: 0; }
      .layer { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: rgba(9,9,11,.38); }
      .layer.clear { background: transparent; }

      .box { position: fixed; display: none; outline: 1px solid rgba(255,255,255,.95); box-shadow: 0 0 0 100vmax rgba(9,9,11,.38); }
      .adjust .box { pointer-events: auto; cursor: move; }
      .size { position: absolute; left: 0; top: -28px; padding: 5px 8px; border-radius: 6px; background: var(--glass);
              color: var(--text); font-size: 11.5px; font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: none;
              backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
      .size.inside { top: 8px; left: 8px; }
      .handle { position: absolute; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #fff;
                box-shadow: 0 0 0 1px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.3); display: none; }
      .adjust .handle { display: block; }
      .handle[data-dir=n]  { left: 50%;  top: 0;    cursor: ns-resize; }
      .handle[data-dir=s]  { left: 50%;  top: 100%; cursor: ns-resize; }
      .handle[data-dir=e]  { left: 100%; top: 50%;  cursor: ew-resize; }
      .handle[data-dir=w]  { left: 0;    top: 50%;  cursor: ew-resize; }
      .handle[data-dir=ne] { left: 100%; top: 0;    cursor: nesw-resize; }
      .handle[data-dir=sw] { left: 0;    top: 100%; cursor: nesw-resize; }
      .handle[data-dir=nw] { left: 0;    top: 0;    cursor: nwse-resize; }
      .handle[data-dir=se] { left: 100%; top: 100%; cursor: nwse-resize; }

      .pill { background: var(--glass); color: var(--text); border: 1px solid var(--line); border-radius: 12px;
              backdrop-filter: blur(16px) saturate(140%); -webkit-backdrop-filter: blur(16px) saturate(140%);
              box-shadow: 0 8px 24px rgba(0,0,0,.28), 0 1px 2px rgba(0,0,0,.2); }
      .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 14px;
              padding: 9px 14px; white-space: nowrap; color: var(--muted); }
      .hint b { color: var(--text); font-weight: 500; }
      kbd { display: inline-block; min-width: 20px; padding: 3px 5px; margin-right: 6px; border-radius: 5px; text-align: center;
            background: rgba(255,255,255,.1); color: var(--text); font-size: 11px; }

      .bar { position: fixed; display: none; align-items: center; gap: 4px; padding: 4px; pointer-events: auto; white-space: nowrap; }
      .adjust .bar { display: flex; }
      .bar.hidden { display: none !important; }
      .sep { width: 1px; height: 20px; background: var(--line); margin: 0 4px; }
      button { display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px; border: 0; border-radius: 8px;
               background: transparent; color: var(--text); cursor: pointer; transition: background .12s; }
      button:hover { background: rgba(255,255,255,.08); }
      button:focus-visible { outline: 2px solid rgba(255,255,255,.6); outline-offset: 1px; }
      .quiet { color: var(--muted); }
      .quiet:hover { color: var(--text); }
      .rec { background: var(--accent); font-weight: 600; padding: 0 14px 0 12px; }
      .rec:hover { background: var(--accent-hover); }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
      .chev { width: 10px; height: 10px; opacity: .6; }
      .toggle { padding: 0 10px; }
      .toggle svg { width: 16px; height: 16px; }
      .toggle .slash { display: none; }
      .toggle[aria-pressed=false] { color: var(--muted); }
      .toggle[aria-pressed=false] .slash { display: inline; }
      .toggle[aria-pressed=false] .ico { opacity: .55; }
      .toggle.pending { color: #fbbf24; animation: pulse 1.2s ease-in-out infinite; }
      .toggle.pending .slash { display: none; }

      .dd { position: relative; }
      .menu { position: absolute; left: 0; min-width: 168px; padding: 4px; display: none; flex-direction: column; gap: 1px; }
      .menu.open { display: flex; }
      .menu.up { bottom: calc(100% + 8px); }
      .menu.down { top: calc(100% + 8px); }
      .menu button { width: 100%; justify-content: flex-start; height: 32px; padding: 0 10px; }
      .menu button[aria-checked=true] { background: rgba(255,255,255,.1); }
      .menu .check { margin-left: auto; width: 12px; height: 12px; opacity: 0; }
      .menu button[aria-checked=true] .check { opacity: .9; }
      .menu .div { height: 1px; background: var(--line); margin: 3px 6px; }
      .glyph-wrap { width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; flex: none; }
      .glyph { border: 1.5px solid currentColor; border-radius: 2.5px; opacity: .85; }
      .glyph.free { border-style: dashed; }
      .glyph.full { border-width: 1.5px; box-shadow: inset 0 0 0 1.5px transparent; }

      .frame { position: fixed; border: 2px solid var(--accent); border-radius: 2px; pointer-events: none; }
      .stop { position: fixed; pointer-events: auto; height: 36px; padding: 0 6px 0 12px; gap: 10px; border-radius: 12px; }
      .stop .sq { width: 10px; height: 10px; border-radius: 2.5px; background: var(--accent); animation: pulse 1.6s ease-in-out infinite; }
      .stop .time { font-variant-numeric: tabular-nums; min-width: 34px; }
      .stop .label { padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,.1); }
      .stop:hover { background: var(--glass); }
      .stop:hover .label { background: var(--accent); }
      @keyframes pulse { 50% { opacity: .35; } }

      .ring { position: fixed; width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; pointer-events: none; display: none;
              background: rgba(255,196,0,.25); border: 2px solid rgba(255,170,0,.9); transition: transform .08s ease-out; }
      .ring.down { transform: scale(.75); background: rgba(255,170,0,.5); }
      .ripple { position: fixed; width: 56px; height: 56px; margin: -28px 0 0 -28px; border-radius: 50%; pointer-events: none;
                border: 3px solid rgba(255,150,0,.95); animation: ripple .5s ease-out forwards; }
      @keyframes ripple { from { transform: scale(.2); opacity: 1; } to { transform: scale(1); opacity: 0; } }
    </style>`;
  document.documentElement.appendChild(host);

  const el = (cls, tag = 'div', text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  const svg = (cls, path) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 12 12');
    s.setAttribute('class', cls);
    s.innerHTML = `<path d="${path}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    return s;
  };
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
  const viewport = () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  let cleanup = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  };

  // Whether the cursor ring and click ripples are drawn into the video.
  // Same setting as the checkbox in Options; the toolbar toggle saves to it.
  let showClicks = true;
  // Sound: the tab's own audio and/or the microphone, both remembered.
  let tabAudio = true;
  let mic = false;
  let micPending = false;
  chrome.storage?.sync.get({ showClicks: true, tabAudio: true, mic: false })
    .then(async (s) => {
      showClicks = s.showClicks;
      tabAudio = s.tabAudio;
      syncCursorUI();
      syncSoundUI();
      if (s.mic) {
        // Only show the mic as on if Chrome still allows it.
        const r = await chrome.runtime.sendMessage({ type: 'mic-permission', prompt: false }).catch(() => null);
        mic = r?.state === 'granted';
        syncSoundUI();
      }
    })
    .catch(() => {});

  // Small outline that previews each shape in the menu.
  function glyph(shape) {
    const wrap = el('glyph-wrap', 'span');
    const g = el(`glyph ${shape.id === 'free' ? 'free' : shape.id === 'full' ? 'full' : ''}`, 'span');
    const r = shape.ratio || (shape.id === 'full' ? 1.4 : 1);
    const w = r >= 1 ? 14 : Math.round(14 * r);
    const h = r >= 1 ? Math.round(14 / r) : 14;
    Object.assign(g.style, { width: `${shape.id === 'free' ? 12 : w}px`, height: `${shape.id === 'free' ? 12 : h}px` });
    wrap.append(g);
    return wrap;
  }

  // ---------- elements ----------

  const ui = el('ui');
  const layer = el('layer');
  const box = el('box');
  const size = el('size');
  box.append(size);
  for (const dir of DIRS) {
    const h = el('handle');
    h.dataset.dir = dir;
    box.append(h);
  }

  const hint = el('hint pill');
  hint.innerHTML = '<b>Drag to select an area</b><span><kbd>↵</kbd>Full view</span><span><kbd>Esc</kbd>Cancel</span>';

  const bar = el('bar pill');
  const dd = el('dd');
  const ddBtn = el('', 'button');
  ddBtn.type = 'button';
  ddBtn.title = 'Shape';
  ddBtn.setAttribute('aria-haspopup', 'menu');
  ddBtn.setAttribute('aria-expanded', 'false');
  const ddLabel = el('', 'span');
  const ddGlyph = el('glyph-wrap', 'span');
  ddBtn.append(ddGlyph, ddLabel, svg('chev', 'M3 4.5l3 3 3-3'));

  const menu = el('menu pill');
  menu.setAttribute('role', 'menu');
  const items = SHAPES.map((shape, i) => {
    const b = el('', 'button');
    b.type = 'button';
    b.setAttribute('role', 'menuitemradio');
    b.append(glyph(shape), el('', 'span', shape.label), svg('check', 'M2.5 6.5l2.3 2.3L9.5 3.8'));
    b.addEventListener('click', () => { setShape(shape.id); closeMenu(); });
    menu.append(b);
    if (i === 1) menu.append(el('div'));
    return [b, shape];
  });
  dd.append(ddBtn, menu);
  ddBtn.addEventListener('click', () => (menu.classList.contains('open') ? closeMenu() : openMenu()));

  const cancelBtn = el('quiet', 'button', 'Cancel');
  cancelBtn.type = 'button';
  cancelBtn.title = 'Esc';
  const recBtn = el('rec', 'button');
  recBtn.type = 'button';
  recBtn.title = 'Enter';
  recBtn.append(el('dot', 'span'), document.createTextNode('Record'));
  const cursorBtn = el('toggle', 'button');
  cursorBtn.type = 'button';
  cursorBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">
      <path class="ico" d="M4 2.5v10l2.6-2.4 1.8 3.9 1.7-.8-1.8-3.8h3.5z" fill="currentColor"/>
      <path class="slash" d="M2.5 2.5l11 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>`;
  cursorBtn.addEventListener('click', () => {
    showClicks = !showClicks;
    syncCursorUI();
    chrome.storage?.sync.set({ showClicks }).catch(() => {});
  });

  const SLASH = '<path class="slash" d="M2.5 2.5l11 11" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>';
  const soundBtn = el('toggle', 'button');
  soundBtn.type = 'button';
  soundBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><g class="ico">
      <path d="M2.5 6h2.4L8.5 3v10L4.9 10H2.5z" fill="currentColor"/>
      <path d="M10.8 5.6a3.4 3.4 0 0 1 0 4.8M12.6 3.9a5.8 5.8 0 0 1 0 8.2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </g>${SLASH}</svg>`;
  soundBtn.addEventListener('click', () => {
    tabAudio = !tabAudio;
    syncSoundUI();
    chrome.storage?.sync.set({ tabAudio }).catch(() => {});
  });

  const micBtn = el('toggle', 'button');
  micBtn.type = 'button';
  micBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><g class="ico">
      <path d="M6 3a2 2 0 0 1 4 0v4a2 2 0 0 1-4 0z" fill="currentColor"/>
      <path d="M4 7a4 4 0 0 0 8 0M8 11v2.5M5.5 13.5h5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </g>${SLASH}</svg>`;
  micBtn.addEventListener('click', async () => {
    if (micPending) return;
    if (mic) {
      mic = false;
      syncSoundUI();
      chrome.storage?.sync.set({ mic }).catch(() => {});
      return;
    }
    // Turning it on: ask Chrome for permission if it hasn't been given yet.
    micPending = true;
    syncSoundUI();
    const r = await chrome.runtime.sendMessage({ type: 'mic-permission', prompt: true }).catch(() => null);
    if (r?.state === 'asking') return; // answer arrives as an 'rr-mic' message
    micAnswer(r?.state === 'granted' ? 'granted' : 'denied');
  });

  function micAnswer(state) {
    micPending = false;
    mic = state === 'granted';
    micNote = state === 'denied' ? 'blocked' : '';
    syncSoundUI();
    if (mic) chrome.storage?.sync.set({ mic: true }).catch(() => {});
  }
  let micNote = '';

  bar.append(dd, cursorBtn, soundBtn, micBtn, el('sep'), cancelBtn, recBtn);
  cancelBtn.addEventListener('click', cancel);
  recBtn.addEventListener('click', () => rect && record(rect));
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());

  ui.append(layer, box, bar, hint);
  root.append(ui);

  function syncCursorUI() {
    cursorBtn.setAttribute('aria-pressed', String(showClicks));
    const label = showClicks ? 'Cursor and clicks: shown in the video' : 'Cursor and clicks: hidden';
    cursorBtn.title = label;
    cursorBtn.setAttribute('aria-label', label);
  }

  function syncSoundUI() {
    soundBtn.setAttribute('aria-pressed', String(tabAudio));
    const s = tabAudio ? "Tab sound: recorded (what this page plays)" : 'Tab sound: off';
    soundBtn.title = s;
    soundBtn.setAttribute('aria-label', s);

    micBtn.classList.toggle('pending', micPending);
    micBtn.setAttribute('aria-pressed', String(mic));
    const m = micPending ? 'Microphone: waiting for your permission'
      : mic ? 'Microphone: recording your voice'
      : micNote === 'blocked' ? 'Microphone: blocked by Chrome. Click to try again'
      : 'Microphone: off';
    micBtn.title = m;
    micBtn.setAttribute('aria-label', m);
  }

  function openMenu() {
    const below = bar.getBoundingClientRect().bottom + 250 < innerHeight;
    menu.classList.toggle('down', below);
    menu.classList.toggle('up', !below);
    menu.classList.add('open');
    ddBtn.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.classList.remove('open');
    ddBtn.setAttribute('aria-expanded', 'false');
  }

  // ---------- geometry ----------

  let phase = 'select';
  let rect = null;
  let shapeId = 'free';
  let ratio = null;
  let drag = null;

  const fullRect = () => ({ x: 0, y: 0, w: innerWidth, h: innerHeight });

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

  function setShape(id) {
    const shape = SHAPES.find((s) => s.id === id);
    shapeId = id;
    ratio = shape.ratio;
    if (id === 'full') rect = fullRect();
    else if (rect) rect = withRatio(rect, ratio);
    if (rect) phase = 'adjust';
    syncShapeUI();
    render();
  }

  // Leaving full view by hand (move/resize/draw) turns the shape back to Free.
  function leaveFull() {
    if (shapeId === 'full') { shapeId = 'free'; syncShapeUI(); }
  }

  function syncShapeUI() {
    const shape = SHAPES.find((s) => s.id === shapeId);
    ddLabel.textContent = shape.label;
    ddBtn.firstChild.replaceWith(glyph(shape));
    items.forEach(([b, s]) => b.setAttribute('aria-checked', String(s.id === shapeId)));
  }

  // ---------- rendering ----------

  function render() {
    ui.className = `ui ${phase}`;
    layer.classList.toggle('clear', !!rect);
    hint.style.display = phase === 'select' && !drag ? '' : 'none';
    if (!rect) { box.style.display = 'none'; return; }
    Object.assign(box.style, { display: 'block', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    size.textContent = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
    size.classList.toggle('inside', rect.y < 34);

    bar.classList.toggle('hidden', !!drag);
    if (phase !== 'adjust' || drag) return;
    const bw = bar.offsetWidth || 300, bh = bar.offsetHeight || 42, GAP = 12;
    let top;
    if (rect.y + rect.h + GAP + bh <= innerHeight) top = rect.y + rect.h + GAP;
    else if (rect.y - GAP - bh >= 0) top = rect.y - GAP - bh;
    else top = rect.y + rect.h - bh - 20; // full view: float inside, above the bottom edge
    bar.style.top = `${top}px`;
    bar.style.left = `${clamp(rect.x + rect.w / 2 - bw / 2, 8, innerWidth - bw - 8)}px`;
  }

  // ---------- pointer ----------

  on(layer, 'pointerdown', (e) => {
    if (e.button !== 0 || phase === 'record') return;
    e.preventDefault();
    closeMenu();
    leaveFull();
    drag = { type: 'draw', x0: e.clientX, y0: e.clientY, prev: rect };
    rect = null;
    render();
  });

  on(box, 'pointerdown', (e) => {
    if (e.button !== 0 || phase !== 'adjust') return;
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    const dir = e.target.dataset?.dir;
    drag = { type: dir ? 'resize' : 'move', dir, start: { ...rect }, px: e.clientX, py: e.clientY, moved: false };
    render();
  });

  on(window, 'pointermove', (e) => {
    if (!drag) return;
    let next = null;
    if (drag.type === 'draw') next = drawRect(drag.x0, drag.y0, e.clientX, e.clientY);
    else if (drag.type === 'resize') next = resizeRect(drag.start, drag.dir, e.clientX - drag.px, e.clientY - drag.py);
    else next = moveRect(drag.start, e.clientX - drag.px, e.clientY - drag.py);
    if (next) {
      if (drag.type !== 'draw' && !drag.moved) { drag.moved = true; leaveFull(); }
      rect = next;
      render();
    }
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
    if (e.key === 'Escape') {
      stop();
      if (menu.classList.contains('open')) closeMenu();
      else cancel();
      return;
    }
    if (e.key === 'Enter' && !menu.classList.contains('open')) { stop(); record(rect || fullRect()); return; }
    if (phase === 'adjust' && e.key.startsWith('Arrow') && !menu.classList.contains('open')) {
      stop();
      const n = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0;
      const dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0;
      const next = moveRect(rect, dx, dy);
      if (next.x !== rect.x || next.y !== rect.y) { leaveFull(); rect = next; render(); }
    }
  }, true);

  on(window, 'resize', () => {
    if (phase !== 'adjust' || !rect) return;
    rect = shapeId === 'full'
      ? fullRect()
      : withRatio(moveRect({ ...rect, w: Math.min(rect.w, innerWidth), h: Math.min(rect.h, innerHeight) }, 0, 0), ratio);
    render();
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

    // Stop pill below the area, or above; left out when neither fits
    // (full view) so it doesn't end up in the video — stop from the toolbar icon.
    const BTN = 36, GAP = 10, W = 132;
    let top = null;
    if (r.y + r.h + GAP + BTN + 4 <= innerHeight) top = r.y + r.h + GAP;
    else if (r.y - GAP - BTN - 4 >= 0) top = r.y - GAP - BTN;
    if (top !== null) {
      const stopBtn = el('stop pill', 'button');
      stopBtn.type = 'button';
      stopBtn.title = 'Stop and save (Alt+Shift+R)';
      const time = el('time', 'span', '0:00');
      const label = el('label', 'span', 'Stop');
      stopBtn.append(el('sq', 'span'), time, label);
      stopBtn.style.top = `${top}px`;
      stopBtn.style.left = `${clamp(r.x + r.w - W, 4, innerWidth - W - 4)}px`;
      on(stopBtn, 'click', () => { stopBtn.disabled = true; label.textContent = 'Saving…'; send({ type: 'stop-request' }); });
      root.append(stopBtn);
      const t0 = Date.now();
      const id = setInterval(() => { if (!stopBtn.disabled) time.textContent = fmt(Date.now() - t0); }, 1000);
      cleanup.push(() => clearInterval(id));
    }

    if (showClicks) showPointer(r);
    on(window, 'resize', () => send({ type: 'viewport', viewport: viewport() }));

    // Let the dimmed overlay leave the screen before recording starts.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      send({ type: 'region-selected', rect: r, viewport: viewport(), tabAudio, mic: mic && !micPending });
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
    if (msg.type === 'rr-mic' && micPending) micAnswer(msg.state);
  }
  chrome.runtime.onMessage.addListener(onMessage);

  window.__regionRecorder = { destroy };
  syncShapeUI();
  syncCursorUI();
  syncSoundUI();
  render();
})();
