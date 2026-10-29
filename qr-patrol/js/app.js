/* app.js — router, screens and bootstrap */
(function () {
  'use strict';
  const U = QP.util, DB = QP.db, L = QP.logic, SC = QP.scanner, LB = QP.labels, EX = QP.exporter;
  const APP_VERSION = '1.0.0';
  const $view = document.getElementById('view');
  const $modalRoot = document.getElementById('modal-root');
  const app = { current: null, seq: 0, installEvent: null, swReg: null, updateReady: false };
  // Follow-up questions already answered "Not yet" during the current visit of a place
  let visit = { placeId: null, asked: new Set() };

  const SAMPLE_PLACES = [
    { id: 'ADM1LB', name: 'Admin Building Lobby', area: 'Admin Block', freq: 1 },
    { id: 'CCR2RM', name: 'Central Control Room', area: 'Admin Block', freq: 2 },
    { id: 'CAN2KT', name: 'Canteen & Kitchen', area: 'Admin Block', freq: 2 },
    { id: 'LKR2SH', name: 'Locker Room & Showers', area: 'Admin Block', freq: 2 },
    { id: 'TBH2GF', name: 'Turbine Hall Ground Floor', area: 'Turbine Hall', freq: 2 },
    { id: 'TBH1OF', name: 'Turbine Hall Operating Floor', area: 'Turbine Hall', freq: 1 },
    { id: 'BLR2L0', name: 'Boiler Area Level 0', area: 'Boiler Area', freq: 2 },
    { id: 'WTP1PL', name: 'Water Treatment Plant', area: 'Water Treatment', freq: 1 },
    { id: 'CHM1ST', name: 'Chemical Store', area: 'Water Treatment', freq: 1 },
    { id: 'SWY1EN', name: 'Switchyard Entrance', area: 'Switchyard', freq: 1 },
    { id: 'WHS1WS', name: 'Warehouse & Workshop', area: 'Yard', freq: 1 },
    { id: 'WST2CP', name: 'Waste Collection Point', area: 'Yard', freq: 2 },
  ];

  // ---------------- Modal helpers ----------------
  function closeModal() { $modalRoot.innerHTML = ''; document.body.style.overflow = ''; }
  function openModal(html, opts) {
    opts = opts || {};
    $modalRoot.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
    const backdrop = $modalRoot.firstElementChild;
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && opts.dismissable !== false) { closeModal(); if (opts.onDismiss) opts.onDismiss(); }
    });
    const m = backdrop.querySelector('.modal');
    m.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { closeModal(); if (opts.onDismiss) opts.onDismiss(); }));
    return m;
  }
  function confirmDialog(o) {
    return new Promise((resolve) => {
      const m = openModal(`
        <h2>${U.esc(o.title || 'Are you sure?')}</h2>
        <div class="muted">${o.html || U.esc(o.message || '')}</div>
        <div class="modal-actions">
          <button class="btn btn-outline" data-m="cancel">${U.esc(o.cancelLabel || 'Cancel')}</button>
          <button class="btn ${o.okClass || 'btn-primary'}" data-m="ok">${U.esc(o.okLabel || 'OK')}</button>
        </div>`, { onDismiss: () => resolve(false) });
      m.querySelector('[data-m=cancel]').onclick = () => { closeModal(); resolve(false); };
      m.querySelector('[data-m=ok]').onclick = () => { closeModal(); resolve(true); };
    });
  }
  function infoDialog(title, html) {
    openModal(`<h2>${U.esc(title)}</h2><div>${html}</div><div class="modal-actions"><button class="btn btn-primary" data-close>Close</button></div>`);
  }

  // ---------------- Small HTML helpers ----------------
  const resultLabel = (r) => (r === 'OK' ? 'OK' : 'Action needed');
  function resultChip(rec) {
    return rec.result === 'OK' ? '<span class="chip chip-done">OK</span>' : '<span class="chip chip-action">Action</span>';
  }
  function slotChip(sl, showSlot) {
    const prefix = showSlot ? sl.slot + ' ' : '';
    switch (sl.state) {
      case 'done': return sl.rec.result === 'ACTION'
        ? `<span class="chip chip-action">${prefix}! ${U.fmtTime(sl.rec.ts)}</span>`
        : `<span class="chip chip-done">${prefix}✓ ${U.fmtTime(sl.rec.ts)}</span>`;
      case 'missed': return `<span class="chip chip-missed">${prefix}Missed</span>`;
      case 'later': return `<span class="chip chip-later">${prefix}later</span>`;
      case 'future': return `<span class="chip chip-later">${prefix}–</span>`;
      default: return `<span class="chip chip-pending">${prefix}Not yet</span>`;
    }
  }
  function groupByArea(items, getPlace) {
    const groups = new Map();
    for (const it of items) {
      const area = (getPlace(it).area || 'No area').trim() || 'No area';
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(it);
    }
    return groups;
  }
  function backLink(href, label) { return `<a class="back" href="${href}">‹ ${U.esc(label || 'Back')}</a>`; }
  function simpleView(title, message, href, linkLabel) {
    return { html: `<section class="card center"><h2>${U.esc(title)}</h2><p class="muted">${U.esc(message)}</p><a class="btn btn-primary" href="${href}">${U.esc(linkLabel)}</a></section>` };
  }
  function updateBanner() {
    return app.updateReady ? '<div class="banner info"><span>A new version is ready.</span><button class="btn btn-primary" data-action="apply-update">Reload</button></div>' : '';
  }
  function setBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = busy;
    if (label !== undefined) btn.textContent = label;
  }

  // ---------------- Router ----------------
  const routes = { home: viewHome, scan: viewScan, check: viewCheck, done: viewDone, history: viewHistory, settings: viewSettings, places: viewPlaces, place: viewPlaceForm, labels: viewLabels, export: viewExport };
  const NAV_OF = { home: 'home', scan: 'scan', check: 'scan', done: 'scan', history: 'history', settings: 'settings', places: 'settings', place: 'settings', labels: 'settings', export: 'settings' };
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const q = h.indexOf('?');
    const path = q >= 0 ? h.slice(0, q) : h;
    const params = new URLSearchParams(q >= 0 ? h.slice(q + 1) : '');
    const parts = path.split('/').filter(Boolean);
    return { name: parts[0] || 'home', arg: parts[1] ? decodeURIComponent(parts[1]) : null, params };
  }
  function setNav(name) {
    const active = NAV_OF[name] || 'home';
    document.querySelectorAll('.bottomnav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === active));
  }
  async function render() {
    const token = ++app.seq;
    if (app.current && app.current.unmount) { try { app.current.unmount(); } catch (e) { console.error(e); } }
    app.current = null;
    closeModal();
    const r = parseHash();
    if (r.name !== 'check') visit = { placeId: null, asked: new Set() };
    const fn = routes[r.name] || viewHome;
    setNav(r.name);
    let v;
    try { v = await fn(r); } catch (err) {
      console.error(err);
      v = { html: `<section class="card"><h2>Something went wrong</h2><p class="muted">${U.esc(err && err.message || err)}</p><a class="btn btn-primary" href="#/home">Go to Home</a></section>` };
    }
    if (token !== app.seq) return; // a newer navigation happened while loading
    $view.innerHTML = v.html;
    window.scrollTo(0, 0);
    app.current = v;
    if (v.mount) { try { await v.mount($view); } catch (e) { console.error(e); } }
  }
  $view.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !$view.contains(el)) return;
    const v = app.current;
    if (!v || !v.actions) return;
    const fn = v.actions[el.dataset.action];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el, e);
  });
  const globalActions = {
    'apply-update': () => {
      if (app.swReg && app.swReg.waiting) app.swReg.waiting.postMessage('SKIP_WAITING');
      else location.reload();
    },
    'install': async () => {
      if (!app.installEvent) return;
      const ev = app.installEvent; app.installEvent = null;
      ev.prompt();
      try { await ev.userChoice; } catch (e) { /* ignore */ }
      render();
    },
  };
  function withGlobal(actions) { return Object.assign({}, globalActions, actions || {}); }

  // ---------------- HOME ----------------
  async function viewHome() {
    const now = new Date(), today = U.todayKey();
    const [places, allPlaces, recs, open, settings, lastBackupTs, recordCount] = await Promise.all([
      DB.getPlaces(), DB.getPlaces(true), DB.getRecordsByDate(today), DB.getOpenActions(), DB.getSettings(), DB.getMeta('lastBackupTs', 0), DB.countRecords(),
    ]);
    const pm = new Map(allPlaces.map((p) => [p.id, p]));
    const status = L.dayStatus(places, recs, today, now);
    const sum = L.summary(status);
    const working = L.isWorkingDay(today, settings);
    open.sort((a, b) => a.ts - b.ts);

    const backupDue = recordCount > 0 && (!lastBackupTs || Date.now() - lastBackupTs > 7 * 86400000);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

    const groups = groupByArea(status, (s) => s.place);
    let checksHtml = '';
    if (!places.length) {
      checksHtml = '<p class="muted">No places yet. Add places in Settings → Places.</p>';
    } else {
      for (const [area, items] of groups) {
        checksHtml += `<div class="group-title">${U.esc(area)}</div><ul class="list">` + items.map((s) => `
          <li><button class="item" data-action="place-detail" data-id="${U.esc(s.place.id)}">
            <div class="item-main"><div class="item-title">${U.esc(s.place.name)}</div></div>
            <div class="chips">${s.slots.map((sl) => slotChip(sl, s.place.freq === 2)).join('')}</div>
          </button></li>`).join('') + '</ul>';
      }
    }
    const openHtml = open.length ? '<ul class="list">' + open.map((r) => {
      const p = pm.get(r.placeId) || { name: '(deleted place)' };
      const days = U.daysSince(r.ts);
      return `<li><button class="item" data-action="action-detail" data-id="${U.esc(r.id)}">
        <div class="item-main"><div class="item-title">${U.esc(p.name)}</div><div class="item-sub">${r.note ? U.esc(r.note) : '<i>No note</i>'}</div></div>
        <div class="item-right"><span class="chip chip-action">${days === 0 ? 'today' : days + ' d'}</span></div>
      </button></li>`;
    }).join('') + '</ul>' : '<p class="muted" style="margin:0">No open actions.</p>';

    const html = `
      <section class="page-head">
        <div><h1>Today</h1><div class="muted">${U.esc(U.fmtDateKey(today, true))} · ${now.getHours() < 12 ? 'Morning (AM)' : 'Afternoon (PM)'}</div></div>
        <div class="progress ${sum.total && sum.done === sum.total ? 'all-done' : ''}"><b>${sum.done}</b>/${sum.total}<span class="lbl">checks</span></div>
      </section>
      ${updateBanner()}
      <a class="btn btn-primary btn-lg btn-block mb" href="#/scan">Scan QR</a>
      ${!working ? '<div class="banner info">Not a working day. Checks are optional today.</div>' : ''}
      ${backupDue ? `<div class="banner warn"><span>${lastBackupTs ? 'Last backup was ' + U.daysSince(lastBackupTs) + ' days ago.' : 'No backup yet.'}</span><a class="btn btn-outline" href="#/export">Back up</a></div>` : ''}
      ${app.installEvent && !standalone ? '<div class="banner info"><span>Install the app on the home screen for offline use.</span><button class="btn btn-primary" data-action="install">Install</button></div>' : ''}
      <section class="card">
        <div class="card-title"><h2>Open actions <span class="badge ${open.length ? 'badge-action' : ''}">${open.length}</span></h2></div>
        ${openHtml}
      </section>
      <section class="card">
        <div class="card-title"><h2>Checks today</h2>${sum.missed ? `<span class="chip chip-missed">${sum.missed} missed</span>` : ''}</div>
        ${checksHtml}
      </section>`;

    const actions = withGlobal({
      'place-detail': (el) => showPlaceDetail(el.dataset.id),
      'action-detail': (el) => showActionDetail(el.dataset.id),
    });
    return { html, actions };
  }

  async function showPlaceDetail(id) {
    const place = await DB.getPlace(id);
    if (!place) return;
    const recs = (await DB.getRecordsByPlace(id)).sort((a, b) => b.ts - a.ts).slice(0, 10);
    const list = recs.length ? '<ul class="list">' + recs.map((r) => `
      <li><button class="item" data-rec="${U.esc(r.id)}">
        <div class="item-time">${U.esc(U.fmtShortDate(r.ts))}<br>${U.fmtTime(r.ts)}</div>
        <div class="item-main"><div class="item-title">${resultLabel(r.result)}${place.freq === 2 ? `<span class="tag">${r.slot}</span>` : ''}${r.manual ? '<span class="tag">manual</span>' : ''}</div><div class="item-sub">${r.note ? U.esc(r.note) : ''}</div></div>
        <div class="item-right">${resultChip(r)}</div>
      </button></li>`).join('') + '</ul>' : '<p class="muted">No records yet.</p>';
    const m = openModal(`
      <div class="eyebrow muted small">${U.esc(place.area || '')}</div>
      <h2>${U.esc(place.name)}</h2>
      <p class="muted small">${place.freq === 2 ? 'Twice a day (AM / PM)' : 'Once a day'} · ID <span class="mono">${U.esc(place.id)}</span></p>
      <h3 class="mt">Recent records</h3>${list}
      <div class="modal-actions"><button class="btn btn-outline" data-close>Close</button></div>`);
    m.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => showRecordDetail(b.dataset.rec)));
  }

  async function showActionDetail(recId) {
    const rec = await DB.getRecord(recId);
    if (!rec) return;
    const place = await DB.getPlace(rec.placeId);
    const photo = rec.hasPhoto ? await DB.getPhoto(rec.id) : null;
    const fu = (rec.followUps || []).map((f) => `<li class="muted small">${U.esc(U.fmtDateTime(f.ts))} · Not yet</li>`).join('');
    const m = openModal(`
      <h2>Open action</h2>
      <p><b>${U.esc(place ? place.name : '(deleted place)')}</b><br><span class="muted small">${U.esc(place && place.area || '')}</span></p>
      <p class="muted small">Reported ${U.esc(U.fmtFull(rec.ts))} · ${U.daysSince(rec.ts)} day(s) open</p>
      <div class="note-text">${rec.note ? U.esc(rec.note) : '<span class="muted">(no note)</span>'}</div>
      ${photo ? `<img class="photo-full" src="${photo}" alt="Photo">` : ''}
      ${fu ? `<p class="small muted" style="margin-top:8px">Follow-ups:</p><ul style="margin:0 0 0 18px;padding:0">${fu}</ul>` : ''}
      <p class="muted small mt">Normally you confirm completion by scanning the place (Done / Not yet).</p>
      <div class="modal-actions"><button class="btn btn-outline" data-close>Close</button><button class="btn btn-ok" data-m="done">Mark as done</button></div>`);
    m.querySelector('[data-m=done]').onclick = async () => {
      closeModal();
      if (!(await confirmDialog({ title: 'Mark as done?', message: 'The action will be closed without a scan.', okLabel: 'Mark as done', okClass: 'btn-ok' }))) return;
      rec.status = 'DONE'; rec.closedTs = Date.now();
      await DB.saveRecord(rec);
      U.toast('Action marked as done');
      render();
    };
  }

  async function showRecordDetail(recId) {
    const rec = await DB.getRecord(recId);
    if (!rec) return;
    const place = await DB.getPlace(rec.placeId);
    const photo = rec.hasPhoto ? await DB.getPhoto(rec.id) : null;
    const fu = (rec.followUps || []).map((f) => `<li class="muted small">${U.esc(U.fmtDateTime(f.ts))} · Not yet</li>`).join('');
    const m = openModal(`
      <h2>${U.esc(place ? place.name : '(deleted place)')}</h2>
      <p class="muted small">${U.esc(U.fmtFull(rec.ts))} · ${rec.slot}${rec.manual ? ' · manual (no QR)' : ''}</p>
      <p><span class="result-badge ${rec.result === 'OK' ? 'result-ok' : 'result-action'}">${resultLabel(rec.result)}</span>
        ${rec.result === 'ACTION' ? `<span class="tag ${rec.status === 'DONE' ? 'tag-ok' : 'tag-action'}">${rec.status === 'DONE' ? 'Done ' + U.fmtDateTime(rec.closedTs) : 'Open'}</span>` : ''}</p>
      ${rec.note ? `<div class="note-text">${U.esc(rec.note)}</div>` : ''}
      ${photo ? `<img class="photo-full" src="${photo}" alt="Photo">` : ''}
      ${fu ? `<p class="small muted" style="margin-top:8px">Follow-ups:</p><ul style="margin:0 0 0 18px;padding:0">${fu}</ul>` : ''}
      <div class="modal-actions"><button class="btn btn-outline danger" data-m="del">Delete</button><button class="btn btn-primary" data-close>Close</button></div>`);
    m.querySelector('[data-m=del]').onclick = async () => {
      closeModal();
      if (!(await confirmDialog({ title: 'Delete this record?', message: 'This cannot be undone.', okLabel: 'Delete', okClass: 'btn-danger' }))) return;
      await DB.deleteRecord(rec.id);
      U.toast('Record deleted');
      render();
    };
  }

  // ---------------- SCAN ----------------
  async function viewScan() {
    const places = await DB.getPlaces();
    const html = `
      <section class="scan-page">
        <div class="scan-wrap">
          <video id="scan-video" playsinline muted autoplay></video>
          <div class="scan-frame"></div>
          <div id="scan-overlay" class="scan-overlay hidden"></div>
        </div>
        <p class="scan-hint">Point the camera at a QR label</p>
        <div class="row gap">
          <button class="btn btn-outline hidden" id="torch-btn" data-action="torch">Torch</button>
          <button class="btn btn-outline" data-action="manual" style="flex:1">Can't scan? Select place</button>
        </div>
      </section>`;
    let restartTimer = 0;
    const overlay = () => document.getElementById('scan-overlay');
    function showOverlay(msg) { const o = overlay(); if (o) { o.textContent = msg; o.classList.remove('hidden'); } }
    function hideOverlay() { const o = overlay(); if (o) o.classList.add('hidden'); }

    async function onCode(text) {
      const id = String(text).trim().toUpperCase();
      const place = await DB.getPlace(id);
      if (place && !place.deleted) { U.vibrate(80); location.hash = '#/check/' + encodeURIComponent(place.id); return; }
      U.vibrate([40, 40, 40]);
      if (place && place.deleted) showOverlay(`"${place.name}" was deleted. Restore it in Settings → Places.`);
      else if (/^[A-Z0-9]{4,10}$/.test(id)) showOverlay(`No place with ID ${id}. Add it in Settings → Places.`);
      else showOverlay('This is not a patrol QR code.');
      restartTimer = setTimeout(() => { hideOverlay(); startCamera(); }, 2200);
    }
    async function startCamera() {
      const video = document.getElementById('scan-video');
      if (!video || parseHash().name !== 'scan') return;
      try {
        await SC.start(video, onCode);
        const tb = document.getElementById('torch-btn');
        if (tb) tb.classList.toggle('hidden', !SC.hasTorch());
      } catch (err) {
        let msg = 'Camera could not be started.';
        if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) msg = 'Camera permission denied. Allow camera access for this app in the browser/app settings, or select the place manually.';
        else if (err && err.name === 'NotFoundError') msg = 'No camera found. Select the place manually.';
        else if (err && err.message) msg += ' ' + err.message;
        showOverlay(msg);
      }
    }
    function onVisibility() {
      if (document.hidden) SC.stop();
      else startCamera();
    }
    const actions = withGlobal({
      'torch': async (el) => { try { const on = await SC.toggleTorch(); el.textContent = on ? 'Torch off' : 'Torch'; } catch (e) { U.toast('Torch not available'); } },
      'manual': () => {
        const groups = groupByArea(places, (p) => p);
        let list = '';
        for (const [area, items] of groups) {
          list += `<div class="group-title">${U.esc(area)}</div><ul class="list">` + items.map((p) => `<li><button class="item" data-pick="${U.esc(p.id)}"><div class="item-main"><div class="item-title">${U.esc(p.name)}</div></div><span class="chevron">›</span></button></li>`).join('') + '</ul>';
        }
        const m = openModal(`<h2>Select place</h2><p class="muted small">Use only when the QR label is missing or damaged. The record is marked "manual".</p>${list || '<p class="muted">No places.</p>'}<div class="modal-actions"><button class="btn btn-outline" data-close>Cancel</button></div>`);
        m.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { closeModal(); location.hash = '#/check/' + encodeURIComponent(b.dataset.pick) + '?manual=1'; }));
      },
    });
    return {
      html, actions,
      mount: () => { document.addEventListener('visibilitychange', onVisibility); startCamera(); },
      unmount: () => { clearTimeout(restartTimer); document.removeEventListener('visibilitychange', onVisibility); SC.stop(); },
    };
  }

  // ---------------- CHECK (after scan) ----------------
  async function viewCheck(r) {
    const id = r.arg, manual = r.params.get('manual') === '1';
    const place = id ? await DB.getPlace(id) : null;
    if (!place) return simpleView('Unknown place', 'This QR code does not match any place.', '#/scan', 'Back to scanner');
    if (visit.placeId !== id) visit = { placeId: id, asked: new Set() };
    const now = new Date(), today = U.todayKey(), slot = U.slotOf(now);
    const recs = (await DB.getRecordsByPlace(id)).sort((a, b) => b.ts - a.ts);
    const last = recs[0] || null;
    const openList = recs.filter((x) => x.result === 'ACTION' && x.status === 'OPEN').sort((a, b) => a.ts - b.ts);
    const pending = openList.filter((x) => !visit.asked.has(x.id));
    const fu = pending[0] || null;
    const fuPhoto = fu && fu.hasPhoto ? await DB.getPhoto(fu.id) : null;
    const todayRecs = recs.filter((x) => x.date === today);
    const already = Number(place.freq) === 2 ? todayRecs.find((x) => x.slot === slot) : todayRecs[0];
    const slotText = Number(place.freq) === 2 ? (slot === 'AM' ? 'Morning check (AM)' : 'Afternoon check (PM)') : 'Daily check';
    let photoData = null, saving = false;

    const head = `
      <section class="card place-head">
        <div class="eyebrow">${U.esc(place.area || 'Place')}</div>
        <h1>${U.esc(place.name)}</h1>
        <div class="muted">${last ? 'Last check: ' + U.esc(U.fmtDateTime(last.ts)) + ' · ' + resultLabel(last.result) : 'No checks yet'}</div>
        ${manual ? '<span class="tag">manual (no QR)</span>' : ''}
      </section>`;
    let body;
    if (fu) {
      body = `
        <section class="card followup">
          <h2>Open action from ${U.esc(U.fmtDateTime(fu.ts))}</h2>
          <p class="muted small">${pending.length > 1 ? pending.length + ' open actions for this place. ' : ''}Has this been done?</p>
          <div class="note-text">${fu.note ? U.esc(fu.note) : '<span class="muted">(no note)</span>'}</div>
          ${fuPhoto ? `<img class="photo-full" src="${fuPhoto}" alt="Photo">` : ''}
          ${(fu.followUps || []).length ? `<p class="muted small">Checked before: ${fu.followUps.map((f) => U.esc(U.fmtDateTime(f.ts)) + ' (not yet)').join(', ')}</p>` : ''}
          <div class="row-xl">
            <button class="btn btn-xl btn-ok" data-action="fu-done">Done</button>
            <button class="btn btn-xl btn-grey" data-action="fu-notyet">Not yet</button>
          </div>
        </section>`;
    } else {
      body = `
        <section class="card">
          <div class="card-title"><h2>${slotText}</h2><span class="muted small">${U.esc(U.fmtDateKey(today))}</span></div>
          ${already ? `<div class="banner info">Already checked ${Number(place.freq) === 2 ? 'this ' + (slot === 'AM' ? 'morning' : 'afternoon') : 'today'} at ${U.fmtTime(already.ts)} (${resultLabel(already.result)}). Saving again adds another record.</div>` : ''}
          <details class="panel" id="note-panel">
            <summary>Add note / photo (optional)</summary>
            <div class="panel-body">
              <textarea id="note" rows="3" maxlength="400" placeholder="Short note"></textarea>
              <div class="photo-row">
                <label class="btn btn-outline btn-sm">Add photo<input type="file" id="photo-input" accept="image/*" capture="environment" hidden></label>
                <img id="photo-thumb" class="photo-thumb hidden" alt="Photo preview">
                <button class="btn btn-link hidden" id="photo-remove" type="button">Remove</button>
              </div>
            </div>
          </details>
          <div id="action-hint" class="banner warn hidden"><span>Describe what needs action (optional), then tap Save.${openList.length ? ' Note: ' + openList.length + ' action(s) still open for this place. Use "Action needed" only for a new issue.' : ''}</span></div>
          <div class="row-xl">
            <button class="btn btn-xl btn-ok" id="btn-ok" data-action="save-ok">OK</button>
            <button class="btn btn-xl btn-action" id="btn-action" data-action="action">Action needed</button>
          </div>
          <div class="center"><button class="btn btn-link hidden" id="btn-cancel-action" data-action="cancel-action">Cancel</button></div>
        </section>`;
    }
    const html = `<div class="no-print">${backLink('#/scan', 'Scanner')}</div>${head}${body}`;

    function setButtons(disabled) { ['btn-ok', 'btn-action'].forEach((i) => { const b = document.getElementById(i); if (b) b.disabled = disabled; }); }
    async function save(result) {
      if (saving) return;
      saving = true; setButtons(true);
      try {
        const noteEl = document.getElementById('note');
        const rec = { id: U.uid(), placeId: id, ts: Date.now(), date: U.todayKey(), slot: U.slotOf(new Date()), result, note: noteEl ? noteEl.value.trim() : '', hasPhoto: !!photoData, manual };
        if (result === 'ACTION') { rec.status = 'OPEN'; rec.followUps = []; }
        await DB.saveRecord(rec, photoData);
        U.vibrate(result === 'OK' ? 60 : [60, 60, 60]);
        location.replace('#/done/' + rec.id);
      } catch (err) {
        saving = false; setButtons(false);
        U.toast('Could not save: ' + (err && err.message || err));
      }
    }
    const actions = withGlobal({
      'fu-done': async (el) => {
        el.disabled = true;
        fu.status = 'DONE'; fu.closedTs = Date.now();
        await DB.saveRecord(fu);
        U.toast('Action marked as done');
        render();
      },
      'fu-notyet': async (el) => {
        el.disabled = true;
        fu.followUps = fu.followUps || [];
        fu.followUps.push({ ts: Date.now(), status: 'NOT_YET' });
        await DB.saveRecord(fu);
        visit.asked.add(fu.id);
        render();
      },
      'save-ok': () => save('OK'),
      'action': (el) => {
        const panel = document.getElementById('note-panel');
        if (panel) panel.open = true;
        document.getElementById('action-hint').classList.remove('hidden');
        document.getElementById('btn-ok').classList.add('hidden');
        document.getElementById('btn-cancel-action').classList.remove('hidden');
        el.textContent = 'Save: Action needed';
        el.dataset.action = 'save-action';
        const note = document.getElementById('note');
        if (note) note.focus();
      },
      'save-action': () => save('ACTION'),
      'cancel-action': () => {
        document.getElementById('action-hint').classList.add('hidden');
        document.getElementById('btn-ok').classList.remove('hidden');
        document.getElementById('btn-cancel-action').classList.add('hidden');
        const b = document.getElementById('btn-action');
        b.textContent = 'Action needed'; b.dataset.action = 'action';
      },
    });
    function mount(root) {
      const input = root.querySelector('#photo-input');
      if (!input) return;
      const thumb = root.querySelector('#photo-thumb'), remove = root.querySelector('#photo-remove');
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        try {
          photoData = await U.compressImage(file, 1280, 0.72);
          thumb.src = photoData; thumb.classList.remove('hidden'); remove.classList.remove('hidden');
        } catch (err) { U.toast(err.message || 'Could not read the photo'); }
        input.value = '';
      });
      remove.addEventListener('click', () => { photoData = null; thumb.classList.add('hidden'); remove.classList.add('hidden'); thumb.removeAttribute('src'); });
    }
    return { html, actions, mount };
  }

  // ---------------- DONE ----------------
  async function viewDone(r) {
    const rec = r.arg ? await DB.getRecord(r.arg) : null;
    if (!rec) return simpleView('Saved', 'The record was saved.', '#/scan', 'Scan next');
    const place = await DB.getPlace(rec.placeId);
    const ok = rec.result === 'OK';
    const html = `
      <section class="card done-screen">
        <div class="done-icon ${ok ? 'ok' : 'action'}">${ok ? '✓' : '!'}</div>
        <h1>Saved</h1>
        <p class="muted">${U.esc(place ? place.name : '')} · ${U.esc(U.fmtDateTime(rec.ts))}${place && Number(place.freq) === 2 ? ' · ' + rec.slot : ''}</p>
        <p><span class="result-badge ${ok ? 'result-ok' : 'result-action'}">${resultLabel(rec.result)}</span></p>
        ${rec.note ? `<div class="note-text">${U.esc(rec.note)}</div>` : ''}
        <div class="stack mt">
          <a class="btn btn-primary btn-lg" href="#/scan">Scan next</a>
          <a class="btn btn-outline" href="#/home">Home</a>
        </div>
      </section>`;
    return { html, actions: withGlobal() };
  }

  // ---------------- HISTORY ----------------
  async function viewHistory(r) {
    const now = new Date(), today = U.todayKey();
    let day = r.params.get('d') || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) day = today;
    const pf = r.params.get('p') || '';
    const [allPlaces, dayRecs, allRecs, settings] = await Promise.all([DB.getPlaces(true), DB.getRecordsByDate(day), DB.getAllRecords(), DB.getSettings()]);
    const pm = new Map(allPlaces.map((p) => [p.id, p]));
    const pName = (pid) => (pm.get(pid) || { name: '(deleted place)' }).name;
    const working = L.isWorkingDay(day, settings);
    const status = L.dayStatus(allPlaces, dayRecs, day, now);
    const missed = [];
    for (const st of status) for (const sl of st.slots) if (sl.state === 'missed' && (!pf || st.place.id === pf)) missed.push({ place: st.place, slot: sl.slot });

    const events = [];
    for (const rec of dayRecs) if (!pf || rec.placeId === pf) events.push({ ts: rec.ts, kind: 'record', rec });
    for (const rec of allRecs) {
      if (rec.result !== 'ACTION' || (pf && rec.placeId !== pf)) continue;
      for (const f of rec.followUps || []) if (U.dateKey(new Date(f.ts)) === day) events.push({ ts: f.ts, kind: 'NOT_YET', rec });
      if (rec.status === 'DONE' && rec.closedTs && U.dateKey(new Date(rec.closedTs)) === day) events.push({ ts: rec.closedTs, kind: 'DONE', rec });
    }
    events.sort((a, b) => a.ts - b.ts);
    const timeline = events.length ? '<ul class="list">' + events.map((e) => {
      const place = pm.get(e.rec.placeId);
      if (e.kind === 'record') {
        const rec = e.rec;
        return `<li><button class="item" data-action="rec-detail" data-id="${U.esc(rec.id)}">
          <div class="item-time">${U.fmtTime(rec.ts)}</div>
          <div class="item-main"><div class="item-title">${U.esc(pName(rec.placeId))}${place && Number(place.freq) === 2 ? `<span class="tag">${rec.slot}</span>` : ''}${rec.manual ? '<span class="tag">manual</span>' : ''}${rec.hasPhoto ? '<span class="tag">photo</span>' : ''}</div>
          <div class="item-sub">${rec.note ? U.esc(rec.note) : ''}</div></div>
          <div class="item-right">${resultChip(rec)}${rec.result === 'ACTION' ? `<span class="tag ${rec.status === 'DONE' ? 'tag-ok' : 'tag-action'}">${rec.status === 'DONE' ? 'done' : 'open'}</span>` : ''}</div>
        </button></li>`;
      }
      return `<li><button class="item" data-action="rec-detail" data-id="${U.esc(e.rec.id)}">
        <div class="item-time">${U.fmtTime(e.ts)}</div>
        <div class="item-main"><div class="item-title">${U.esc(pName(e.rec.placeId))}<span class="tag">follow-up</span></div>
        <div class="item-sub">Action from ${U.esc(U.fmtShortDate(e.rec.ts))}: ${e.kind === 'DONE' ? 'Done' : 'Not yet'}</div></div>
        <div class="item-right"><span class="chip ${e.kind === 'DONE' ? 'chip-done' : 'chip-pending'}">${e.kind === 'DONE' ? 'Done' : 'Not yet'}</span></div>
      </button></li>`;
    }).join('') + '</ul>' : '<p class="muted" style="margin:0">No records on this day.</p>';

    const missedHtml = !working
      ? '<p class="muted" style="margin:0">Not a working day. No checks were required.</p>'
      : (missed.length ? '<ul class="list">' + missed.map((m) => `<li class="item"><div class="item-main"><div class="item-title">${U.esc(m.place.name)}</div><div class="item-sub">${U.esc(m.place.area || '')}</div></div><span class="chip chip-missed">${m.slot === 'DAY' ? 'Missed' : m.slot + ' missed'}</span></li>`).join('') + '</ul>'
        : `<p class="muted" style="margin:0">${day === today ? 'Nothing missed so far.' : 'No missed checks.'}</p>`);

    const placeOptions = allPlaces.filter((p) => !p.deleted || p.id === pf).map((p) => `<option value="${U.esc(p.id)}" ${p.id === pf ? 'selected' : ''}>${U.esc(p.name)}${p.deleted ? ' (deleted)' : ''}</option>`).join('');
    const link = (d, p) => '#/history?d=' + d + (p ? '&p=' + encodeURIComponent(p) : '');
    const html = `
      <h1>History</h1>
      <div class="daynav">
        <a class="btn btn-outline" href="${link(U.addDays(day, -1), pf)}" aria-label="Previous day">‹</a>
        <button class="daylabel btn btn-outline" data-action="pick" style="flex:1">${U.esc(U.fmtDateKey(day, true))}${day === today ? ' (today)' : ''}</button>
        <a class="btn btn-outline ${day >= today ? 'hidden' : ''}" href="${link(U.addDays(day, 1), pf)}" aria-label="Next day">›</a>
        <input type="date" id="date-input" value="${day}" max="${today}" style="position:absolute;opacity:0;width:1px;height:1px;pointer-events:none">
      </div>
      <div class="row gap mb">
        <select id="place-filter" style="flex:1"><option value="">All places</option>${placeOptions}</select>
        ${day !== today ? `<a class="btn btn-outline" href="${link(today, pf)}">Today</a>` : ''}
      </div>
      <section class="card"><div class="card-title"><h2>Records <span class="badge">${events.filter((e) => e.kind === 'record').length}</span></h2></div>${timeline}</section>
      <section class="card"><div class="card-title"><h2>Missed checks <span class="badge ${missed.length && working ? 'badge-action' : ''}">${working ? missed.length : '–'}</span></h2></div>${missedHtml}</section>`;
    const actions = withGlobal({
      'rec-detail': (el) => showRecordDetail(el.dataset.id),
      'pick': () => { const i = document.getElementById('date-input'); if (!i) return; if (i.showPicker) { try { i.showPicker(); return; } catch (e) { /* fall through */ } } i.click(); },
    });
    function mount(root) {
      root.querySelector('#date-input').addEventListener('change', (e) => { if (e.target.value) location.hash = link(e.target.value, pf); });
      root.querySelector('#place-filter').addEventListener('change', (e) => { location.hash = link(day, e.target.value); });
    }
    return { html, actions, mount };
  }

  // ---------------- SETTINGS ----------------
  async function viewSettings() {
    const [places, settings, usage] = await Promise.all([DB.getPlaces(), DB.getSettings(), DB.estimateUsage()]);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const dayBtns = [1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" class="${settings.workingDays.includes(d) ? 'on' : ''}" data-action="toggle-day" data-day="${d}">${U.DAYS[d]}</button>`).join('');
    const html = `
      <h1>Settings</h1>
      ${updateBanner()}
      <section class="card"><ul class="menu">
        <li><a href="#/places">Places <span class="muted small">(${places.length})</span></a></li>
        <li><a href="#/labels">QR labels (print / PDF)</a></li>
        <li><a href="#/export">Excel export &amp; backup</a></li>
      </ul></section>
      <section class="card">
        <h2>Working days</h2>
        <p class="muted small">Missed checks are counted only on these days.</p>
        <div class="daytoggles">${dayBtns}</div>
      </section>
      <section class="card">
        <h2>App</h2>
        <p class="muted small">Version ${APP_VERSION} · ${standalone ? 'Installed (home screen)' : 'Running in browser'}${usage && usage.usage != null ? ' · Storage used: ' + U.fmtBytes(usage.usage) : ''}</p>
        <div class="stack">
          ${app.installEvent && !standalone ? '<button class="btn btn-primary" data-action="install">Install app on home screen</button>' : ''}
          <button class="btn btn-outline" data-action="check-update">Check for update (needs internet)</button>
        </div>
      </section>
      <section class="card">
        <h2>Data</h2>
        <p class="muted small">Sample places are provided for testing. Before real use, reset all data and add your own places.</p>
        <div class="stack">
          <button class="btn btn-outline" data-action="load-samples">Load sample places</button>
          <button class="btn btn-outline danger" data-action="reset">Reset all data</button>
        </div>
      </section>
      <p class="muted small center">All data is stored only on this phone. Make regular backups.</p>`;
    const actions = withGlobal({
      'toggle-day': async (el) => {
        const d = Number(el.dataset.day);
        const s = await DB.getSettings();
        s.workingDays = s.workingDays.includes(d) ? s.workingDays.filter((x) => x !== d) : s.workingDays.concat([d]);
        await DB.saveSettings(s);
        el.classList.toggle('on');
      },
      'check-update': async (el) => {
        if (!navigator.onLine) { U.toast('You are offline. Connect to Wi-Fi first.'); return; }
        setBusy(el, true, 'Checking…');
        try {
          if (app.swReg) await app.swReg.update();
          setTimeout(() => { setBusy(el, false, 'Check for update (needs internet)'); if (!app.updateReady) U.toast('You have the latest version.'); else render(); }, 1500);
        } catch (e) { setBusy(el, false, 'Check for update (needs internet)'); U.toast('Update check failed.'); }
      },
      'load-samples': async () => {
        const n = await loadSamples();
        U.toast(n ? n + ' sample places added' : 'Sample places already exist');
        render();
      },
      'reset': async () => {
        const ok = await confirmDialog({ title: 'Reset all data?', html: 'This deletes <b>all places, records and photos</b> on this phone. Make a backup first if you need the data.<br><br>This cannot be undone.', okLabel: 'Delete everything', okClass: 'btn-danger' });
        if (!ok) return;
        const again = await confirmDialog({ title: 'Really delete everything?', message: 'Last chance.', okLabel: 'Yes, delete', okClass: 'btn-danger' });
        if (!again) return;
        await DB.resetAll();
        await DB.setMeta('seeded', true);
        U.toast('All data deleted');
        location.hash = '#/home';
      },
    });
    return { html, actions };
  }

  async function loadSamples() {
    let n = 0;
    for (const s of SAMPLE_PLACES) {
      const existing = await DB.getPlace(s.id);
      if (existing) continue;
      await DB.savePlace(Object.assign({}, s, { createdTs: Date.now(), sample: true }));
      n++;
    }
    return n;
  }

  // ---------------- PLACES ----------------
  async function viewPlaces() {
    const all = await DB.getPlaces(true);
    const places = all.filter((p) => !p.deleted), deleted = all.filter((p) => p.deleted);
    const groups = groupByArea(places, (p) => p);
    let list = '';
    for (const [area, items] of groups) {
      list += `<div class="group-title">${U.esc(area)}</div><ul class="list">` + items.map((p) => `
        <li><a class="item" href="#/place/${encodeURIComponent(p.id)}">
          <div class="item-main"><div class="item-title">${U.esc(p.name)}</div><div class="item-sub mono">${U.esc(p.id)}</div></div>
          <div class="item-right"><span class="chip ${Number(p.freq) === 2 ? 'chip-done' : 'chip-pending'}">${Number(p.freq) === 2 ? 'AM · PM' : '1× day'}</span><span class="chevron">›</span></div>
        </a></li>`).join('') + '</ul>';
    }
    const html = `
      <div class="page-head"><div>${backLink('#/settings', 'Settings')}<h1>Places</h1></div><a class="btn btn-primary" href="#/place/new">+ Add</a></div>
      <section class="card">${list || '<p class="muted">No places yet. Tap "+ Add".</p>'}</section>
      ${deleted.length ? `<details class="card" style="padding:10px 16px"><summary style="font-weight:600;color:var(--muted);padding:6px 0;cursor:pointer">Deleted places (${deleted.length})</summary><ul class="list">${deleted.map((p) => `<li class="item"><div class="item-main"><div class="item-title">${U.esc(p.name)}</div><div class="item-sub">${U.esc(p.area || '')}</div></div><button class="btn btn-sm btn-outline" data-action="restore" data-id="${U.esc(p.id)}">Restore</button></li>`).join('')}</ul></details>` : ''}`;
    const actions = withGlobal({
      'restore': async (el) => { await DB.restorePlace(el.dataset.id); U.toast('Place restored'); render(); },
    });
    return { html, actions };
  }

  async function viewPlaceForm(r) {
    const isNew = !r.arg || r.arg === 'new';
    const place = isNew ? { name: '', area: '', freq: 1 } : await DB.getPlace(r.arg);
    if (!place) return simpleView('Place not found', 'This place does not exist.', '#/places', 'Back to places');
    const areas = [...new Set((await DB.getPlaces()).map((p) => p.area).filter(Boolean))].sort();
    let freq = Number(place.freq) === 2 ? 2 : 1;
    const html = `
      <div class="page-head"><div>${backLink('#/places', 'Places')}<h1>${isNew ? 'New place' : 'Edit place'}</h1></div></div>
      <section class="card">
        <label class="field"><span>Place name *</span><input type="text" id="f-name" value="${U.esc(place.name)}" maxlength="60" placeholder="e.g. Turbine Hall Ground Floor" autocomplete="off"></label>
        <label class="field"><span>Area / zone</span><input type="text" id="f-area" value="${U.esc(place.area || '')}" maxlength="40" list="area-list" placeholder="e.g. Turbine Hall" autocomplete="off"><datalist id="area-list">${areas.map((a) => `<option value="${U.esc(a)}">`).join('')}</datalist></label>
        <div class="field-label">Check frequency</div>
        <div class="segmented" id="f-freq">
          <button type="button" class="${freq === 1 ? 'on' : ''}" data-action="freq" data-v="1">Once a day</button>
          <button type="button" class="${freq === 2 ? 'on' : ''}" data-action="freq" data-v="2">Twice a day (AM / PM)</button>
        </div>
        <p class="muted small" style="margin-top:8px">AM = before 12:00 · PM = after 12:00</p>
        <div class="stack mt">
          <button class="btn btn-primary btn-lg" data-action="save">Save</button>
          ${isNew ? '' : '<button class="btn btn-outline danger" data-action="delete">Delete place</button>'}
        </div>
      </section>
      ${isNew ? '' : `<section class="card"><h2>QR code</h2><div class="qr-preview mt">${LB.qrSvg(place.id)}<div><div class="mono" style="font-size:1.2rem">${U.esc(place.id)}</div><p class="muted small">Print labels from Settings → QR labels.</p></div></div></section>`}`;
    const actions = withGlobal({
      'freq': (el) => { freq = Number(el.dataset.v); document.querySelectorAll('#f-freq button').forEach((b) => b.classList.toggle('on', b === el)); },
      'save': async (el) => {
        const name = document.getElementById('f-name').value.trim();
        const area = document.getElementById('f-area').value.trim();
        if (!name) { U.toast('Please enter a place name'); document.getElementById('f-name').focus(); return; }
        el.disabled = true;
        const p = Object.assign({}, place, { name, area, freq });
        if (isNew) { p.id = await DB.newPlaceId(); p.createdTs = Date.now(); }
        await DB.savePlace(p);
        U.toast(isNew ? 'Place added' : 'Place saved');
        location.hash = '#/places';
      },
      'delete': async () => {
        const ok = await confirmDialog({ title: 'Delete this place?', message: 'Its records stay in the history. You can restore the place later from the "Deleted places" list.', okLabel: 'Delete', okClass: 'btn-danger' });
        if (!ok) return;
        await DB.deletePlace(place.id);
        U.toast('Place deleted');
        location.hash = '#/places';
      },
    });
    return { html, actions, mount: () => { if (isNew) document.getElementById('f-name').focus(); } };
  }

  // ---------------- LABELS ----------------
  let labelSel = null; // Set of selected place IDs (kept while the app is open)
  async function viewLabels() {
    const places = await DB.getPlaces();
    const layoutKey = (await DB.getMeta('labelLayout', 'M'));
    const ids = new Set(places.map((p) => p.id));
    if (!labelSel) labelSel = new Set(ids);
    for (const id of [...labelSel]) if (!ids.has(id)) labelSel.delete(id);
    const selected = places.filter((p) => labelSel.has(p.id));
    const canShare = U.canShareFiles();
    const html = `
      <div class="no-print">
        <div class="page-head"><div>${backLink('#/settings', 'Settings')}<h1>QR labels</h1></div></div>
        <section class="card labels-controls">
          <label class="field"><span>Label size</span>
            <select id="layout">${Object.values(LB.LAYOUTS).map((l) => `<option value="${l.key}" ${l.key === layoutKey ? 'selected' : ''}>${l.name} · QR ${l.qr} mm</option>`).join('')}</select></label>
          <div class="field-label">Places (${selected.length} of ${places.length}) <button class="btn btn-link btn-sm" data-action="sel-all">All</button> <button class="btn btn-link btn-sm" data-action="sel-none">None</button></div>
          <div class="place-pick">${places.map((p) => `<label><input type="checkbox" data-pick="${U.esc(p.id)}" ${labelSel.has(p.id) ? 'checked' : ''}><span>${U.esc(p.name)} <span class="muted small">· ${U.esc(p.area || '')}</span></span></label>`).join('') || '<p class="muted">No places.</p>'}</div>
          <p class="muted small mt">${selected.length} label(s) · ${LB.pageCount(selected.length, layoutKey)} A4 page(s). Print at 100% scale (no "fit to page").</p>
          <div class="stack">
            <button class="btn btn-primary btn-lg" data-action="print" ${selected.length ? '' : 'disabled'}>Print / Save as PDF (system dialog)</button>
            <button class="btn btn-outline" data-action="pdf" ${selected.length ? '' : 'disabled'}>Download PDF file</button>
            ${canShare ? `<button class="btn btn-outline" data-action="pdf-share" ${selected.length ? '' : 'disabled'}>Share PDF (email, messenger…)</button>` : ''}
          </div>
        </section>
        <h2 class="mb">Preview</h2>
      </div>
      <div class="sheet-preview"><div class="sheet-scaler" id="sheets">${LB.sheetsHTML(selected, layoutKey)}</div></div>`;
    async function makePdf(el, share) {
      setBusy(el, true, 'Creating PDF…');
      try {
        const blob = LB.buildPDF(selected, layoutKey);
        const name = 'qr-patrol-labels_' + U.fileStamp() + '.pdf';
        if (share) { if (!(await U.shareBlob(blob, name, 'QR Patrol labels'))) U.downloadBlob(blob, name); }
        else { U.downloadBlob(blob, name); U.toast('PDF saved to Downloads'); }
      } catch (err) { if (!(err && err.name === 'AbortError')) U.toast('PDF failed: ' + (err && err.message || err)); }
      setBusy(el, false, share ? 'Share PDF (email, messenger…)' : 'Download PDF file');
    }
    const actions = withGlobal({
      'sel-all': () => { labelSel = new Set(ids); render(); },
      'sel-none': () => { labelSel = new Set(); render(); },
      'print': () => window.print(),
      'pdf': (el) => makePdf(el, false),
      'pdf-share': (el) => makePdf(el, true),
    });
    function fit() {
      const wrap = $view.querySelector('.sheet-preview'), scaler = $view.querySelector('#sheets');
      if (!wrap || !scaler || !scaler.firstElementChild) { if (wrap) wrap.style.height = '0px'; return; }
      const sheetW = scaler.firstElementChild.offsetWidth || 718;
      const scale = Math.min(1, wrap.clientWidth / sheetW);
      scaler.style.transform = 'scale(' + scale + ')';
      wrap.style.height = Math.ceil(scaler.offsetHeight * scale) + 'px';
    }
    function mount(root) {
      root.querySelector('#layout').addEventListener('change', async (e) => { await DB.setMeta('labelLayout', e.target.value); render(); });
      root.querySelectorAll('[data-pick]').forEach((cb) => cb.addEventListener('change', () => { if (cb.checked) labelSel.add(cb.dataset.pick); else labelSel.delete(cb.dataset.pick); render(); }));
      fit();
      window.addEventListener('resize', fit);
      window.addEventListener('afterprint', fit);
    }
    function unmount() { window.removeEventListener('resize', fit); window.removeEventListener('afterprint', fit); }
    return { html, actions, mount, unmount };
  }

  // ---------------- EXPORT & BACKUP ----------------
  async function viewExport() {
    const today = U.todayKey();
    const first = today.slice(0, 8) + '01';
    const [lastBackupTs, recordCount, placeCount] = await Promise.all([DB.getMeta('lastBackupTs', 0), DB.countRecords(), DB.getPlaces(true).then((p) => p.length)]);
    const canShare = U.canShareFiles();
    const html = `
      <div class="page-head"><div>${backLink('#/settings', 'Settings')}<h1>Export &amp; backup</h1></div></div>
      <section class="card">
        <h2>Excel export</h2>
        <p class="muted small">Sheets: Records, Open actions, Missed checks.</p>
        <div class="row gap">
          <label class="field" style="flex:1"><span>From</span><input type="date" id="exp-from" value="${first}" max="${today}"></label>
          <label class="field" style="flex:1"><span>To</span><input type="date" id="exp-to" value="${today}" max="${today}"></label>
        </div>
        <div class="stack">
          <button class="btn btn-primary" data-action="excel">Download Excel (.xlsx)</button>
          ${canShare ? '<button class="btn btn-outline" data-action="excel-share">Share Excel</button>' : ''}
        </div>
      </section>
      <section class="card">
        <h2>Backup</h2>
        <p class="muted small">One file with everything: ${placeCount} place(s), ${recordCount} record(s), photos and settings.<br>Last backup: <b>${lastBackupTs ? U.esc(U.fmtFull(lastBackupTs)) : 'never'}</b></p>
        <div class="stack">
          <button class="btn btn-primary" data-action="backup">Download backup (.json)</button>
          ${canShare ? '<button class="btn btn-outline" data-action="backup-share">Share backup</button>' : ''}
        </div>
        <p class="muted small mt">Keep the file somewhere safe (office PC, cloud drive, email). You need it if the phone is reset or replaced.</p>
      </section>
      <section class="card">
        <h2>Restore</h2>
        <p class="muted small">Replaces all data on this phone with the contents of a backup file.</p>
        <label class="btn btn-outline btn-block">Choose backup file…<input type="file" id="restore-file" accept="application/json,.json" hidden></label>
      </section>`;
    function range() {
      const from = document.getElementById('exp-from').value, to = document.getElementById('exp-to').value;
      if (!from || !to || from > to) { U.toast('Check the date range'); return null; }
      return { from, to };
    }
    async function excel(el, share) {
      const rg = range(); if (!rg) return;
      const label = el.textContent;
      setBusy(el, true, 'Creating…');
      try {
        const res = await EX.buildExcelBlob(rg.from, rg.to);
        const name = 'qr-patrol_' + rg.from.replace(/-/g, '') + '-' + rg.to.replace(/-/g, '') + '.xlsx';
        if (share) { if (!(await U.shareBlob(res.blob, name, 'QR Patrol export'))) U.downloadBlob(res.blob, name); }
        else { U.downloadBlob(res.blob, name); U.toast(`Excel saved (${res.counts.records} records, ${res.counts.open} open, ${res.counts.missed} missed)`); }
      } catch (err) { if (!(err && err.name === 'AbortError')) U.toast('Export failed: ' + (err && err.message || err)); }
      setBusy(el, false, label);
    }
    async function backup(el, share) {
      const label = el.textContent;
      setBusy(el, true, 'Creating…');
      try {
        const blob = await EX.buildBackupBlob();
        const name = 'qr-patrol_backup_' + U.fileStamp() + '.json';
        if (share) { if (!(await U.shareBlob(blob, name, 'QR Patrol backup'))) U.downloadBlob(blob, name); }
        else U.downloadBlob(blob, name);
        await DB.setMeta('lastBackupTs', Date.now());
        U.toast('Backup file created (' + U.fmtBytes(blob.size) + ')');
        render();
      } catch (err) { if (!(err && err.name === 'AbortError')) U.toast('Backup failed: ' + (err && err.message || err)); setBusy(el, false, label); }
    }
    const actions = withGlobal({
      'excel': (el) => excel(el, false),
      'excel-share': (el) => excel(el, true),
      'backup': (el) => backup(el, false),
      'backup-share': (el) => backup(el, true),
    });
    function mount(root) {
      root.querySelector('#restore-file').addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const data = await EX.parseBackupFile(file);
          const ok = await confirmDialog({
            title: 'Restore this backup?',
            html: `Backup from <b>${U.esc(data.exportedAt ? data.exportedAt.replace('T', ' ').slice(0, 16) : 'unknown date')}</b><br>${data.places.length} place(s), ${data.records.length} record(s), ${(data.photos || []).length} photo(s).<br><br><b>All current data on this phone will be replaced.</b>`,
            okLabel: 'Restore', okClass: 'btn-danger',
          });
          if (!ok) return;
          await DB.importAll(data);
          U.toast('Backup restored');
          location.hash = '#/home';
        } catch (err) { infoDialog('Restore failed', `<p>${U.esc(err && err.message || err)}</p>`); }
      });
    }
    return { html, actions, mount };
  }

  // ---------------- Bootstrap ----------------
  async function seedIfNeeded() {
    if (await DB.getMeta('seeded', false)) return;
    if ((await DB.getPlaces(true)).length === 0) await loadSamples();
    await DB.setMeta('seeded', true);
  }
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      app.swReg = reg;
      const watch = (w) => { if (!w) return; w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) { app.updateReady = true; U.toast('A new version is ready. See the banner on Home.'); render(); } }); };
      if (reg.waiting && navigator.serviceWorker.controller) app.updateReady = true;
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
    }).catch((err) => console.warn('Service worker registration failed', err));
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      location.reload();
    });
  }
  async function init() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) { /* ignore */ }
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.installEvent = e; const n = parseHash().name; if (n === 'home' || n === 'settings') render(); });
    window.addEventListener('appinstalled', () => { app.installEvent = null; U.toast('App installed'); });
    window.addEventListener('hashchange', render);
    try { await seedIfNeeded(); } catch (err) {
      $view.innerHTML = `<section class="card"><h2>Storage not available</h2><p class="muted">${U.esc(err && err.message || err)}</p><p class="muted small">This app needs IndexedDB. Please use Chrome and do not open it in private/incognito mode.</p></section>`;
      return;
    }
    registerSW();
    if (!location.hash) location.replace('#/home');
    render();
  }
  QP.app = { render, APP_VERSION, loadSamples, SAMPLE_PLACES };
  init();
})();
