/* ==========================================================
   spectate.js - "Enter code" box, the Following list, and the live view-only page.
   Viewers can only read. The database rules stop anyone but the host from changing a tournament.
   ========================================================== */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => { if (root.toast) root.toast(m); };
  let following = null, followFailed = false, loadingList = false, draftCode = '';
  const peeks = new Map();                         // code -> { at, info }   info null = host removed it
  let cur = null;                                  // the tournament being watched right now
  const signedIn = () => !!(root.Sync && Sync.active() && root.Cloud);
  const isFollowing = code => !!(following && following.some(f => f.code === code));

  /* ---------- Following list ---------- */
  function statusText(code) {
    const p = peeks.get(code);
    if (!p) return 'Checking...';
    if (p.info === null) return 'Removed by the host';
    if (!p.info) return '';
    return p.info.status === 'finished' ? 'Winner: ' + esc(p.info.championName || 'not recorded') : 'In progress';
  }
  function followingHtml() {
    if (following === null) return '<p class="empty glass">Loading...</p>';
    if (!following.length) return `<p class="empty glass">${followFailed ? 'Could not load your list. Check your connection.' : 'Tournaments you follow appear here, so you never need to type a code twice.'}</p>`;
    return `<div class="grid">${following.map(f => `<div class="tcard glass follow ${(peeks.get(f.code) || {}).info && peeks.get(f.code).info.status === 'finished' ? 'done' : ''}">
      <a href="#/watch/${esc(f.code)}"><h3>${esc(f.name)}</h3><p>${esc(f.game)}, hosted by ${esc(f.ownerName || 'someone')}</p><p>${statusText(f.code)}</p></a>
      <button type="button" class="link unf" data-unf="${esc(f.code)}">Unfollow</button></div>`).join('')}</div>`;
  }
  function paint() { const el = document.getElementById('following'); if (el) el.innerHTML = followingHtml(); }

  async function loadFollowing() {
    if (loadingList || !signedIn()) return;
    loadingList = true;
    try { following = await Cloud.loadFollowing(); followFailed = false; }
    catch (e) { console.warn('Arena: could not load following', e); followFailed = true; if (following === null) following = []; }
    loadingList = false;
    paint(); if (cur) draw();
    const stale = following.filter(f => !peeks.has(f.code) || Date.now() - peeks.get(f.code).at > 60000).slice(0, 20);
    await Promise.allSettled(stale.map(f => Cloud.peekTournament(f.code)
      .then(info => peeks.set(f.code, { at: Date.now(), info }))
      .catch(() => peeks.set(f.code, { at: Date.now(), info: undefined }))));
    paint();
  }

  function homeHtml() {
    if (!signedIn()) return '';
    return `<section class="watch"><h2>Watch a tournament</h2>
      <form id="codeForm" class="codeform glass" autocomplete="off">
        <label for="codeIn">Enter the share code from the host</label>
        <div class="codeline"><input id="codeIn" type="text" maxlength="9" autocapitalize="characters" spellcheck="false" placeholder="e.g. K7M2QX" value="${esc(draftCode)}">
          <button class="btn primary">Watch</button></div>
        <p id="codeErr" class="err" role="alert"></p>
      </form>
      <h3 class="gh">Following</h3><div id="following">${followingHtml()}</div></section>`;
  }

  function bindHome(view) {
    const form = view.querySelector('#codeForm'); if (!form) return;
    const input = form.querySelector('#codeIn'), err = form.querySelector('#codeErr');
    input.addEventListener('input', () => { draftCode = input.value; err.textContent = ''; });
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const code = Cloud.normCode(input.value);
      if (!Cloud.validCode(code)) { err.textContent = Cloud.friendly({ code: 'app/bad-code' }); return; }
      draftCode = ''; location.hash = '#/watch/' + code;
    });
    view.querySelector('#following').addEventListener('click', async ev => {
      const b = ev.target.closest('[data-unf]'); if (!b) return;
      b.disabled = true;
      try { await Cloud.unfollow(b.dataset.unf); following = following.filter(f => f.code !== b.dataset.unf); paint(); toast('Unfollowed.'); }
      catch (e) { b.disabled = false; toast(Cloud.friendly(e)); }
    });
    loadFollowing();
  }

  /* ---------- Live page ---------- */
  function leave() { if (cur) { try { if (cur.unsub) cur.unsub(); } catch (e) {} cur = null; } }

  function render(el, raw) {
    if (!signedIn()) { el.innerHTML = notice('Log in to watch', 'You need to be online and logged in to follow a tournament.'); return; }
    const code = Cloud.normCode(raw);
    if (!Cloud.validCode(code)) { leave(); el.innerHTML = notice('That code does not look right', 'Share codes have 6 letters and numbers.'); el.onclick = null; return; }
    if (Store.get().tournaments.some(t => t.id === code)) { location.replace('#/t/' + code); return; }   // your own tournament: open it normally
    if (cur && cur.code === code) { cur.view = el; draw(); return; }                                  // already watching: just redraw
    leave();
    const me = cur = { code, view: el, state: 'loading', data: null, meta: null, err: null, unsub: null };
    draw();
    if (following === null) loadFollowing();
    me.unsub = Cloud.watchTournament(code, (t, meta) => {
      if (cur !== me) return;
      if (!t) { me.state = 'missing'; me.data = null; } else { me.state = 'ok'; me.data = t; me.meta = meta; }
      draw();
    }, e => { if (cur !== me) return; console.warn('Arena: watch failed', e); me.state = 'error'; me.err = e; draw(); });
  }

  const notice = (title, text, extra) => `<section><h2>${esc(title)}</h2><p class="empty glass">${esc(text)}</p>${extra || ''}<p><a href="#/">Back to home</a></p></section>`;

  function banner() {
    const m = cur.meta || {}, done = m.status === 'finished', f = isFollowing(cur.code);
    return `<div class="watchbar glass">
      <div><span class="live ${done ? 'done' : ''}"><i></i>${done ? 'Finished' : 'Live'}</span>
        <span class="mute small">Hosted by ${esc(m.ownerName || 'someone')}. View only, updates by itself.</span></div>
      <div class="row"><b class="code">${esc(cur.code)}</b>
        ${f ? '<span class="mute small">&#10003; Following</span><button type="button" class="btn sm" data-act="unfollow">Unfollow</button>'
            : '<button type="button" class="btn sm primary" data-act="follow">Follow</button>'}</div></div>`;
  }

  function draw() {
    if (!cur) return;
    const v = cur.view;
    if (cur.state === 'ok') { Tournament.show(v, cur.data, { banner: banner(), onAct }); return; }
    v.onclick = ev => { const a = ev.target.closest('[data-act]'); if (a) onAct(a.dataset.act); };
    if (cur.state === 'loading') v.innerHTML = notice('Opening tournament...', 'Connecting to ' + cur.code + '.');
    else if (cur.state === 'missing') v.innerHTML = notice('Tournament not found', 'No tournament has the code ' + cur.code + '. Check it with the host. If you followed it before, the host may have deleted it.',
      isFollowing(cur.code) ? '<p><button type="button" class="btn" data-act="unfollow">Remove from Following</button></p>' : '');
    else v.innerHTML = notice('Could not open it', Cloud.friendly(cur.err), '<p><button type="button" class="btn primary" data-act="retry">Try again</button></p>');
  }

  async function onAct(act) {
    if (!cur) return;
    const code = cur.code;
    try {
      if (act === 'retry') { const el = cur.view; leave(); render(el, code); return; }
      if (act === 'follow' && cur.data) {
        const info = { name: cur.data.name, game: cur.data.game, ownerName: (cur.meta && cur.meta.ownerName) || '' };
        await Cloud.follow(code, info);
        following = [Object.assign({ code, followedAt: Date.now() }, info)].concat((following || []).filter(f => f.code !== code));
        toast('Following. It is on your home screen now.');
      } else if (act === 'unfollow') {
        await Cloud.unfollow(code);
        following = (following || []).filter(f => f.code !== code);
        toast('Unfollowed.');
      }
      draw();
    } catch (e) { toast(Cloud.friendly(e)); }
  }

  root.Spectate = { homeHtml, bindHome, render, leave };
})(window);
