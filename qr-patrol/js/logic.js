/* logic.js — patrol rules: schedules, slots, day status, missed checks (QP.logic)
 * Schedule of a place: days = null (every working day) or weekday numbers (0 = Sun … 6 = Sat); times = 1 or 2 (AM/PM).
 * A check is required only on the scheduled day itself (no carry-over). Settings.workingDays is the master calendar;
 * Settings.offDays lists dates marked "No patrol" (holiday / absence). */
window.QP = window.QP || {};
(function () {
  'use strict';
  const U = QP.util;
  const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function workingDays(settings) { return (settings && settings.workingDays) || [1, 2, 3, 4, 5]; }
  function offDays(settings) { return (settings && settings.offDays) || []; }
  function isWorkingDay(key, settings) { return workingDays(settings).includes(U.parseKey(key).getDay()); }
  function isOffDay(key, settings) { return offDays(settings).includes(key); }
  function isPatrolDay(key, settings) { return isWorkingDay(key, settings) && !isOffDay(key, settings); }

  function placeTimes(place) { return Number(place.times != null ? place.times : place.freq) === 2 ? 2 : 1; }
  function placeDays(place) { return Array.isArray(place.days) && place.days.length ? place.days : null; }
  function requiredSlots(place) { return placeTimes(place) === 2 ? ['AM', 'PM'] : ['DAY']; }
  function slotLabel(slot) { return slot === 'DAY' ? 'Day' : slot; }
  function daysLabel(days) {
    if (!days || !days.length) return 'Every working day';
    return [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(' ');
  }
  function scheduleLabel(place) {
    const d = placeDays(place), t = placeTimes(place);
    if (!d) return t === 2 ? 'Daily · AM · PM' : 'Daily';
    return daysLabel(d) + (t === 2 ? ' · AM · PM' : '');
  }

  // Was this place part of the patrol on the given day (created before, not yet deleted)?
  function placeActiveOn(place, key) {
    if (place.createdTs && U.dateKey(new Date(place.createdTs)) > key) return false;
    if (place.deleted && place.deletedTs && U.dateKey(new Date(place.deletedTs)) <= key) return false;
    if (place.deleted && !place.deletedTs) return false;
    return true;
  }
  // Is a check required for this place on this day?
  function isDueOn(place, key, settings) {
    if (!isPatrolDay(key, settings)) return false;
    if (!placeActiveOn(place, key)) return false;
    const d = placeDays(place);
    return !d || d.includes(U.parseKey(key).getDay());
  }
  // Next day after fromKey (within 60 days) on which the place is due, or null.
  function nextDueKey(place, fromKey, settings) {
    let key = fromKey;
    for (let i = 0; i < 60; i++) {
      key = U.addDays(key, 1);
      if (isDueOn(place, key, settings)) return key;
    }
    return null;
  }

  /* Status of every place that is due on one day.
   * state: done | missed | pending (due now) | later (PM slot in the morning) | future */
  function dayStatus(places, dayRecords, key, now, settings) {
    now = now || new Date();
    settings = settings || {};
    const today = U.dateKey(now);
    const isPast = key < today, isToday = key === today;
    const afterNoon = now.getHours() >= 12;
    const byPlace = {};
    for (const r of dayRecords) (byPlace[r.placeId] = byPlace[r.placeId] || []).push(r);
    return places.filter((p) => isDueOn(p, key, settings)).map((p) => {
      const recs = (byPlace[p.id] || []).slice().sort((a, b) => a.ts - b.ts);
      // A place added in the afternoon has no AM slot on that first day.
      const created = p.createdTs ? new Date(p.createdTs) : null;
      const noAmToday = created && U.dateKey(created) === key && created.getHours() >= 12;
      const slots = requiredSlots(p).filter((slot) => !(slot === 'AM' && noAmToday)).map((slot) => {
        const matching = slot === 'DAY' ? recs : recs.filter((r) => r.slot === slot);
        const rec = matching.length ? matching[matching.length - 1] : null;
        let state;
        if (rec) state = 'done';
        else if (isPast) state = 'missed';
        else if (isToday) {
          if (slot === 'AM' && afterNoon) state = 'missed';
          else if (slot === 'PM' && !afterNoon) state = 'later';
          else state = 'pending';
        } else state = 'future';
        return { slot, rec, state, count: matching.length };
      });
      return { place: p, slots, records: recs, hasAction: recs.some((r) => r.result === 'ACTION') };
    });
  }

  function summary(statusList) {
    let total = 0, done = 0, missed = 0;
    for (const s of statusList) for (const sl of s.slots) { total++; if (sl.state === 'done') done++; if (sl.state === 'missed') missed++; }
    return { total, done, missed };
  }

  // Missed checks for a date range (patrol days only). Returns [{date, place, slot}]
  async function missedInRange(places, fromKey, toKey, settings, now) {
    now = now || new Date();
    const today = U.dateKey(now);
    if (toKey > today) toKey = today;
    const out = [];
    for (let key = fromKey; key <= toKey; key = U.addDays(key, 1)) {
      if (!isPatrolDay(key, settings)) continue;
      const recs = await QP.db.getRecordsByDate(key);
      for (const st of dayStatus(places, recs, key, now, settings)) {
        for (const sl of st.slots) if (sl.state === 'missed') out.push({ date: key, place: st.place, slot: sl.slot });
      }
    }
    return out;
  }

  QP.logic = {
    DAY_SHORT, isWorkingDay, isOffDay, isPatrolDay, placeTimes, placeDays, requiredSlots, slotLabel, daysLabel, scheduleLabel,
    placeActiveOn, isDueOn, nextDueKey, dayStatus, summary, missedInRange,
  };
})();
