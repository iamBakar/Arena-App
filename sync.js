/* ==========================================================
   sync.js - keeps this device's tournaments and the cloud in step.
   Store.tournaments is a local copy of the signed-in person's tournaments.
   ========================================================== */
(function (root) {
  'use strict';
  const sigOf = t => JSON.stringify(t, (k, v) => (k === 'rev' ? undefined : v));   // rev is bookkeeping, not content
  let uid = null, ready = false, busy = false, again = false, synced = {};
  const say = m => { if (root.toast) root.toast(m); };

  async function start(u, force) {
    if (!force && uid === u) return;
    uid = u; ready = false; synced = {};
    const s = Store.get();
    let mine;
    try { mine = await Cloud.loadMine(); } catch (e) { return; }          // offline: keep the saved copy, retry when online
    const cache = force ? [] : (s.cacheUid === u ? s.tournaments : s.tournaments.filter(t => t.ownerId === u));
    const legacy = s.cacheUid ? [] : s.tournaments.filter(t => !t.ownerId);   // made before accounts existed
    const map = {}; synced = {};
    mine.forEach(c => {
      const l = cache.find(x => x.id === c.id);
      if (l && l.rev === c.rev && sigOf(l) !== sigOf(c)) map[c.id] = l;     // unsaved edits made on this device
      else { map[c.id] = c; synced[c.id] = sigOf(c); }
    });
    cache.filter(l => !l.rev && !map[l.id]).forEach(l => (map[l.id] = l));  // new, not yet saved
    for (const l of legacy) { l.id = await Cloud.newCode(); l.ownerId = u; delete l.rev; map[l.id] = l; }
    const list = Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    Store.commit(st => { st.tournaments = list; st.cacheUid = u; });
    ready = true;
    if (legacy.length) say('Moved ' + legacy.length + ' tournament(s) from this device to your account.');
    flush();
  }

  async function flush() {
    if (!ready || !uid) return;
    if (busy) { again = true; return; }
    busy = true; let saved = false;
    try {
      const list = Store.get().tournaments.slice();
      for (const t of list) {
        if (synced[t.id] === sigOf(t)) continue;
        try { await Cloud.saveTournament(t); synced[t.id] = sigOf(t); saved = true; }
        catch (e) {
          if (e && e.code === 'app/conflict') { say('Updated from another device.'); busy = false; return start(uid, true); }
          return;                                                          // offline or other error: try again on the next change
        }
      }
      for (const id of Object.keys(synced)) {
        if (!list.some(x => x.id === id)) { try { await Cloud.deleteTournament(id); delete synced[id]; } catch (e) {} }
      }
    } finally {
      busy = false;
      if (saved) Store.commit(() => {});                                   // store the new revision numbers locally
      if (again) { again = false; flush(); }
    }
  }

  function stop() { uid = null; ready = false; synced = {}; Store.commit(st => { st.tournaments = []; st.cacheUid = null; }); }
  function pending() {
    if (!uid) return 0;
    const list = Store.get().tournaments;
    return list.filter(t => synced[t.id] !== sigOf(t)).length + Object.keys(synced).filter(id => !list.some(x => x.id === id)).length;
  }

  Store.subscribe(flush);
  window.addEventListener('online', () => { if (uid && !ready) start(uid, false); else flush(); });
  root.Sync = { start, flush, flushNow: async () => { await flush(); while (busy) await new Promise(r => setTimeout(r, 100)); }, stop, pending, active: () => !!uid, uid: () => uid };
})(window);
