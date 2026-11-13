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
  let acct = { mode: 'loading', user: null, profile: null };   // loading | local | out | unverified | noprofile | in

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
    const p = Store.get().profile, b = $('#profileBtn');
    b.hidden = ['loading', 'out', 'unverified', 'noprofile'].includes(acct.mode);
    b.innerHTML = p ? `<span>${esc(p.avatar)}</span><span>${esc(p.name)}</span>` : '<span>Create profile</span>';
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
        ${first ? '' : extrasHtml()}
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
    if (!first) bindExtras();
  }
  $('#profileBtn').addEventListener('click', () => (acct.mode === 'in' ? openAccount() : openProfile(!Store.get().profile)));
  dlg.addEventListener('cancel', e => { if (!Store.get().profile) e.preventDefault(); }); // profile is required first

  const extrasHtml = () => installBlock();
  function bindExtras() {
    const inst = $('#inst');
    if (inst) inst.addEventListener('click', () => { installPrompt.prompt(); installPrompt = null; dlg.close(); });
  }
  function openAccount() {
    const p = Store.get().profile || {};
    dlg.innerHTML = `<form id="pf"><h2>${esc(p.avatar || '')} ${esc(p.name || '')}</h2>
      <p class="mute">${esc((acct.user && acct.user.email) || '')}</p>
      <div class="row"><button type="button" class="btn" id="logout">Log out</button><button type="button" class="btn" id="closeDlg">Close</button></div>
      ${extrasHtml()}</form>`;
    if (!dlg.open) dlg.showModal();
    $('#closeDlg').addEventListener('click', () => dlg.close());
    $('#logout').addEventListener('click', async () => {
      await Sync.flushNow();
      if (Sync.pending() && !confirm('Some changes are not saved to the cloud yet. Log out anyway?')) return;
      dlg.close(); await Cloud.logOut(); toast('Logged out.');
    });
    bindExtras();
  }

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
    if (acct.mode === 'loading') { view.innerHTML = '<p class="empty glass">Loading...</p>'; return; }
    if (acct.mode === 'out' || acct.mode === 'unverified' || acct.mode === 'noprofile') {
      if (dlg.open) dlg.close();
      Auth.render(view, acct.mode === 'noprofile' ? '#/profile' : acct.mode === 'unverified' ? '#/verify' : h, { email: acct.user && acct.user.email });
      return;
    }
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
  function onCloud(s) {
    if (!s.user) { acct = { mode: 'out', user: null, profile: null }; Sync.stop(); }
    else if (!s.user.verified) acct = { mode: 'unverified', user: s.user, profile: null };
    else if (!s.profile) acct = { mode: 'noprofile', user: s.user, profile: null };
    else {
      acct = { mode: 'in', user: s.user, profile: s.profile };
      const cur = Store.get().profile;
      if (!cur || cur.uid !== s.user.uid || cur.name !== s.profile.username || cur.avatar !== s.profile.avatar)
        Store.commit(st => { st.profile = { name: s.profile.username, avatar: s.profile.avatar, uid: s.user.uid }; });
      Sync.start(s.user.uid);
    }
    refresh(); route();
  }
  window.addEventListener('focus', () => { if (acct.mode === 'unverified' && window.Cloud) Cloud.checkVerified().catch(() => {}); });
  const startCloud = () => Cloud.onAuth(onCloud);
  if (window.Cloud) startCloud(); else window.addEventListener('cloud-ready', startCloud, { once: true });
  setTimeout(() => { if (acct.mode === 'loading') { acct = { mode: 'local', user: null, profile: null }; refresh(); route(); } }, 6000);   // could not reach Firebase: keep working locally

  refresh(); route();
  if (!Store.isPersistent()) toast('This browser blocks saving. Export a backup before closing.');
})();
