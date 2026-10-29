/* labels.js — QR label sheets: HTML (print) and PDF (jsPDF) (QP.labels) */
window.QP = window.QP || {};
(function () {
  'use strict';
  const U = QP.util;
  const PAGE = { w: 190, h: 277, margin: 10 }; // A4 inner area (10 mm margins)
  const LAYOUTS = {
    L: { key: 'L', name: 'Large (6 per page)', cols: 2, rows: 3, qr: 60, namePt: 22, areaPt: 13, idPt: 10 },
    M: { key: 'M', name: 'Medium (8 per page)', cols: 2, rows: 4, qr: 42, namePt: 16, areaPt: 11, idPt: 8.5 },
    S: { key: 'S', name: 'Small (15 per page)', cols: 3, rows: 5, qr: 30, namePt: 12, areaPt: 9.5, idPt: 7.5 },
  };
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif';
  const PX_PER_MM = 8; // ~203 dpi raster for label text in the PDF

  function makeQR(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(String(text));
    qr.make();
    return qr;
  }
  function qrSvg(text) { return makeQR(text).createSvgTag({ cellSize: 4, margin: 0, scalable: true }); }

  function labelHTML(p) {
    return `<div class="label">
      <div class="qr">${qrSvg(p.id)}</div>
      <div class="lname">${U.esc(p.name)}</div>
      <div class="larea">${U.esc(p.area || '')}</div>
      <div class="lid">${U.esc(p.id)}</div>
    </div>`;
  }
  function sheetsHTML(places, layoutKey) {
    const L = LAYOUTS[layoutKey] || LAYOUTS.M;
    const per = L.cols * L.rows;
    const pages = [];
    for (let i = 0; i < places.length; i += per) pages.push(places.slice(i, i + per));
    const style = `--cols:${L.cols};--rows:${L.rows};--qr:${L.qr}mm;--name-font:${L.namePt}pt;--area-font:${L.areaPt}pt;--id-font:${L.idPt}pt`;
    return pages.map((page) => `<div class="sheet" style="${style}">${page.map(labelHTML).join('')}</div>`).join('');
  }
  function pageCount(n, layoutKey) { const L = LAYOUTS[layoutKey] || LAYOUTS.M; return Math.ceil(n / (L.cols * L.rows)); }

  // ---- PDF ----
  function drawQR(doc, text, x, y, sizeMm) {
    const qr = makeQR(text);
    const n = qr.getModuleCount();
    const m = sizeMm / n;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (qr.isDark(r, c)) {
          let c2 = c;
          while (c2 < n && qr.isDark(r, c2)) c2++;
          doc.rect(x + c * m, y + r * m, (c2 - c) * m + 0.02, m + 0.02, 'F');
          c = c2;
        } else c++;
      }
    }
  }
  function ellipsize(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  function wrapText(ctx, text, maxW, maxLines) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? cur + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW) { cur = test; continue; }
      if (cur) { lines.push(cur); cur = ''; }
      let piece = '';
      for (const ch of word) {
        if (ctx.measureText(piece + ch).width <= maxW || !piece) piece += ch;
        else { lines.push(piece); piece = ch; }
      }
      cur = piece;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = ellipsize(ctx, kept[maxLines - 1] + ' ' + lines.slice(maxLines).join(' '), maxW);
      return kept;
    }
    return lines.length ? lines : [''];
  }
  // Name + area rendered to a small raster so any script (not just Latin) prints correctly.
  function textImage(p, L, widthMm) {
    const w = Math.round(widthMm * PX_PER_MM);
    const namePx = L.namePt * 0.3528 * PX_PER_MM;
    const areaPx = L.areaPt * 0.3528 * PX_PER_MM;
    const nameFont = `700 ${namePx}px ${FONT}`;
    const areaFont = `400 ${areaPx}px ${FONT}`;
    const c = document.createElement('canvas');
    let ctx = c.getContext('2d');
    ctx.font = nameFont;
    const lines = wrapText(ctx, p.name, w - 6, 2);
    const nameLH = namePx * 1.2, areaLH = areaPx * 1.35;
    const h = Math.ceil(lines.length * nameLH + (p.area ? areaLH : 0) + 6);
    c.width = w; c.height = h;
    ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#000000'; ctx.font = nameFont;
    let yy = 2;
    for (const ln of lines) { ctx.fillText(ln, w / 2, yy); yy += nameLH; }
    if (p.area) { ctx.font = areaFont; ctx.fillStyle = '#333333'; ctx.fillText(ellipsize(ctx, p.area, w - 6), w / 2, yy + 1); }
    return { dataUrl: c.toDataURL('image/jpeg', 0.92), hMm: h / PX_PER_MM };
  }

  function buildPDF(places, layoutKey) {
    const L = LAYOUTS[layoutKey] || LAYOUTS.M;
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF) throw new Error('PDF library not loaded');
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const per = L.cols * L.rows;
    const cellW = PAGE.w / L.cols, cellH = PAGE.h / L.rows, pad = 3;
    places.forEach((p, i) => {
      if (i > 0 && i % per === 0) doc.addPage();
      const idx = i % per, col = idx % L.cols, row = Math.floor(idx / L.cols);
      const x = PAGE.margin + col * cellW, y = PAGE.margin + row * cellH;
      doc.setDrawColor(154, 165, 177); doc.setLineWidth(0.3);
      doc.setLineDashPattern([1.2, 1.2], 0); doc.rect(x, y, cellW, cellH); doc.setLineDashPattern([], 0);
      const qx = x + (cellW - L.qr) / 2, qy = y + pad + 1;
      drawQR(doc, p.id, qx, qy, L.qr);
      const img = textImage(p, L, cellW - pad * 2);
      const ty = qy + L.qr + 2.5;
      const maxH = y + cellH - 6 - ty;
      let w = cellW - pad * 2, h = img.hMm;
      if (h > maxH && maxH > 0) { w = w * maxH / h; h = maxH; }
      doc.addImage(img.dataUrl, 'JPEG', x + (cellW - w) / 2, ty, w, h);
      doc.setFont('courier', 'normal'); doc.setFontSize(L.idPt); doc.setTextColor(85, 85, 85);
      doc.text(p.id, x + cellW / 2, y + cellH - 2.2, { align: 'center' });
    });
    return doc.output('blob');
  }

  QP.labels = { LAYOUTS, qrSvg, sheetsHTML, pageCount, buildPDF };
})();
