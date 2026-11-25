export const appId = 'dayleaf';
export const appName = 'DayLeaf';

const published = new URL('./terms.json?current', import.meta.url);
const bundled = new URL('./terms.json', import.meta.url);
const cacheName = 'app-terms-document:' + bundled.pathname;
let inFlight;

function validate(doc) {
  if (doc?.appId !== appId || !/^\d+(\.\d+)*$/.test(doc.version) ||
      !['draft','approved'].includes(doc.status) || typeof doc.text !== 'string' ||
      !doc.text.startsWith(appName + ' Terms of Service\n') ||
      !doc.text.split('\n')[2]?.startsWith('Version ' + doc.version + ' ')) {
    throw Error('The updated agreement could not be verified. Reload to try again.');
  }
  return doc;
}

async function readTerms() {
  let cache;
  try { cache = await caches.open(cacheName); } catch { /* Site storage can be restricted. */ }
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    response = await fetch(published, {cache:'no-store', signal:controller.signal});
    if (response.ok) {
      const doc = validate(await response.json());
      try { await cache?.put(bundled,new Response(JSON.stringify(doc))); } catch { /* The release also bundles these terms. */ }
      return doc;
    }
  } catch (error) {
    if (response?.ok && error.name !== 'AbortError') throw error;
  } finally { clearTimeout(timer); }
  // The installed shell and the last online check can have different versions.
  const copies = await Promise.allSettled([cache?.match(bundled), fetch(bundled)].map(async source => {
    const local = await source;
    if (local?.ok) return validate(await local.json());
  }));
  const available = copies.filter(copy => copy.status === 'fulfilled' && copy.value).map(copy => copy.value);
  if (!available.length) throw Error('Your terms are unavailable. Reconnect and open the app again.');
  return available.sort((a,b) => b.version.localeCompare(a.version, 'en', {numeric:true}))[0];
}

export function currentTerms() {
  if (!inFlight) inFlight = readTerms().finally(() => { inFlight = undefined; });
  return inFlight;
}

