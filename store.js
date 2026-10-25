// 根資料夾 handle 存取（background 與 options 共用）
const JDIS_DB_NAME = 'jdis';
const JDIS_STORE = 'handles';
const JDIS_KEY = 'root';

function jdisOpenDb() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(JDIS_DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(JDIS_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveRootHandle(handle) {
    const db = await jdisOpenDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(JDIS_STORE, 'readwrite');
        tx.objectStore(JDIS_STORE).put(handle, JDIS_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function loadRootHandle() {
    const db = await jdisOpenDb();
    return new Promise((resolve, reject) => {
        const req = db.transaction(JDIS_STORE, 'readonly').objectStore(JDIS_STORE).get(JDIS_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}
