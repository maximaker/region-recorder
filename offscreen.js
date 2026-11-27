// Offscreen document: holds the tab stream, crops each frame to the chosen
// area (WebCodecs VideoFrame.visibleRect, no canvas) and records it.

const MAX_SIDE = 4096;

let stream = null;
let micStream = null;
let audioCtx = null;
let recorder = null;
let chunks = [];
let viewport = null;
let rect = null;
let outSize = null;
let ticker = null;

const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

function cleanupMedia() {
  clearInterval(ticker);
  ticker = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
  audioCtx?.close().catch(() => {});
  audioCtx = null;
  recorder = null;
  chunks = [];
  rect = null;
  outSize = null;
}

// The tab's sound is always captured here; whether it goes into the video is
// decided at start(), after the user picks in the toolbar.
async function prepare({ streamId, viewport: vp }) {
  cleanupMedia();
  viewport = vp;
  const fullW = vp.w * vp.dpr;
  const fullH = vp.h * vp.dpr;
  const k = Math.min(1, MAX_SIDE / fullW, MAX_SIDE / fullH);
  const W = Math.round(fullW * k);
  const H = Math.round(fullH * k);
  const source = { chromeMediaSource: 'tab', chromeMediaSourceId: streamId };

  stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: source },
    video: { mandatory: { ...source, minWidth: W, maxWidth: W, minHeight: H, maxHeight: H, maxFrameRate: 30 } },
  });

  // Capturing a tab mutes it for you; play the sound back so you still hear it.
  const [audioTrack] = stream.getAudioTracks();
  if (audioTrack) {
    audioCtx = new AudioContext();
    audioCtx.createMediaStreamSource(new MediaStream([audioTrack])).connect(audioCtx.destination);
  }
  stream.getVideoTracks()[0].addEventListener('ended', () => {
    chrome.runtime.sendMessage({ type: 'capture-ended' }).catch(() => {});
  });
}

// Maps the CSS-pixel area onto the frame. Handles letterboxing in case the
// window was resized after capture began.
function cropFor(frame) {
  const vr = frame.visibleRect;
  const s = Math.min(vr.width / viewport.w, vr.height / viewport.h);
  const ox = vr.x + (vr.width - viewport.w * s) / 2;
  const oy = vr.y + (vr.height - viewport.h * s) / 2;
  const right = vr.x + vr.width;
  const bottom = vr.y + vr.height;
  const x = Math.min(even(ox + rect.x * s), even(right - 2));
  const y = Math.min(even(oy + rect.y * s), even(bottom - 2));
  const w = Math.min(even(rect.w * s), even(right - x));
  const h = Math.min(even(rect.h * s), even(bottom - y));
  return { x, y, width: w, height: h };
}

function pickMime(format) {
  const mp4 = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
  const webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const order = format === 'webm' ? [...webm, ...mp4] : [...mp4, ...webm];
  return order.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

// MediaRecorder only records the first audio track, so tab sound and mic are
// mixed into one. The mic never goes to the speakers (no echo).
async function buildAudio(tabAudio, mic) {
  const [tabTrack] = stream.getAudioTracks();
  const useTab = tabAudio && tabTrack;
  if (mic) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      if (e?.name === 'NotAllowedError') throw new Error('the microphone is blocked. Turn it on again in the toolbar to allow it.');
      if (e?.name === 'NotFoundError') throw new Error('no microphone was found.');
      throw e;
    }
  }
  const [micTrack] = micStream?.getAudioTracks() || [];
  if (useTab && micTrack) {
    audioCtx ??= new AudioContext();
    const mix = audioCtx.createMediaStreamDestination();
    audioCtx.createMediaStreamSource(new MediaStream([tabTrack])).connect(mix);
    audioCtx.createMediaStreamSource(micStream).connect(mix);
    return mix.stream.getAudioTracks();
  }
  if (useTab) return [tabTrack];
  if (micTrack) return [micTrack];
  return [];
}

async function micStatus() {
  try {
    return (await navigator.permissions.query({ name: 'microphone' })).state;
  } catch {
    return 'prompt';
  }
}

async function start({ rect: r, viewport: vp, format, tabAudio = true, mic = false }) {
  if (!stream) throw new Error('the tab capture is not ready');
  rect = r;
  viewport = vp;
  const audioTracks = await buildAudio(tabAudio, mic); // before anything starts, so a mic error leaves nothing running

  const [videoTrack] = stream.getVideoTracks();
  const processor = new MediaStreamTrackProcessor({ track: videoTrack });
  const generator = new MediaStreamTrackGenerator({ kind: 'video' });

  processor.readable
    .pipeThrough(new TransformStream({
      transform(frame, controller) {
        let out;
        try {
          const visibleRect = cropFor(frame);
          outSize ??= { w: visibleRect.width, h: visibleRect.height };
          out = new VideoFrame(frame, { visibleRect, displayWidth: outSize.w, displayHeight: outSize.h });
        } catch (e) {
          console.warn('frame skipped', e);
        } finally {
          frame.close();
        }
        if (out) controller.enqueue(out);
      },
    }))
    .pipeTo(generator.writable)
    .catch(() => {}); // ends when the source track stops

  const mimeType = pickMime(format);
  recorder = new MediaRecorder(new MediaStream([generator, ...audioTracks]), {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start(1000);

  const startedAt = Date.now();
  ticker = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'tick', elapsed: Date.now() - startedAt }).catch(() => {});
  }, 1000);
}

function stop() {
  return new Promise((resolve, reject) => {
    if (!recorder || recorder.state === 'inactive') return reject(new Error('nothing is being recorded'));
    const rec = recorder;
    rec.onstop = () => {
      const mime = (rec.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mime });
      cleanupMedia();
      resolve({ url: URL.createObjectURL(blob), mime, size: blob.size });
    };
    rec.onerror = (e) => reject(e.error || new Error('recorder error'));
    rec.stop();
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return;
  (async () => {
    try {
      switch (msg.type) {
        case 'prepare': await prepare(msg); return sendResponse({ ok: true });
        case 'start': await start(msg); return sendResponse({ ok: true });
        case 'mic-status': return sendResponse({ ok: true, state: await micStatus() });
        case 'stop': return sendResponse({ ok: true, ...(await stop()) });
        case 'viewport': viewport = msg.viewport; return sendResponse({ ok: true });
        case 'revoke': URL.revokeObjectURL(msg.url); return sendResponse({ ok: true });
        case 'reset': cleanupMedia(); return sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});
