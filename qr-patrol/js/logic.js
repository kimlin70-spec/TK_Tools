/* logic.js — patrol rules: slots, day status, missed checks (QP.logic) */
window.QP = window.QP || {};
(function () {
  'use strict';
  const U = QP.util;

  function isWorkingDay(key, settings) {
    const days = (settings && settings.workingDays) || [1, 2, 3, 4, 5];
    return days.includes(U.parseKey(key).getDay());
  }
  function requiredSlots(place) { return Number(place.freq) === 2 ? ['AM', 'PM'] : ['DAY']; }
  function slotLabel(slot) { return slot === 'DAY' ? 'Day' : slot; }

  // Was this place part of the patrol on the given day?
  function placeActiveOn(place, key) {
    if (place.createdTs && U.dateKey(new Date(place.createdTs)) > key) return false;
    if (place.deleted && place.deletedTs && U.dateKey(new Date(place.deletedTs)) <= key) return false;
    if (place.deleted && !place.deletedTs) return false;
    return true;
  }

  /* Status of every place for one day.
   * state: done | missed | pending (due now) | later (PM slot in the morning) | future */
  function dayStatus(places, dayRecords, key, now) {
    now = now || new Date();
    const today = U.dateKey(now);
    const isPast = key < today, isToday = key === today;
    const afterNoon = now.getHours() >= 12;
    const byPlace = {};
    for (const r of dayRecords) (byPlace[r.placeId] = byPlace[r.placeId] || []).push(r);
    return places.filter((p) => placeActiveOn(p, key)).map((p) => {
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

  // Missed checks for a date range (working days only). Returns [{date, place, slot}]
  async function missedInRange(places, fromKey, toKey, settings, now) {
    now = now || new Date();
    const today = U.dateKey(now);
    if (toKey > today) toKey = today;
    const out = [];
    for (let key = fromKey; key <= toKey; key = U.addDays(key, 1)) {
      if (!isWorkingDay(key, settings)) continue;
      const recs = await QP.db.getRecordsByDate(key);
      for (const st of dayStatus(places, recs, key, now)) {
        for (const sl of st.slots) if (sl.state === 'missed') out.push({ date: key, place: st.place, slot: sl.slot });
      }
    }
    return out;
  }

  QP.logic = { isWorkingDay, requiredSlots, slotLabel, placeActiveOn, dayStatus, summary, missedInRange };
})();
