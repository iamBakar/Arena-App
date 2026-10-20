/* ==========================================================
   setup.js - "New tournament" wizard (4 steps).
   Game > Players > Format > Review & start
   ========================================================== */
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const GAMES = {
    fc:      { label: 'FC 27',      sport: 'football', hint: 'Goals scored. 3 points for a win.' },
    tekken:  { label: 'Tekken 8',   sport: 'tekken',   hint: 'Rounds won. A win is all that counts.' },
    cricket: { label: 'Cricket',    sport: 'cricket',  hint: 'Runs and overs. 2 points for a win.' },
    other:   { label: 'Other game', sport: null,       hint: 'Type its name and pick how it is scored.' }
  };
  const TYPES = { football: 'Goals (football style)', cricket: 'Runs and overs (cricket style)', tekken: 'Rounds, no draws (fighting style)' };
  const STEPS = ['Game', 'Players', 'Format', 'Review'];

  let draft = null, view = null;
  const fresh = () => ({ step: 0, name: '', game: 'fc', customName: '', customType: 'football', text: '', seeding: 'random',
    format: 'league', repeats: 1, groupCount: 2, q: null, two: false, third: false, points: null, maxOvers: 20 });

  const sportOf = d => GAMES[d.game].sport || d.customType;
  const gameName = d => d.game === 'other' ? (d.customName.trim() || 'Custom game') : GAMES[d.game].label;
  const names = d => d.text.split('\n').map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const points = d => d.points || Object.assign({}, Core.SPORTS[sportOf(d)].points);

  /* ---------- Qualifier options for the chosen format ---------- */
  function qOpts(d, n) {
    if (d.format === 'league') return Core.qualifierOptions([n]);
    if (d.format === 'groups') {
      const sizes = Core.splitGroups(Array.from({ length: n }, (_, i) => i), d.groupCount).map(g => g.length);
      return Core.qualifierOptions(sizes);
    }
    return [];
  }
  const chosenQ = (d, n) => { const o = qOpts(d, n); return o.find(x => x.perGroup + ':' + x.extra === d.q) || o[0] || null; };
  const koTeams = (d, n) => d.format === 'knockout' ? n : (chosenQ(d, n) || { total: 0 }).total;

  /* ---------- Small html helpers ---------- */
  const opt = (name, val, title, desc, checked, off) =>
    `<label class="opt"><input type="radio" name="${name}" value="${val}" ${checked ? 'checked' : ''} ${off ? 'disabled' : ''}><span><b>${title}</b><small>${desc}</small></span></label>`;
  const check = (name, label, checked) => `<label class="tick"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> ${label}</label>`;

  /* ---------- Steps ---------- */
  function stepGame(d) {
    return `<h2>Choose the game</h2>
      <div class="opts">${Object.entries(GAMES).map(([k, g]) => opt('game', k, g.label, g.hint, d.game === k)).join('')}</div>
      ${d.game === 'other' ? `
        <label class="field">Game name<input type="text" name="customName" maxlength="30" value="${esc(d.customName)}" autocomplete="off"></label>
        <label class="field">How is it scored?<select name="customType">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${d.customType === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      <label class="field">Tournament name (optional)<input type="text" name="tname" maxlength="40" placeholder="e.g. Friday night cup" value="${esc(d.name)}" autocomplete="off"></label>`;
  }

  function stepPlayers(d) {
    return `<h2>Add players or teams</h2>
      <p class="mute">Type one name per line. For FC you can enter the player, or the club they use.</p>
      <label class="field">Names<textarea name="text" rows="9" placeholder="Ali&#10;Hamza&#10;Sara">${esc(d.text)}</textarea></label>
      <p class="mute"><span id="cnt">${names(d).length}</span> added</p>
      <div class="opts two">${opt('seeding', 'random', 'Random draw', 'Shuffle before building fixtures.', d.seeding === 'random')}
        ${opt('seeding', 'order', 'Keep my order', 'First name is the top seed and gets byes first.', d.seeding === 'order')}</div>`;
  }

  function stepFormat(d) {
    const n = names(d).length, sport = sportOf(d), S = Core.SPORTS[sport];
    if (d.format === 'groups' && n < 6) d.format = 'league';
    const gc = Core.groupCountOptions(n);
    if (gc.length && !gc.includes(d.groupCount)) d.groupCount = gc[0];
    const q = chosenQ(d, n), kt = koTeams(d, n), p = points(d);

    let extra = '';
    if (d.format === 'league' || d.format === 'groups') {
      if (d.format === 'groups')
        extra += `<label class="field">Number of groups<select name="groupCount">${gc.map(g => `<option ${g === d.groupCount ? 'selected' : ''}>${g}</option>`).join('')}</select></label>`;
      extra += `<div class="field">Meetings per pair<div class="opts three">${[1, 2, 3].map(r => opt('repeats', r, r + 'x', r === 1 ? 'Single round' : r === 2 ? 'Home and away' : 'Three rounds', d.repeats === r)).join('')}</div></div>`;
      extra += `<label class="field">${d.format === 'league' ? 'After the league' : 'Who goes through to the knockout'}<select name="q">${qOpts(d, n).map(o =>
        `<option value="${o.perGroup}:${o.extra}" ${o === q ? 'selected' : ''}>${o.label}</option>`).join('')}</select></label>`;
    }
    if (kt >= 4) {
      extra += `<div class="field">Knockout options${S.allowLegs ? check('two', 'Two legs in the semi-finals (home and away, final stays one match)', d.two) : ''}
        ${check('third', 'Play a third-place match', d.third)}</div>`;
    }
    const scoring = `<div class="field">Points<div class="pts">
      <label>Win<input type="number" name="pw" min="0" max="9" value="${p.win}"></label>
      ${S.hasDraw ? `<label>${sport === 'cricket' ? 'Tie / no result' : 'Draw'}<input type="number" name="pd" min="0" max="9" value="${p.draw}"></label>` : ''}
      <label>Loss<input type="number" name="pl" min="0" max="9" value="${p.loss}"></label>
      ${sport === 'cricket' ? `<label>Overs per innings<input type="number" name="mo" min="1" max="100" value="${d.maxOvers}"></label>` : ''}
    </div></div>`;

    return `<h2>Pick the format</h2><p class="mute">${n} ${n === 1 ? 'entry' : 'entries'} added.</p>
      <div class="opts">${opt('format', 'league', 'League', 'Everyone plays everyone. Top of the table wins, or the best go to playoffs.', d.format === 'league')}
        ${opt('format', 'knockout', 'Knockout', 'Lose and you are out. Byes keep odd numbers fair.', d.format === 'knockout')}
        ${opt('format', 'groups', 'Groups + knockout', n < 6 ? 'Needs at least 6 entries.' : 'Group stage first, then a knockout.', d.format === 'groups', n < 6)}</div>
      ${extra}${scoring}`;
  }

  function matchText(d, n) {
    if (d.format === 'knockout') return (n - 1) + ' knockout matches';
    const sizes = d.format === 'league' ? [n] : Core.splitGroups(Array.from({ length: n }, (_, i) => i), d.groupCount).map(g => g.length);
    return sizes.reduce((s, x) => s + x * (x - 1) / 2, 0) * d.repeats + ' ' + (d.format === 'league' ? 'league' : 'group') + ' matches';
  }

  function stepReview(d) {
    const n = names(d).length, sport = sportOf(d), p = points(d), q = chosenQ(d, n), kt = koTeams(d, n);
    const v = Core.validateSetup({ count: n, format: d.format, groups: d.groupCount });
    const fmt = { league: 'League', knockout: 'Knockout', groups: 'Groups + knockout' }[d.format];
    const rows = [
      ['Game', esc(gameName(d)) + ' (' + Core.SPORTS[sport].label + ' rules)'],
      ['Name', esc(d.name.trim() || gameName(d) + ' tournament')],
      ['Entries', n + ', ' + (d.seeding === 'random' ? 'random draw' : 'in your order')],
      ['Format', fmt + (d.format !== 'knockout' ? ', ' + d.repeats + 'x' : '') + (d.format === 'groups' ? ', ' + d.groupCount + ' groups' : '')],
      ['Fixtures', matchText(d, n)]
    ];
    if (q && q.total) rows.push([d.format === 'league' ? 'Playoffs' : 'Advance', esc(q.label)]);
    if (kt >= 4) rows.push(['Knockout', (d.two && Core.SPORTS[sport].allowLegs ? 'Two-leg semis' : 'Single matches') + (d.third ? ', third-place match' : '')]);
    rows.push(['Points', 'Win ' + p.win + (Core.SPORTS[sport].hasDraw ? ', draw ' + p.draw : '') + ', loss ' + p.loss + (sport === 'cricket' ? ', ' + d.maxOvers + ' overs' : '')]);
    return `<h2>Ready to start?</h2>
      <dl class="sum">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[1]}</dd>`).join('')}</dl>
      ${v.warnings.map(w => `<p class="note">${esc(w)}</p>`).join('')}`;
  }

  /* ---------- Validation per step ---------- */
  function validate(d) {
    if (d.step === 0 && d.game === 'other' && !d.customName.trim()) return 'Type a name for the game.';
    const ns = names(d);
    if (d.step === 1) {
      if (ns.length < 2) return 'Add at least 2 players or teams.';
      if (ns.length > 64) return 'The limit is 64 entries.';
      const seen = new Set();
      for (const x of ns) { const k = x.toLowerCase(); if (seen.has(k)) return 'The name "' + x + '" is used twice. Make each name different.'; seen.add(k); }
    }
    if (d.step === 2) {
      const v = Core.validateSetup({ count: ns.length, format: d.format, groups: d.groupCount });
      if (!v.ok) return v.errors[0];
      const p = points(d);
      if (![p.win, p.draw, p.loss].every(x => Number.isInteger(x) && x >= 0)) return 'Points must be whole numbers, 0 or higher.';
      if (p.win <= p.loss) return 'A win must be worth more points than a loss.';
      if (!Number.isInteger(d.maxOvers) || d.maxOvers < 1 || d.maxOvers > 100) return 'Overs per innings must be between 1 and 100.';
    }
    return null;
  }

  /* ---------- Create the tournament ---------- */
  function start() {
    const d = draft, ns = names(d), sport = sportOf(d), n = ns.length;
    const players = ns.map((name, i) => ({ id: 'p' + (i + 1), name }));
    const order = players.map(p => p.id);
    const seeds = d.seeding === 'random' ? Core.shuffle(order) : order;
    const q = chosenQ(d, n), kt = koTeams(d, n);
    const koOpts = { twoLegSemis: !!(d.two && kt >= 4 && Core.SPORTS[sport].allowLegs), thirdPlace: !!(d.third && kt >= 4) };
    const t = {
      id: Store.uid(), name: d.name.trim() || gameName(d) + ' tournament', game: gameName(d), sport, format: d.format,
      status: 'running', createdAt: Date.now(), players, championName: null, groups: [], ko: null,
      settings: { repeats: d.format === 'knockout' ? 1 : d.repeats, groupCount: d.groupCount, qualifier: q && q.total ? q : null,
        koOpts, points: points(d), maxOvers: d.maxOvers, seeding: d.seeding }
    };
    if (d.format === 'league') { t.groups = Core.buildLeague(seeds, d.repeats).groups; t.stage = 'league'; }
    else if (d.format === 'groups') { t.groups = Core.buildGroups(seeds, d.groupCount, d.repeats).groups; t.stage = 'groups'; }
    else { t.ko = Core.buildKnockout(seeds, koOpts); t.stage = 'knockout'; }
    draft = null;
    location.hash = '#/t/' + t.id;           // set first so the store refresh lands on the right page
    Store.commit(s => { s.tournaments.unshift(t); });
  }

  /* ---------- Render + events ---------- */
  function render(toTop) {
    const d = draft, y = window.scrollY, last = d.step === 3;
    view.innerHTML = `
      <section class="wiz">
        <ol class="steps">${STEPS.map((s, i) => `<li class="${i === d.step ? 'on' : i < d.step ? 'done' : ''}"><i>${i + 1}</i>${s}</li>`).join('')}</ol>
        <div class="panel glass">
          ${[stepGame, stepPlayers, stepFormat, stepReview][d.step](d)}
          <p id="err" class="err" role="alert"></p>
          <div class="row">
            ${d.step > 0 ? '<button type="button" class="btn" data-act="back">Back</button>' : '<button type="button" class="btn" data-act="cancel">Cancel</button>'}
            <button type="button" class="btn primary" data-act="${last ? 'start' : 'next'}">${last ? 'Start tournament' : 'Continue'}</button>
          </div>
        </div>
      </section>`;
    window.scrollTo(0, toTop ? 0 : y);
  }

  const PKEY = { pw: 'win', pd: 'draw', pl: 'loss' };
  function bind() {
    view.oninput = e => {
      const t = e.target;
      if (t.name === 'tname') draft.name = t.value;
      else if (t.name === 'customName') draft.customName = t.value;
      else if (t.name === 'text') { draft.text = t.value; $('#cnt').textContent = names(draft).length; }
    };
    view.onchange = e => {
      const t = e.target, n = t.name, v = t.value;
      if (n === 'game') { draft.game = v; draft.points = null; return render(); }
      if (n === 'customType') { draft.customType = v; draft.points = null; return render(); }
      if (n === 'format') { draft.format = v; draft.q = null; return render(); }
      if (n === 'groupCount') { draft.groupCount = +v; draft.q = null; return render(); }
      if (n === 'q') { draft.q = v; return render(); }
      if (n === 'seeding') draft.seeding = v;
      else if (n === 'repeats') draft.repeats = +v;
      else if (n === 'two') draft.two = t.checked;
      else if (n === 'third') draft.third = t.checked;
      else if (n === 'mo') draft.maxOvers = parseInt(v, 10);
      else if (PKEY[n]) draft.points = Object.assign(points(draft), { [PKEY[n]]: parseInt(v, 10) });
    };
    view.onclick = e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'cancel') { draft = null; location.hash = '#/'; }
      else if (act === 'back') { draft.step--; render(true); }
      else if (act === 'next') {
        const err = validate(draft);
        if (err) $('#err').textContent = err; else { draft.step++; render(true); }
      } else if (act === 'start') start();
    };
  }

  root.Setup = { render(el) { view = el; if (!draft) draft = fresh(); bind(); render(true); } };
})(window);
