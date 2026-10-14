import { LOCAL_KEY, DRAFT_KEY } from "./config.js";

const DB_NAME = "gym-tracker-data";
const DB_VERSION = 1;
const STORE = "snapshots";
const CURRENT = "current";

function openDatabase(factory = globalThis.indexedDB) {
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    let request;
    try { request = factory.open(DB_NAME, DB_VERSION); } catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || Error("IndexedDB open failed"));
    request.onblocked = () => reject(Error("IndexedDB upgrade blocked by another tab"));
  });
}
function idbOperation(db, mode, operation) {
  return new Promise((resolve, reject) => {
    let tx, request;
    try {
      tx = db.transaction(STORE, mode);
      request = operation(tx.objectStore(STORE));
    } catch (error) { reject(error); return; }
    let result;
    request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || Error("IndexedDB transaction aborted"));
  });
}
function parseLegacy(storage, toast) {
  try {
    const raw = storage.getItem(LOCAL_KEY);
    const main = raw ? JSON.parse(raw) : {};
    if (!main || typeof main !== "object" || Array.isArray(main)) throw Error("Invalid stored data");
    const fallback = storage.getItem(DRAFT_KEY);
    const drafts = main.drafts ?? (fallback ? JSON.parse(fallback) : {});
    if (!drafts || typeof drafts !== "object" || Array.isArray(drafts)) throw Error("Invalid drafts");
    return {
      sessions: Array.isArray(main.sessions) ? main.sessions : [],
      body: Array.isArray(main.body) ? main.body : [],
      custom: Array.isArray(main.custom) ? main.custom : [],
      schedules: Array.isArray(main.schedules) ? main.schedules : [],
      preferences: main.preferences && typeof main.preferences === "object" ? main.preferences : {},
      drafts
    };
  } catch (error) {
    toast("Stored data could not be read. Restore a JSON backup.");
    throw error; // Never replace invalid legacy records with an empty database.
  }
}
export function createLocalStorage({state, preferences, toast, storage = globalThis.localStorage, factory = globalThis.indexedDB}) {
  let db = null, ready = false, queue = Promise.resolve(), current = null;
  const snapshot = () => ({
    sessions: state.sessions, body: state.body, custom: state.custom,
    drafts: state.drafts, schedules: state.schedules, preferences: preferences()
  });
  function readLocal() {
    if (current) return current;
    return parseLegacy(storage, toast);
  }
  function loadDrafts() {
    // Boot hydration occurs in initialize(); preserve this method for legacy callers.
    if (current) state.drafts = current.drafts || {};
    else {
      try { state.drafts = parseLegacy(storage, toast).drafts; }
      catch { state.drafts = {}; }
    }
  }
  async function initialize() {
    if (ready) return readLocal();
    // Validate the source before creating a new IndexedDB record. A pre-existing
    // current snapshot takes priority even when legacy data is subsequently stale.
    let legacy;
    try { legacy = parseLegacy(storage, toast); } catch (error) { legacy = null; }
    try {
      db = await openDatabase(factory);
      if (db) {
        const existing = await idbOperation(db, "readonly", store => store.get(CURRENT));
        if (existing) { current = existing; ready = true; return current; }
        if (!legacy) throw Error("Legacy data needs manual recovery before migration");
        await idbOperation(db, "readwrite", store => store.put(legacy, CURRENT));
        const verified = await idbOperation(db, "readonly", store => store.get(CURRENT));
        if (JSON.stringify(verified) !== JSON.stringify(legacy)) throw Error("Migration verification failed");
        current = verified; ready = true; return current;
      }
    } catch (error) {
      if (!legacy) throw error;
      toast("IndexedDB unavailable; using existing browser storage. Export a backup.");
      db = null;
    }
    if (!legacy) throw Error("No valid local data available");
    current = legacy; ready = true; return current;
  }
  function writeLocal() {
    // Existing synchronous callers are supported in localStorage-only environments.
    if (db) throw Error("Use commit() for IndexedDB writes");
    try {
      const data = snapshot();
      storage.setItem(LOCAL_KEY, JSON.stringify(data));
      current = data;
      return true;
    } catch { return false; }
  }
  function commit() {
    const data = structuredClone(snapshot());
    const task = queue.catch(() => {}).then(async () => {
      if (!ready) await initialize();
      if (db) {
        await idbOperation(db, "readwrite", store => store.put(data, CURRENT));
        current = data;
        // Best-effort compatibility mirror. Never fail an IDB commit due to quota.
        try { storage.setItem(LOCAL_KEY, JSON.stringify(data)); } catch {}
      } else {
        storage.setItem(LOCAL_KEY, JSON.stringify(data));
        current = data;
      }
    });
    queue = task;
    return task;
  }
  return {initialize, readLocal, writeLocal, loadDrafts, commit, snapshot};
}
