importScripts('store.js');

function safeName(name) {
    return name.replace(/[\\/:*?"<>|]/g, '_').replace(/[. ]+$/, '').trim();
}

function todayFolder() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function getExt(url) {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return m ? `.${m[1].toLowerCase()}` : '.jpg';
}

function buildJobs(code, cover, samples) {
    const jobs = [];
    if (cover) jobs.push({ url: cover, name: `${code}_cover${getExt(cover)}` });
    // n 是圖片在網站上的原始編號，只下載部分圖片時檔名也不會變
    samples.forEach(({ url, n }) => {
        jobs.push({ url, name: `${code}_${String(n).padStart(2, '0')}${getExt(url)}` });
    });
    return jobs;
}

async function saveImage(dir, job) {
    const res = await fetch(job.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const fileHandle = await dir.getFileHandle(job.name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
}

// 資料夾未設定或授權過期時，自動開啟設定視窗（授權必須由使用者在擴充功能頁面按下）
let setupWindowId = null;

async function openSetup() {
    if (setupWindowId !== null) {
        try {
            await chrome.windows.update(setupWindowId, { focused: true });
            return;
        } catch (e) {
            setupWindowId = null;
        }
    }
    const win = await chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), type: 'popup', width: 380, height: 640 });
    setupWindowId = win.id;
}

chrome.windows.onRemoved.addListener((id) => {
    if (id === setupWindowId) setupWindowId = null;
});

function send(port, msg) {
    try {
        port.postMessage(msg);
    } catch (e) {
        console.log('[PreviewImageSaver] port closed:', e.message);
    }
}

async function run(port, { code, actor, cover, samples }) {
    try {
        const root = await loadRootHandle();
        if (!root) {
            openSetup();
            send(port, { type: 'error', message: '請在彈出的視窗選擇資料夾' });
            return;
        }
        if ((await root.queryPermission({ mode: 'readwrite' })) !== 'granted') {
            openSetup();
            send(port, { type: 'error', message: '請在彈出的視窗按「重新授權」，再下載一次' });
            return;
        }

        const dateDir = await root.getDirectoryHandle(todayFolder(), { create: true });
        // 資料夾名在番號前面加演員名，圖片檔名只用番號
        const codeDir = await dateDir.getDirectoryHandle(safeName(actor ? `${actor} ${code}` : code), { create: true });
        const jobs = buildJobs(safeName(code), cover, samples);

        let ok = 0;
        let failed = 0;
        // 整批同時抓取並寫入同一個番號資料夾
        await Promise.all(jobs.map(async (job) => {
            try {
                await saveImage(codeDir, job);
                ok++;
            } catch (e) {
                failed++;
                console.log('[PreviewImageSaver] 失敗:', job.url, e.message);
            }
            send(port, { type: 'progress', done: ok + failed, total: jobs.length });
        }));
        console.log(`[PreviewImageSaver] ${code} 完成：成功 ${ok}、失敗 ${failed}`);
        send(port, { type: 'done', ok, failed });
    } catch (e) {
        console.log('[PreviewImageSaver] error:', e);
        send(port, { type: 'error', message: e.message });
    }
}

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    }
});

// 人臉偵測放在 offscreen document，選圖視窗要偵測時才建立、關閉時釋放
let offscreenCreating = null;

async function ensureOffscreen() {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length > 0) return;
    if (!offscreenCreating) {
        offscreenCreating = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['BLOBS'],
            justification: '在擴充功能頁面內讀取圖片像素，偵測人臉並計算佔比'
        }).finally(() => { offscreenCreating = null; });
    }
    await offscreenCreating;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'face-open') {
        ensureOffscreen().then(
            () => sendResponse({ ok: true }),
            (e) => {
                console.log('[PreviewImageSaver] 建立偵測頁面失敗:', e.message);
                sendResponse({ ok: false, error: e.message });
            }
        );
        return true;
    }
    if (msg.type === 'face-close') {
        chrome.offscreen.closeDocument().catch((e) => console.log('[PreviewImageSaver] 關閉偵測頁面:', e.message));
    }
    return false;
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'download') return;
    port.onMessage.addListener((msg) => run(port, msg));
});
