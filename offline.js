const protocol = 'dayleaf-offline-v2';
const build = '9c913beb82292945e211'; // generated offline build
const scope = new URL('./', import.meta.url).href;
const workerURL = new URL('sw.js', scope).href;

function checkController(worker, repair) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      channel.port1.close();
      reject(Error('Offline worker did not respond.'));
    }, 20000);
    channel.port1.onmessage = event => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    try {
      worker.postMessage({ type: 'dayleaf:check', repair }, [channel.port2]);
    } catch (error) {
      clearTimeout(timeout);
      channel.port1.close();
      reject(error);
    }
  });
}

export function startOffline(onStatus) {
  const service = navigator.serviceWorker;
  if (!service || !window.isSecureContext) {
    onStatus('Offline setup needs HTTPS', false);
    return;
  }
  let sequence = 0;
  let registration;
  let currentInstall;
  let checking;
  let checkedAt = 0;
  const set = (label, ready = false) => onStatus(label, ready);

  async function check() {
    const ticket = ++sequence;
    const worker = service.controller;
    set('Checking offline files…');
    if (worker?.state === 'activating') {
      worker.addEventListener('statechange', check, { once: true });
      set('Preparing offline copy…');
      return;
    }
    if (!worker || worker.scriptURL !== workerURL || worker.state !== 'activated') {
      set(currentInstall ? 'Preparing offline copy…' : 'Offline setup incomplete');
      return;
    }
    try {
      const result = await checkController(worker, navigator.onLine);
      if (ticket !== sequence || worker !== service.controller) return;
      if (result.protocol !== protocol || result.build !== build) {
        set('Update installed · reopen Dayleaf');
      } else if (result.ready) {
        set('Ready for offline use', true);
      } else {
        set('Offline setup incomplete · reopen online to retry');
      }
    } catch {
      if (ticket === sequence) set('Offline setup incomplete · reopen online to retry');
    }
  }

  function observeInstall() {
    const worker = registration?.installing;
    if (!worker || worker === currentInstall) return;
    currentInstall = worker;
    if (!service.controller) set('Preparing offline copy…');
    const changed = () => {
      if (worker.state === 'redundant' || worker.state === 'activated') {
        worker.removeEventListener('statechange', changed);
        if (worker === currentInstall) currentInstall = null;
        check();
      }
    };
    worker.addEventListener('statechange', changed);
  }

  async function connect(update) {
    set('Checking offline files…');
    try {
      let match = await service.getRegistration(scope);
      if (match?.scope !== scope || (!match.active && !match.installing && !match.waiting)) {
        match = await service.register(workerURL, { scope, updateViaCache: 'none' });
      }
      if (registration !== match) {
        registration?.removeEventListener('updatefound', observeInstall);
        registration = match;
        registration.addEventListener('updatefound', observeInstall);
      }
      observeInstall();
      if (update && navigator.onLine && registration.active && !registration.installing) {
        // An existing cached release stays usable if the static host is unavailable.
        registration.update().catch(() => {});
      }
      await check();
    } catch {
      if (service.controller?.scriptURL === workerURL) await check();
      else set('Offline setup incomplete · reopen online to retry');
    }
  }

  function recheck() {
    if (checking) return checking;
    checkedAt = Date.now();
    checking = connect(false).finally(() => { checking = null; });
    return checking;
  }
  service.addEventListener('controllerchange', check);
  service.addEventListener('message', event => {
    if (event.source === service.controller && event.data?.type === 'dayleaf:cache-changed') check();
  });
  window.addEventListener('online', () => connect(true));
  window.addEventListener('offline', check);
  window.addEventListener('pageshow', event => { if (event.persisted) recheck(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recheck();
  });
  // Reverify after returning from another app, even if the page was not suspended.
  window.addEventListener('focus', () => { if (Date.now() - checkedAt > 1500) recheck(); });
  connect(true);
  return recheck;
}
