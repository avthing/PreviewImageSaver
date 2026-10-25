const TOTAL = 7;
// 減少動態：系統偏好或使用者在頁面上按「暫停動畫」，任一為真都停止所有自動動畫並顯示靜態結果
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = false;
try { motionPaused = localStorage.getItem('pis_welcome_motion') === 'off'; } catch (e) { /* 讀不到就用預設 */ }
const reduceMotion = () => motionQuery.matches || motionPaused;
const steps = [...document.querySelectorAll('.step')];
const rail = document.getElementById('rail');
let current = 0;

/* ───────── 左側步驟軌道、眉標 ───────── */
steps.forEach((step) => {
    const n = Number(step.dataset.step);
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="step-btn" data-go="${n}">
        <span class="node">${n}</span>
        <span class="lbl"><strong></strong><small></small></span></button>`;
    li.querySelector('strong').textContent = step.dataset.title;
    li.querySelector('small').textContent = step.dataset.sub;
    rail.appendChild(li);
    step.querySelector('.eyebrow').textContent = `STEP ${String(n).padStart(2, '0')} / ${String(TOTAL).padStart(2, '0')}`;
});

/* ───────── 小工具：計時器與示範的生命週期 ───────── */
let stops = [];

function stopDemos() {
    stops.forEach((fn) => fn());
    stops = [];
}

// 回傳 { after, clear }：after(ms, fn) 排程，clear() 一次取消
function makeTimeline() {
    const ids = [];
    return {
        after(ms, fn) { ids.push(setTimeout(fn, ms)); },
        clear() { ids.forEach(clearTimeout); ids.length = 0; }
    };
}

function relCenter(el, container, fx = 0.5, fy = 0.5) {
    const c = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - c.left + r.width * fx, y: r.top - c.top + r.height * fy };
}

function moveCursor(cursor, x, y) {
    cursor.style.transform = `translate(${x}px, ${y}px)`;
}

function clickCursor(cursor) {
    cursor.classList.remove('click');
    void cursor.offsetWidth;
    cursor.classList.add('click');
}

/* ───────── 示範 1：一鍵下載（游標點擊 → 進度 → 縮圖逐張蓋章），可點按鈕重播 ───────── */
function playDownload(mock) {
    const tiles = [...mock.querySelectorAll('.mock-grid .tile')];
    const btn = mock.querySelector('.fab span');
    const toast = mock.querySelector('.toast');
    const cursor = mock.querySelector('.cursor');
    const tl = makeTimeline();
    let ticker = null;
    const TOTAL_IMAGES = 21;

    function reset() {
        tl.clear();
        clearInterval(ticker);
        tiles.forEach((t) => t.classList.remove('done'));
        toast.classList.remove('show', 'ok');
        btn.classList.remove('busy', 'press');
        btn.textContent = '下載圖片';
        cursor.style.transition = 'none';
        moveCursor(cursor, 36, mock.clientHeight * 0.62);
        void cursor.offsetWidth;
        cursor.style.transition = '';
    }

    function run() {
        reset();
        if (reduceMotion()) {
            tiles.forEach((t) => t.classList.add('done'));
            btn.textContent = `完成 ${TOTAL_IMAGES} 張`;
            toast.textContent = `完成 ${TOTAL_IMAGES} 張`;
            toast.classList.add('show', 'ok');
            return;
        }
        tl.after(450, () => {
            const p = relCenter(btn, mock, 0.55, 0.62);
            moveCursor(cursor, p.x, p.y);
        });
        tl.after(1500, () => {
            clickCursor(cursor);
            btn.classList.add('press');
        });
        tl.after(1650, () => {
            btn.classList.remove('press');
            btn.classList.add('busy');
            btn.textContent = '準備中...';
            toast.textContent = '準備中...';
            toast.classList.add('show');
        });
        tl.after(2000, () => {
            let i = 0;
            ticker = setInterval(() => {
                i++;
                const text = `下載中 ${i}/${TOTAL_IMAGES}`;
                btn.textContent = text;
                toast.textContent = text;
                const doneCount = Math.floor((i / TOTAL_IMAGES) * tiles.length);
                tiles.slice(0, doneCount).forEach((t) => t.classList.add('done'));
                if (i >= TOTAL_IMAGES) {
                    clearInterval(ticker);
                    btn.classList.remove('busy');
                    btn.textContent = `完成 ${TOTAL_IMAGES} 張`;
                    toast.textContent = `完成 ${TOTAL_IMAGES} 張`;
                    toast.classList.add('ok');
                    const away = relCenter(btn, mock, 0.3, -1.5);
                    moveCursor(cursor, away.x - 60, away.y - 40);
                }
            }, 95);
        });
        tl.after(7200, run);
    }

    const onClick = () => run();
    btn.addEventListener('click', onClick);
    btn.style.cursor = 'pointer';
    run();

    return () => {
        tl.clear();
        clearInterval(ticker);
        btn.removeEventListener('click', onClick);
    };
}

/* ───────── 示範 2：選圖（縮圖可點、計數即時更新） ───────── */
document.addEventListener('click', (e) => {
    const tile = e.target.closest('.mini-modal .tile');
    if (!tile) return;
    tile.classList.toggle('sel');
    const modal = tile.closest('.mini-modal');
    const tiles = modal.querySelectorAll('.grid4 .tile');
    const n = modal.querySelectorAll('.grid4 .tile.sel').length;
    modal.querySelector('.cnt').textContent = `已選 ${n} / 共 ${tiles.length} 張`;
    const dl = modal.querySelector('.dl');
    dl.textContent = `下載已選 (${n})`;
    dl.classList.toggle('off', n === 0);
});

/* ───────── 示範 2b：停留放大（滑鼠停在縮圖 0.5 秒浮出放大圖，可用開關關閉） ───────── */
const hoverZoomOpt = document.getElementById('hoverZoomOpt');
let hoverZoomOn = true;
let zoomTimer = null;

function hideZoomPops() {
    clearTimeout(zoomTimer);
    document.querySelectorAll('.zoom-pop.show').forEach((p) => p.classList.remove('show'));
}

loadHoverZoom().then((value) => {
    hoverZoomOn = value;
    hoverZoomOpt.checked = value;
});

hoverZoomOpt.addEventListener('change', () => {
    hoverZoomOn = hoverZoomOpt.checked;
    saveHoverZoom(hoverZoomOn);
    if (!hoverZoomOn) hideZoomPops();
});

document.addEventListener('mouseover', (e) => {
    const tile = e.target.closest('.mini-modal .tile');
    if (!tile || tile.contains(e.relatedTarget) || !hoverZoomOn) return;
    const pop = tile.closest('.mock').querySelector('.zoom-pop');
    clearTimeout(zoomTimer);
    zoomTimer = setTimeout(() => {
        pop.firstElementChild.style.backgroundImage = getComputedStyle(tile).backgroundImage;
        pop.classList.add('show');
    }, 500);
});

document.addEventListener('mouseout', (e) => {
    const tile = e.target.closest('.mini-modal .tile');
    if (tile && !tile.contains(e.relatedTarget)) hideZoomPops();
});

/* ───────── 示範 2c：臉佔比篩選（拖動滑桿，臉夠大的縮圖自動被勾選，框與分數變綠） ───────── */
const faceDemo = document.querySelector('.face-demo');
const faceDemoSlider = faceDemo.querySelector('input[type="range"]');

function applyFaceDemo() {
    const min = Number(faceDemoSlider.value);
    const tiles = [...faceDemo.querySelectorAll('.fd-grid .tile')];
    let n = 0;
    tiles.forEach((tile) => {
        const hit = Number(tile.dataset.r) >= min;
        tile.classList.toggle('sel', hit);
        tile.querySelectorAll('.fbox, .fscore').forEach((el) => el.classList.toggle('hit', hit));
        if (hit) n++;
    });
    faceDemo.querySelector('.fd-val').textContent = `${min}%`;
    faceDemo.querySelector('.fd-count').textContent = `已選 ${n} / 共 ${tiles.length} 張`;
}

faceDemoSlider.addEventListener('input', applyFaceDemo);
applyFaceDemo();

/* ───────── 示範 3：可拖曳按鈕（真的可以拖，原位置留殘影） ───────── */
const dragMock = document.querySelector('[data-pv="3"] .mock');
const dragFab = dragMock.querySelector('.fab.drag');

// 示範視窗有 1px 邊框：座標要以內框（padding box）為基準，否則每次移動都會多出邊框寬度
function dragBounds() {
    const b = dragMock.getBoundingClientRect();
    return { left: b.left + dragMock.clientLeft, top: b.top + dragMock.clientTop, width: dragMock.clientWidth, height: dragMock.clientHeight };
}

dragFab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragFab.setPointerCapture(e.pointerId);
    const fab = dragFab.getBoundingClientRect();
    const box = dragBounds();
    const shiftX = e.clientX - fab.left;
    const shiftY = e.clientY - fab.top;
    dragFab.classList.add('grabbing');
    dragMock.classList.add('moved');

    const move = (ev) => {
        const x = Math.max(0, Math.min(ev.clientX - box.left - shiftX, box.width - fab.width));
        const y = Math.max(26, Math.min(ev.clientY - box.top - shiftY, box.height - fab.height));
        dragFab.style.right = 'auto';
        dragFab.style.bottom = 'auto';
        dragFab.style.left = `${x}px`;
        dragFab.style.top = `${y}px`;
    };
    const up = () => {
        dragFab.classList.remove('grabbing');
        dragFab.removeEventListener('pointermove', move);
        dragFab.removeEventListener('pointerup', up);
        dragFab.removeEventListener('pointercancel', up);
    };
    dragFab.addEventListener('pointermove', move);
    dragFab.addEventListener('pointerup', up);
    dragFab.addEventListener('pointercancel', up);
});

// 拖曳的鍵盤替代：按鈕取得焦點後，方向鍵移動（Shift 加大步距）
dragFab.addEventListener('keydown', (e) => {
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!dir) return;
    e.preventDefault();
    e.stopPropagation(); // 避免觸發全域的「左右鍵換頁」
    const step = e.shiftKey ? 48 : 12;
    const fab = dragFab.getBoundingClientRect();
    const box = dragBounds();
    // 以上次寫入的樣式值為準，只有第一次才量測（每次重量會累積子像素舍入誤差）
    const x0 = dragFab.style.left ? parseFloat(dragFab.style.left) : fab.left - box.left;
    const y0 = dragFab.style.top ? parseFloat(dragFab.style.top) : fab.top - box.top;
    const x = Math.max(0, Math.min(x0 + dir[0] * step, box.width - fab.width));
    const y = Math.max(26, Math.min(y0 + dir[1] * step, box.height - fab.height));
    dragFab.style.right = 'auto';
    dragFab.style.bottom = 'auto';
    dragFab.style.left = `${x}px`;
    dragFab.style.top = `${y}px`;
    dragMock.classList.add('moved');
});

/* ───────── 示範 4：釘選（游標自動走完：點拼圖 → 開選單 → 按圖釘） ───────── */
function playPin() {
    const illus = document.querySelector('.illus');
    const cursor = illus.querySelector('.cursor');
    const dropdown = illus.querySelector('.dropdown');
    const pinBox = illus.querySelector('.hl.pin');
    const pinIcon = illus.querySelector('.pin-ic');
    const tl = makeTimeline();

    function reset() {
        tl.clear();
        dropdown.classList.remove('show');
        pinBox.classList.remove('on');
        pinIcon.classList.remove('on');
        cursor.style.transition = 'none';
        moveCursor(cursor, 70, 270);
        void cursor.offsetWidth;
        cursor.style.transition = '';
    }

    function run() {
        reset();
        if (reduceMotion()) {
            dropdown.classList.add('show');
            pinBox.classList.add('on');
            pinIcon.classList.add('on');
            return;
        }
        tl.after(700, () => moveCursor(cursor, 440, 118));
        tl.after(1800, () => { clickCursor(cursor); dropdown.classList.add('show'); });
        tl.after(2700, () => moveCursor(cursor, 433, 230));
        tl.after(3800, () => { clickCursor(cursor); pinBox.classList.add('on'); pinIcon.classList.add('on'); });
        tl.after(7000, run);
    }
    run();
    return () => tl.clear();
}

/* ───────── 第 1 步：功能分頁（計時條跑完自動換頁；使用者一操作就停止輪播） ───────── */
const seg = document.querySelector('.seg');
const tabs = [...seg.querySelectorAll('button')];
const panels = [...document.querySelectorAll('.pv')];
let tabIndex = 0;

function selectTab(i) {
    tabIndex = (i + tabs.length) % tabs.length;
    tabs.forEach((t, idx) => t.setAttribute('aria-selected', String(idx === tabIndex)));
    panels.forEach((p, idx) => p.classList.toggle('active', idx === tabIndex));
    stopDemos();
    if (tabIndex === 0) stops.push(playDownload(panels[0].querySelector('.mock')));
}

seg.addEventListener('click', (e) => {
    const tab = e.target.closest('button[data-tab]');
    if (!tab) return;
    seg.classList.remove('auto');
    selectTab(Number(tab.dataset.tab));
});

// 輪播遇到鍵盤焦點就停止（WCAG 2.2.2）；滑鼠移入的暫停由 CSS 處理
seg.addEventListener('focusin', () => seg.classList.remove('auto'));

seg.addEventListener('animationend', (e) => {
    if (e.pseudoElement === '::after' && seg.classList.contains('auto')) selectTab(tabIndex + 1);
});

/* ───────── 第 2 步：授權完成才能按「繼續」 ───────── */
const folderNext = document.getElementById('folderNext');
const permission = document.getElementById('permission');

function syncFolderGate() {
    folderNext.disabled = permission.dataset.state !== 'granted';
}
new MutationObserver(syncFolderGate).observe(permission, { attributes: true, attributeFilter: ['data-state'] });
syncFolderGate();

/* ───────── 第 3 步：下載方式（兩個預覽跟著切換，選擇存進設定） ───────── */
const modeRadios = [...document.querySelectorAll('input[name="mode"]')];
const modePreviews = [...document.querySelectorAll('.mode-preview')];
let currentMode = 'all';

function showModePreview(mode) {
    currentMode = mode;
    modePreviews.forEach((p) => p.classList.toggle('active', p.dataset.modePreview === mode));
    stopDemos();
    if (current === 3 && mode === 'all') {
        stops.push(playDownload(document.querySelector('[data-mode-preview="all"] .mock')));
    }
}

loadPickMode().then((pick) => {
    modeRadios.forEach((r) => { r.checked = r.value === (pick ? 'pick' : 'all'); });
    modePreviews.forEach((p) => p.classList.toggle('active', p.dataset.modePreview === (pick ? 'pick' : 'all')));
    currentMode = pick ? 'pick' : 'all';
});

document.addEventListener('change', (e) => {
    if (e.target.name !== 'mode') return;
    showModePreview(e.target.value);
    savePickMode(e.target.value === 'pick');
});

/* ───────── 第 6 步：接印樣（逐張彈出、滑過顯示實際檔名）／第 2 步檔案樹逐行出現 ───────── */
document.querySelectorAll('.sheet .frame').forEach((frame, i) => {
    frame.style.setProperty('--i', i);
    frame.dataset.name = frame.classList.contains('cover') ? 'DEVR-018_cover.jpg' : `DEVR-018_${frame.textContent.trim()}.jpg`;
});
document.querySelectorAll('.step[data-step="2"] .tree-box li').forEach((li, i) => li.style.setProperty('--i', i));

/* ───────── 彩片噴發（完成時） ───────── */
const CHIP_COLORS = ['#B42F5A', '#005EF3', '#FFC847', '#609EFF', '#C55073', '#42AB28'];

function burst(x, y, count = 34) {
    if (reduceMotion()) return;
    for (let i = 0; i < count; i++) {
        const chip = document.createElement('i');
        chip.className = 'chip';
        chip.style.left = `${x}px`;
        chip.style.top = `${y}px`;
        chip.style.background = CHIP_COLORS[i % CHIP_COLORS.length];
        chip.style.setProperty('--dx', `${(Math.random() - 0.5) * 520}px`);
        chip.style.setProperty('--dy', `${-120 - Math.random() * 280 + Math.random() * 260}px`);
        chip.style.setProperty('--r', `${(Math.random() - 0.5) * 720}deg`);
        chip.style.animationDelay = `${Math.random() * 80}ms`;
        document.body.appendChild(chip);
        chip.addEventListener('animationend', () => chip.remove());
    }
}

/* ───────── 換頁：依方向、進入各步驟時啟動對應示範 ───────── */
function enter(n) {
    stopDemos();
    seg.classList.remove('auto');
    if (n === 1) {
        selectTab(0);
        if (!reduceMotion()) {
            // 重新觸發計時條動畫
            void seg.offsetWidth;
            seg.classList.add('auto');
        }
    } else if (n === 3) {
        showModePreview(currentMode);
    } else if (n === 5) {
        stops.push(playPin());
    } else if (n === TOTAL) {
        const stage = document.querySelector(`.step[data-step="${TOTAL}"] .stage`).getBoundingClientRect();
        setTimeout(() => burst(stage.left + stage.width / 2, stage.top + stage.height * 0.45), 350);
    }
}

function show(n, { push = true } = {}) {
    n = Math.max(1, Math.min(n, TOTAL));
    if (n === current) return;
    const dir = n > current ? 'fwd' : 'back';
    current = n;
    steps.forEach((s) => {
        const active = Number(s.dataset.step) === n;
        s.classList.toggle('active', active);
        s.classList.remove('fwd', 'back');
        if (active) s.classList.add(dir);
    });
    [...rail.children].forEach((li, i) => {
        li.classList.toggle('done', i + 1 < n);
        li.classList.toggle('current', i + 1 === n);
        const b = li.querySelector('button');
        if (i + 1 === n) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
    });
    // pushState：瀏覽器「上一頁」可回到前一步；popstate 觸發的換頁與首次載入不再新增歷史
    if (push) history.pushState({ n }, '', `#step-${n}`);
    else history.replaceState({ n }, '', `#step-${n}`);
    window.scrollTo(0, 0);
    const heading = document.querySelector(`.step[data-step="${n}"] .title`);
    if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
    }
    enter(n);
}

/* ───────── 暫停動畫 ───────── */
const motionBtn = document.getElementById('motionBtn');

function applyMotion() {
    document.documentElement.dataset.motion = motionPaused ? 'off' : 'on';
    motionBtn.querySelector('span').textContent = motionPaused ? '播放動畫' : '暫停動畫';
    motionBtn.querySelector('.ic-pause').hidden = motionPaused;
    motionBtn.querySelector('.ic-play').hidden = !motionPaused;
}

motionBtn.addEventListener('click', () => {
    motionPaused = !motionPaused;
    try { localStorage.setItem('pis_welcome_motion', motionPaused ? 'off' : 'on'); } catch (e) { /* 無法儲存就只在本次生效 */ }
    applyMotion();
    stopDemos();
    enter(current);
});

/* ───────── 事件 ───────── */
document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) return show(Number(go.dataset.go));

    const nav = e.target.closest('[data-nav]');
    if (!nav || nav.disabled) return;
    if (nav.dataset.nav === 'next') show(current + 1);
    else if (nav.dataset.nav === 'prev') show(current - 1);
    else if (nav.dataset.nav === 'finish') {
        const r = nav.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 46);
        setTimeout(() => window.close(), reduceMotion() ? 0 : 650);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') show(current + 1);
    else if (e.key === 'ArrowLeft') show(current - 1);
});

// 瀏覽器「上一頁／下一頁」：切到對應步驟，不重複寫入歷史
window.addEventListener('popstate', () => {
    const m = location.hash.match(/step-(\d)/);
    if (m && Number(m[1]) !== current) show(Number(m[1]), { push: false });
});

applyMotion();
const initial = location.hash.match(/step-(\d)/);
show(initial ? Number(initial[1]) : 1, { push: false });
