/* ==========================================================
   sync.js - keeps this device's tournaments and the cloud in step.
   Store.tournaments is a local copy of the signed-in person's tournaments.
   Shows its status (Saving / Saved / Not saved / Offline) and always says WHAT failed and WHY.
   One problem tournament never blocks the others.
   ========================================================== */
(function (root) {
  'use strict';
  const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
  const sigOf = t => JSON.stringify(t, (k, v) => (k === 'rev' ? undefined : v));   // rev is bookkeeping, not content
  let uid = null, ready = false, busy = false, again = false, synced = {}, status = { state: 'idle', msg: '' };
  const subs = [];
  const say = m => { if (root.toast) root.toast(m); };
  const setStatus = (state, msg) => { status = { state, msg: msg || '' }; subs.forEach(f => f(status)); };
  const offlineLike = e => (typeof navigator !== 'undefined' && navigator.onLine === false) || (e && (e.code === 'unavailable' || e.code === 'auth/network-request-failed'));
  function fail(e, what) {
    console.error('[Arena sync]', what || '', e);
    if (offlineLike(e)) setStatus('offline', 'No internet connection. Your changes are kept on this device and will be saved when you are back online.');
    else setStatus('error', (what ? what + ': ' : '') + Cloud.friendly(e) + (e && e.code ? ' (' + e.code + ')' : '') + '. Open your profile menu and run "Check cloud connection" to see why.');
  }

  async function start(u, force) {
    if (!force && uid === u) return;
    uid = u; ready = false; synced = {};
    const s = Store.get();
    let mine;
    try { mine = await Cloud.loadMine(); } catch (e) { fail(e, 'Could not load your tournaments'); return; }   // nothing is lost; retry() or going online tries again
    const cache = force ? [] : (s.cacheUid === u ? s.tournaments : s.tournaments.filter(t => t.ownerId === u));
    const legacy = s.cacheUid ? [] : s.tournaments.filter(t => !t.ownerId);   // made before accounts existed
    const map = {}; synced = {};
    mine.forEach(c => {
      const l = cache.find(x => x.id === c.id);
      if (l && l.rev === c.rev && sigOf(l) !== sigOf(c)) map[c.id] = l;       // unsaved edits made on this device
      else { map[c.id] = c; synced[c.id] = sigOf(c); }
    });
    cache.filter(l => !l.rev && !map[l.id]).forEach(l => (map[l.id] = l));    // new, not yet saved
    for (const l of legacy) { l.id = await Cloud.newCode(); l.ownerId = u; delete l.rev; map[l.id] = l; }
    const list = Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    Store.commit(st => { st.tournaments = list; st.cacheUid = u; });
    ready = true; setStatus('saved');
    if (legacy.length) say('Moved ' + legacy.length + ' tournament(s) from this device to your account.');
    flush();
  }

  async function flush() {
    if (!ready || !uid) return;
    if (busy) { again = true; return; }
    busy = true; let saved = false;
    try {
      const list = Store.get().tournaments.slice();
      const dirty = list.filter(t => synced[t.id] !== sigOf(t)), gone = Object.keys(synced).filter(id => !list.some(x => x.id === id));
      if (!dirty.length && !gone.length) return;
      setStatus('saving');
      let firstErr = null, what = '';
      for (const t of dirty) {
        try {
          if (!CODE_RE.test(t.id)) {                                           // an id that is not a share code can never be saved: give it one
            const old = t.id; t.id = await Cloud.newCode(); delete t.rev;
            if (location.hash === '#/t/' + old) location.replace('#/t/' + t.id);
          }
          if (t.ownerId !== uid) t.ownerId = uid;
          await Cloud.saveTournament(t); synced[t.id] = sigOf(t); saved = true;
        } catch (e) {
          if (e && e.code === 'app/conflict') { say('Updated from another device.'); busy = false; return start(uid, true); }
          if (!firstErr) { firstErr = e; what = 'Could not save "' + t.name + '"'; }   // keep going: one bad tournament must not block the rest
        }
      }
      for (const id of gone) {
        try { await Cloud.deleteTournament(id); delete synced[id]; } catch (e) { if (!firstErr) { firstErr = e; what = 'Could not delete a tournament'; } }
      }
      if (firstErr) { fail(firstErr, what); return; }
      setStatus('saved');
    } finally {
      busy = false;
      if (saved) Store.commit(() => {});                                     // store the new revision numbers locally
      if (again) { again = false; flush(); }
    }
  }

  // Try again without discarding anything made on this device.
  function retry() {
    if (!uid) return;
    if (!ready) { const u = uid; uid = null; return start(u, false); }
    return flush();
  }
  function stop() { uid = null; ready = false; synced = {}; setStatus('idle'); Store.commit(st => { st.tournaments = []; st.cacheUid = null; }); }
  function pending() {
    if (!uid) return 0;
    const list = Store.get().tournaments;
    return list.filter(t => synced[t.id] !== sigOf(t)).length + Object.keys(synced).filter(id => !list.some(x => x.id === id)).length;
  }

  Store.subscribe(flush);
  window.addEventListener('online', retry);
  window.addEventListener('focus', () => { if (status.state === 'error' || status.state === 'offline') retry(); });
  setInterval(() => { if (uid && (status.state === 'error' || status.state === 'offline')) retry(); }, 30000);
  root.Sync = {
    start, flush, retry, stop, pending, active: () => !!uid, uid: () => uid,
    flushNow: async () => { await flush(); while (busy) await new Promise(r => setTimeout(r, 100)); },
    status: () => status, onStatus: f => subs.push(f)
  };
})(window);
