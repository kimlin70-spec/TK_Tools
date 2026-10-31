/* export.js — Excel export and JSON backup (QP.exporter) */
window.QP = window.QP || {};
(function () {
  'use strict';
  const U = QP.util, DB = QP.db, L = QP.logic;
  const RESULT_LABEL = { OK: 'OK', ACTION: 'Action needed' };
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  function followUpText(rec) {
    const f = rec.followUps || [];
    const notYet = f.filter((x) => x.status === 'NOT_YET').length;
    const parts = [];
    if (notYet) parts.push('Not yet x' + notYet);
    if (rec.status === 'DONE') parts.push('Done ' + (rec.closedTs ? U.fmtFull(rec.closedTs) : ''));
    return parts.join('; ').trim();
  }
  function sheet(rows, widths) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map((w) => ({ wch: w }));
    return ws;
  }

  async function buildExcelBlob(fromKey, toKey) {
    if (!window.XLSX) throw new Error('Excel library not loaded');
    const [places, records, settings, open] = await Promise.all([DB.getPlaces(true), DB.getAllRecords(), DB.getSettings(), DB.getOpenActions()]);
    const pm = new Map(places.map((p) => [p.id, p]));
    const pName = (id) => (pm.get(id) || {}).name || ('(deleted place) ' + id);
    const pArea = (id) => (pm.get(id) || {}).area || '';

    const recs = records.filter((r) => r.date >= fromKey && r.date <= toKey).sort((a, b) => a.ts - b.ts);
    const rows = [['Date', 'Time', 'Slot', 'Area', 'Place', 'Result', 'Note', 'Photo', 'Action status', 'Closed at', 'Follow-ups', 'Manual', 'Extra', 'Record ID']];
    for (const r of recs) {
      rows.push([
        r.date, U.fmtTime(r.ts), r.slot, pArea(r.placeId), pName(r.placeId), RESULT_LABEL[r.result] || r.result, r.note || '',
        r.hasPhoto ? 'Yes' : '', r.result === 'ACTION' ? (r.status === 'DONE' ? 'Done' : 'Open') : '',
        r.closedTs ? U.fmtFull(r.closedTs) : '', followUpText(r), r.manual ? 'Yes' : '', r.extra ? 'Yes' : '', r.id,
      ]);
    }
    const openRows = [['Reported', 'Time', 'Area', 'Place', 'Note', 'Days open', 'Follow-ups', 'Photo', 'Record ID']];
    for (const r of open.slice().sort((a, b) => a.ts - b.ts)) {
      openRows.push([r.date, U.fmtTime(r.ts), pArea(r.placeId), pName(r.placeId), r.note || '', U.daysSince(r.ts), followUpText(r), r.hasPhoto ? 'Yes' : '', r.id]);
    }
    const missed = await L.missedInRange(places, fromKey, toKey, settings);
    const missedRows = [['Date', 'Area', 'Place', 'Slot']];
    for (const m of missed) missedRows.push([m.date, m.place.area || '', m.place.name, L.slotLabel(m.slot)]);
    const offRows = [['Date', 'Weekday', 'Note']];
    for (const d of (settings.offDays || []).filter((d) => d >= fromKey && d <= toKey).sort()) offRows.push([d, L.DAY_SHORT[U.parseKey(d).getDay()], 'No patrol (holiday / absence)']);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(rows, [11, 7, 6, 16, 28, 14, 40, 7, 13, 17, 24, 8, 7, 38]), 'Records');
    XLSX.utils.book_append_sheet(wb, sheet(openRows, [11, 7, 16, 28, 40, 10, 24, 7, 38]), 'Open actions');
    XLSX.utils.book_append_sheet(wb, sheet(missedRows, [11, 16, 28, 6]), 'Missed checks');
    XLSX.utils.book_append_sheet(wb, sheet(offRows, [11, 9, 30]), 'No patrol days');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return { blob: new Blob([out], { type: XLSX_MIME }), counts: { records: recs.length, open: open.length, missed: missed.length } };
  }

  async function buildBackupBlob() {
    const data = await DB.exportAll();
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  }
  async function parseBackupFile(file) {
    const text = await U.readFileText(file);
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('The file is not a valid backup (not JSON).'); }
    return DB.validateBackup(data);
  }

  QP.exporter = { buildExcelBlob, buildBackupBlob, parseBackupFile, RESULT_LABEL };
})();
