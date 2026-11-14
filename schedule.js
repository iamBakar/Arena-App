/* ==========================================================
   schedule.js - match times. No UI.
   t.schedule = { gap: minutes between match starts,
                  days: [{ date: 'YYYY-MM-DD', start: minutes, end: minutes }],
                  delays: { matchId: minutes } }
   Times are minutes after midnight (600 = 10:00). Matches fill the days in order.
   A delay on a match moves that match and every later match on the same day.
   ========================================================== */
(function (root) {
  'use strict';
  const GAPS = [10, 15, 20, 30, 45, 60];
  const pad = n => String(n).padStart(2, '0');

  /* ---------- Formatting ---------- */
  function fmtTime(min, mode) {
    min = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(min / 60), m = min % 60;
    if (mode === '12h') return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
    return pad(h) + ':' + pad(m);
  }
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  function addDays(s, n) { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  const fmtDate = s => parseDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
  function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  const mode = () => (root.Store && Store.get().settings && Store.get().settings.timeFormat) || '24h';
  const label = slot => fmtDate(slot.date) + ' ' + fmtTime(slot.minute, mode());

  /* ---------- Which matches need a slot, in playing order ---------- */
  // Group/league rounds first, then the knockout (third place before the final). Byes and walkovers need no time.
  function ordered(t) {
    const out = (t.groups || []).flatMap((g, gi) => g.matches.map((m, i) => ({ m, gi, i })))
      .sort((x, y) => x.m.round - y.m.round || x.gi - y.gi || x.i - y.i).map(x => x.m);
    if (t.ko) {
      const rounds = t.ko.rounds;
      rounds.slice(0, -1).forEach(r => out.push(...r));
      if (t.ko.third) out.push(t.ko.third);
      out.push(...rounds[rounds.length - 1]);
    }
    return out.filter(m => !m.bye && !(m.result && m.result.wo));
  }

  /* ---------- Fit matches into days ---------- */
  function dayAt(s, i) {
    if (i < s.days.length) return Object.assign({ auto: false }, s.days[i]);
    const last = s.days[s.days.length - 1];                       // more days needed than set up: repeat the last day
    return { date: addDays(last.date, i - s.days.length + 1), start: last.start, end: last.end, auto: true };
  }
  function compute(t) {
    const s = t.schedule;
    if (!s || !s.days || !s.days.length) return null;
    const slots = {}, list = ordered(t), used = [[]];
    let d = 0, day = dayAt(s, 0), cursor = day.start;
    list.forEach(m => {
      const dl = (s.delays && s.delays[m.id]) || 0;
      let c = Math.max(day.start, cursor + dl);
      if (c + s.gap > day.end && c > day.start) {                  // no room left today: first slot of the next day
        d++; day = dayAt(s, d); used[d] = used[d] || []; c = Math.max(day.start, day.start + dl);
      }
      slots[m.id] = { day: d, date: day.date, minute: c, auto: day.auto };
      used[d].push(m);
      cursor = c + s.gap;
    });
    const total = Math.max(used.length, s.days.length);
    const days = [];
    for (let i = 0; i < total; i++) days.push(Object.assign(dayAt(s, i), { index: i, matches: used[i] || [] }));
    return { slots, days, extraDays: Math.max(0, used.length - s.days.length) };
  }

  /* ---------- Setup checks ---------- */
  function defaults() { return { gap: 30, days: [{ date: today(), start: 600, end: 1080 }], delays: {} }; }
  function validate(s) {
    if (!GAPS.includes(s.gap)) return 'Pick the time between matches.';
    if (!s.days.length) return 'Add at least one day.';
    for (let i = 0; i < s.days.length; i++) {
      const d = s.days[i];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || isNaN(parseDate(d.date))) return 'Day ' + (i + 1) + ': pick a date.';
      if (i && d.date === s.days[i - 1].date) return 'Days ' + i + ' and ' + (i + 1) + ' have the same date.';
      if (i && d.date < s.days[i - 1].date) return 'Days must be in date order.';
      if (!(d.end - d.start >= s.gap)) return 'Day ' + (i + 1) + ' must end at least ' + s.gap + ' minutes after it starts.';
    }
    return null;
  }

  /* ---------- Delays ---------- */
  function addDelay(t, id, min) {
    const s = t.schedule; s.delays = s.delays || {};
    const v = Math.max(-180, Math.min(180, (s.delays[id] || 0) + min));
    if (v === 0) delete s.delays[id]; else s.delays[id] = v;
  }
  function clearDelay(t, id) { if (t.schedule && t.schedule.delays) delete t.schedule.delays[id]; }

  root.Schedule = { GAPS, fmtTime, fmtDate, addDays, today, mode, label, ordered, compute, defaults, validate, addDelay, clearDelay };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Schedule;
})(typeof window !== 'undefined' ? window : globalThis);
