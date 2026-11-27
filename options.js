const DEFAULTS = { folder: 'Region Recordings', format: 'auto', audio: true };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS).then((s) => {
  $('folder').value = s.folder;
  $('format').value = s.format;
  $('audio').checked = s.audio;
});

$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    folder: $('folder').value.trim(),
    format: $('format').value,
    audio: $('audio').checked,
  });
  $('status').textContent = 'Saved.';
  setTimeout(() => ($('status').textContent = ''), 2000);
});

$('open').addEventListener('click', () => chrome.downloads.showDefaultFolder());
