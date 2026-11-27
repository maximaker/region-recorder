// Service worker: coordinates the toolbar button, the page overlay and the
// offscreen recorder, and saves the finished video through chrome.downloads.

const DEFAULTS = { folder: 'Region Recordings', format: 'auto' };
const REC_COLOR = '#d93025';

// ---------- state (kept in session storage: the worker may be restarted) ----------

async function getState() {
  const { rr } = await chrome.storage.session.get('rr');
  return rr || { status: 'idle' };
}
const setState = (rr) => chrome.storage.session.set({ rr });

async function getPending() {
  const { pending } = await chrome.storage.session.get('pending');
  return pending || {};
}
const setPending = (pending) => chrome.storage.session.set({ pending });

// ---------- offscreen document ----------

let creating = null;
async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  creating ??= chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Records the selected part of the tab.',
  });
  try { await creating; } finally { creating = null; }
}

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function closeOffscreen() {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}

const toOffscreen = (msg) => chrome.runtime.sendMessage({ ...msg, target: 'offscreen' });

// ---------- badge ----------

async function badge(text, title) {
  await chrome.action.setBadgeBackgroundColor({ color: REC_COLOR });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title: title || 'Record an area (Alt+Shift+R)' });
}

async function flagError(message) {
  console.warn('[Region Recorder]', message);
  await badge('!', `Region Recorder: ${message}`);
  setTimeout(() => badge(''), 6000);
}

// ---------- flow ----------

chrome.action.onClicked.addListener(async (tab) => {
  const st = await getState();
  if (st.status === 'recording') return stopRecording();
  if (st.status === 'saving') return;
  if (st.status === 'selecting' || st.status === 'preparing') return cancel(st.tabId);
  try {
    await begin(tab);
  } catch (e) {
    await cancel(tab.id);
    await flagError(friendly(e));
  }
});

function friendly(e) {
  const m = String(e?.message || e);
  if (/cannot be scripted|chrome:\/\/|Cannot access/i.test(m)) return 'this page cannot be recorded (browser or store page).';
  return m;
}

async function begin(tab) {
  await setState({ status: 'preparing', tabId: tab.id });

  // Fails early on pages extensions can't touch (chrome://, Web Store).
  const [{ result: viewport }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }),
  });

  // Must be used within a few seconds, so the tab stream opens now and the
  // recorder only starts once an area is chosen.
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  await ensureOffscreen();
  const res = await toOffscreen({ type: 'prepare', streamId, viewport });
  if (!res?.ok) throw new Error(res?.error || 'could not start the tab capture');

  if ((await getState()).status !== 'preparing') return; // cancelled meanwhile
  await setState({ status: 'selecting', tabId: tab.id, title: tab.title || 'Recording' });
  await badge('…', 'Drag to choose an area. Click again to cancel.');
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
}

async function startRecording(rect, viewport, tabAudio, mic) {
  const st = await getState();
  const settings = await chrome.storage.sync.get(DEFAULTS);
  const res = await toOffscreen({ type: 'start', rect, viewport, format: settings.format, tabAudio, mic });
  if (!res?.ok) {
    await cancel(st.tabId);
    const why = res?.error || 'could not start recording';
    notify('rr-start-failed', 'Recording did not start', why.charAt(0).toUpperCase() + why.slice(1), []);
    return flagError(why);
  }
  await setState({ ...st, status: 'recording' });
  await badge('REC', 'Recording. Click to stop and save (Alt+Shift+R).');
}

async function stopRecording() {
  const st = await getState();
  if (st.status !== 'recording') return;
  await setState({ ...st, status: 'saving' });
  chrome.tabs.sendMessage(st.tabId, { type: 'rr-cleanup' }).catch(() => {});

  try {
    const res = await toOffscreen({ type: 'stop' });
    if (!res?.ok) throw new Error(res?.error || 'recording failed');
    if (!res.size) throw new Error('the recording came out empty');

    const settings = await chrome.storage.sync.get(DEFAULTS);
    const filename = buildFilename(settings.folder, st.title, res.mime);
    const id = await chrome.downloads.download({
      url: res.url, filename, conflictAction: 'uniquify', saveAs: false,
    });
    const pending = await getPending();
    pending[id] = res.url;
    await setPending(pending);
    await badge('');
    // Small files can finish before the id was stored; catch that case here.
    const [item] = await chrome.downloads.search({ id });
    if (item && item.state !== 'in_progress') await downloadFinished(id, item.state);
  } catch (e) {
    await flagError(friendly(e));
    await closeOffscreen();
  } finally {
    await setState({ status: 'idle' });
  }
}

async function cancel(tabId) {
  if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'rr-cleanup' }).catch(() => {});
  if (await hasOffscreen()) await toOffscreen({ type: 'reset' }).catch(() => {});
  await setState({ status: 'idle' });
  await badge('');
  if (!Object.keys(await getPending()).length) await closeOffscreen();
}

// ---------- file naming ----------

function clean(part) {
  return part.replace(/[<>:"/\\|?*\x00-\x1f~]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '');
}

function buildFilename(folder, title, mime) {
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  const name = `${clean(title).slice(0, 80) || 'Recording'} ${stamp}.${ext}`;
  const dir = String(folder || '').split(/[\\/]+/).map(clean).filter(Boolean).join('/');
  return dir ? `${dir}/${name}` : name;
}

// ---------- messages ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === 'offscreen') return;
  if (msg.type === 'mic-permission') {
    micPermission(msg.prompt, sender.tab).then(sendResponse, () => sendResponse({ state: 'prompt' }));
    return true;
  }
  (async () => {
    const st = await getState();
    const fromTab = sender.tab?.id;
    switch (msg.type) {
      case 'region-selected':
        if (st.status === 'selecting' && fromTab === st.tabId) {
          await startRecording(msg.rect, msg.viewport, msg.tabAudio !== false, !!msg.mic);
        }
        break;
      case 'levels': // offscreen can't reach tabs; relay to the page's Stop pill
        if (st.status === 'recording') {
          chrome.tabs.sendMessage(st.tabId, { type: 'rr-levels', tab: msg.tab, mic: msg.mic }).catch(() => {});
        }
        break;
      case 'mic-answer':
        await micAnswered(msg.state);
        break;
      case 'selection-cancelled':
        if (st.status === 'selecting' && fromTab === st.tabId) await cancel(st.tabId);
        break;
      case 'stop-request':
        if (fromTab === st.tabId) await stopRecording();
        break;
      case 'viewport':
        if (st.status === 'recording' && fromTab === st.tabId) await toOffscreen({ type: 'viewport', viewport: msg.viewport });
        break;
      case 'tick':
        if (st.status === 'recording') {
          const s = Math.floor(msg.elapsed / 1000);
          await chrome.action.setBadgeText({ text: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` });
        }
        break;
      case 'capture-ended':
        if (st.status === 'recording') await stopRecording();
        else if (st.status !== 'idle') await cancel(st.tabId);
        break;
    }
  })();
});

// Free the video memory once Chrome has written the file.
chrome.downloads.onChanged.addListener((delta) => {
  const state = delta.state?.current;
  if (state === 'complete' || state === 'interrupted') downloadFinished(delta.id, state);
});

const handled = new Set(); // the event and the check in stopRecording can both fire

async function downloadFinished(id, state) {
  if (handled.has(id)) return;
  handled.add(id);
  const pending = await getPending();
  const url = pending[id];
  if (!url) return; // not ours
  delete pending[id];
  await setPending(pending);
  if (state === 'interrupted') {
    await flagError('saving the video failed — check the Downloads list.');
    notify(`rr-fail-${id}`, 'Recording not saved', 'Chrome could not write the file. Check the Downloads list.', []);
  } else {
    const [item] = await chrome.downloads.search({ id });
    const name = item?.filename?.split(/[\\/]/).pop() || 'Your video';
    notify(`rr-${id}`, 'Recording saved', name, [{ title: 'Open' }, { title: 'Show in folder' }]);
  }
  if (await hasOffscreen()) await toOffscreen({ type: 'revoke', url }).catch(() => {});
  const st = await getState();
  if (['idle', 'saving'].includes(st.status) && !Object.keys(pending).length) await closeOffscreen();
}

// ---------- microphone permission ----------
// The offscreen document can't show Chrome's permission prompt, so the first
// time the mic is turned on, an extension page asks for it. The permission
// then belongs to the extension and the recorder can use it.
// It opens as a normal tab next to the user's (not a popup window): popups
// have no address bar, where Chrome shows its prompt, and can open unseen.

async function micPermission(prompt, tab) {
  let state = 'prompt';
  if (await hasOffscreen()) {
    const r = await toOffscreen({ type: 'mic-status' }).catch(() => null);
    state = r?.state || 'prompt';
  }
  if (state === 'granted' || !prompt || !tab) return { state };

  const { micAsk } = await chrome.storage.session.get('micAsk');
  if (micAsk) await chrome.tabs.remove(micAsk.askTabId).catch(() => {});
  const ask = await chrome.tabs.create({
    url: 'mic.html', windowId: tab.windowId, index: tab.index + 1, openerTabId: tab.id, active: true,
  });
  await chrome.storage.session.set({ micAsk: { askTabId: ask.id, tabId: tab.id, tabWindowId: tab.windowId } });
  return { state: 'asking' };
}

async function micAnswered(state) {
  const { micAsk } = await chrome.storage.session.get('micAsk');
  if (!micAsk) return;
  await chrome.storage.session.remove('micAsk');
  chrome.tabs.sendMessage(micAsk.tabId, { type: 'rr-mic', state }).catch(() => {});
  if (state === 'granted' || state === 'dismissed') {
    await chrome.tabs.update(micAsk.tabId, { active: true }).catch(() => {});
    await chrome.windows.update(micAsk.tabWindowId, { focused: true }).catch(() => {});
    setTimeout(() => chrome.tabs.remove(micAsk.askTabId).catch(() => {}), state === 'granted' ? 900 : 0);
  }
}

// Closing the permission tab without answering counts as "not now".
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { micAsk } = await chrome.storage.session.get('micAsk');
  if (micAsk?.askTabId === tabId) await micAnswered('dismissed');
});

// ---------- "saved" notification ----------

function notify(id, title, message, buttons) {
  chrome.notifications.create(id, {
    type: 'basic', iconUrl: 'icons/128.png', title, message, buttons, priority: 1,
  }).catch((e) => console.warn('[Region Recorder] notification failed', e));
}

const downloadIdOf = (notifId) => {
  const m = /^rr-(\d+)$/.exec(notifId);
  return m ? Number(m[1]) : null;
};

async function showFile(id) {
  chrome.downloads.show(id);
}

async function openFile(id) {
  try {
    await chrome.downloads.open(id);
  } catch {
    chrome.downloads.show(id); // file moved/deleted, or Chrome refused: fall back to the folder
  }
}

chrome.notifications.onButtonClicked.addListener(async (notifId, index) => {
  const id = downloadIdOf(notifId);
  if (id == null) return;
  if (index === 0) await openFile(id);
  else await showFile(id);
  chrome.notifications.clear(notifId);
});

chrome.notifications.onClicked.addListener(async (notifId) => {
  const id = downloadIdOf(notifId);
  if (id != null) await showFile(id);
  chrome.notifications.clear(notifId);
});

// Closing the tab saves what was recorded; navigating away while choosing cancels.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const st = await getState();
  if (st.tabId !== tabId) return;
  if (st.status === 'recording') await stopRecording();
  else if (st.status !== 'idle') await cancel(null);
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'loading') return;
  const st = await getState();
  if (st.tabId === tabId && st.status === 'selecting') await cancel(null);
});

chrome.runtime.onStartup.addListener(() => setState({ status: 'idle' }));
