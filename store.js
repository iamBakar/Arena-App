/* ==========================================================
   store.js - saves everything in this browser (localStorage).
   Falls back to memory if the browser blocks storage.
   ========================================================== */
(function (root) {
  'use strict';
  const KEY = 'arena.v1';
  const fresh = () => ({ v: 1, profile: null, settings: { theme: 'auto', timeFormat: '24h' }, tournaments: [] });
  let state = fresh(), persistent = true;
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) adopt(JSON.parse(raw));
    } catch (e) { persistent = false; }
  }
  function adopt(p) {
    const f = fresh();
    state = Object.assign(f, p);
    state.settings = Object.assign(f.settings, p.settings);
    if (!Array.isArray(state.tournaments)) state.tournaments = [];
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); persistent = true; }
    catch (e) { persistent = false; }
  }

  // Change data safely: store.commit(s => { s.profile = {...} })
  function commit(fn) { fn(state); save(); listeners.forEach(f => f(state)); }

  function exportJSON() { return JSON.stringify(state, null, 2); }
  function importJSON(text) {
    let p;
    try { p = JSON.parse(text); } catch (e) { return { ok: false, error: 'That file is not valid JSON.' }; }
    if (!p || p.v !== 1 || !Array.isArray(p.tournaments)) return { ok: false, error: 'That is not an Arena backup file.' };
    adopt(p); save(); listeners.forEach(f => f(state));
    return { ok: true, count: state.tournaments.length };
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  load();
  root.Store = {
    get: () => state, commit, uid, exportJSON, importJSON,
    subscribe: f => listeners.push(f), isPersistent: () => persistent
  };
})(window);
