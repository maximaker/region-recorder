// Copy buttons for submit-helper.html: copies the field's text and marks the button.
document.querySelectorAll('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const text = btn.closest('.field').querySelector('pre').textContent;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    btn.textContent = 'Copied';
    btn.classList.add('done');
  });
});
