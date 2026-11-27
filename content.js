// Page overlay: drag to choose an area, then a red frame and a Stop button
// drawn just outside it (so neither ends up in the video).

(() => {
  if (window.__regionRecorder) window.__regionRecorder.destroy();

  const MIN = 16;
  const host = document.createElement('region-recorder-ui');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; }
      .layer { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: rgba(0,0,0,.4); }
      .layer.dragging { background: transparent; }
      .box { position: fixed; display: none; border: 1px solid #fff; box-shadow: 0 0 0 100vmax rgba(0,0,0,.4); }
      .size { position: absolute; right: 0; bottom: -24px; color: #fff; background: rgba(0,0,0,.7); padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
      .hint { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); color: #fff; background: rgba(20,20,20,.85); padding: 8px 14px; border-radius: 8px; white-space: nowrap; }
      .frame { position: fixed; border: 2px solid #d93025; pointer-events: none; }
      .stop { position: fixed; pointer-events: auto; display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px;
              border: 0; border-radius: 8px; background: #d93025; color: #fff; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
      .stop:hover { background: #b3261e; }
      .stop i { width: 10px; height: 10px; background: #fff; border-radius: 2px; }
    </style>`;
  document.documentElement.appendChild(host);

  const viewport = () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio });
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
  const el = (cls, tag = 'div') => Object.assign(document.createElement(tag), { className: cls });

  let cleanup = [];
  const on = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  };

  // ---------- selecting ----------

  const layer = el('layer');
  const box = el('box');
  const size = el('size');
  const hint = el('hint');
  hint.textContent = 'Drag to choose an area · Enter records the whole view · Esc cancels';
  box.append(size);
  root.append(layer, box, hint);

  let start = null;
  let current = null;

  const draw = (r) => {
    Object.assign(box.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    size.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
  };

  on(layer, 'mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY };
    layer.classList.add('dragging');
    hint.style.display = 'none';
  });
  on(window, 'mousemove', (e) => {
    if (!start) return;
    const x = Math.max(0, Math.min(start.x, e.clientX));
    const y = Math.max(0, Math.min(start.y, e.clientY));
    current = {
      x, y,
      w: Math.min(innerWidth, Math.max(start.x, e.clientX)) - x,
      h: Math.min(innerHeight, Math.max(start.y, e.clientY)) - y,
    };
    draw(current);
  }, true);
  on(window, 'mouseup', () => {
    if (!start) return;
    start = null;
    if (current && current.w >= MIN && current.h >= MIN) return begin(current);
    current = null;
    box.style.display = 'none';
    layer.classList.remove('dragging');
    hint.style.display = '';
  }, true);
  on(window, 'keydown', (e) => {
    if (!layer.isConnected) return;
    if (e.key === 'Escape') { e.preventDefault(); destroy(); send({ type: 'selection-cancelled' }); }
    if (e.key === 'Enter') { e.preventDefault(); begin({ x: 0, y: 0, w: innerWidth, h: innerHeight }); }
  }, true);

  // ---------- recording ----------

  function begin(r) {
    r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    layer.remove(); box.remove(); hint.remove();

    const frame = el('frame');
    Object.assign(frame.style, { left: `${r.x - 2}px`, top: `${r.y - 2}px`, width: `${r.w + 4}px`, height: `${r.h + 4}px` });
    root.append(frame);

    // Stop button goes below the area, or above it; if neither fits (whole
    // view) it is left out so it doesn't end up in the video.
    const BTN = 32, GAP = 8;
    let top = null;
    if (r.y + r.h + GAP + BTN + 4 <= innerHeight) top = r.y + r.h + GAP;
    else if (r.y - GAP - BTN - 4 >= 0) top = r.y - GAP - BTN;
    if (top !== null) {
      const stop = el('stop', 'button');
      const label = document.createElement('span');
      stop.append(document.createElement('i'), label);
      label.textContent = 'Stop · 0:00';
      stop.style.top = `${top}px`;
      stop.style.left = `${Math.max(4, Math.min(r.x + r.w - 120, innerWidth - 124))}px`;
      on(stop, 'click', () => { stop.disabled = true; label.textContent = 'Saving…'; send({ type: 'stop-request' }); });
      root.append(stop);
      const t0 = Date.now();
      const id = setInterval(() => {
        if (stop.disabled) return;
        const s = Math.floor((Date.now() - t0) / 1000);
        label.textContent = `Stop · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      }, 1000);
      cleanup.push(() => clearInterval(id));
    }

    on(window, 'resize', () => send({ type: 'viewport', viewport: viewport() }));

    // Let the dimmed overlay disappear from the screen before recording starts.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      send({ type: 'region-selected', rect: r, viewport: viewport() });
    }));
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
})();
