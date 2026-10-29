/* util.js — small shared helpers (QP.util) */
window.QP = window.QP || {};
(function () {
  'use strict';
  const pad2 = (n) => String(n).padStart(2, '0');
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseKey(key) { const p = String(key).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function todayKey() { return dateKey(new Date()); }
  function addDays(key, n) { const d = parseKey(key); d.setDate(d.getDate() + n); return dateKey(d); }
  function slotOf(d) { d = d || new Date(); return d.getHours() < 12 ? 'AM' : 'PM'; }
  function fmtTime(ts) { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function fmtDateKey(key, withYear) {
    const d = parseKey(key);
    return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + (withYear ? ', ' + d.getFullYear() : '');
  }
  function fmtShortDate(ts) { const d = new Date(ts); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function fmtDateTime(ts) { return fmtShortDate(ts) + ' ' + fmtTime(ts); }
  function fmtFull(ts) { const d = new Date(ts); return dateKey(d) + ' ' + fmtTime(ts); }
  function daysSince(ts) {
    const a = parseKey(dateKey(new Date(ts)));
    const b = parseKey(todayKey());
    return Math.round((b - a) / 86400000);
  }
  function fileStamp(d) { d = d || new Date(); return dateKey(d).replace(/-/g, '') + '_' + pad2(d.getHours()) + pad2(d.getMinutes()); }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  function placeId() {
    const arr = new Uint32Array(6);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < 6; i++) s += ID_ALPHABET[arr[i] % ID_ALPHABET.length];
    return s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function vibrate(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern || 80); } catch (e) { /* ignore */ } }
  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  // Short confirmation beep (iPhones have no vibration API). The AudioContext is created on the first user gesture.
  let audioCtx = null;
  function primeAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!audioCtx && AC) audioCtx = new AC();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* no audio */ }
  }
  function beep(freq, ms) {
    try {
      if (!audioCtx || audioCtx.state !== 'running') return;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime, d = (ms || 120) / 1000;
      o.type = 'sine'; o.frequency.value = freq || 1320;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* ignore */ }
  }
  document.addEventListener('pointerdown', primeAudio, { passive: true });
  document.addEventListener('keydown', primeAudio, { passive: true });

  function compressImage(file, maxDim, quality) {
    maxDim = maxDim || 1280; quality = quality || 0.72;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read the image')); };
      img.src = url;
    });
  }

  function downloadBlob(blob, filename) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 3000);
  }
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] })); } catch (e) { return false; }
  }
  async function shareBlob(blob, filename, title) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: title || filename });
      return true;
    }
    return false;
  }

  let toastTimer = null;
  function toast(msg, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2400);
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return '-';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error || new Error('Could not read file'));
      r.readAsText(file);
    });
  }

  QP.util = {
    pad2, DAYS, MONTHS, dateKey, parseKey, todayKey, addDays, slotOf, fmtTime, fmtDateKey, fmtShortDate, fmtDateTime, fmtFull,
    daysSince, fileStamp, uid, placeId, esc, vibrate, isIOS, isStandalone, beep, compressImage, downloadBlob, canShareFiles, shareBlob, toast, fmtBytes, readFileText,
  };
})();
