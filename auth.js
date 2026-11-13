/* ==========================================================
   auth.js - log in / create account / verify email / reset password screens.
   ========================================================== */
(function (root) {
  'use strict';
  const AV = ['⚽', '🥊', '🏏', '🎮', '🏆', '🔥'];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = 'viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const EYE = `<svg ${ICON}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
  const EYE_OFF = `<svg ${ICON}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  let current = null;

  const avatars = () => `<fieldset><legend>Pick an icon</legend><div class="avs">${AV.map((a, i) =>
    `<label><input type="radio" name="av" value="${a}" ${i === 0 ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div></fieldset>`;
  const userField = () => `<label class="field">Username<input type="text" name="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}"
    title="3 to 20 letters, numbers or underscores" autocomplete="username" autocapitalize="none" required></label>
    <p class="mute small">This is the name others see. Letters, numbers and underscores only.</p>`;
  const emailField = () => '<label class="field">Email<input type="email" name="email" autocomplete="email" required></label>';
  const pwField = (auto, min) => `<label class="field">Password<span class="pw"><input type="password" name="password" ${min ? 'minlength="6"' : ''} autocomplete="${auto}" required>
    <button type="button" class="eye" aria-label="Show password" aria-pressed="false">${EYE}</button></span></label>`;
  const err = '<p id="aerr" class="err" role="alert"></p>';

  const FORMS = {
    login: () => `<h2>Log in</h2><p class="mute">Welcome back. Log in to open your tournaments.</p>${emailField()}${pwField('current-password')}${err}
      <div class="row"><button class="btn primary">Log in</button></div>
      <p class="alt"><a href="#/reset">Forgot password?</a><a href="#/signup">Create account</a></p>`,
    signup: () => `<h2>Create account</h2><p class="mute">One account works for hosting tournaments and following them.</p>
      ${userField()}${emailField()}${pwField('new-password', true)}
      <p class="mute small">At least 6 characters. You will need to verify your email before you can use the app.</p>${avatars()}${err}
      <div class="row"><button class="btn primary">Create account</button></div>
      <p class="alt"><a href="#/login">I already have an account</a></p>`,
    reset: () => `<h2>Reset password</h2><p class="mute">Enter your email and we will send you a link to choose a new password.</p>${emailField()}${err}
      <div class="row"><button class="btn primary">Send reset link</button></div>
      <p class="alt"><a href="#/login">Back to log in</a></p>`,
    verify: ctx => `<h2>Verify your email</h2><p>We sent a link to <b>${esc(ctx.email || 'your email')}</b>. Open it, then come back here.</p>
      <p class="mute small">The email can take a minute and may be in your spam folder.</p>${err}
      <div class="row"><button type="button" class="btn primary" id="acheck">I have verified</button>
      <button type="button" class="btn" id="aresend">Send again</button><button type="button" class="btn" id="alogout">Log out</button></div>`,
    profile: () => `<h2>Choose a username</h2><p class="mute">Your email is verified. Pick the name others will see.</p>
      ${userField()}${avatars()}<p id="aerr" class="err" role="alert">${esc((root.Cloud && Cloud.note && Cloud.note()) || '')}</p>
      <div class="row"><button class="btn primary">Finish</button><button type="button" class="btn" id="alogout">Log out</button></div>`
  };

  function render(view, hash, ctx) {
    ctx = ctx || {};
    const mode = { '#/signup': 'signup', '#/reset': 'reset', '#/profile': 'profile', '#/verify': 'verify' }[hash] || 'login';
    if (current === mode && view.querySelector('.authcard')) return;      // keep what the person has typed
    current = mode;
    view.innerHTML = `<section class="authwrap"><div class="panel glass authcard"><div class="authbrand">ARENA</div>
      <form id="af">${FORMS[mode](ctx)}</form></div></section>`;
    const form = document.getElementById('af'), msg = () => document.getElementById('aerr');

    form.querySelectorAll('.eye').forEach(b => b.addEventListener('click', () => {
      const input = b.previousElementSibling, show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.innerHTML = show ? EYE_OFF : EYE; b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }));
    const out = document.getElementById('alogout'); if (out) out.addEventListener('click', () => Cloud.logOut());

    if (mode === 'verify') {
      const chk = document.getElementById('acheck'), rs = document.getElementById('aresend');
      chk.addEventListener('click', async () => {
        msg().className = 'err'; msg().textContent = ''; chk.disabled = true;
        try { if (!(await Cloud.checkVerified())) msg().textContent = 'Not verified yet. Open the link in the email first, then try again.'; }
        catch (e) { msg().textContent = Cloud.friendly(e); }
        chk.disabled = false;
      });
      rs.addEventListener('click', async () => {
        rs.disabled = true; msg().className = 'err';
        try { await Cloud.resendVerification(); msg().classList.add('okmsg'); msg().textContent = 'Email sent again. Check your spam folder too.'; setTimeout(() => { rs.disabled = false; }, 30000); }
        catch (e) { msg().textContent = Cloud.friendly(e); rs.disabled = false; }
      });
      return;
    }
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = new FormData(form), btn = form.querySelector('button.primary');
      msg().textContent = ''; msg().classList.remove('okmsg'); btn.disabled = true;
      try {
        if (mode === 'login') await Cloud.logIn(f.get('email'), f.get('password'));
        else if (mode === 'signup') await Cloud.signUp(f.get('email'), f.get('password'), f.get('username'), f.get('av') || AV[0]);
        else if (mode === 'profile') await Cloud.claimProfile(f.get('username'), f.get('av') || AV[0]);
        else { await Cloud.resetPassword(f.get('email')); msg().classList.add('okmsg'); msg().textContent = 'If that email has an account, a reset link is on its way. Check your spam folder too.'; }
      } catch (e) { msg().textContent = Cloud.friendly(e); }
      btn.disabled = false;
    });
  }
  root.Auth = { render };
})(window);
