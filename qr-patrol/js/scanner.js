/* scanner.js — camera QR scanning (BarcodeDetector when available, jsQR fallback) (QP.scanner) */
window.QP = window.QP || {};
(function () {
  'use strict';
  let stream = null, video = null, track = null, running = false, rafId = 0;
  let detector = null, canvas = null, ctx = null, lastDecode = 0, onResult = null, torchOn = false;
  let gen = 0; // incremented on every start/stop so a late getUserMedia result can be discarded

  async function makeDetector() {
    try {
      if ('BarcodeDetector' in window) {
        const formats = window.BarcodeDetector.getSupportedFormats ? await window.BarcodeDetector.getSupportedFormats() : ['qr_code'];
        if (formats.includes('qr_code')) return new window.BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (e) { /* fall back to jsQR */ }
    return null;
  }

  async function start(videoEl, cb) {
    stop();
    const my = ++gen;
    video = videoEl; onResult = cb;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Camera is not available in this browser.');
    const s = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (my !== gen || !video) { s.getTracks().forEach((t) => t.stop()); return; } // screen was left meanwhile
    stream = s;
    track = stream.getVideoTracks()[0] || null;
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play().catch(() => {});
    detector = await makeDetector();
    if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
    running = true; torchOn = false; lastDecode = 0;
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    gen++;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (stream) { stream.getTracks().forEach((t) => { try { t.stop(); } catch (e) { /* ignore */ } }); }
    if (video) { try { video.pause(); video.srcObject = null; } catch (e) { /* ignore */ } }
    stream = null; track = null; video = null;
  }

  async function tick() {
    if (!running) return;
    const now = performance.now();
    if (video && video.readyState >= 2 && now - lastDecode > 120) {
      lastDecode = now;
      let text = null;
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes && codes.length) text = codes[0].rawValue;
        } else if (window.jsQR) {
          const vw = video.videoWidth, vh = video.videoHeight;
          if (vw && vh) {
            const scale = Math.min(1, 480 / Math.max(vw, vh));
            const w = Math.round(vw * scale), h = Math.round(vh * scale);
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const code = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
            if (code && code.data) text = code.data;
          }
        }
      } catch (e) {
        if (detector) detector = null; // BarcodeDetector failed: use jsQR from now on
      }
      if (text && running) {
        running = false;
        const cb = onResult;
        if (cb) cb(String(text));
        return;
      }
    }
    if (running) rafId = requestAnimationFrame(tick);
  }

  function hasTorch() {
    try { return !!(track && track.getCapabilities && track.getCapabilities().torch); } catch (e) { return false; }
  }
  async function toggleTorch() {
    if (!hasTorch()) return false;
    torchOn = !torchOn;
    await track.applyConstraints({ advanced: [{ torch: torchOn }] });
    return torchOn;
  }
  function isRunning() { return running; }

  QP.scanner = { start, stop, hasTorch, toggleTorch, isRunning };
})();
