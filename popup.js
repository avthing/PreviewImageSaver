const pickMode = document.getElementById('pickMode');
const hoverZoom = document.getElementById('hoverZoom');

loadHoverZoom().then((value) => {
    hoverZoom.checked = value;
});

loadPickMode().then((value) => {
    pickMode.checked = value;
});

document.addEventListener('change', (e) => {
    if (e.target === pickMode) {
        savePickMode(pickMode.checked);
        console.log('[PreviewImageSaver] 下載前選圖:', pickMode.checked);
    } else if (e.target === hoverZoom) {
        saveHoverZoom(hoverZoom.checked);
        console.log('[PreviewImageSaver] 停留放大:', hoverZoom.checked);
    }
});
