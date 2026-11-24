import {stores,emptyRecords,validateRecord,validateSnapshot} from './schema.js';
import {cryptoDescriptor,validDescriptor,checkNewPassword,newSalt,deriveKey,seal,unseal,makeDat} from './backup.js';

export {stores,validateSnapshot};
export const db = emptyRecords();
const databaseName = 'dayleaf-vault-v2:' + new URL('./',import.meta.url).pathname;
const tableNames = ['meta','sealed'];
const locked = () => Error('Unlock the vault to continue.');
const conflict = () => Error('This journal changed. Reopen the vault and review the latest records.');
let connection;
let channel;
let session = null;
let authGeneration = 0;
let editGeneration = 0;
let pending = Promise.resolve();
let locking = null;
let changed = () => {};
let failed = () => {};

function result(request) {
  return new Promise((resolve,reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function finished(tx) {
  return new Promise((resolve,reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || Error('The transaction was interrupted.'));
  });
}
function serialize(operation) {
  const work = pending.then(operation);
  // A queue barrier must never retain the previous plaintext snapshot or row
  // as its fulfilled value after the vault has locked.
  pending = work.then(() => {}, () => {});
  return work;
}
function requireSession() {
  if (!session) throw locked();
  return session;
}
function checkSession(expected) {
  if (!expected || session !== expected) throw locked();
}
function checkAuth(generation) {
  if (generation !== authGeneration) throw locked();
}
function readHeader() {
  return result(connection.transaction('meta').objectStore('meta').get('vault'));
}
function readRows() {
  const tx = connection.transaction(tableNames);
  return Promise.all([
    result(tx.objectStore('meta').get('vault')),
    result(tx.objectStore('sealed').getAll())
  ]);
}
export async function openStore(onChange = () => {}, onFailure = () => {}) {
  changed = onChange;
  failed = onFailure;
  if (!connection) {
    const open = indexedDB.open(databaseName,1);
    open.onupgradeneeded = () => {
      for (const name of tableNames) open.result.createObjectStore(name,{keyPath:'id'});
    };
    connection = await result(open);
    connection.onversionchange = () => {
      lockVault().catch(failed);
      connection.close();
      failed(Error('The journal database changed. Reload the app.'));
    };
    if (typeof BroadcastChannel === 'function') {
      channel = new BroadcastChannel(databaseName);
      channel.onmessage = () => {
        if (isUnlocked()) failed(conflict());
      };
    }
  }
  return vaultExists();
}
export async function vaultExists() {
  return Boolean(await readHeader());
}
export const isUnlocked = () => session !== null;
export function vaultRevision() {
  requireSession();
  return editGeneration;
}
function identifier(store,id) {
  return store + '/' + id;
}
function activate(header,key,records,handles) {
  const committed = new Map();
  for (const name of stores) {
    db[name] = records[name];
    for (const row of records[name]) committed.set(identifier(name,row.id),row);
  }
  session = {salt:header.salt,key,revision:header.revision,handles,committed,
    knownHandles:new Set(handles.values()),restoring:false};
  editGeneration++;
}
function checkHeader(header) {
  if (!validDescriptor(header) || !Number.isSafeInteger(header.revision) || header.revision < 0 ||
      !Number.isSafeInteger(header.count) || header.count < 0) {
    throw Error('The vault format is unsupported or damaged.');
  }
}
export async function createVault(password) {
  if (session) throw Error('A vault is already open.');
  checkNewPassword(password);
  const generation = ++authGeneration;
  await pending;
  const salt = newSalt();
  const key = await deriveKey(password,salt);
  const verifier = await seal(key,'Dayleaf vault','verify');
  checkAuth(generation);
  const header = {id:'vault',...cryptoDescriptor,salt,...verifier,revision:0,count:0};
  const tx = connection.transaction(tableNames,'readwrite');
  const done = finished(tx);
  const count = tx.objectStore('sealed').count();
  count.onsuccess = () => {
    if (count.result || generation !== authGeneration) { tx.abort(); return; }
    // add (rather than put) protects simultaneous first-run setup in two tabs.
    tx.objectStore('meta').add(header);
  };
  try { await done; }
  catch { throw Error('Vault setup could not finish. Reopen the app before trying again.'); }
  checkAuth(generation);
  activate(header,key,emptyRecords(),new Map());
}
async function unpack(header,rows,key,checkActive) {
  checkHeader(header);
  if (rows.length !== header.count) throw Error('The vault is incomplete.');
  const handles = new Map();
  const records = emptyRecords();
  for (const item of rows) {
    checkActive();
    const {store,row} = await unseal(key,item,'record/' + item.id);
    validateRecord(store,row);
    const identity = identifier(store,row.id);
    if (handles.has(identity)) throw Error('The vault contains duplicated records.');
    handles.set(identity,item.id);
    records[store].push(row);
  }
  // Restore the original key-ordered presentation and stable backup ordering.
  for (const name of stores) records[name].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return {records,handles};
}
export async function unlockVault(password) {
  if (session) throw Error('A vault is already open.');
  const generation = ++authGeneration;
  await pending;
  const first = await readHeader();
  checkHeader(first);
  const key = await deriveKey(password,first.salt);
  try {
    const verified = await unseal(key,first,'verify');
    if (verified !== 'Dayleaf vault') throw Error();
  } catch {
    throw Error('Could not unlock the vault. Check the password and try again.');
  }
  checkAuth(generation);
  const [header,rows] = await readRows();
  if (header?.salt !== first.salt) throw conflict();
  const {records,handles} = await unpack(header,rows,key,() => checkAuth(generation));
  checkAuth(generation);
  activate(header,key,records,handles);
}
export function lockVault() {
  authGeneration++;
  editGeneration++;
  const previous = session;
  session = null;
  for (const name of stores) {
    db[name].length = 0;
    db[name] = [];
  }
  if (previous) {
    previous.closing = true;
    if (previous.restoreTx) {
      try { previous.restoreTx.abort(); } catch { /* the transaction already finished */ }
    }
    previous.key = null;
    previous.committed.clear();
    previous.handles.clear();
  }
  // Accepted puts have already started Web Crypto encryption. Drain those
  // ciphertext writes in order before a later unlock reads the database.
  if (!previous) return locking || pending;
  const drain = pending.then(() => {
    if (previous.closeFailure) throw previous.closeFailure;
  });
  locking = drain;
  const release = () => { if (locking === drain) locking = null; };
  drain.then(release,release);
  return drain;
}
async function commit(current, change, cancelOnLock = false) {
  const tx = connection.transaction(tableNames,'readwrite');
  if (cancelOnLock) current.restoreTx = tx;
  const done = finished(tx);
  const meta = tx.objectStore('meta');
  const get = meta.get('vault');
  let reason;
  get.onsuccess = () => {
    const h = get.result;
    try {
      if (h?.revision !== current.revision || h.salt !== current.salt) throw conflict();
      h.count = change(tx.objectStore('sealed'),h.count);
      h.revision++;
      meta.put(h);
    } catch (error) {
      reason = error;
      tx.abort();
    }
  };
  try { await done; } catch (error) { throw reason || error; }
  finally { if (cancelOnLock) current.restoreTx = null; }
  current.revision++;
  channel?.postMessage('changed');
}
function display(name,id,row) {
  const list = db[name];
  const index = list.findIndex(entry => entry.id === id);
  if (row) {
    if (index === -1) list.push(row);
    else list[index] = row;
  } else if (index !== -1) list.splice(index,1);
}
export function put(name,record) {
  const current = requireSession();
  if (current.restoring) throw Error('A restore is in progress. Try the edit again afterward.');
  if (!stores.includes(name) || !record || typeof record.id !== 'string') throw Error('Invalid journal entry.');
  const existing = db[name].find(row => row.id === record.id);
  const now = new Date().toISOString();
  const saved = structuredClone({...record,createdAt:existing?.createdAt || now,updatedAt:now});
  validateRecord(name,saved);
  const identity = identifier(name,saved.id);
  const handle = current.handles.get(identity) || crypto.randomUUID();
  current.handles.set(identity,handle);
  editGeneration++;
  display(name,saved.id,saved);
  // Initiate encryption while the key is still available. Queued writes carry
  // a random storage ID, nonce and ciphertext, never plaintext IndexedDB data.
  const encryption = seal(current.key,{store:name,row:saved},'record/' + handle);
  encryption.catch(() => {}); // the queue below observes and reports the error
  return serialize(async () => {
    try {
      const sealed = await encryption;
      await commit(current,(table,count) => {
        table.put({id:handle,...sealed});
        return count + (current.knownHandles.has(handle) ? 0 : 1);
      });
      current.knownHandles.add(handle);
      if (session === current) {
        current.committed.set(identity,saved);
        changed(name);
      }
      return saved;
    } catch (error) {
      if (current.closing) current.closeFailure = error;
      if (session === current) {
        if (db[name].find(r => r.id === saved.id) === saved) display(name,saved.id,current.committed.get(identity));
        failed(error);
      }
      throw error;
    }
  });
}
export function snapshot() {
  const current = requireSession();
  return serialize(async () => {
    checkSession(current);
    const [header,rows] = await readRows();
    if (header?.salt !== current.salt || header.revision !== current.revision) throw conflict();
    const {records} = await unpack(header,rows,current.key,() => checkSession(current));
    checkSession(current);
    return {app:'Dayleaf',schema:1,exportedAt:new Date().toISOString(),records};
  });
}
export async function exportDat() {
  const current = requireSession();
  const data = await snapshot();
  checkSession(current);
  const text = await makeDat(data,current.key,current.salt);
  checkSession(current);
  return text;
}
export async function replaceAll(data,expectedRevision = vaultRevision()) {
  const current = requireSession();
  if (current.restoring || expectedRevision !== editGeneration) throw conflict();
  const incoming = structuredClone(validateSnapshot(data).records);
  current.restoring = true;
  editGeneration++;
  try {
    return await serialize(async () => {
      checkSession(current);
      const sealed = [];
      const handles = new Map();
      const committed = new Map();
      for (const name of stores) {
        for (const row of incoming[name]) {
          checkSession(current);
          const id = crypto.randomUUID();
          const identity = identifier(name,row.id);
          sealed.push({id,...await seal(current.key,{store:name,row},'record/' + id)});
          handles.set(identity,id);
          committed.set(identity,row);
        }
      }
      checkSession(current);
      // Encrypt and validate the entire candidate before touching the live
      // store. clear, all adds and the revision update commit or abort together.
      await commit(current,table => {
        checkSession(current);
        table.clear();
        for (const row of sealed) table.add(row);
        return sealed.length;
      },true);
      if (session === current) {
        current.handles = handles;
        current.knownHandles = new Set(handles.values());
        current.committed = committed;
        for (const name of stores) db[name] = incoming[name];
        changed('restore');
      }
    });
  } finally {
    current.restoring = false;
  }
}

