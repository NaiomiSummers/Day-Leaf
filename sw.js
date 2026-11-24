// Only the immutable app files below can enter this cache.
const protocol = 'dayleaf-offline-v2';
// BEGIN GENERATED ASSETS
const build = '9c913beb82292945e211';
const assetDigests = {
  "app.js": "28be34e91bae5dafc7b60ddb5d9335f0a0d95c2e4d7fdaef7b15c2c374a88eaf",
  "assess.css": "96353a77ef49cf38d479adf974a21943707cf13a2b0708cfe1abf81a26b2403b",
  "assess.js": "57b523ea137abb7eb1052d20845b4714575b8e280a75a5fb29d6fdbeaadc4662",
  "assets/hills.webp": "624af362f50b9921ae62619bb6982ec65e6a5f8b7a9d352d6e8a738ccac4014d",
  "assets/icon-192.png": "d2188b0f9d799c95a75195e7996de999f76c12fe31c0e122c26eec69f963ad1a",
  "assets/icon-512.png": "6fdf6a1d578ac13183606af1f7451074f2aa6fa36da538cfa9b6c9113a582c8d",
  "assets/pdf-lib.js": "b8b2e5fe87a89a48c88331822d9ed36f0239a783649f03cce4a9948cbb173e68",
  "assets/touch.png": "81f575d5763ec12c56fcf7f0940bfb3b4b7aedd78c66ce01da8e00e905a09360",
  "backup.js": "a3c2390941afc7f629337812232175c027a14bda4dbe8a43c6d5db23db79dd50",
  "daily.css": "95e36725d2aa1ea22e798be9cb5064c3f4bc93a587497128a4a333df9f0adf04",
  "daily.js": "2b579eb295af17fb0c13a80970831e0e140e6172540774e82c5467ac63859e9f",
  "forms/followup.pdf": "d2b562a45d227b394a7c07ec62f0d95803c900b9be6e4cc6576af6af8f2da649",
  "forms/followup.png": "16ee21ea3d2095d9edceebf047c43c1010befdfb04038643b20dbd1c63bbdb33",
  "forms/passages.js": "30ffee02f7a01744285165c458b1fc2deb44c2a61d63956e72bf836f319fcdec",
  "forms/recent.pdf": "71be49140ae40dc18788696b89f2effdc25ac953e5ff5215c6bbf640bec290e0",
  "forms/recent.png": "896273eb2948881bdafa9d5323d0f9c3740cd3afe4ce04d96b5bfd0bcdec4a8e",
  "icons.js": "a41f15acdd285e6aa4f81ecab26086c22f830cfca1521bc96bd06ca76cef56d1",
  "index.html": "170afe72e0ec96cec94154ecc6c9cfd13e08fac720320cd4bf5b9e02fe89450a",
  "manifest.webmanifest": "052343275c4760068a5bca5bcb37f99c25708e136fc4a2706ab87d28445c5d73",
  "offline.js": "6b2541699c8214353600b475f4cb5a08cac74d82fbb268d969818b2d6875311d",
  "pdf-export.js": "9202a45ae66d6f02fb926c8052f5ced44df370e1523ed23bce240e583da503ac",
  "report-actions.js": "c3cc801adfd889221232932e5961e1f318f7a8b29a21e98a4d08289f6e36d92d",
  "review.css": "daf1da400ea7156d7a668909146677db7ab8066b00de31ebf7b5b07811ce6298",
  "review.js": "70ffbb4ecf53aad37bc1a397016620ca88e63d557bee5fe682a26c34cd4d5842",
  "schema.js": "2e2c313edd1995780819d2e017047b740dd6c42bd3de6251c688b212141eaceb",
  "settings.js": "0ec93f03d9701bea34a841b26bba44a713af81e2834b59e32e16030d9c134811",
  "store.js": "5349499e8e5aedbe557d990b82129b799d67c5e7f88cb4298daffaf70674027c",
  "style.css": "b444a51ad4387004520080e71ba9267cba286ebe71af50a03f0a6060cbf57685",
  "vault-screen.js": "520a47cfc069f2b763c1d4e09d5b3198f10e53528ce0d7b55648a1d46235895a"
};
// END GENERATED ASSETS

const scope = new URL(self.registration.scope);
const prefix = protocol + '|' + encodeURIComponent(scope.pathname) + '|';
const cacheName = prefix + build;
const assetURLs = new Map(Object.keys(assetDigests).map(name => [new URL(name, scope).href, name]));
const home = new URL('index.html', scope).href;
const legacyCache = 'dayleaf-static-' + scope.pathname + '-v1.0.0-final';

async function validAsset(url, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return false;
  const name = assetURLs.get(url);
  if (!name) return false;
  const bytes = /\.(html|css|js|webmanifest)$/.test(name)
    ? new TextEncoder().encode((await response.text()).replace(/\r\n/g, '\n'))
    : await response.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  return hex === assetDigests[name];
}

async function download(cache, url) {
  const response = await fetch(url, { cache: 'no-store', redirect: 'error' });
  if (!(await validAsset(url, response.clone()))) throw Error('Incomplete static release.');
  await cache.put(url, response.clone());
  return response;
}

async function checkFiles(repair) {
  const cache = await caches.open(cacheName);
  const results = await Promise.allSettled([...assetURLs.keys()].map(async url => {
    if (await validAsset(url, await cache.match(url))) return true;
    if (!repair) return false;
    await download(cache, url);
    return true;
  }));
  return results.every(result => result.status === 'fulfilled' && result.value);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    if (!(await checkFiles(true))) throw Error('Offline setup could not verify all required files.');
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const discard = (await caches.keys()).filter(key =>
      key === legacyCache || (key.startsWith(prefix) && key !== cacheName));
    await Promise.all(discard.map(key => caches.delete(key)));
  })());
});

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port || event.data?.type !== 'dayleaf:check') return;
  event.waitUntil((async () => {
    try {
      const ready = await checkFiles(event.data.repair === true);
      port.postMessage({ protocol, build, ready });
    } catch {
      port.postMessage({ protocol, build, ready: false });
    }
  })());
});

async function tellClients() {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) client.postMessage({ type: 'dayleaf:cache-changed' });
}

async function servePDF(response, range) {
  const pair = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!pair || (!pair[1] && !pair[2])) return response;
  const bytes = await response.arrayBuffer();
  const length = bytes.byteLength;
  const start = pair[1] ? Number(pair[1]) : Math.max(0, length - Number(pair[2]));
  const end = pair[1] && pair[2] ? Math.min(Number(pair[2]), length - 1) : length - 1;
  if (start > end || start >= length) {
    return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + length } });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': 'application/pdf',
      'Accept-Ranges': 'bytes',
      'Content-Range': 'bytes ' + start + '-' + end + '/' + length,
      'Content-Length': String(end - start + 1)
    }
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  url.hash = '';
  const key = url.href === scope.href ? home : url.href;
  if (!assetURLs.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    let response = await cache.match(key);
    if (!response) {
      // A browser may evict a previously verified file. Surface the change even offline.
      try {
        response = await download(cache, key);
      } finally {
        await tellClients();
      }
    }
    const range = event.request.headers.get('Range');
    return range && key.endsWith('.pdf') ? servePDF(response, range) : response;
  })());
});
