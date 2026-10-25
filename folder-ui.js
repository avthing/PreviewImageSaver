const folderEl = document.getElementById('folder');
const permissionEl = document.getElementById('permission');
const messageEl = document.getElementById('message');

async function refresh() {
    const handle = await loadRootHandle();
    if (!handle) {
        folderEl.textContent = '尚未選擇';
        permissionEl.textContent = '未設定';
        permissionEl.dataset.state = 'none';
        return;
    }
    folderEl.textContent = handle.name;
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    permissionEl.textContent = perm === 'granted' ? '已授權' : '需要重新授權';
    permissionEl.dataset.state = perm === 'granted' ? 'granted' : 'prompt';
}

async function pickFolder() {
    try {
        const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await saveRootHandle(handle);
        console.log('[PreviewImageSaver] 已選擇資料夾:', handle.name);
        messageEl.textContent = '';
    } catch (e) {
        if (e.name !== 'AbortError') messageEl.textContent = e.message;
    }
    await refresh();
}

async function reauthorize() {
    const handle = await loadRootHandle();
    if (!handle) {
        messageEl.textContent = '請先選擇資料夾';
        return;
    }
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    console.log('[PreviewImageSaver] 重新授權結果:', perm);
    messageEl.textContent = perm === 'granted' ? '' : '授權未通過';
    await refresh();
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'pick') pickFolder();
    else if (btn.dataset.action === 'reauth') reauthorize();
});

refresh();
