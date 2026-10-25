(() => {
    // 各站點：isVideoPage 判斷是否為影片頁（決定按鈕是否顯示）、
    // extract 回傳 { code, actor, cover, samples: [{ url, thumb }] }，actor 是第一位演員名（可為 null），
    // url 是原圖、thumb 是選圖視窗用的縮圖
    function extractJavdb() {
        const copy = document.querySelector('.panel-block.first-block .copy-to-clipboard');
        const fromAttr = copy && copy.dataset.clipboardText && copy.dataset.clipboardText.trim();
        const value = document.querySelector('.panel-block.first-block .value');
        const cover = document.querySelector('img.video-cover');
        const samples = [...document.querySelectorAll('.tile-images.preview-images a.tile-item')].map((a) => {
            const img = a.querySelector('img');
            return { url: a.href, thumb: img ? img.src : a.href };
        });
        const actor = document.querySelector('.panel-block a.actor-female') || document.querySelector('.panel-block a[class*="actor-"]');
        return {
            code: fromAttr || (value ? value.textContent.trim() : null),
            actor: actor ? actor.textContent.trim() : null,
            cover: cover ? cover.src : null,
            samples
        };
    }

    function extractJavLibrary() {
        const code = document.querySelector('#video_id .text');
        const cover = document.querySelector('#video_jacket_img');
        const samples = [...document.querySelectorAll('.previewthumbs a')].map((a) => {
            const img = a.querySelector('img');
            return { url: a.href, thumb: img ? img.src : a.href };
        });
        const actor = document.querySelector('#video_cast .star a');
        return {
            code: code ? code.textContent.trim() : null,
            actor: actor ? actor.textContent.trim() : null,
            cover: cover ? cover.src : null,
            samples
        };
    }

    // JavTrailers 是 SPA，頁面內換頁時 __NUXT_DATA__ 不會更新，所以重新抓當前網址的 HTML 來解析
    async function extractJavTrailers() {
        const cid = location.pathname.split('/').filter(Boolean).pop();
        const escaped = cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const html = await (await fetch(location.pathname, { credentials: 'same-origin' })).text();

        const coverMatch = html.match(new RegExp(`https://pics\\.dmm\\.co\\.jp/[^"\\\\\\s]*?/${escaped}pl\\.jpg`));
        const thumbRe = new RegExp(`(https://pics\\.dmm\\.co\\.jp/[^"\\\\\\s]*?/${escaped})-(\\d+)\\.jpg`, 'g');
        const bases = new Map();
        let m;
        while ((m = thumbRe.exec(html))) bases.set(Number(m[2]), m[1]);
        // gallery 給的 -N.jpg 是縮圖，大圖是 jp-N.jpg
        const samples = [...bases.keys()].sort((a, b) => a - b).map((n) => ({
            url: `${bases.get(n)}jp-${n}.jpg`,
            thumb: `${bases.get(n)}-${n}.jpg`
        }));

        const dvdLine = [...document.querySelectorAll('p.mb-1')]
            .map((p) => p.textContent.trim())
            .find((t) => t.startsWith('DVD ID:'));
        // 演員連結文字是「Kana Mito 水戸かな」，只留第一個非 ASCII 字元起的日文名
        const castLine = [...document.querySelectorAll('p.mb-1')].find((p) => p.textContent.trim().startsWith('Cast(s):'));
        const castName = castLine && castLine.querySelector('a') ? castLine.querySelector('a').textContent.trim() : null;
        const jaName = castName && castName.match(/[^\x00-\x7F].*$/);
        return {
            code: dvdLine ? dvdLine.replace('DVD ID:', '').trim() : cid.toUpperCase(),
            actor: jaName ? jaName[0] : castName,
            cover: coverMatch ? coverMatch[0] : null,
            samples
        };
    }

    const SITES = {
        'javdb.com': { isVideoPage: () => location.pathname.startsWith('/v/'), extract: extractJavdb },
        'www.javlibrary.com': { isVideoPage: () => !!document.querySelector('#video_jacket_img'), extract: extractJavLibrary },
        'javtrailers.com': { isVideoPage: () => location.pathname.startsWith('/video/'), extract: extractJavTrailers }
    };
    const site = SITES[location.hostname];
    if (!site) return;

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
        <style>
            button { padding: 10px 16px; border: 0; border-radius: 8px; background: #2563eb; color: #fff;
                     font: 14px sans-serif; white-space: nowrap; cursor: grab; box-shadow: 0 2px 8px rgba(0,0,0,.3); user-select: none; }
            button[aria-disabled="true"] { background: #6b7280; }
        </style>
        <button type="button">下載圖片</button>`;
    document.documentElement.appendChild(host);

    const POS_KEY = 'jdis_button_pos';

    // 限制在視窗範圍內並改用 left/top 定位
    function applyPos(left, top) {
        const maxX = document.documentElement.clientWidth - host.offsetWidth;
        const maxY = document.documentElement.clientHeight - host.offsetHeight;
        host.style.right = 'auto';
        host.style.bottom = 'auto';
        host.style.left = Math.max(0, Math.min(left, maxX)) + 'px';
        host.style.top = Math.max(0, Math.min(top, maxY)) + 'px';
    }

    // 按鈕文字變長或視窗縮小時，避免超出畫面
    function clampIntoView() {
        if (!host.style.left || host.style.display === 'none') return;
        const rect = host.getBoundingClientRect();
        applyPos(rect.left, rect.top);
    }

    try {
        const saved = JSON.parse(localStorage.getItem(POS_KEY));
        if (saved) applyPos(saved.left, saved.top);
    } catch (e) {
        console.log('[PreviewImageSaver] 還原按鈕位置失敗:', e.message);
    }

    // SPA 換頁不會重新載入 content script，定時依目前頁面決定是否顯示按鈕
    function syncVisibility() {
        host.style.display = site.isVideoPage() ? '' : 'none';
        clampIntoView();
    }
    setInterval(syncVisibility, 1000);
    syncVisibility();
    window.addEventListener('resize', clampIntoView);

    const mainButton = root.querySelector('button');
    let busy = false;
    let dragged = false;

    // 拖曳：移動超過 4px 才算拖曳，避免誤觸下載；放開後記住位置
    host.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        dragged = false;
        const rect = host.getBoundingClientRect();
        const shiftX = e.clientX - rect.left;
        const shiftY = e.clientY - rect.top;
        const startX = e.clientX;
        const startY = e.clientY;

        function onMove(ev) {
            if (!dragged && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
            dragged = true;
            applyPos(ev.clientX - shiftX, ev.clientY - shiftY);
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!dragged) return;
            const finalRect = host.getBoundingClientRect();
            try {
                localStorage.setItem(POS_KEY, JSON.stringify({ left: finalRect.left, top: finalRect.top }));
            } catch (err) {
                console.log('[PreviewImageSaver] 儲存按鈕位置失敗:', err.message);
            }
            console.log('[PreviewImageSaver] 已儲存按鈕位置:', finalRect.left, finalRect.top);
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });

    // 拖曳的鍵盤替代：按鈕取得焦點後，方向鍵移動位置（Shift 加大步距），並記住位置
    host.addEventListener('keydown', (e) => {
        const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!dir) return;
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 48 : 12;
        const rect = host.getBoundingClientRect();
        applyPos(rect.left + dir[0] * step, rect.top + dir[1] * step);
        const finalRect = host.getBoundingClientRect();
        try {
            localStorage.setItem(POS_KEY, JSON.stringify({ left: finalRect.left, top: finalRect.top }));
        } catch (err) {
            console.log('[PreviewImageSaver] 儲存按鈕位置失敗:', err.message);
        }
    });

    function setText(text) {
        mainButton.textContent = text;
        clampIntoView();
    }

    function setBusy(value) {
        busy = value;
        root.querySelectorAll('button').forEach((b) => {
            if (value) b.setAttribute('aria-disabled', 'true');
            else b.removeAttribute('aria-disabled');
        });
    }

    function finish(text) {
        setBusy(false);
        setText(text);
        setTimeout(() => {
            if (!busy) setText('下載圖片');
        }, 4000);
    }

    // 抓取頁面資料並整理：去除重複，樣本圖依在頁面上的順序給原始編號 n（1 起算）
    async function prepare() {
        let page;
        try {
            page = await site.extract();
        } catch (e) {
            console.log('[PreviewImageSaver] 解析頁面失敗:', e);
            throw new Error('解析頁面失敗');
        }
        if (!page.code) throw new Error('找不到番號');
        const seen = new Set();
        const samples = page.samples
            .filter((s) => !seen.has(s.url) && seen.add(s.url))
            .map((s, i) => ({ ...s, n: i + 1 }));
        if (!page.cover && samples.length === 0) throw new Error('找不到圖片');
        console.log(`[PreviewImageSaver] ${page.actor ? `${page.actor} ` : ''}${page.code}：封面 ${page.cover ? 1 : 0}、預覽圖 ${samples.length}`);
        return { code: page.code, actor: page.actor, cover: page.cover, samples };
    }

    function download(code, actor, cover, samples) {
        setBusy(true);
        setText('準備中...');
        const port = chrome.runtime.connect({ name: 'download' });
        let ended = false;
        port.onMessage.addListener((msg) => {
            if (msg.type === 'progress') {
                setText(`下載中 ${msg.done}/${msg.total}`);
            } else if (msg.type === 'done') {
                ended = true;
                finish(msg.failed ? `完成 ${msg.ok} 張，失敗 ${msg.failed} 張` : `完成 ${msg.ok} 張`);
            } else if (msg.type === 'error') {
                ended = true;
                finish(msg.message);
            }
        });
        port.onDisconnect.addListener(() => {
            if (!ended) finish('連線中斷');
        });
        port.postMessage({ code, actor, cover, samples: samples.map(({ url, n }) => ({ url, n })) });
    }

    let pickerOpen = false;

    // 選圖視窗：縮圖格狀清單，預設全選，確認後只下載勾選的
    function openPicker(page) {
        if (pickerOpen) return;
        pickerOpen = true;

        const items = [];
        if (page.cover) items.push({ key: 'cover', url: page.cover, thumb: page.cover, label: '封面' });
        page.samples.forEach((s) => items.push({ key: String(s.n), url: s.url, thumb: s.thumb, label: `#${String(s.n).padStart(2, '0')}` }));
        const selected = new Set(items.map((i) => i.key));

        const modalHost = document.createElement('div');
        modalHost.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
        const mroot = modalHost.attachShadow({ mode: 'open' });
        mroot.innerHTML = `
            <style>
                :host { --bg: #ffffff; --muted: #f1f4f9; --border: #e2e8f0; --text: #0f172a; --sub: #475569; --primary: #2563eb; }
                @media (prefers-color-scheme: dark) {
                    :host { --bg: #131c31; --muted: #1a2540; --border: #26334f; --text: #e8edf7; --sub: #a3b0c8; --primary: #3b82f6; }
                }
                * { box-sizing: border-box; }
                .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); font: 14px/1.5 "Segoe UI", "Microsoft JhengHei", sans-serif; }
                .panel { position: absolute; display: flex; flex-direction: column; overflow: hidden; resize: both;
                         min-width: 420px; min-height: 280px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px);
                         background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 14px;
                         box-shadow: 0 16px 48px rgba(0, 0, 0, .4); outline: none; }
                header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; }
                header { border-bottom: 1px solid var(--border); cursor: move; user-select: none; }
                footer { border-top: 1px solid var(--border); justify-content: flex-end; }
                h2 { margin: 0; font-size: 16px; }
                .count { margin: 0; font-size: 13px; color: var(--sub); }
                .tools { display: flex; gap: 8px; }
                .grid { display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: max-content; align-content: start; gap: 10px;
                        flex: 1; min-height: 0; padding: 16px 20px; overflow-y: auto; }
                .item { position: relative; display: block; cursor: pointer; border: 2px solid var(--border); border-radius: 10px;
                        overflow: hidden; background: var(--muted); }
                .item:has(input:checked) { border-color: var(--primary); }
                .thumb { position: relative; aspect-ratio: 16 / 10; background: #000; }
                .thumb img { display: block; width: 100%; height: 100%; object-fit: contain; }
                .boxes { position: absolute; pointer-events: none; }
                .face { position: absolute; border: 2px solid #f59e0b; }
                .face.hit { border-color: #22c55e; }
                .scores { position: absolute; top: 6px; right: 6px; z-index: 1; display: flex; flex-direction: column;
                          align-items: flex-end; gap: 2px; pointer-events: none; }
                .score { padding: 0 6px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 16px;
                         color: #000; background: #f59e0b; white-space: nowrap; }
                .score.hit { background: #22c55e; }
                .score.more { color: #fff; background: rgba(0, 0, 0, .65); }
                .facebar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 10px 20px; border-bottom: 1px solid var(--border); }
                .facebar[hidden] { display: none; }
                .facebar select { padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg);
                                  color: var(--text); font: inherit; font-size: 13px; }
                .facebar input { flex: 1; max-width: 320px; accent-color: var(--primary); }
                .facebar .hits { color: var(--sub); font-size: 13px; }
                .item input { position: absolute; z-index: 2; top: 8px; left: 8px; width: 18px; height: 18px; margin: 0; cursor: pointer; accent-color: var(--primary); }
                .item .tag { position: absolute; right: 6px; bottom: 6px; padding: 1px 8px; border-radius: 999px;
                             font-size: 12px; color: #fff; background: rgba(0, 0, 0, .65); }
                .item input:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
                .zoom { position: fixed; z-index: 3; inset: 0; display: none; align-items: center; justify-content: center;
                        padding: 24px; pointer-events: none; }
                .zoom.show { display: flex; }
                .zoom img { max-width: 100%; max-height: 100%; border-radius: 10px; background: #000;
                            box-shadow: 0 16px 48px rgba(0, 0, 0, .6); }
                button { padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg);
                         color: var(--text); font: inherit; font-weight: 600; cursor: pointer; }
                button:hover { background: var(--muted); }
                button.primary { background: var(--primary); border-color: var(--primary); color: #fff; }
                button.primary:hover { filter: brightness(1.1); }
                button:disabled { opacity: .45; cursor: default; }
                button:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
            </style>
            <div class="overlay" data-role="overlay">
                <div class="panel" role="dialog" aria-modal="true" aria-label="選擇要下載的圖片" tabindex="-1">
                    <header>
                        <div><h2></h2><p class="count"></p></div>
                        <div class="tools">
                            <button type="button" data-act="faces">偵測人臉</button>
                            <button type="button" data-act="all">全選</button>
                            <button type="button" data-act="none">全不選</button>
                        </div>
                    </header>
                    <div class="facebar" hidden>
                        <select class="shape" aria-label="框選範圍" title="框選範圍：頭部框是依五官框外推出含額頭與頭髮的範圍">
                            <option value="head">頭部框（含頭髮）</option>
                            <option value="face">五官框（模型原始）</option>
                        </select>
                        <select class="measure" aria-label="計算方式" title="計算方式：面積比＝框面積÷圖面積；高度比＝框高÷圖高；寬度比＝框寬÷圖寬；邊長比＝面積比開根號（不受圖片長寬比影響）">
                            <option value="area">面積比</option>
                            <option value="height">高度比</option>
                            <option value="width">寬度比</option>
                            <option value="side">邊長比（√面積）</option>
                        </select>
                        <span>臉佔比 ≥ <strong class="faceval"></strong></span>
                        <input type="range" min="0" max="100" step="1" value="15" aria-label="臉佔整張圖的最低比例">
                        <span class="hits"></span>
                    </div>
                    <div class="grid"></div>
                    <footer>
                        <button type="button" data-act="cancel">取消</button>
                        <button type="button" class="primary" data-act="ok"></button>
                    </footer>
                </div>
                <div class="zoom"><img alt="" referrerpolicy="no-referrer"></div>
            </div>`;
        mroot.querySelector('h2').textContent = page.actor ? `${page.actor} ${page.code}` : page.code;
        const grid = mroot.querySelector('.grid');
        const zoomEl = mroot.querySelector('.zoom');
        const zoomImg = zoomEl.querySelector('img');
        let zoomTimer = null;
        let hoverZoomOn = true;
        loadHoverZoomSetting().then((value) => { hoverZoomOn = value; });

        // 游標在縮圖上停留 0.5 秒後，放大顯示原圖；離開、捲動或關閉視窗就收起來
        function hideZoom() {
            clearTimeout(zoomTimer);
            zoomEl.classList.remove('show');
            zoomImg.removeAttribute('src');
        }

        function scheduleZoom(item) {
            clearTimeout(zoomTimer);
            if (!hoverZoomOn) return;
            zoomTimer = setTimeout(() => {
                zoomImg.onload = () => {
                    console.log(`[PreviewImageSaver] 放大 ${item.label}：${zoomImg.naturalWidth}x${zoomImg.naturalHeight}`, zoomImg.currentSrc);
                    zoomEl.classList.add('show');
                };
                zoomImg.onerror = () => {
                    // 原圖載入失敗時退回縮圖，至少還是放大的
                    zoomImg.onerror = null;
                    zoomImg.src = item.thumb;
                };
                zoomImg.src = item.url;
            }, 500);
        }

        grid.addEventListener('scroll', hideZoom);
        items.forEach((item) => {
            const label = document.createElement('label');
            label.className = 'item';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = true;
            input.dataset.key = item.key;
            input.setAttribute('aria-label', item.label);
            const img = document.createElement('img');
            img.referrerPolicy = 'no-referrer';
            img.loading = 'lazy';
            img.alt = item.label;
            img.src = item.thumb;
            const tag = document.createElement('span');
            tag.className = 'tag';
            tag.textContent = item.label;
            // 臉框疊在縮圖上，item 記下偵測結果供篩選使用
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            const boxes = document.createElement('div');
            boxes.className = 'boxes';
            const scores = document.createElement('div');
            scores.className = 'scores';
            thumb.append(img, boxes, scores);
            Object.assign(item, { input, boxesEl: boxes, scoresEl: scores, faces: [], faceEls: [], scoreEls: [], maxRatio: 0, failed: false });
            label.append(input, thumb, tag);
            label.addEventListener('mouseenter', () => scheduleZoom(item));
            label.addEventListener('mouseleave', hideZoom);
            grid.appendChild(label);
        });

        const okButton = mroot.querySelector('[data-act="ok"]');
        const countEl = mroot.querySelector('.count');
        function refresh() {
            countEl.textContent = `已選 ${selected.size} / 共 ${items.length} 張`;
            okButton.textContent = `下載已選 (${selected.size})`;
            okButton.disabled = selected.size === 0;
        }

        // 人臉偵測：用縮圖交給 offscreen document 偵測，在縮圖上畫框並標示臉佔整張圖的比例
        const FACE_CONCURRENCY = 3;
        const FACE_SCORE_MAX = 3;
        const facesButton = mroot.querySelector('[data-act="faces"]');
        const faceBar = mroot.querySelector('.facebar');
        const faceSlider = faceBar.querySelector('input');
        const faceValEl = faceBar.querySelector('.faceval');
        const hitsEl = faceBar.querySelector('.hits');
        const shapeSelect = faceBar.querySelector('.shape');
        const measureSelect = faceBar.querySelector('.measure');
        let faceState = 'idle';
        let faceMin = Number(faceSlider.value);
        let faceShape = 'face';
        let faceMeasure = 'side';
        let filterActive = false;
        let closed = false;
        // 偵測前先讀回上次選的算法，避免先用預設算法畫框再跳變
        const faceModeReady = loadFaceMode().then((mode) => {
            faceShape = mode.shape;
            faceMeasure = mode.measure;
            shapeSelect.value = faceShape;
            measureSelect.value = faceMeasure;
            syncSliderRange();
        });

        // 面積比的數字偏小，滑桿上限 50；其餘為線性比例，上限 100
        function syncSliderRange() {
            faceSlider.max = faceMeasure === 'area' ? 50 : 100;
            faceMin = Math.min(faceMin, Number(faceSlider.max));
            faceSlider.value = faceMin;
        }

        // 依目前選的框與算法重算每張臉的比例並重畫框。縮圖以 contain 置中顯示，先算出圖片實際佔的範圍，臉框才對得準
        function renderFaces(item) {
            const { width, height, faces } = item.detected;
            const measure = FACE_MEASURES[faceMeasure];
            item.faces = faces.map((f) => ({ box: f[faceShape], ratio: measure(f[faceShape]) }));
            item.maxRatio = Math.max(0, ...item.faces.map((f) => f.ratio));
            const frame = 16 / 10;
            const aspect = width / height;
            const w = aspect > frame ? 1 : aspect / frame;
            const h = aspect > frame ? frame / aspect : 1;
            item.boxesEl.style.cssText = `left:${(1 - w) * 50}%;top:${(1 - h) * 50}%;width:${w * 100}%;height:${h * 100}%`;
            item.boxesEl.textContent = '';
            item.faceEls = item.faces.map(({ box, ratio }) => {
                const el = document.createElement('div');
                el.className = 'face';
                el.style.cssText = `left:${box.x * 100}%;top:${box.y * 100}%;width:${box.w * 100}%;height:${box.h * 100}%`;
                item.boxesEl.appendChild(el);
                return el;
            });
            // 比例放在縮圖右上角（不蓋住人臉），由大到小最多列 3 個，其餘併成「+N」
            item.scoresEl.textContent = '';
            item.scoreEls = [];
            const order = item.faces.map((_, i) => i).sort((a, b) => item.faces[b].ratio - item.faces[a].ratio);
            order.slice(0, FACE_SCORE_MAX).forEach((i) => {
                const chip = document.createElement('span');
                chip.className = 'score';
                chip.textContent = `${(item.faces[i].ratio * 100).toFixed(1)}%`;
                item.scoresEl.appendChild(chip);
                item.scoreEls[i] = chip;
            });
            if (order.length > FACE_SCORE_MAX) {
                const more = document.createElement('span');
                more.className = 'score more';
                more.textContent = `+${order.length - FACE_SCORE_MAX}`;
                item.scoresEl.appendChild(more);
            }
        }

        // 換算法時偵測結果不變，只重算比例；滑桿動過之後，換算法也會同步更新勾選
        function onModeChange() {
            faceShape = shapeSelect.value;
            faceMeasure = measureSelect.value;
            syncSliderRange();
            saveFaceMode(faceShape, faceMeasure);
            items.forEach((item) => { if (item.detected) renderFaces(item); });
            applyFaceFilter(filterActive);
        }

        shapeSelect.addEventListener('change', onModeChange);
        measureSelect.addEventListener('change', onModeChange);

        // 標出達標的臉並統計符合張數；updateSelection 時，最大的臉 ≥ 門檻才勾選（偵測失敗的圖維持原本的勾選狀態）
        function applyFaceFilter(updateSelection) {
            let hits = 0;
            items.forEach((item) => {
                item.faceEls.forEach((el, i) => {
                    const hit = item.faces[i].ratio * 100 >= faceMin;
                    el.classList.toggle('hit', hit);
                    if (item.scoreEls[i]) item.scoreEls[i].classList.toggle('hit', hit);
                });
                if (item.failed) return;
                const match = item.maxRatio * 100 >= faceMin;
                if (match) hits++;
                if (!updateSelection) return;
                item.input.checked = match;
                if (match) selected.add(item.key);
                else selected.delete(item.key);
            });
            faceValEl.textContent = `${faceMin}%`;
            hitsEl.textContent = `符合 ${hits} / ${items.length} 張`;
            refresh();
        }

        async function sendFace(msg) {
            const res = await chrome.runtime.sendMessage(msg);
            if (!res || !res.ok) throw new Error(res ? res.error : '無回應');
            return res;
        }

        async function detectFaces() {
            if (faceState !== 'idle') return;
            faceState = 'running';
            facesButton.disabled = true;
            facesButton.textContent = '準備偵測...';
            try {
                await faceModeReady;
                await sendFace({ type: 'face-open' });
                // 偵測頁面建立期間使用者已關閉視窗：close() 當時還沒有東西可關，這裡補關
                if (closed) {
                    chrome.runtime.sendMessage({ type: 'face-close' }).catch(() => {});
                    return;
                }
            } catch (e) {
                console.log('[PreviewImageSaver] 無法啟動人臉偵測:', e.message);
                faceState = 'idle';
                facesButton.disabled = false;
                facesButton.textContent = '偵測失敗，重試';
                return;
            }
            let next = 0;
            let done = 0;
            let failed = 0;
            async function worker() {
                while (!closed && next < items.length) {
                    const item = items[next++];
                    try {
                        const res = await sendFace({ type: 'detect-faces', url: item.thumb });
                        item.detected = res;
                        renderFaces(item);
                    } catch (e) {
                        failed++;
                        item.failed = true;
                        console.log(`[PreviewImageSaver] ${item.label} 偵測失敗:`, e.message);
                    }
                    done++;
                    if (!closed) facesButton.textContent = `偵測中 ${done}/${items.length}`;
                }
            }
            await Promise.all(Array.from({ length: FACE_CONCURRENCY }, worker));
            if (closed) return;
            if (failed === items.length) {
                items.forEach((item) => { item.failed = false; });
                faceState = 'idle';
                facesButton.disabled = false;
                facesButton.textContent = '偵測失敗，重試';
                return;
            }
            faceState = 'done';
            facesButton.textContent = failed ? `偵測完成（${failed} 張失敗）` : '偵測完成';
            faceBar.hidden = false;
            applyFaceFilter(false);
        }

        faceSlider.addEventListener('input', () => {
            faceMin = Number(faceSlider.value);
            filterActive = true;
            applyFaceFilter(true);
        });

        // 彈出框可從右下角拖曳縮放、拖曳標題列移動；縮圖欄數固定，所以縮圖會隨框的大小變化。
        // 每次開啟都回到預設大小並置中（開啟時算一次，之後內容變動不會跳動），不記住調整結果
        const panel = mroot.querySelector('.panel');

        function placePanel() {
            const vw = document.documentElement.clientWidth;
            const vh = document.documentElement.clientHeight;
            const width = Math.min(900, vw - 16);
            const height = Math.min(Math.round(vh * 0.8), vh - 16);
            panel.style.width = `${width}px`;
            panel.style.height = `${height}px`;
            panel.style.left = `${Math.max(8, (vw - width) / 2)}px`;
            panel.style.top = `${Math.max(8, (vh - height) / 2)}px`;
        }

        // 移動彈出框，並限制在可見範圍內
        function movePanel(left, top) {
            const vw = document.documentElement.clientWidth;
            const vh = document.documentElement.clientHeight;
            panel.style.left = `${Math.max(8, Math.min(left, vw - panel.offsetWidth - 8))}px`;
            panel.style.top = `${Math.max(8, Math.min(top, vh - panel.offsetHeight - 8))}px`;
        }

        // 瀏覽器視窗縮小時，把彈出框拉回可見範圍
        function clampPanel() {
            movePanel(panel.offsetLeft, panel.offsetTop);
        }

        // 拖曳標題列移動彈出框（標題列上的按鈕照常可按）
        panel.querySelector('header').addEventListener('mousedown', (e) => {
            if (e.button !== 0 || e.target.closest('button')) return;
            e.preventDefault();
            const shiftX = e.clientX - panel.offsetLeft;
            const shiftY = e.clientY - panel.offsetTop;

            function onMove(ev) {
                movePanel(ev.clientX - shiftX, ev.clientY - shiftY);
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // 拖曳縮放時滑鼠常會在框外放開，只有按下與放開都在背景上才算點背景關閉
        let downOnOverlay = false;
        mroot.addEventListener('mousedown', (e) => { downOnOverlay = e.target.dataset.role === 'overlay'; });

        function close() {
            pickerOpen = false;
            closed = true;
            window.removeEventListener('resize', clampPanel);
            if (faceState !== 'idle') chrome.runtime.sendMessage({ type: 'face-close' }).catch(() => {});
            hideZoom();
            document.removeEventListener('keydown', onKey, true);
            modalHost.remove();
        }

        function onKey(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close();
            }
        }

        mroot.addEventListener('change', (e) => {
            const input = e.target.closest('input[data-key]');
            if (!input) return;
            if (input.checked) selected.add(input.dataset.key);
            else selected.delete(input.dataset.key);
            refresh();
        });

        mroot.addEventListener('click', (e) => {
            const act = e.target.closest('[data-act]');
            if (!act) {
                if (e.target.dataset.role === 'overlay' && downOnOverlay) close();
                return;
            }
            if (act.dataset.act === 'all' || act.dataset.act === 'none') {
                const checked = act.dataset.act === 'all';
                mroot.querySelectorAll('input[data-key]').forEach((input) => {
                    input.checked = checked;
                    if (checked) selected.add(input.dataset.key);
                    else selected.delete(input.dataset.key);
                });
                refresh();
            } else if (act.dataset.act === 'faces') {
                detectFaces();
            } else if (act.dataset.act === 'cancel') {
                close();
            } else if (act.dataset.act === 'ok' && selected.size > 0) {
                const picked = {
                    cover: selected.has('cover') ? page.cover : null,
                    samples: page.samples.filter((s) => selected.has(String(s.n)))
                };
                close();
                if (!busy) download(page.code, page.actor, picked.cover, picked.samples);
            }
        });

        document.addEventListener('keydown', onKey, true);
        document.documentElement.appendChild(modalHost);
        placePanel();
        window.addEventListener('resize', clampPanel);
        refresh();
        panel.focus();
        detectFaces();
    }

    // 人臉佔比的算法：框選範圍（head 頭部框／face 五官框）× 計算方式。框為正規化座標（w、h 為佔圖寬、圖高的比例）
    const FACE_SHAPES = ['head', 'face'];
    const FACE_MEASURES = {
        area: (b) => b.w * b.h,
        height: (b) => b.h,
        width: (b) => b.w,
        side: (b) => Math.sqrt(b.w * b.h)
    };

    // 設定「人臉佔比算法」（預設五官框的邊長比：乘上圖片幾何平均邊長即臉的邊長像素，適合換臉挑圖），選圖視窗切換時會記住
    async function loadFaceMode() {
        const fallback = { shape: 'face', measure: 'side' };
        try {
            const result = await chrome.storage.sync.get({ faceShape: fallback.shape, faceMeasure: fallback.measure });
            return {
                shape: FACE_SHAPES.includes(result.faceShape) ? result.faceShape : fallback.shape,
                measure: result.faceMeasure in FACE_MEASURES ? result.faceMeasure : fallback.measure
            };
        } catch (e) {
            console.log('[PreviewImageSaver] 讀取人臉算法設定失敗，使用預設:', e.message);
            return fallback;
        }
    }

    function saveFaceMode(shape, measure) {
        chrome.storage.sync.set({ faceShape: shape, faceMeasure: measure })
            .catch((e) => console.log('[PreviewImageSaver] 儲存人臉算法設定失敗:', e.message));
    }

    // 設定「停留放大」（預設開啟）
    async function loadHoverZoomSetting() {
        try {
            const result = await chrome.storage.sync.get({ hoverZoom: true });
            return !!result.hoverZoom;
        } catch (e) {
            console.log('[PreviewImageSaver] 讀取放大設定失敗，維持開啟:', e.message);
            return true;
        }
    }

    // 設定「下載前先選擇圖片」（預設關閉＝直接下載全部）
    async function shouldPick() {
        try {
            const result = await chrome.storage.sync.get({ pickBeforeDownload: false });
            return !!result.pickBeforeDownload;
        } catch (e) {
            console.log('[PreviewImageSaver] 讀取設定失敗，改為直接下載:', e.message);
            return false;
        }
    }

    async function start() {
        if (busy) return;
        // 擴充功能重新載入後，已開啟頁面上的舊腳本會失效（chrome.storage／runtime 變 undefined）
        if (!chrome.runtime || !chrome.runtime.id) {
            console.log('[PreviewImageSaver] 擴充功能已重新載入，此頁面的腳本已失效');
            return finish('擴充功能已更新，請按 F5 重新整理頁面');
        }
        setBusy(true);
        setText('準備中...');
        let page;
        let pick;
        try {
            [page, pick] = await Promise.all([prepare(), shouldPick()]);
        } catch (e) {
            return finish(e.message);
        }
        if (pick) {
            setBusy(false);
            setText('下載圖片');
            openPicker(page);
        } else {
            download(page.code, page.actor, page.cover, page.samples);
        }
    }

    root.addEventListener('click', (e) => {
        if (dragged) {
            dragged = false;
            return;
        }
        if (e.target.closest('button')) start();
    });
})();
