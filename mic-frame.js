// Loaded in an invisible frame on the page being recorded. Because the frame
// belongs to the extension, Chrome shows its normal permission box on the page
// as "Region Recorder wants to…". The answer goes back to the overlay.
const id = new URLSearchParams(location.search).get('id');
const reply = (data) => parent.postMessage({ rrMicFrame: id, ...data }, '*');

navigator.mediaDevices.getUserMedia({ audio: true })
  .then((s) => {
    s.getTracks().forEach((t) => t.stop());
    reply({ state: 'granted' });
  })
  .catch((e) => reply({ state: 'error', name: e?.name, message: String(e?.message || '') }));
