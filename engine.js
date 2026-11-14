/* ==========================================================
   engine.js  -  Match flow on top of core.js (no UI).
   Needs core.js loaded first in the browser.
   ========================================================== */
(function (root) {
  'use strict';
  const Core = (typeof require === 'function' && typeof module !== 'undefined') ? require('./core.js') : root.Core;
  const clone = o => JSON.parse(JSON.stringify(o));
  const isInt = x => Number.isInteger(x) && x >= 0;
  const side = s => s === 'a' || s === 'b';

  /* ---------- Who won a knockout tie? Returns 'a' | 'b' | null (not finished) ---------- */
  // Level scores need result.decider = 'a' | 'b'  (penalties / super over / decider game).
  function koSide(sport, m) {
    const r = m.result;
    if (!r) return null;
    if (r.wo) return side(r.winner) ? r.winner : null;   // walkover decides the match or tie
    if (sport === 'cricket') return side(r.winner) ? r.winner : null;
    if (m.legs === 2) {
      if (!r.legs || r.legs.length < 2) return null;
      const A = r.legs[0].a + r.legs[1].a, B = r.legs[0].b + r.legs[1].b;
      if (A !== B) return A > B ? 'a' : 'b';
      return side(r.decider) ? r.decider : null;
    }
    if (r.a !== r.b) return r.a > r.b ? 'a' : 'b';
    return side(r.decider) ? r.decider : null;
  }

  /* ---------- Validate a result before saving. Returns error text or null ---------- */
  // Two-leg results are stored as { legs:[{a,b},{a,b}], decider? } - scores always from match.a vs match.b.
  function validateResult(sport, res, { stage = 'group', legs = 1 } = {}) {
    if (!res) return 'No result entered.';
    if (res.wo) return side(res.winner) ? null : 'Pick who gets the walkover.';
    if (sport === 'cricket') {
      if (!['a', 'b', 'tie', 'nr'].includes(res.winner)) return 'Pick a winner, tie or no result.';
      if (stage === 'ko' && !side(res.winner)) return 'Knockouts need a winner (decide with a super over).';
      if (res.winner === 'nr') return null;
      for (const s of ['a', 'b']) {
        const x = res[s];
        if (!x || !isInt(x.runs) || typeof x.overs !== 'number' || x.overs < 0) return 'Enter runs and overs for both teams.';
        if (Math.round((x.overs - Math.floor(x.overs)) * 10) > 5) return 'Overs like 12.3 mean 12 overs 3 balls (max .5).';
      }
      if (res.winner === 'tie' && res.a.runs !== res.b.runs) return 'A tie needs equal runs.';
      return null;
    }
    const score = s => {
      if (!s || !isInt(s.a) || !isInt(s.b)) return 'Enter whole-number scores for both sides.';
      if (sport === 'tekken' && s.a === s.b) return 'Tekken has no draws - one player must win.';
      return null;
    };
    if (stage === 'ko' && legs === 2) {
      if (!Array.isArray(res.legs) || res.legs.length < 1 || res.legs.length > 2) return 'Enter leg 1 (and leg 2).';
      for (const l of res.legs) { const e = score(l); if (e) return e; }
    } else { const e = score(res); if (e) return e; }
    if (stage === 'ko') {
      const complete = legs !== 2 || res.legs.length === 2;
      if (complete && !koSide(sport, { legs, result: res }))
        return 'Scores are level - pick who won the ' + Core.SPORTS[sport].koTiebreak.toLowerCase() + '.';
    }
    return null;
  }

  /* ---------- Knockout: rebuild everything from entered results ---------- */
  // Called after any change, so edit and undo are safe. Returns { cleared, champion }.
  // "cleared" = later matches whose teams changed, so their old results were dropped.
  function recompute(ko, sport) {
    const cleared = [];
    ko.rounds.forEach((round, ri) => {
      round.forEach((m, i) => {
        if (ri > 0) {
          const pa = ko.rounds[ri - 1][2 * i], pb = ko.rounds[ri - 1][2 * i + 1];
          const na = pa.winner || null, nb = pb.winner || null;
          if ((na !== m.a || nb !== m.b) && m.result) { m.result = null; cleared.push(m.id); }
          m.a = na; m.b = nb;
        }
        if (m.bye) m.winner = m.a || m.b;
        else { const s = koSide(sport, m); m.winner = s ? m[s] : null; }
      });
    });
    if (ko.third) {
      const sf = ko.rounds[ko.rounds.length - 2];
      if (sf.some(m => m.bye)) ko.third = null; // no real semi-final losers (e.g. 3 players)
      else {
        const loser = m => (m.winner ? (m.winner === m.a ? m.b : m.a) : null);
        const t = ko.third, la = loser(sf[0]), lb = loser(sf[1]);
        if ((la !== t.a || lb !== t.b) && t.result) { t.result = null; cleared.push(t.id); }
        t.a = la; t.b = lb;
        const s = koSide(sport, t); t.winner = s ? t[s] : null;
      }
    }
    ko.champion = ko.rounds[ko.rounds.length - 1][0].winner || null;
    return { cleared, champion: ko.champion };
  }

  const findMatch = (ko, id) => ko.rounds.flat().concat(ko.third ? [ko.third] : []).find(m => m.id === id);

  // Enter, edit (pass a new result) or undo (pass null) a knockout result.
  // If the change would wipe later results, nothing happens until you retry with force = true.
  function setKoResult(ko, sport, id, result, force = false) {
    const m = findMatch(ko, id);
    if (!m) return { ok: false, error: 'Match not found.' };
    if (m.bye) return { ok: false, error: 'This is a bye - nothing to enter.' };
    if (!m.a || !m.b) return { ok: false, error: 'Teams for this match are not decided yet.' };
    if (result !== null) {
      const err = validateResult(sport, result, { stage: 'ko', legs: m.legs });
      if (err) return { ok: false, error: err };
    }
    const trial = clone(ko);
    findMatch(trial, id).result = result;
    const info = recompute(trial, sport);
    const affected = info.cleared.filter(x => x !== id);
    if (affected.length && !force) return { ok: false, needsConfirm: true, affected };
    ko.rounds = trial.rounds; ko.third = trial.third; ko.champion = info.champion;
    return { ok: true, cleared: affected, champion: info.champion };
  }

  /* ---------- Group / league stage ---------- */
  function setGroupResult(matches, sport, id, result) {
    const m = matches.find(x => x.id === id);
    if (!m) return { ok: false, error: 'Match not found.' };
    if (result !== null) {
      const err = validateResult(sport, result, { stage: 'group' });
      if (err) return { ok: false, error: err };
    }
    m.result = result;
    return { ok: true };
  }
  const groupTables = (sport, groups, rules) => groups.map(g => Core.computeStandings(sport, g.teams, g.matches, rules));
  const isStageDone = groups => groups.every(g => g.matches.every(m => m.result));
  const nextPending = matches => matches.find(m => !m.result && m.a && m.b) || null;
  const leagueWinner = (sport, group, rules, withdrawn) => {
    if (!isStageDone([group])) return null;
    const row = Core.computeStandings(sport, group.teams, group.matches, rules).find(r => !(withdrawn || []).includes(r.id));
    return row ? row.id : null;
  };

  // Groups finished -> build the knockout from the chosen qualifier option.
  function startKnockoutFromGroups(sport, groups, option, koOpts, rules) {
    if (!isStageDone(groups)) throw new Error('Finish all group matches first.');
    const seeds = Core.pickQualifiers(sport, groupTables(sport, groups, rules), option);
    return Core.buildKnockout(seeds, koOpts);
  }

  /* ---------- Walkovers and withdrawals ---------- */
  const WO_GOALS = { football: 3, tekken: 2 };                      // a forfeit is recorded as a 3-0 (FC) or 2-0 (Tekken) win
  function woResult(sport, winner) {
    if (sport === 'cricket') return { wo: true, winner };
    const g = WO_GOALS[sport];
    return { wo: true, winner, a: winner === 'a' ? g : 0, b: winner === 'b' ? g : 0 };
  }
  const koList = ko => ko.rounds.flat().concat(ko.third ? [ko.third] : []);

  // Gives every unplayed match of a withdrawn player to the opponent. Safe to run again and again.
  function applyWithdrawals(t) {
    const wd = new Set(t.withdrawn || []); if (!wd.size) return;
    if (t.stage !== 'knockout') {
      t.groups.forEach(g => g.matches.forEach(m => {
        if (m.result) return;
        const aw = wd.has(m.a), bw = wd.has(m.b); if (!aw && !bw) return;
        m.result = Object.assign(woResult(t.sport, aw && !bw ? 'b' : 'a'), { auto: true });
      }));
    }
    if (t.ko) {
      let changed = true, guard = 0;
      while (changed && guard++ < 30) {
        changed = false;
        for (const m of koList(t.ko)) {
          if (m.bye || m.winner || !m.a || !m.b) continue;          // opponent not known yet: handled on a later run
          const aw = wd.has(m.a), bw = wd.has(m.b); if (!aw && !bw) continue;
          const r = setKoResult(t.ko, t.sport, m.id, Object.assign(woResult(t.sport, aw && !bw ? 'b' : 'a'), { auto: true }), true);
          if (r.ok) changed = true;
        }
      }
    }
  }
  function withdrawPlayer(t, id) {
    t.withdrawn = t.withdrawn || [];
    if (!t.withdrawn.includes(id)) t.withdrawn.push(id);
    applyWithdrawals(t);
  }
  // Undo a withdrawal: removes the walkovers that were given automatically because of it.
  function reinstatePlayer(t, id) {
    t.withdrawn = (t.withdrawn || []).filter(x => x !== id);
    if (t.stage !== 'knockout') t.groups.forEach(g => g.matches.forEach(m => { if (m.result && m.result.auto && (m.a === id || m.b === id)) m.result = null; }));
    if (t.ko) {
      koList(t.ko).filter(m => m.result && m.result.auto && (m.a === id || m.b === id)).map(m => m.id).forEach(mid => {
        const m = koList(t.ko).find(x => x.id === mid);
        if (m && m.result && m.result.auto) setKoResult(t.ko, t.sport, mid, null, true);
      });
    }
  }
  // Group/league qualifiers, leaving out anyone who withdrew.
  function qualifierSeeds(t) {
    const wd = new Set(t.withdrawn || []), rules = { points: t.settings.points, maxOvers: t.settings.maxOvers };
    const tables = groupTables(t.sport, t.groups, rules).map(tb => tb.filter(r => !wd.has(r.id)));
    return Core.pickQualifiers(t.sport, tables, t.settings.qualifier);
  }
  function startKnockout(t) {
    if (!isStageDone(t.groups)) throw new Error('Finish all group matches first.');
    const seeds = qualifierSeeds(t);
    if (seeds.length < 2) throw new Error('Not enough players are left to start the knockout.');
    return Core.buildKnockout(seeds, t.settings.koOpts);
  }

  root.Engine = { woResult, applyWithdrawals, withdrawPlayer, reinstatePlayer, qualifierSeeds, startKnockout, koSide, validateResult, recompute, setKoResult, setGroupResult, groupTables, isStageDone, nextPending, leagueWinner, startKnockoutFromGroups };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
