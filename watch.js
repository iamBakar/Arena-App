/* ==========================================================
   watch.js - view-only live page for a tournament opened with a code (#/v/CODE).
   ========================================================== */
(function (root) {
  'use strict';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cur = null, unsub = null, data = null, state = 'loading', err = '', el = null, following = [];
  const auto = {};                                                          // codes already auto-followed this session
  const isFollowing = code => following.some(f => f.code === code);
  const info = () => ({ name: data.name, game: data.game, ownerName: data.ownerName });

  function stop() { if (unsub) unsub(); unsub = null; cur = null; data = null; }

  function onData(d, code) {
    if (cur !== code) return;
    data = d; state = d ? 'ok' : 'missing';
    const me = root.Sync && Sync.uid();
    if (d && !isFollowing(code) && !auto[code] && d.ownerId !== me) {      // entering a code follows it, so it is saved for next time
      auto[code] = true;
      Cloud.follow(code, info()).then(() => Cloud.track('join_tournament')).catch(() => {});
    }
    paint();
  }
  function onErr(e, code) { if (cur !== code) return; console.error('[Arena watch]', e); state = 'error'; err = Cloud.friendly(e); paint(); }

  function toggle() {
    if (!data || !cur) return;
    (isFollowing(cur) ? Cloud.unfollow(cur) : Cloud.follow(cur, info())).catch(() => {});
  }

  const card = body => `<section class="authwrap"><div class="panel glass authcard">${body}<p><a href="#/">Back to home</a></p></div></section>`;
  function paint() {
    if (!el || !cur) return;
    if (state === 'loading') { el.innerHTML = card('<h2>Opening tournament</h2><p class="mute">One moment...</p>'); return; }
    if (state === 'error') { el.innerHTML = card(`<h2>Could not open it</h2><p class="err">${esc(err)}</p>`); return; }
    if (state === 'missing') {
      el.innerHTML = card(`<h2>Tournament not found</h2><p class="mute">There is no tournament with the code <b>${esc(cur)}</b>. Check the code with the host, or it may have been deleted.</p>
        ${isFollowing(cur) ? '<div class="row"><button type="button" class="btn" id="rmfollow">Remove from my list</button></div>' : ''}`);
      const b = document.getElementById('rmfollow'); if (b) b.addEventListener('click', () => Cloud.unfollow(cur).catch(() => {}));
      return;
    }
    if (root.Sync && data.ownerId === Sync.uid() && location.hash !== '#/t/' + cur) { location.replace('#/t/' + cur); return; }   // your own: open the editable page
    Tournament.render(el, cur, data.t, { ownerName: data.ownerName, following: isFollowing(cur), toggle });
  }

  function render(view, code) {
    code = String(code).toUpperCase(); el = view;
    if (cur !== code) {
      stop(); cur = code; state = 'loading'; data = null;
      unsub = Cloud.watchTournament(code, d => onData(d, code), e => onErr(e, code));
    }
    paint();
  }
  function setFollowing(list) { following = list || []; paint(); }
  root.Watch = { render, stop, setFollowing };
})(window);
