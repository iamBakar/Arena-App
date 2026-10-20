/* ==========================================================
   app.js - screens, theme, profile, routing.
   ========================================================== */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const AVATARS = ['⚽', '🥊', '🏏', '🎮', '🏆', '🔥'];
  const THEMES = { auto: ['◐', 'Theme: follows your device'], light: ['☀', 'Theme: light'], dark: ['☾', 'Theme: dark'] };
  const FORMATS = { league: 'League', knockout: 'Knockout', groups: 'Groups + knockout' };
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const dlg = $('#dlg'), view = $('#view');

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  window.toast = toast;

  /* ---------- Theme: auto follows the device, button cycles auto > light > dark ---------- */
  function applyTheme() {
    const pref = Store.get().settings.theme;
    document.documentElement.dataset.theme = (pref === 'dark' || (pref === 'auto' && dark.matches)) ? 'dark' : 'light';
    const b = $('#themeBtn'); b.textContent = THEMES[pref][0]; b.title = b.ariaLabel = THEMES[pref][1];
  }
  $('#themeBtn').addEventListener('click', () => {
    const order = ['auto', 'light', 'dark'], cur = Store.get().settings.theme;
    Store.commit(s => { s.settings.theme = order[(order.indexOf(cur) + 1) % 3]; });
  });
  dark.addEventListener('change', applyTheme);

  /* ---------- Profile ---------- */
  function renderProfileChip() {
    const p = Store.get().profile;
    $('#profileBtn').innerHTML = p ? `<span>${esc(p.avatar)}</span><span>${esc(p.name)}</span>` : '<span>Create profile</span>';
  }

  function openProfile(first) {
    const p = Store.get().profile || { name: '', avatar: AVATARS[0] };
    dlg.innerHTML = `
      <form id="pf">
        <h2>${first ? 'Create your profile' : 'Your profile'}</h2>
        <p class="mute">${first ? 'You run the tournaments. Players are added when you create one.' : 'Change how you appear in the app.'}</p>
        <label>Your name<input type="text" name="name" maxlength="24" required value="${esc(p.name)}" autocomplete="off"></label>
        <fieldset><legend>Pick an icon</legend><div class="avs">
          ${AVATARS.map(a => `<label><input type="radio" name="av" value="${a}" ${a === p.avatar ? 'checked' : ''}><span>${a}</span></label>`).join('')}
        </div></fieldset>
        <div class="row">
          <button class="btn primary">Save profile</button>
          ${first ? '' : '<button type="button" class="btn" id="closeDlg">Close</button>'}
        </div>
        ${first ? '' : `<hr><h3>Backup</h3>
          <p class="mute">Your data is saved in this browser only. Export a file to keep a copy, or import one to restore.</p>
          <div class="row"><button type="button" class="btn" id="exp">Export backup</button>
          <button type="button" class="btn" id="imp">Import backup</button>
          <input type="file" id="file" accept=".json,application/json" hidden></div>${installBlock()}`}
      </form>`;
    if (!dlg.open) dlg.showModal();

    $('#pf').addEventListener('submit', e => {
      e.preventDefault();
      const f = new FormData(e.target), name = (f.get('name') || '').trim();
      if (!name) return;
      Store.commit(s => { s.profile = { name, avatar: f.get('av') || AVATARS[0] }; });
      dlg.close(); toast(first ? 'Profile created. Welcome, ' + name + '!' : 'Profile saved.');
    });
    const close = $('#closeDlg'); if (close) close.addEventListener('click', () => dlg.close());
    if (!first) {
      $('#exp').addEventListener('click', exportBackup);
      $('#imp').addEventListener('click', () => $('#file').click());
      $('#file').addEventListener('change', importBackup);
      const inst = $('#inst');
      if (inst) inst.addEventListener('click', () => { installPrompt.prompt(); installPrompt = null; dlg.close(); });
    }
  }
  $('#profileBtn').addEventListener('click', () => openProfile(!Store.get().profile));
  dlg.addEventListener('cancel', e => { if (!Store.get().profile) e.preventDefault(); }); // profile is required first

  /* ---------- Install as an app ---------- */
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); installPrompt = ev; });
  const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function installBlock() {
    if (isInstalled()) return '<hr><h3>Install as an app</h3><p class="mute">You are using the installed app.</p>';
    return `<hr><h3>Install as an app</h3>
      <p class="mute">iPhone: open this page in Safari, tap Share, then Add to Home Screen. Android: open the browser menu, then Install app or Add to Home screen.</p>
      ${installPrompt ? '<div class="row"><button type="button" class="btn" id="inst">Add to home screen</button></div>' : ''}`;
  }

  /* ---------- Backup ---------- */
  function exportBackup() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    Exporter.offerFile(blob, 'arena-backup-' + new Date().toISOString().slice(0, 10) + '.json', 'Your backup is ready');
  }
  function importBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const res = Store.importJSON(String(r.result));
      if (res.ok) { dlg.close(); toast('Backup restored: ' + res.count + ' tournament(s).'); }
      else toast(res.error);
    };
    r.readAsText(file);
  }

  /* ---------- Views ---------- */
  function cards(list, emptyText) {
    if (!list.length) return `<p class="empty glass">${emptyText}</p>`;
    return `<div class="grid">${list.map(t => {
      const sport = (Core.SPORTS[t.sport] || {}).label || t.sport;
      const note = t.status === 'finished' ? 'Winner: ' + esc(t.championName || 'not recorded') : 'In progress';
      return `<a class="tcard glass ${t.status === 'finished' ? 'done' : ''}" href="#/t/${esc(t.id)}">
        <h3>${esc(t.name)}</h3><p>${esc(sport)}, ${esc(FORMATS[t.format] || t.format)}</p><p>${note}</p></a>`;
    }).join('')}</div>`;
  }

  function homeView() {
    const s = Store.get(), p = s.profile || { name: 'champ' };
    const running = s.tournaments.filter(t => t.status !== 'finished');
    const done = s.tournaments.filter(t => t.status === 'finished');
    return `
      <section class="hero">
        <h1>Ready, ${esc(p.name)}?</h1>
        <p>Pick a game, add your players, and enter each result as the matches finish. Arena builds the fixtures and tables.</p>
        <a class="cta" href="#/new">New tournament</a>
      </section>
      <section><h2>Running now</h2>${cards(running, 'No tournaments running. Start one and it will show up here.')}</section>
      <section><h2>History</h2>${cards(done, 'Finished tournaments are kept here with their winners.')}</section>`;
  }

  function placeholderView(title, text) {
    return `<section><h2>${title}</h2><p class="empty glass">${text}</p><p><a href="#/">Back to home</a></p></section>`;
  }

  let lastHash = '';
  function route() {
    const h = location.hash || '#/';
    if (!Store.get().profile) { openProfile(true); view.innerHTML = ''; return; }
    if (h === '#/new') Setup.render(view);
    else if (h.startsWith('#/t/')) Tournament.render(view, decodeURIComponent(h.slice(4)));
    else view.innerHTML = homeView();
    if (h !== lastHash) window.scrollTo(0, 0); // only jump to top when changing page
    lastHash = h;
  }

  /* ---------- Boot ---------- */
  function refresh() { applyTheme(); renderProfileChip(); }
  Store.subscribe(() => { refresh(); if (dlg.open === false) route(); else if (Store.get().profile) route(); });
  window.addEventListener('hashchange', route);
  refresh(); route();
  if (!Store.isPersistent()) toast('This browser blocks saving. Export a backup before closing.');
})();
