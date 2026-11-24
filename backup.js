import {validateSnapshot} from './schema.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', {fatal:true});
export const version = 2;
const kdf = 'PBKDF2-SHA256';
const iterations = 600000;
const cipher = 'AES-256-GCM';
export const cryptoDescriptor = Object.freeze({version, kdf, iterations, cipher});

export function encode64(bytes) {
  let string = '';
  for (let i = 0; i < bytes.length; i += 16384) {
    string += String.fromCharCode(...bytes.subarray(i, i + 16384));
  }
  return btoa(string);
}
export function decode64(string) {
  if (typeof string !== 'string') throw Error('Missing encrypted data.');
  const bytes = Uint8Array.from(atob(string), c => c.charCodeAt(0));
  if (encode64(bytes) !== string) throw Error('Invalid encrypted data.');
  return bytes;
}
export function newSalt() {
  return encode64(crypto.getRandomValues(new Uint8Array(16)));
}
export function checkNewPassword(password) {
  if (typeof password !== 'string' || [...password].length < 12) {
    throw Error('Use a password with at least 12 characters.');
  }
}
export function validDescriptor(h) {
  return h?.version === version && h.kdf === kdf && h.iterations === iterations && h.cipher === cipher;
}
export async function deriveKey(password, encodedSalt) {
  if (typeof password !== 'string') throw Error('Enter your password.');
  const salt = decode64(encodedSalt);
  if (salt.length !== 16) throw Error('Invalid encryption salt.');
  const utf8 = encoder.encode(password);
  let material;
  try {
    material = await crypto.subtle.importKey('raw',utf8,'PBKDF2',false,['deriveKey']);
  } finally {
    utf8.fill(0);
  }
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},
    material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function algorithm(iv, purpose) {
  return {name:'AES-GCM',iv,tagLength:128,additionalData:encoder.encode('Dayleaf/v2/' + purpose)};
}
export async function seal(key, value, purpose) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = encoder.encode(JSON.stringify(value));
  try {
    const encrypted = await crypto.subtle.encrypt(algorithm(iv,purpose),key,bytes);
    return {iv:encode64(iv),data:encode64(new Uint8Array(encrypted))};
  } finally {
    bytes.fill(0);
  }
}
export async function unseal(key, sealed, purpose) {
  const iv = decode64(sealed.iv);
  if (iv.length !== 12) throw Error('Invalid encryption nonce.');
  const bytes = new Uint8Array(await crypto.subtle.decrypt(algorithm(iv,purpose),key,decode64(sealed.data)));
  try {
    return JSON.parse(decoder.decode(bytes));
  } finally {
    bytes.fill(0);
  }
}
export async function makeDat(snapshot, key, salt) {
  validateSnapshot(snapshot);
  const sealed = await seal(key,snapshot,'portable-backup');
  return JSON.stringify({format:'dayleaf-dat', ...cryptoDescriptor, salt, ...sealed});
}
export async function decryptBackup(text,password) {
  try {
    const envelope = JSON.parse(text);
    if (envelope?.format !== 'dayleaf-dat' || !validDescriptor(envelope)) throw Error('Unsupported backup.');
    const key = await deriveKey(password,envelope.salt);
    return validateSnapshot(await unseal(key,envelope,'portable-backup'));
  } catch {
    throw Error('Could not open this backup. Check the password and that the file is a complete Dayleaf backup.');
  }
}

