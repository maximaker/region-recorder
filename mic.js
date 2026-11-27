// Shows Chrome's microphone prompt for the extension, then reports back.
const $ = (id) => document.getElementById(id);
const answer = (state) => chrome.runtime.sendMessage({ type: 'mic-answer', state }).catch(() => {});

async function ask() {
  $('allow').disabled = true;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    $('icon').classList.add('ok');
    $('title').textContent = 'Microphone ready';
    $('text').textContent = 'Taking you back to your tab. Press Record when you are ready.';
    $('allow').hidden = true;
    $('close').hidden = true;
    answer('granted');
  } catch (e) {
    const blocked = e?.name === 'NotAllowedError';
    $('title').textContent = blocked ? 'The microphone is blocked' : 'No microphone found';
    $('text').textContent = blocked
      ? 'Chrome is set to block it for Region Recorder. Allow it in the microphone settings, then try again.'
      : 'Plug in or turn on a microphone, then try again.';
    $('allow').textContent = 'Try again';
    $('allow').disabled = false;
    $('settings').hidden = !blocked;
  }
}

$('allow').addEventListener('click', ask);
$('close').addEventListener('click', () => { answer('dismissed'); window.close(); });
$('settings').addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}` });
});

ask();
