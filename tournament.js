/* ==========================================================
   tournament.js - tournament page: fixtures + result entry.
   ========================================================== */
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dlg = $('#dlg');
  let t = null, view = null, opened = {}, tab = 'fixtures', curId = null, ro = false, meta = {};

  const nm = id => { const p = t.players.find(x => x.id === id); return p ? p.name : 'To be decided'; };
  const e = id => esc(nm(id));
  const rules = () => ({ points: t.settings.points, maxOvers: t.settings.maxOvers });
  const koList = () => t.ko ? t.ko.rounds.flat().concat(t.ko.third ? [t.ko.third] : []) : [];
  const allGroup = () => t.groups.flatMap(g => g.matches);
  const isKoId = id => /^(K|TP)/.test(id);
  const findMatch = id => allGroup().concat(koList()).find(m => m.id === id);
  const isDone = m => (isKoId(m.id) ? !!m.winner : !!m.result);
  const tiebreak = () => Core.SPORTS[t.sport].koTiebreak || 'decider game';

  /* ---------- Keep status/champion in step with the results ---------- */
  function sync() {
    if (t.stage === 'knockout' && t.ko) {
      if (t.ko.champion) {
        t.championName = nm(t.ko.champion);
        t.status = (!t.ko.third || t.ko.third.winner) ? 'finished' : 'running';
      } else { t.championName = null; t.status = 'running'; }
    } else if (t.stage === 'league' && !t.settings.qualifier) {
      if (Engine.isStageDone(t.groups)) { t.championName = nm(Engine.leagueWinner(t.sport, t.groups[0], rules())); t.status = 'finished'; }
      else { t.championName = null; t.status = 'running'; }
    }
  }

  /* ---------- Result text ---------- */
  function resText(m) {
    const r = m.result; if (!r) return '';
    if (t.sport === 'cricket') {
      if (r.winner === 'nr') return 'No result';
      const base = r.a.runs + ' v ' + r.b.runs;
      return esc(r.winner === 'tie' ? base + ', tie' : base + ', ' + nm(r.winner === 'a' ? m.a : m.b) + ' won');
    }
    let s = r.legs ? r.legs.map(l => l.a + '-' + l.b).join(', ') : r.a + ' - ' + r.b;
    if (r.legs && r.legs.length === 2) s += ' (agg ' + (r.legs[0].a + r.legs[1].a) + '-' + (r.legs[0].b + r.legs[1].b) + ')';
    if (r.decider) s += ', ' + tiebreak() + ': ' + nm(r.decider === 'a' ? m.a : m.b);
    return esc(s);
  }

  /* ---------- Rows ---------- */
  function row(m, locked) {
    if (m.bye) return `<div class="mrow bye"><span class="tm a">${e(m.winner)}</span><span class="vs">advances (bye)</span></div>`;
    const done = isDone(m), ready = m.a && m.b;
    const mid = m.result ? `<b class="score">${resText(m)}</b>` : '<span class="vs">vs</span>';
    const label = done ? 'Edit' : (m.result ? 'Enter leg 2' : 'Enter result');
    const btn = (ready && !locked && !ro) ? `<button class="btn sm" data-act="enter" data-id="${m.id}">${label}</button>` : '<span></span>';
    return `<div class="mrow ${done ? 'played' : ''}"><span class="tm a">${e(m.a)}</span>${mid}<span class="tm b">${e(m.b)}</span>${btn}</div>`;
  }

  function groupSection(g, locked) {
    const rounds = {};
    g.matches.forEach(m => (rounds[m.round] = rounds[m.round] || []).push(m));
    const cur = Object.keys(rounds).find(r => rounds[r].some(m => !m.result));
    const head = t.groups.length > 1 ? `<h3 class="gh">${esc(g.name)}</h3>` : '';
    return head + Object.keys(rounds).map(r => {
      const ms = rounds[r], key = (locked ? 'L' : '') + g.name + ':' + r;
      const open = opened[key] !== undefined ? opened[key] : r === cur && !locked;
      const rest = g.teams.filter(id => !ms.some(m => m.a === id || m.b === id));
      return `<details class="round" data-key="${esc(key)}" ${open ? 'open' : ''}>
        <summary>Round ${r}<span>${ms.filter(m => m.result).length}/${ms.length} played</span></summary>
        <div class="mlist">${ms.map(m => row(m, locked)).join('')}</div>
        ${rest.length ? `<p class="mute rest">Resting: ${rest.map(e).join(', ')}</p>` : ''}</details>`;
    }).join('');
  }

  function koSection() {
    const ko = t.ko;
    return ko.rounds.map(rd => `<h3 class="gh">${esc(rd[0].roundName)}${rd[0].legs === 2 ? ' (two legs)' : ''}</h3>
      <div class="mlist">${rd.map(m => row(m)).join('')}</div>`).join('') +
      (ko.third ? `<h3 class="gh">Third place</h3><div class="mlist">${row(ko.third)}</div>` : '');
  }

  /* ---------- Page ---------- */
  function nextUp() {
    const list = t.stage === 'knockout'
      ? koList().filter(m => !m.bye && !m.winner && m.a && m.b)
      : allGroup().slice().sort((x, y) => x.round - y.round).filter(m => !m.result);
    return list[0] || null;
  }

  function stagePanel() {
    if (ro) return '';
    const q = t.settings.qualifier;
    if (t.stage === 'knockout' || !q || !Engine.isStageDone(t.groups)) return '';
    const seeds = Core.pickQualifiers(t.sport, Engine.groupTables(t.sport, t.groups, rules()), q);
    return `<div class="panel glass go"><h3>${t.format === 'league' ? 'League complete' : 'Group stage complete'}</h3>
      <p>${esc(q.label)}. They enter the knockout in this order:</p>
      <ol class="qual">${seeds.map(id => `<li>${e(id)}</li>`).join('')}</ol>
      <button class="btn primary" data-act="start-ko">Start knockout</button></div>`;
  }

  // ext = a tournament opened from a code (read-only). Without it: one of your own tournaments (editable).
  function render(el, id, ext, m) {
    view = el; ro = !!ext; meta = m || {}; t = ext || Store.get().tournaments.find(x => x.id === id);
    if (curId !== id) { tab = 'fixtures'; curId = id; }
    if (!t) { view.innerHTML = '<section><h2>Tournament not found</h2><p><a href="#/">Back to home</a></p></section>'; return; }
    if ((tab === 'bracket' && !t.ko) || (tab === 'table' && !t.groups.length)) tab = 'fixtures';
    const fmt = { league: 'League', knockout: 'Knockout', groups: 'Groups + knockout' }[t.format];
    const ko = koList().filter(m => !m.bye), all = allGroup().concat(ko);
    const played = all.filter(isDone).length, pct = all.length ? Math.round(played / all.length * 100) : 0;
    const next = nextUp();

    let body = '';
    if (t.stage === 'knockout') {
      body = koSection();
      if (t.format !== 'knockout') body += `<details class="round" data-key="grp-results"><summary>Group stage results<span>locked</span></summary>
        ${t.groups.map(g => groupSection(g, true)).join('')}
        ${ro ? '<p class="mute rest">These results are locked.</p>' : '<p class="mute rest">These are locked because the knockout has started. <button class="link" data-act="reopen">Reopen the group stage</button> (this clears the knockout).</p>'}</details>`;
    } else body = t.groups.map(g => groupSection(g, false)).join('');

    const content = tab === 'table' ? tablesHtml() : tab === 'bracket' ? bracketHtml() : `<h2 class="fx">Fixtures</h2>${body}`;
    view.innerHTML = `<section class="tpage">
      <p><a href="#/">&larr; All tournaments</a></p>
      <h1 class="tt">${esc(t.name)}</h1>
      <p class="mute">${esc(t.game)}, ${fmt}, ${t.players.length} entries</p>
      ${topBar()}
      <p><button class="btn sm" data-act="pdf">Share as PDF</button></p>
      <div class="bar" aria-label="${pct}% played"><i style="width:${pct}%"></i></div>
      <p class="mute">${played} of ${all.length} matches played${t.stage === 'groups' || (t.stage === 'league' && t.settings.qualifier) ? ' (knockout matches are added later)' : ''}</p>
      ${t.championName ? `<div class="champ"><span>🏆</span><div><small>${t.status === 'finished' ? 'Champion' : 'Champion decided'}</small><b>${esc(t.championName)}</b></div></div>` : ''}
      ${stagePanel()}
      ${next && !t.championName || (next && t.stage === 'knockout') ? `<div class="panel glass next"><small>Next match</small>
        <div class="mrow"><span class="tm a">${e(next.a)}</span><span class="vs">vs</span><span class="tm b">${e(next.b)}</span>
        ${ro ? '' : '<button class="btn primary sm" data-act="enter" data-id="' + next.id + '">Enter result</button>'}</div>
        ${next.roundName ? `<p class="mute">${esc(next.roundName)}</p>` : ''}</div>` : ''}
      ${tabsHtml()}${content}
      ${ro ? '' : '<p class="danger"><button class="link" data-act="delete">Delete this tournament</button></p>'}</section>`;
    view.onclick = onClick;
  }

  /* ---------- Standings tables ---------- */
  const sg = n => (n > 0 ? '+' : '') + n;
  const TB_TEXT = {
    football: 'Ranked by points, goal difference, goals scored, then head-to-head.',
    cricket: 'Ranked by points, wins, net run rate (NRR), then head-to-head.',
    tekken: 'Ranked by wins, round difference, rounds won, then head-to-head. RF/RA = rounds for/against, RD = difference.'
  };
  function tablesHtml() {
    const tables = Engine.groupTables(t.sport, t.groups, rules()), q = t.settings.qualifier, S = t.sport;
    let hot = new Set(), legend = '';
    if (q) {
      hot = new Set(Core.pickQualifiers(S, tables, q));
      legend = 'Highlighted rows are in a qualifying place right now.' + (q.extra ? ' Best ' + (q.perGroup + 1) + (q.perGroup + 1 === 2 ? 'nd' : 'th') + '-placed teams are compared across groups by points per game.' : '');
    } else if (t.format === 'league') {
      if (tables[0][0] && tables[0][0].p) hot = new Set([tables[0][0].id]);
      legend = 'The table leader wins the league.';
    }
    const cols = S === 'football' ? [['P', 'p'], ['W', 'w'], ['D', 'd'], ['L', 'l'], ['GF', 'gf'], ['GA', 'ga'], ['GD', 'gd'], ['Pts', 'pts']]
      : S === 'cricket' ? [['P', 'p'], ['W', 'w'], ['L', 'l'], ['T/NR', 'd'], ['Pts', 'pts'], ['NRR', 'nrr']]
      : [['P', 'p'], ['W', 'w'], ['L', 'l'], ['RF', 'gf'], ['RA', 'ga'], ['RD', 'gd']];
    const fmt = (k, v) => k === 'gd' ? sg(v) : k === 'nrr' ? (v > 0 ? '+' : '') + v.toFixed(3) : v;
    return '<h2 class="fx">Table</h2>' + tables.map((tb, gi) => `
      ${t.groups.length > 1 ? `<h3 class="gh">${esc(t.groups[gi].name)}</h3>` : ''}
      <div class="tbl glass"><table><thead><tr><th>#</th><th class="nm">${S === 'tekken' || S === 'cricket' || S === 'football' ? 'Name' : ''}</th>${cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead>
      <tbody>${tb.map(r => `<tr class="${hot.has(r.id) ? 'q' : ''}"><td>${r.pos}</td><td class="nm">${e(r.id)}</td>${cols.map(c => `<td class="${c[1] === 'pts' ? 'pt' : ''}">${fmt(c[1], r[c[1]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('') +
      `<p class="mute note-s">${legend} ${TB_TEXT[S]}</p>`;
  }

  /* ---------- Bracket ---------- */
  function sideScore(m, k) {
    const r = m.result; if (!r) return '';
    let v;
    if (t.sport === 'cricket') v = r.winner === 'nr' || !r[k] ? '' : r[k].runs;
    else if (r.legs) v = r.legs.reduce((sum, l) => sum + l[k], 0);
    else v = r[k];
    return v + (r.decider === k ? '*' : '');
  }
  function bracketHtml() {
    const ko = t.ko;
    const side = (m, k) => { const id = m[k], win = m.winner && id && m.winner === id, lose = m.winner && id && m.winner !== id;
      return `<div class="bt ${win ? 'w' : ''} ${lose ? 'l' : ''}"><span>${id ? e(id) : 'To be decided'}</span><b>${sideScore(m, k)}</b></div>`; };
    const card = m => m.bye ? `<div class="bm"><div class="bt w"><span>${e(m.winner)}</span><b>bye</b></div></div>`
      : `<div class="bm">${side(m, 'a')}${side(m, 'b')}${m.legs === 2 ? '<small>two legs, aggregate</small>' : ''}</div>`;
    const cols = ko.rounds.map(rd => `<div class="bcol"><h3 class="gh">${esc(rd[0].roundName)}</h3>${rd.map(card).join('')}</div>`).join('');
    const champ = `<div class="bcol"><h3 class="gh">Champion</h3><div class="bm champ-card">${ko.champion ? '🏆 ' + e(ko.champion) : 'To be decided'}</div></div>`;
    return `<h2 class="fx">Bracket</h2><div class="bracket">${cols}${champ}</div>
      ${ko.third ? `<h3 class="gh">Third place</h3><div class="bracket"><div class="bcol">${card(ko.third)}</div></div>` : ''}
      <p class="mute note-s">* won on ${esc(tiebreak())}.</p>`;
  }

  function tabsHtml() {
    const items = [['fixtures', 'Fixtures']];
    if (t.groups.length) items.push(['table', 'Table']);
    if (t.ko) items.push(['bracket', 'Bracket']);
    return `<div class="tabs" role="tablist">${items.map(([k, l]) =>
      `<button type="button" role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  }

  /* ---------- Share code (host) / live badge (viewer) ---------- */
  function topBar() {
    if (ro) return `<div class="codebar"><span class="live">Live</span><span>Hosted by <b>${esc(meta.ownerName || 'the host')}</b></span>
      <button class="btn sm" data-act="follow">${meta.following ? 'Unfollow' : 'Follow'}</button></div>`;
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(t.id)) return '';
    return `<div class="codebar"><span>Share code</span><b class="code">${esc(t.id)}</b><button class="btn sm" data-act="copy">Copy</button></div>
      <p class="mute small">Others enter this code on the home page to watch live. They cannot change anything.</p>`;
  }
  function copyCode(code) {
    const ask = () => window.prompt('Copy this code:', code);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => { if (window.toast) toast('Code copied: ' + code); }).catch(ask);
    else ask();
  }

  /* ---------- Clicks ---------- */
  function onClick(ev) {
    const sum = ev.target.closest('summary');
    if (sum) { const d = sum.parentNode; setTimeout(() => { opened[d.dataset.key] = d.open; }, 0); return; }
    const a = ev.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (ro && ['enter', 'start-ko', 'reopen', 'delete'].includes(act)) return;   // view-only
    if (act === 'enter') openEntry(a.dataset.id);
    else if (act === 'copy') copyCode(t.id);
    else if (act === 'follow') { if (meta.toggle) meta.toggle(); }
    else if (act === 'pdf') {
      a.disabled = true;
      Exporter.share(t)
        .then(r => { if (window.toast && r === 'shared') toast('PDF shared.'); })
        .catch(() => { if (window.toast) toast('Could not make the PDF.'); })
        .finally(() => { a.disabled = false; });
    } else if (act === 'tab') { tab = a.dataset.tab; render(view, t.id, ro ? t : undefined, meta); }   // keep viewer mode when switching tabs
    else if (act === 'start-ko') {
      tab = 'bracket';
      Store.commit(() => {
        t.ko = Engine.startKnockoutFromGroups(t.sport, t.groups, t.settings.qualifier, t.settings.koOpts, rules());
        t.stage = 'knockout'; sync();
      });
    } else if (act === 'reopen') {
      if (!confirm('Reopen the group stage? The knockout bracket and its results will be deleted.')) return;
      Store.commit(() => { t.ko = null; t.stage = t.format === 'league' ? 'league' : 'groups'; t.championName = null; t.status = 'running'; });
    } else if (act === 'delete') {
      if (!confirm('Delete "' + t.name + '" and all its results? This cannot be undone.')) return;
      const id = t.id; location.hash = '#/';
      Store.commit(s => { s.tournaments = s.tournaments.filter(x => x.id !== id); });
    }
  }

  /* ---------- Result entry dialog ---------- */
  const numIn = (name, v, ph) => `<input type="number" inputmode="numeric" min="0" step="1" name="${name}" value="${v == null ? '' : v}" aria-label="${ph}">`;
  const scoreRow = (p, v, m, label) => `<div class="score-in">${label ? `<b>${label}</b>` : ''}
    <span class="tm a">${e(m.a)}</span>${numIn(p + 'a', v && v.a, 'Score for ' + nm(m.a))}<i>-</i>${numIn(p + 'b', v && v.b, 'Score for ' + nm(m.b))}<span class="tm b">${e(m.b)}</span></div>`;

  function openEntry(id) {
    const m = findMatch(id), isKo = isKoId(id), r = m.result || {}, A = e(m.a), B = e(m.b);
    const legs = isKo ? m.legs : 1, sport = t.sport;
    let body = '';
    if (sport === 'cricket') {
      const wins = [['a', A + ' won'], ['b', B + ' won']].concat(isKo ? [] : [['tie', 'Tie'], ['nr', 'No result']]);
      body = `<fieldset class="wins"><legend>Result</legend>${wins.map(([v, l]) =>
        `<label class="tick"><input type="radio" name="winner" value="${v}" ${r.winner === v ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
        <div id="stats">${['a', 'b'].map(s => { const x = r[s] || {}; return `<div class="inn"><b>${s === 'a' ? A : B}</b>
          <label>Runs<input type="number" min="0" name="runs${s}" value="${x.runs == null ? '' : x.runs}"></label>
          <label>Overs<input type="number" min="0" step="0.1" name="overs${s}" value="${x.overs == null ? '' : x.overs}"></label>
          <label class="tick"><input type="checkbox" name="out${s}" ${x.allOut ? 'checked' : ''}> All out</label></div>`; }).join('')}
          <p class="mute">Overs like 12.3 mean 12 overs and 3 balls.${isKo ? ' A knockout needs a winner, so use the super over result if it was tied.' : ''}</p></div>`;
    } else if (legs === 2) {
      body = scoreRow('l1', r.legs && r.legs[0], m, 'Leg 1') + scoreRow('l2', r.legs && r.legs[1], m, 'Leg 2') +
        '<p class="mute">Always enter scores in the order shown, whoever was at home.</p>';
    } else body = scoreRow('', r, m);

    const needDecider = isKo && sport !== 'cricket' && !(sport === 'tekken' && legs === 1);
    if (needDecider) body += `<fieldset id="dec" hidden><legend>Level. Who won the ${esc(tiebreak())}?</legend>
      <label class="tick"><input type="radio" name="decider" value="a" ${r.decider === 'a' ? 'checked' : ''}> ${A}</label>
      <label class="tick"><input type="radio" name="decider" value="b" ${r.decider === 'b' ? 'checked' : ''}> ${B}</label></fieldset>`;

    dlg.innerHTML = `<form id="rf"><h2>${A} vs ${B}</h2>
      <p class="mute">${isKo ? esc(m.roundName) : esc(t.sport === 'cricket' ? 'Enter the match result' : 'Enter the final score')}</p>${body}
      <p id="derr" class="err" role="alert"></p>
      <div class="row"><button class="btn primary">Save result</button><button type="button" class="btn" data-d="cancel">Cancel</button>
      ${m.result ? '<button type="button" class="btn" data-d="clear">Clear result</button>' : ''}</div></form>`;
    dlg.showModal();
    const f = $('#rf');

    const val = k => { const x = f.elements[k]; return !x || x.value === '' ? null : Number(x.value); };
    const refresh = () => {
      const dec = $('#dec'); if (dec) {
        let level = false;
        if (legs === 2) { const v = ['l1a', 'l1b', 'l2a', 'l2b'].map(val); level = v.every(x => x !== null) && v[0] + v[2] === v[1] + v[3]; }
        else { const a = val('a'), b = val('b'); level = a !== null && b !== null && a === b; }
        dec.hidden = !level;
      }
      const st = $('#stats'); if (st) st.hidden = f.elements.winner && f.elements.winner.value === 'nr';
    };
    f.addEventListener('input', refresh); f.addEventListener('change', refresh); refresh();

    f.addEventListener('click', ev => {
      const d = ev.target.dataset.d;
      if (d === 'cancel') dlg.close(); else if (d === 'clear') save(m, isKo, null);
    });
    f.addEventListener('submit', ev => {
      ev.preventDefault();
      let res;
      if (sport === 'cricket') {
        const w = f.elements.winner.value; if (!w) { $('#derr').textContent = 'Pick the result first.'; return; }
        res = { winner: w };
        if (w !== 'nr') ['a', 'b'].forEach(s => {
          const o = f.elements['overs' + s].value;
          res[s] = { runs: val('runs' + s), overs: o === '' ? null : parseFloat(o), allOut: f.elements['out' + s].checked };
        });
      } else if (legs === 2) {
        const l1 = { a: val('l1a'), b: val('l1b') }, l2 = { a: val('l2a'), b: val('l2b') };
        res = { legs: (l2.a === null && l2.b === null) ? [l1] : [l1, l2] };
      } else res = { a: val('a'), b: val('b') };
      const dec = $('#dec');
      if (dec && !dec.hidden && f.elements.decider.value) res.decider = f.elements.decider.value;
      save(m, isKo, res);
    });
  }

  function save(m, isKo, res) {
    let out = isKo ? Engine.setKoResult(t.ko, t.sport, m.id, res)
      : Engine.setGroupResult(t.groups.find(g => g.matches.includes(m)).matches, t.sport, m.id, res);
    if (out.needsConfirm) {
      if (!confirm('This changes who plays later, so ' + out.affected.length + ' later result(s) will be cleared. Continue?')) return;
      out = Engine.setKoResult(t.ko, t.sport, m.id, res, true);
    }
    if (!out.ok) { $('#derr').textContent = out.error; return; }
    dlg.close();
    Store.commit(() => sync());
  }

  root.Tournament = { render };
})(window);
