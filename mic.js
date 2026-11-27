// Asks Chrome for the microphone on the extension's behalf, then reports back.
// The request waits for a click: Chrome shows its full prompt for a click,
// but may shrink a request made on page load into an easy-to-miss chip.
const $ = (id) => document.getElementById(id);
const answer = (state) => chrome.runtime.sendMessage({ type: 'mic-answer', state }).catch(() => {});

async function ask() {
  $('allow').disabled = true;
  $('text').textContent = 'Choose Allow in the box Chrome shows at the top left of this window.';
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
$('close').addEventListener('click', () => answer('dismissed'));
$('settings').addEventListener('click', () => {
  chrome.tabs.create({ url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(location.origin)}` });
});

// Already allowed (e.g. from Options)? Skip the click.
navigator.permissions.query({ name: 'microphone' })
  .then((p) => { if (p.state === 'granted') ask(); })
  .catch(() => {});
