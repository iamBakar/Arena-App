/* ==========================================================
   auth.js - log in / create account / reset password screens.
   ========================================================== */
(function (root) {
  'use strict';
  const AV = ['⚽', '🥊', '🏏', '🎮', '🏆', '🔥'];
  let current = null;

  const avatars = () => `<fieldset><legend>Pick an icon</legend><div class="avs">${AV.map((a, i) =>
    `<label><input type="radio" name="av" value="${a}" ${i === 0 ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div></fieldset>`;
  const userField = () => `<label class="field">Username<input type="text" name="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}"
    title="3 to 20 letters, numbers or underscores" autocomplete="username" autocapitalize="none" required></label>
    <p class="mute small">This is the name others see. Letters, numbers and underscores only.</p>`;
  const emailField = () => '<label class="field">Email<input type="email" name="email" autocomplete="email" required></label>';
  const err = '<p id="aerr" class="err" role="alert"></p>';

  const FORMS = {
    login: () => `<h2>Log in</h2><p class="mute">Welcome back. Log in to open your tournaments.</p>${emailField()}
      <label class="field">Password<input type="password" name="password" autocomplete="current-password" required></label>${err}
      <div class="row"><button class="btn primary">Log in</button></div>
      <p class="alt"><a href="#/reset">Forgot password?</a><a href="#/signup">Create account</a></p>`,
    signup: () => `<h2>Create account</h2><p class="mute">One account works for hosting tournaments and following them.</p>
      ${userField()}${emailField()}
      <label class="field">Password<input type="password" name="password" minlength="6" autocomplete="new-password" required></label>
      <p class="mute small">At least 6 characters.</p>${avatars()}${err}
      <div class="row"><button class="btn primary">Create account</button></div>
      <p class="alt"><a href="#/login">I already have an account</a></p>`,
    reset: () => `<h2>Reset password</h2><p class="mute">Enter your email and we will send you a link to choose a new password.</p>${emailField()}${err}
      <div class="row"><button class="btn primary">Send reset link</button></div>
      <p class="alt"><a href="#/login">Back to log in</a></p>`,
    profile: () => `<h2>Choose a username</h2><p class="mute">Your account is ready. Pick the name others will see.</p>
      ${userField()}${avatars()}${err}
      <div class="row"><button class="btn primary">Finish</button><button type="button" class="btn" id="alogout">Log out</button></div>`
  };

  function render(view, hash) {
    const mode = hash === '#/signup' ? 'signup' : hash === '#/reset' ? 'reset' : hash === '#/profile' ? 'profile' : 'login';
    if (current === mode && view.querySelector('.authcard')) return;   // keep what the person has typed
    current = mode;
    view.innerHTML = `<section class="authwrap"><div class="panel glass authcard"><div class="authbrand">ARENA</div>
      <form id="af">${FORMS[mode]()}</form></div></section>`;
    const form = document.getElementById('af');
    const out = document.getElementById('alogout'); if (out) out.addEventListener('click', () => Cloud.logOut());
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = new FormData(form), msg = document.getElementById('aerr'), btn = form.querySelector('button.primary');
      msg.textContent = ''; msg.classList.remove('okmsg'); btn.disabled = true;
      try {
        if (mode === 'login') await Cloud.logIn(f.get('email'), f.get('password'));
        else if (mode === 'signup') await Cloud.signUp(f.get('email'), f.get('password'), f.get('username'), f.get('av') || AV[0]);
        else if (mode === 'profile') await Cloud.claimProfile(f.get('username'), f.get('av') || AV[0]);
        else { await Cloud.resetPassword(f.get('email')); msg.classList.add('okmsg'); msg.textContent = 'If that email has an account, a reset link is on its way. Check your spam folder too.'; }
      } catch (e) { msg.textContent = Cloud.friendly(e); }
      btn.disabled = false;
    });
  }
  root.Auth = { render };
})(window);
