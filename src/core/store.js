import { DB_NAME, DB_VERSION, STORAGE_KEYS } from './constants.js';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  const attempt = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB không khả dụng trong môi trường này.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('datasets')) {
        db.createObjectStore('datasets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Không mở được IndexedDB.'));
    req.onblocked = () =>
      reject(new Error('IndexedDB bị chặn bởi một phiên khác đang mở. Hãy đóng các tab khác rồi thử lại.'));
  });
  dbPromise = attempt.catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function isIdbRequest(v) {
  return !!v && typeof v === 'object' && 'result' in v && 'onsuccess' in v;
}

function tx(store, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const os = transaction.objectStore(store);
        let result;
        try {
          result = fn(os);
        } catch (err) {
          reject(err);
          return;
        }
        // Request trả về đúng giá trị .result (có thể undefined cho delete/get
        // miss) thay vì trả về chính đối tượng request.
        transaction.oncomplete = () => resolve(isIdbRequest(result) ? result.result : result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

export const store = {
  saveDataset(dataset) {
    return tx('datasets', 'readwrite', (os) => os.put(dataset));
  },
  getDataset(id) {
    return tx('datasets', 'readonly', (os) => os.get(id));
  },
  getAllDatasets() {
    return tx('datasets', 'readonly', (os) => os.getAll());
  },
  deleteDataset(id) {
    return tx('datasets', 'readwrite', (os) => os.delete(id));
  },
  clearDatasets() {
    return tx('datasets', 'readwrite', (os) => os.clear());
  },
  saveSetting(key, value) {
    return tx('settings', 'readwrite', (os) => os.put({ key, value }));
  },
  getSetting(key) {
    return tx('settings', 'readonly', (os) => os.get(key)).then((r) => r?.value);
  },
  async getSettings() {
    const rows = await tx('settings', 'readonly', (os) => os.getAll());
    const out = Object.create(null);
    for (const r of rows || []) out[r.key] = r.value;
    return out;
  },
};

export function readLocalJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocalJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable */
  }
}

export const localKeys = STORAGE_KEYS;
