/* db.js — IndexedDB storage (QP.db). All data stays on the device. */
window.QP = window.QP || {};
(function () {
  'use strict';
  const NAME = 'qr-patrol-db';
  const VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('places')) db.createObjectStore('places', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' });
          s.createIndex('date', 'date');
          s.createIndex('placeId', 'placeId');
          s.createIndex('status', 'status');
        }
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('Could not open database'));
      req.onblocked = () => reject(new Error('Database is blocked by another tab'));
    });
    return dbPromise;
  }
  function wrap(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Database error'));
    });
  }
  async function store(name, mode) {
    const db = await open();
    return db.transaction(name, mode || 'readonly').objectStore(name);
  }
  async function getAll(name) { return wrap((await store(name)).getAll()); }
  async function get(name, key) { return wrap((await store(name)).get(key)); }
  async function put(name, value) { return wrap((await store(name, 'readwrite')).put(value)); }
  async function del(name, key) { return wrap((await store(name, 'readwrite')).delete(key)); }
  async function clear(name) { return wrap((await store(name, 'readwrite')).clear()); }
  async function count(name) { return wrap((await store(name)).count()); }
  async function byIndex(name, index, value) { return wrap((await store(name)).index(index).getAll(value)); }
  async function bulkPut(name, items) {
    if (!items || !items.length) return;
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      const s = tx.objectStore(name);
      items.forEach((i) => s.put(i));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  }

  // ---- settings / meta ----
  const DEFAULT_SETTINGS = { workingDays: [1, 2, 3, 4, 5] };
  async function getMeta(key, def) { const m = await get('meta', key); return m ? m.value : def; }
  async function setMeta(key, value) { return put('meta', { key, value }); }
  async function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, (await getMeta('settings', null)) || {}); }
  async function saveSettings(s) { return setMeta('settings', s); }

  // ---- places ----
  function sortPlaces(a, b) {
    return (a.area || '').localeCompare(b.area || '') || (a.name || '').localeCompare(b.name || '');
  }
  async function getPlaces(includeDeleted) {
    const all = await getAll('places');
    return (includeDeleted ? all : all.filter((p) => !p.deleted)).sort(sortPlaces);
  }
  async function getPlace(id) { return get('places', id); }
  async function savePlace(p) { await put('places', p); return p; }
  async function deletePlace(id) {
    const p = await get('places', id);
    if (!p) return;
    p.deleted = true; p.deletedTs = Date.now();
    await put('places', p);
  }
  async function restorePlace(id) {
    const p = await get('places', id);
    if (!p) return;
    delete p.deleted; delete p.deletedTs;
    await put('places', p);
  }
  async function newPlaceId() {
    for (let i = 0; i < 20; i++) {
      const id = QP.util.placeId();
      if (!(await get('places', id))) return id;
    }
    throw new Error('Could not generate a unique ID');
  }

  // ---- records & photos ----
  async function getAllRecords() { return getAll('records'); }
  async function getRecordsByDate(key) { return byIndex('records', 'date', key); }
  async function getRecordsByPlace(placeId) { return byIndex('records', 'placeId', placeId); }
  async function getOpenActions() { return byIndex('records', 'status', 'OPEN'); }
  async function getRecord(id) { return get('records', id); }
  async function saveRecord(rec, photoDataUrl) {
    await put('records', rec);
    if (photoDataUrl) await put('photos', { id: rec.id, data: photoDataUrl });
  }
  async function getPhoto(recordId) { const p = await get('photos', recordId); return p ? p.data : null; }
  async function deleteRecord(id) { await del('records', id); await del('photos', id); }
  async function countRecords() { return count('records'); }

  // ---- whole-database operations ----
  async function resetAll() {
    for (const s of ['places', 'records', 'photos', 'meta']) await clear(s);
  }
  async function exportAll() {
    const [places, records, photos, settings, lastBackupTs] = await Promise.all([
      getAll('places'), getAll('records'), getAll('photos'), getSettings(), getMeta('lastBackupTs', 0),
    ]);
    return { app: 'qr-patrol', schema: 1, exportedAt: new Date().toISOString(), settings, places, records, photos, lastBackupTs };
  }
  function validateBackup(data) {
    if (!data || data.app !== 'qr-patrol' || !Array.isArray(data.places) || !Array.isArray(data.records)) {
      throw new Error('This is not a QR Patrol backup file.');
    }
    return data;
  }
  async function importAll(data) {
    validateBackup(data);
    await resetAll();
    await bulkPut('places', data.places);
    await bulkPut('records', data.records);
    await bulkPut('photos', Array.isArray(data.photos) ? data.photos : []);
    await saveSettings(Object.assign({}, DEFAULT_SETTINGS, data.settings || {}));
    await setMeta('seeded', true);
    await setMeta('lastBackupTs', Date.now());
  }
  async function estimateUsage() {
    try { if (navigator.storage && navigator.storage.estimate) return await navigator.storage.estimate(); } catch (e) { /* ignore */ }
    return null;
  }

  QP.db = {
    open, getMeta, setMeta, getSettings, saveSettings,
    getPlaces, getPlace, savePlace, deletePlace, restorePlace, newPlaceId,
    getAllRecords, getRecordsByDate, getRecordsByPlace, getOpenActions, getRecord, saveRecord, getPhoto, deleteRecord, countRecords,
    resetAll, exportAll, importAll, validateBackup, estimateUsage, DEFAULT_SETTINGS,
  };
})();
