// 使用者設定（彈出視窗與教學頁共用）
// pickBeforeDownload：true 時按下載按鈕會先跳出選圖視窗，預設 false（直接下載全部）
const JDIS_PICK_KEY = 'pickBeforeDownload';

async function loadPickMode() {
    const result = await chrome.storage.sync.get({ [JDIS_PICK_KEY]: false });
    return !!result[JDIS_PICK_KEY];
}

function savePickMode(value) {
    return chrome.storage.sync.set({ [JDIS_PICK_KEY]: !!value });
}

// hoverZoom：選圖視窗中，游標在縮圖上停留 0.5 秒是否自動放大，預設 true
const JDIS_ZOOM_KEY = 'hoverZoom';

async function loadHoverZoom() {
    const result = await chrome.storage.sync.get({ [JDIS_ZOOM_KEY]: true });
    return !!result[JDIS_ZOOM_KEY];
}

function saveHoverZoom(value) {
    return chrome.storage.sync.set({ [JDIS_ZOOM_KEY]: !!value });
}
