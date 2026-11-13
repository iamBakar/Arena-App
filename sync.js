/* ==========================================================
   sync.js - keeps this device's tournaments and the cloud in step.
   Store.tournaments is a local copy of the signed-in person's tournaments.
   Failures are no longer silent: they are logged, shown once, and retried.
   ========================================================== */
(function (root) {
  'use strict';
  const sigOf = t => JSON.stringify(t, (k, v) => (k === 'rev' ? undefined : v));   // rev is bookkeeping, not content
  let uid = null, ready = false, busy = false, again = false, synced = {};
  let gen = 0, retryTimer = null, retryMs = 3000, lastErr = '', lastToast = 0, lastPull = 0;
  const say = m => { if (root.toast) root.toast(m); };
  const codeOf = e => (e && (e.code || e.message)) || 'unknown';

  function problem(e, what) {
    lastErr = codeOf(e);
    console.warn('Arena sync: could not ' + what, e);
    if (Date.now() - lastToast > 30000) { lastToast = Date.now(); say('Could not ' + what + ' (' + lastErr + '). Retrying...'); }
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (uid) (ready ? flush() : start(uid, false, true)); }, retryMs);
    retryMs = Math.min(retryMs * 2, 60000);
  }
  function healthy() { lastErr = ''; retryMs = 3000; clearTimeout(retryTimer); }

  // force = throw away local copy and take the cloud's.  soft = re-check the cloud without disturbing anything.
  async function start(u, force, soft) {
    if (!force && !soft && uid === u) return;
    const my = ++gen;
    if (!soft) { ready = false; synced = {}; }
    uid = u;
    let mine;
    try { mine = await Cloud.loadMine(); }
    catch (e) { if (my === gen) problem(e, 'load your tournaments'); return; }
    if (my !== gen) return;                                                // a newer start/stop took over
    const s = Store.get();                                                 // read AFTER the wait, so nothing made meanwhile is lost
    const cache = force ? [] : (s.cacheUid === u ? s.tournaments : s.tournaments.filter(t => t.ownerId === u));
    const legacy = s.cacheUid ? [] : s.tournaments.filter(t => !t.ownerId);   // made before accounts existed
    const map = {}, nextSynced = {};
    mine.forEach(c => {
      const l = cache.find(x => x.id === c.id);
      if (l && l.rev === c.rev && sigOf(l) !== sigOf(c)) map[c.id] = l;   // unsaved edits made on this device
      else { map[c.id] = c; nextSynced[c.id] = sigOf(c); }
    });
    cache.filter(l => !l.rev && !map[l.id]).forEach(l => (map[l.id] = l)); // new, not yet saved
    try { for (const l of legacy) { l.id = await Cloud.newCode(); l.ownerId = u; delete l.rev; map[l.id] = l; } }
    catch (e) { if (my === gen) problem(e, 'move your tournaments'); return; }
    if (my !== gen) return;
    const list = Object.values(map).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const fp = l => l.map(t => t.id + ':' + t.rev + ':' + sigOf(t)).join('|');
    const unchanged = soft && ready && fp(list) === fp(s.tournaments);
    synced = nextSynced;
    if (!unchanged) Store.commit(st => { st.tournaments = list; st.cacheUid = u; });
    ready = true; healthy();
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
        const sig = sigOf(t);                                              // taken BEFORE saving, so edits made during the save are not lost
        if (synced[t.id] === sig) continue;
        try { await Cloud.saveTournament(t); synced[t.id] = sig; saved = true; }
        catch (e) {
          if (e && e.code === 'app/conflict') { say('Updated from another device.'); busy = false; return start(uid, true); }
          problem(e, 'save to the cloud'); return;                         // keeps the change, retries automatically
        }
      }
      for (const id of Object.keys(synced)) {
        if (!list.some(x => x.id === id)) {
          try { await Cloud.deleteTournament(id); delete synced[id]; saved = true; }
          catch (e) { problem(e, 'delete from the cloud'); return; }
        }
      }
      healthy();
    } finally {
      busy = false;
      if (saved) Store.commit(() => {});                                   // store the new revision numbers locally
      if (again) { again = false; flush(); }
    }
  }

  function stop() {
    gen++; clearTimeout(retryTimer); uid = null; ready = false; synced = {}; lastErr = '';
    Store.commit(st => { st.tournaments = []; st.cacheUid = null; });
  }
  function pending() {
    if (!uid) return 0;
    const list = Store.get().tournaments;
    return list.filter(t => synced[t.id] !== sigOf(t)).length + Object.keys(synced).filter(id => !list.some(x => x.id === id)).length;
  }
  async function flushNow() {
    if (uid && !ready) await start(uid, false, true);
    await flush();
    while (busy) await new Promise(r => setTimeout(r, 100));
  }

  Store.subscribe(flush);
  window.addEventListener('online', () => { if (!uid) return; if (!ready) start(uid, false, true); else flush(); });
  // Coming back to the tab (e.g. after making a tournament on the laptop): pull in anything new from the cloud.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !uid) return;
    if (!ready) return start(uid, false, true);
    if (busy || pending()) return flush();
    if (Date.now() - lastPull > 20000) { lastPull = Date.now(); start(uid, false, true); }
  });
  root.Sync = { start, flush, flushNow, stop, pending, active: () => !!uid, uid: () => uid, lastError: () => lastErr };
})(window);
