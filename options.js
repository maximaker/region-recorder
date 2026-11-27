const DEFAULTS = { folder: 'Region Recordings', format: 'auto', tabAudio: true, mic: false, showClicks: true };
const $ = (id) => document.getElementById(id);
const say = (text) => {
  $('status').textContent = text;
  setTimeout(() => { if ($('status').textContent === text) $('status').textContent = ''; }, 3000);
};

chrome.storage.sync.get(DEFAULTS).then((s) => {
  $('folder').value = s.folder;
  $('format').value = s.format;
  $('tabAudio').checked = s.tabAudio;
  $('mic').checked = s.mic;
  $('showClicks').checked = s.showClicks;
});

// Ticking the mic asks Chrome for permission right here, once.
$('mic').addEventListener('change', async () => {
  if (!$('mic').checked) return;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch (e) {
    $('mic').checked = false;
    say(e?.name === 'NotAllowedError' ? 'Chrome blocked the microphone.' : 'No microphone found.');
  }
});

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    folder: $('folder').value.trim(),
    format: $('format').value,
    tabAudio: $('tabAudio').checked,
    mic: $('mic').checked,
    showClicks: $('showClicks').checked,
  });
  say('Saved.');
});

$('open').addEventListener('click', () => chrome.downloads.showDefaultFolder());
