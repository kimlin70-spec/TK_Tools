/* report.js — PDF patrol reports (QP.report)
 * Pages are drawn on a canvas (so Korean or any other script in names/notes renders with the phone's fonts)
 * and embedded as JPEG pages with jsPDF. Photos are included as thumbnails. */
window.QP = window.QP || {};
(function () {
  'use strict';
  const U = QP.util, DB = QP.db, L = QP.logic;
  const PAGE = { w: 210, h: 297, margin: 12, footer: 9 }; // mm
  const SCALE = 7.5; // px per mm (~190 dpi)
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans KR", "Malgun Gothic", Arial, sans-serif';
  const C = { text: '#1c2430', muted: '#667085', line: '#d5dce4', ok: '#2e7d32', action: '#e65100', missed: '#c62828', box: '#eef2f6', photo: '#c9d2dc' };
  const X = PAGE.margin, W = PAGE.w - 2 * PAGE.margin;

  function loadImage(src) {
    return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Image failed')); i.src = src; });
  }

  // Minimal page/cursor renderer. Finished pages are kept only as JPEG data URLs to save memory.
  class Pages {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = Math.round(PAGE.w * SCALE);
      this.canvas.height = Math.round(PAGE.h * SCALE);
      this.ctx = this.canvas.getContext('2d');
      this.images = [];
      this.y = PAGE.margin;
      this.started = false;
    }
    px(mm) { return mm * SCALE; }
    startPage() {
      const c = this.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.y = PAGE.margin; this.started = true;
    }
    endPage() { if (!this.started) return; this.images.push(this.canvas.toDataURL('image/jpeg', 0.82)); this.started = false; }
    ensure(hMm) {
      if (!this.started) this.startPage();
      if (this.y + hMm > PAGE.h - PAGE.margin - PAGE.footer) { this.endPage(); this.startPage(); }
    }
    font(size, weight) { this.ctx.font = `${weight || 400} ${this.px(size)}px ${FONT}`; }
    width(str, size, weight) { this.font(size, weight); return this.ctx.measureText(str).width / SCALE; }
    ellipsize(str, size, weight, maxW) {
      this.font(size, weight);
      const c = this.ctx, maxPx = this.px(maxW);
      if (c.measureText(str).width <= maxPx) return str;
      let t = str;
      while (t.length > 1 && c.measureText(t + '…').width > maxPx) t = t.slice(0, -1);
      return t + '…';
    }
    wrap(str, size, weight, maxW) {
      this.font(size, weight);
      const c = this.ctx, maxPx = this.px(maxW), out = [];
      for (const rawLine of String(str || '').split(/\r?\n/)) {
        let cur = '';
        for (const word of rawLine.split(' ')) {
          const test = cur ? cur + ' ' + word : word;
          if (c.measureText(test).width <= maxPx) { cur = test; continue; }
          if (cur) out.push(cur);
          let piece = '';
          for (const ch of word) {
            if (!piece || c.measureText(piece + ch).width <= maxPx) piece += ch;
            else { out.push(piece); piece = ch; }
          }
          cur = piece;
        }
        out.push(cur);
      }
      return out;
    }
    text(str, x, y, o) {
      o = o || {};
      const c = this.ctx;
      this.font(o.size || 3.6, o.weight);
      c.fillStyle = o.color || C.text; c.textBaseline = 'top'; c.textAlign = o.align || 'left';
      const s = o.maxW ? this.ellipsize(String(str), o.size || 3.6, o.weight, o.maxW) : String(str);
      c.fillText(s, this.px(x), this.px(y));
    }
    // Wrapped paragraph at the cursor; advances y, breaking pages per line.
    para(str, x, maxW, o) {
      o = o || {};
      const size = o.size || 3.6, lh = size * (o.lh || 1.4);
      const lines = this.wrap(str, size, o.weight, maxW);
      for (const ln of lines) { this.ensure(lh); this.text(ln, x, this.y, o); this.y += lh; }
      return lines.length;
    }
    hr(color) {
      this.ensure(1);
      const c = this.ctx;
      c.strokeStyle = color || C.line; c.lineWidth = this.px(0.25);
      c.beginPath(); c.moveTo(this.px(X), this.px(this.y)); c.lineTo(this.px(X + W), this.px(this.y)); c.stroke();
    }
    box(x, y, w, h, fill) {
      const c = this.ctx;
      c.fillStyle = fill;
      const r = this.px(2);
      c.beginPath();
      if (c.roundRect) c.roundRect(this.px(x), this.px(y), this.px(w), this.px(h), r); else c.rect(this.px(x), this.px(y), this.px(w), this.px(h));
      c.fill();
    }
    async image(dataUrl, x, maxW, maxH) {
      let img;
      try { img = await loadImage(dataUrl); } catch (e) { return 0; }
      let w = maxW, h = maxW * img.naturalHeight / img.naturalWidth;
      if (h > maxH) { h = maxH; w = maxH * img.naturalWidth / img.naturalHeight; }
      this.ensure(h + 2);
      const c = this.ctx;
      c.drawImage(img, this.px(x), this.px(this.y), this.px(w), this.px(h));
      c.strokeStyle = C.photo; c.lineWidth = this.px(0.2); c.strokeRect(this.px(x), this.px(this.y), this.px(w), this.px(h));
      this.y += h + 2;
      return h;
    }
    finish() { this.endPage(); return this.images; }
  }

  function sectionTitle(P, title) {
    P.ensure(14);
    P.y += 3;
    P.text(title, X, P.y, { size: 4.4, weight: 700 });
    P.y += 6.5;
    P.hr('#9aa5b1');
    P.y += 2.5;
  }
  function summaryTiles(P, tiles) {
    const gap = 3, w = (W - gap * (tiles.length - 1)) / tiles.length, h = 15;
    P.ensure(h + 4);
    tiles.forEach((t, i) => {
      const x = X + i * (w + gap);
      P.box(x, P.y, w, h, C.box);
      P.text(t.value, x + 3, P.y + 2.2, { size: 5.2, weight: 700, color: t.color || C.text, maxW: w - 6 });
      P.text(t.label, x + 3, P.y + 9.8, { size: 2.8, color: C.muted, maxW: w - 6 });
    });
    P.y += h + 4;
  }

  async function drawRecord(P, rec, place, opts) {
    const colMain = X + 16, resultW = 34, mainW = W - 16 - resultW;
    P.ensure(13);
    P.y += 1.5;
    const top = P.y;
    const ok = rec.result === 'OK';
    P.text(U.fmtTime(rec.ts), X, top, { size: 3.6, weight: 700 });
    P.text(place ? place.name : '(deleted place)', colMain, top, { size: 3.8, weight: 700, maxW: mainW });
    P.text(ok ? 'OK' : 'ACTION NEEDED', X + W, top, { size: 3.6, weight: 700, color: ok ? C.ok : C.action, align: 'right' });
    if (!ok) P.text(rec.status === 'DONE' ? 'done ' + U.fmtDateTime(rec.closedTs) : 'open', X + W, top + 5, { size: 2.9, color: C.muted, align: 'right' });
    P.y = top + 5.2;
    const sub = [place && place.area, place && L.placeTimes(place) === 2 ? rec.slot : null, rec.extra ? 'extra (not scheduled)' : null, rec.manual ? 'manual (no QR)' : null, rec.hasPhoto && !opts.photos ? 'photo on phone' : null].filter(Boolean).join('  ·  ');
    if (sub) { P.text(sub, colMain, P.y, { size: 3, color: C.muted, maxW: mainW + resultW }); P.y += 4.6; }
    if (rec.note) P.para(rec.note, colMain, mainW + resultW, { size: 3.4 });
    if (opts.photos && rec.hasPhoto) {
      const data = await DB.getPhoto(rec.id);
      if (data) { P.y += 1; await P.image(data, colMain, 80, 60); }
    }
    P.y += 1.5;
    P.hr();
  }
  function drawFollowUp(P, ev, place) {
    const colMain = X + 16;
    P.ensure(11);
    P.y += 1.5;
    const top = P.y, done = ev.kind === 'DONE';
    P.text(U.fmtTime(ev.ts), X, top, { size: 3.6, weight: 700 });
    P.text('Follow-up: ' + (place ? place.name : '(deleted place)'), colMain, top, { size: 3.8, weight: 700, maxW: W - 16 - 34 });
    P.text(done ? 'DONE' : 'NOT YET', X + W, top, { size: 3.6, weight: 700, color: done ? C.ok : C.muted, align: 'right' });
    P.y = top + 5.2;
    P.text('Action reported ' + U.fmtDateTime(ev.rec.ts) + (ev.rec.note ? '  ·  ' + ev.rec.note : ''), colMain, P.y, { size: 3, color: C.muted, maxW: W - 16 });
    P.y += 6;
    P.hr();
  }

  /* Build the report. Returns a Blob (PDF). opts.photos: include photos (default true). */
  async function buildReportPDF(fromKey, toKey, opts) {
    opts = Object.assign({ photos: true }, opts || {});
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) throw new Error('PDF library not loaded');
    const now = new Date(), today = U.todayKey();
    if (toKey > today) toKey = today;
    if (fromKey > toKey) fromKey = toKey;
    const [allPlaces, allRecs, settings, open] = await Promise.all([DB.getPlaces(true), DB.getAllRecords(), DB.getSettings(), DB.getOpenActions()]);
    const pm = new Map(allPlaces.map((p) => [p.id, p]));
    const byDate = {};
    for (const r of allRecs) (byDate[r.date] = byDate[r.date] || []).push(r);
    const actionRecs = allRecs.filter((r) => r.result === 'ACTION');
    open.sort((a, b) => a.ts - b.ts);
    const single = fromKey === toKey;
    const P = new Pages();

    // Title block
    P.ensure(26);
    P.text(single ? 'Daily Patrol Report' : 'Patrol Report', X, P.y, { size: 7, weight: 700 });
    P.y += 9.5;
    P.text(single ? U.fmtDateKey(fromKey, true) : U.fmtDateKey(fromKey, true) + '  –  ' + U.fmtDateKey(toKey, true), X, P.y, { size: 4.4, color: C.muted });
    P.y += 6.5;
    P.text('Generated ' + U.fmtFull(now.getTime()) + (opts.photos ? '' : '  ·  photos not included'), X, P.y, { size: 3, color: C.muted });
    P.y += 5;

    for (let key = fromKey; key <= toKey; key = U.addDays(key, 1)) {
      const dayRecs = (byDate[key] || []).slice().sort((a, b) => a.ts - b.ts);
      const working = L.isWorkingDay(key, settings), off = L.isOffDay(key, settings), patrol = working && !off;
      const status = L.dayStatus(allPlaces, dayRecs, key, now, settings);
      const sum = L.summary(status);
      const missed = [];
      if (patrol) for (const st of status) for (const sl of st.slots) if (sl.state === 'missed') missed.push({ place: st.place, slot: sl.slot });
      const events = dayRecs.map((rec) => ({ ts: rec.ts, kind: 'record', rec }));
      for (const rec of actionRecs) {
        for (const f of rec.followUps || []) if (U.dateKey(new Date(f.ts)) === key) events.push({ ts: f.ts, kind: 'NOT_YET', rec });
        if (rec.status === 'DONE' && rec.closedTs && U.dateKey(new Date(rec.closedTs)) === key) events.push({ ts: rec.closedTs, kind: 'DONE', rec });
      }
      events.sort((a, b) => a.ts - b.ts);
      const actionsToday = dayRecs.filter((r) => r.result === 'ACTION').length;

      if (!single) {
        P.ensure(16);
        P.y += 4;
        P.text(U.fmtDateKey(key, true) + (off ? '  (no patrol)' : (working ? '' : '  (not a working day)')), X, P.y, { size: 5, weight: 700 });
        P.y += 7.5;
      }
      summaryTiles(P, [
        { label: 'Checks done', value: sum.done + ' / ' + sum.total, color: sum.total && sum.done === sum.total ? C.ok : C.text },
        { label: 'Missed', value: patrol ? String(missed.length) : '–', color: missed.length ? C.missed : C.text },
        { label: 'Action needed', value: String(actionsToday), color: actionsToday ? C.action : C.text },
        { label: single ? 'Open actions now' : 'Open actions now', value: String(open.length), color: open.length ? C.action : C.text },
      ]);
      if (off) P.para('Marked as a no-patrol day (holiday / absence). No checks were required.', X, W, { size: 3.2, color: C.muted });
      else if (!working) P.para('Not a working day. No checks were scheduled.', X, W, { size: 3.2, color: C.muted });

      sectionTitle(P, 'Records (' + dayRecs.length + ')');
      if (!events.length) P.para('No records on this day.', X, W, { size: 3.6, color: C.muted });
      for (const e of events) {
        const place = pm.get(e.rec.placeId);
        if (e.kind === 'record') await drawRecord(P, e.rec, place, opts);
        else drawFollowUp(P, e, place);
      }

      sectionTitle(P, 'Missed checks (' + (patrol ? missed.length : '–') + ')');
      if (off) P.para('No-patrol day. Nothing is counted as missed.', X, W, { size: 3.6, color: C.muted });
      else if (!working) P.para('Not a working day. No checks were required.', X, W, { size: 3.6, color: C.muted });
      else if (!missed.length) P.para(key === today ? 'Nothing missed so far today.' : 'No missed checks.', X, W, { size: 3.6, color: C.muted });
      else {
        for (const m of missed) {
          P.ensure(6);
          P.text(m.place.name + (m.place.area ? '   ·   ' + m.place.area : ''), X + 2, P.y, { size: 3.6, maxW: W - 30 });
          P.text(m.slot === 'DAY' ? 'Missed' : m.slot + ' missed', X + W, P.y, { size: 3.6, weight: 700, color: C.missed, align: 'right' });
          P.y += 5.6;
        }
      }
    }

    sectionTitle(P, 'Open actions as of now (' + open.length + ')');
    if (!open.length) P.para('No open actions.', X, W, { size: 3.6, color: C.muted });
    for (const rec of open) {
      const place = pm.get(rec.placeId);
      P.ensure(14);
      P.y += 1.5;
      const top = P.y, days = U.daysSince(rec.ts);
      P.text(place ? place.name : '(deleted place)', X, top, { size: 3.8, weight: 700, maxW: W - 30 });
      P.text(days === 0 ? 'today' : days + ' day' + (days === 1 ? '' : 's') + ' open', X + W, top, { size: 3.6, weight: 700, color: C.action, align: 'right' });
      P.y = top + 5.2;
      const notYet = (rec.followUps || []).length;
      P.text([place && place.area, 'Reported ' + U.fmtFull(rec.ts), notYet ? 'Not yet ×' + notYet : null].filter(Boolean).join('  ·  '), X, P.y, { size: 3, color: C.muted, maxW: W });
      P.y += 4.6;
      if (rec.note) P.para(rec.note, X, W, { size: 3.4 });
      if (opts.photos && rec.hasPhoto) {
        const data = await DB.getPhoto(rec.id);
        if (data) { P.y += 1; await P.image(data, X, 60, 45); }
      }
      P.y += 1.5;
      P.hr();
    }

    const pages = P.finish();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const footerLeft = 'QR Patrol  -  ' + (single ? fromKey : fromKey + ' to ' + toKey);
    pages.forEach((img, i) => {
      if (i) doc.addPage();
      doc.addImage(img, 'JPEG', 0, 0, PAGE.w, PAGE.h);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
      doc.text(footerLeft, PAGE.margin, PAGE.h - 5.5);
      doc.text('Page ' + (i + 1) + ' / ' + pages.length, PAGE.w - PAGE.margin, PAGE.h - 5.5, { align: 'right' });
    });
    return doc.output('blob');
  }

  function reportFileName(fromKey, toKey) {
    const f = fromKey.replace(/-/g, ''), t = toKey.replace(/-/g, '');
    return 'patrol-report_' + (fromKey === toKey ? f : f + '-' + t) + '.pdf';
  }

  QP.report = { buildReportPDF, reportFileName };
})();
