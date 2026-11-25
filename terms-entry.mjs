import { appId, currentTerms } from './terms.mjs';
import { showTerms, displayDocument } from './terms-ui.mjs';

const receipt = 'agreed+safety-v1';
const shell = document.querySelector('#application-template');
let activeKey;
let checking;

function accepted(key) {
  try { return localStorage.getItem(key) === receipt; }
  catch { return false; }
}

async function check() {
  const doc = await currentTerms();
  const key = appId + ':terms:' + doc.version;
  if (activeKey !== key) displayDocument(doc);
  activeKey = key;
  if (accepted(key)) return;
  await showTerms(() => {
    try {
      localStorage.setItem(key, receipt);
      if (!accepted(key)) throw Error();
    } catch {
      throw Error('Could not save your agreement in this browser. Allow site storage and try again.');
    }
  });
}

function ensureAgreement() {
  if (!checking) checking = check().catch(error => {
    const failure = document.createElement('dialog');
    failure.setAttribute('aria-label','Terms of Service unavailable');
    const message = document.createElement('p');
    message.textContent = error.message || 'Could not open the terms. Reconnect and reload.';
    const retry = document.createElement('button');
    retry.textContent = 'Reload';
    retry.onclick = () => location.reload();
    failure.append(message,retry);
    failure.addEventListener('cancel', event => event.preventDefault());
    document.body.append(failure);
    failure.showModal();
    throw error;
  }).finally(() => { checking = undefined; });
  return checking;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'}).catch(() => {});
}
await ensureAgreement();
window.addEventListener('storage', event => {
  if (event.key === activeKey || event.key === null) ensureAgreement();
});
window.addEventListener('pageshow', event => { if (event.persisted) ensureAgreement(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') ensureAgreement();
});
window.addEventListener('online', ensureAgreement);
const entry = shell.dataset.entry;
shell.replaceWith(shell.content);
document.querySelector('#terms-loading')?.remove();
await import(entry);

