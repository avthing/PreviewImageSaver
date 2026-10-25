// Offscreen document：在擴充功能頁面內抓圖並偵測人臉（service worker 沒有 canvas，頁面端又讀不到跨網域像素）
import { FaceDetector, FilesetResolver } from './vendor/mediapipe/vision_bundle.mjs';

let detectorPromise = null;

function getDetector() {
    if (!detectorPromise) {
        detectorPromise = (async () => {
            const fileset = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('vendor/mediapipe'));
            return FaceDetector.createFromOptions(fileset, {
                baseOptions: { modelAssetPath: chrome.runtime.getURL('vendor/mediapipe/blaze_face_short_range.tflite') },
                runningMode: 'IMAGE',
                minDetectionConfidence: 0.5
            });
        })().catch((e) => {
            detectorPromise = null;
            throw e;
        });
    }
    return detectorPromise;
}

// 模型框的是眉毛到下巴的五官區域，把它外推成含額頭、頭髮與耳朵的頭部框（單位為五官框的寬、高）。
// 外推量依使用者在一張特寫封面上手畫的目標框反推，是經驗值，不同臉型、髮型會有誤差
const HEAD_PAD = { side: 0.14, top: 0.485, bottom: -0.07 };

function toHeadBox(b, width, height) {
    const left = Math.max(0, b.originX - b.width * HEAD_PAD.side);
    const right = Math.min(width, b.originX + b.width * (1 + HEAD_PAD.side));
    const top = Math.max(0, b.originY - b.height * HEAD_PAD.top);
    const bottom = Math.min(height, b.originY + b.height * (1 + HEAD_PAD.bottom));
    return { x: left / width, y: top / height, w: (right - left) / width, h: (bottom - top) / height };
}

// 回傳正規化（0–1）的框：face 是模型原始的五官框，head 是外推的頭部框；比例由選圖視窗依所選算法計算
async function detectFaces(url) {
    if (new URL(url).protocol !== 'https:') throw new Error('只支援 https 圖片');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bitmap = await createImageBitmap(await res.blob());
    try {
        const detector = await getDetector();
        const { width, height } = bitmap;
        const faces = detector.detect(bitmap).detections
            .filter((d) => d.boundingBox)
            .map(({ boundingBox: b }) => ({
                face: { x: b.originX / width, y: b.originY / height, w: b.width / width, h: b.height / height },
                head: toHeadBox(b, width, height)
            }));
        return { width, height, faces };
    } finally {
        bitmap.close();
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'detect-faces') return false;
    detectFaces(msg.url).then(
        (result) => sendResponse({ ok: true, ...result }),
        (e) => {
            console.log('[PreviewImageSaver] 人臉偵測失敗:', msg.url, e.message);
            sendResponse({ ok: false, error: e.message });
        }
    );
    return true;
});
