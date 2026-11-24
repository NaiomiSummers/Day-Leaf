import {mark, icon} from './icons.js';

export function drawGate(exists, authenticate) {
  const gate = document.querySelector('#vault');
  const title = exists ? 'Unlock your journal' : 'Create your private vault';
  const help = exists
    ? 'Enter your vault password to open Dayleaf on this device.'
    : 'Your password encrypts your entries and drafts on this device. Choose at least 12 characters. A forgotten password cannot be recovered.';
  gate.innerHTML = `<div class="vault-wrap">
    <div class="brand vault-brand">${mark}<div><strong>Dayleaf</strong><small>Personal journal</small></div></div>
    <section class="card vault-card" aria-labelledby="vault-title">
      <div class="vault-landscape" aria-hidden="true"></div>
      <div class="vault-inner">
        <h1 id="vault-title">${title}</h1>
        <p class="muted">${help}</p>
        <form class="stack" autocomplete="off" data-vault-form>
          <label class="field"><span>Vault password</span>
            <input type="password" name="password" required ${exists ? '' : 'minlength="12"'} autocomplete="off" autocapitalize="none" spellcheck="false"></label>
          ${exists ? '' : '<label class="field"><span>Confirm vault password</span><input type="password" name="confirm" required minlength="12" autocomplete="off" autocapitalize="none" spellcheck="false"></label>'}
          <p class="vault-message" role="status" aria-live="polite" data-vault-message></p>
          <button class="btn primary" type="submit">${icon('lock',17)}${exists ? 'Unlock vault' : 'Create vault'}</button>
        </form>
        ${exists ? '' : '<p class="muted vault-move-note">Have a Dayleaf .dat backup? Create a vault on this device, then open Settings to restore it.</p>'}
      </div>
    </section>
    <div class="vault-offline"><span class="status-dot" data-status-dot></span><span data-offline-status></span></div>
  </div>`;
  const form = gate.querySelector('form');
  form.onsubmit = async event => {
    event.preventDefault();
    const password = form.elements.password.value;
    const message = form.querySelector('[data-vault-message]');
    if (!exists && Array.from(password).length < 12) {
      message.textContent = 'Choose a password of at least 12 characters.';
      return;
    }
    if (!exists && password !== form.elements.confirm.value) {
      message.textContent = 'The passwords do not match. Enter them again.';
      return;
    }
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    message.textContent = exists ? 'Unlocking…' : 'Creating your vault…';
    form.reset();
    try {
      await authenticate(password);
    } catch (error) {
      if (!form.isConnected) return;
      message.textContent = error.message || 'The vault could not be opened.';
      form.elements.password.focus();
    } finally {
      button.disabled = false;
    }
  };
}

