// Cliente: gestión de claves ECDSA P-256 no exportables en IndexedDB.
// La clave privada nunca sale del navegador. Cada dispositivo tiene un par
// asociado al `devicePublicId` que devuelve el servidor tras registrar.

const DB_NAME = "cedim-devices";
const STORE = "keys";
const CURRENT_KEY = "current";
const CURRENT_ID_KEY = "device_public_id";

type StoredKey = {
  privateKey: CryptoKey;
  publicKeyJwk: JsonWebKey;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  return await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function b64u(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function getLocalDevicePublicId(): Promise<string | null> {
  const v = await idbGet<string>(CURRENT_ID_KEY);
  return v ?? null;
}

export async function setLocalDevicePublicId(id: string): Promise<void> {
  await idbSet(CURRENT_ID_KEY, id);
}

export async function clearLocalDevice(): Promise<void> {
  await idbDelete(CURRENT_KEY);
  await idbDelete(CURRENT_ID_KEY);
}

/** Devuelve el par existente o genera uno nuevo no exportable. */
export async function getOrCreateKeyPair(): Promise<StoredKey> {
  const existing = await idbGet<StoredKey>(CURRENT_KEY);
  if (existing?.privateKey && existing?.publicKeyJwk) return existing;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const stored: StoredKey = { privateKey: pair.privateKey, publicKeyJwk };
  await idbSet(CURRENT_KEY, stored);
  return stored;
}

export async function signChallenge(challenge: string): Promise<string> {
  const { privateKey } = await getOrCreateKeyPair();
  const data = new TextEncoder().encode(challenge);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    data,
  );
  return b64u(new Uint8Array(sig));
}

export async function getPublicKeyJwk(): Promise<JsonWebKey> {
  const { publicKeyJwk } = await getOrCreateKeyPair();
  return publicKeyJwk;
}
