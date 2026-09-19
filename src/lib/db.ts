/**
 * IndexedDB: almacén de los blobs de vídeo.
 *
 * Un solo object store (`blobs`) con el id de la grabación como clave.
 * Los metadatos viven en localStorage (`store.ts`); aquí solo van los bytes.
 */
const DB_NAME = 'cminds-teleprompter';
const DB_VERSION = 1;
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
  });

  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        // El éxito de la petición no implica que la transacción ya se guardó.
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error ?? new Error('No se pudo guardar en IndexedDB'));
        request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB'));
      }),
  );
}

export const putBlob = (key: string, blob: Blob): Promise<IDBValidKey> =>
  tx('readwrite', (store) => store.put(blob, key));

export const getBlob = (key: string): Promise<Blob | undefined> =>
  tx('readonly', (store) => store.get(key) as IDBRequest<Blob | undefined>);

export const deleteBlob = (key: string): Promise<undefined> =>
  tx('readwrite', (store) => store.delete(key));

/** Claves guardadas. Sirve para detectar vídeos sin ficha que los reclame. */
export const listBlobKeys = (): Promise<string[]> =>
  tx('readonly', (store) => store.getAllKeys() as IDBRequest<IDBValidKey[]>).then((keys) =>
    keys.map(String),
  );

/** Espacio usado y disponible, para avisar antes de que falle una grabación. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
