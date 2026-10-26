/**
 * Tiny key-value store on IndexedDB for what the device keeps for itself: the
 * counter's offline data (catalog snapshot, sales and customers waiting to be
 * sent) and the photos of a product form being filled. Unlike localStorage it
 * holds megabytes and survives a full browser restart.
 */
const DB_NAME = "lp2050-offline";
const STORE = "kv";

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>("readonly", (s) => s.get(key));
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return run<void>("readwrite", (s) => s.put(value, key)).then(() => undefined);
}

export function idbDelete(key: string): Promise<void> {
  return run<void>("readwrite", (s) => s.delete(key)).then(() => undefined);
}
