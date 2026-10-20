/* ==========================================================
   core.js  -  Tournament logic (no UI). Works in browser + Node.
   Browser: window.Core    Node: require('./core.js')
   ========================================================== */
(function (root) {
  'use strict';

  /* ---------- Sports config (points are editable per tournament) ---------- */
  const SPORTS = {
    football: { label: 'FC (Football)', points: { win: 3, draw: 1, loss: 0 }, hasDraw: true,  koTiebreak: 'Penalties',  allowLegs: true,  tiebreak: ['pts', 'gd', 'gf'] },
    cricket:  { label: 'Cricket',       points: { win: 2, draw: 1, loss: 0 }, hasDraw: true,  koTiebreak: 'Super over', allowLegs: false, tiebreak: ['pts', 'w', 'nrr'], maxOvers: 20 },
    tekken:   { label: 'Tekken 8',      points: { win: 1, draw: 0, loss: 0 }, hasDraw: false, koTiebreak: null,         allowLegs: true,  tiebreak: ['pts', 'gd', 'gf'] }
  };

  /* ---------- Small helpers ---------- */
  const nextPow2 = n => { let p = 1; while (p < n) p *= 2; return p; };
  const isPow2 = n => n >= 1 && (n & (n - 1)) === 0;
  const shuffle = (arr, rng = Math.random) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const roundName = teams =>
    teams === 2 ? 'Final' : teams === 4 ? 'Semi-finals' : teams === 8 ? 'Quarter-finals' : 'Round of ' + teams;
  const groupLetter = i => String.fromCharCode(65 + i);

  /* ---------- Setup validation ---------- */
  function groupCountOptions(count) {
    const out = [];
    for (let g = 2; g <= Math.floor(count / 3); g++) out.push(g); // each group needs >= 3 teams
    return out;
  }
  function validateSetup({ count, format, groups = 2 }) {
    const errors = [], warnings = [];
    if (count < 2) errors.push('You need at least 2 players/teams.');
    if (count === 2) warnings.push('With 2 players this is just a single match (or a series).');
    if (count === 3 && format === 'knockout') warnings.push('3 players in a knockout means one player gets a bye to the final.');
    if (format === 'groups') {
      if (count < 6) errors.push('Groups + knockout needs at least 6 players (2 groups of 3). Use League or Knockout instead.');
      else if (!groupCountOptions(count).includes(groups)) errors.push('Too many groups: each group needs at least 3 players.');
    }
    return { ok: errors.length === 0, errors, warnings };
  }

  /* ---------- Fixtures: round robin (circle method, odd counts get a rest "bye") ---------- */
  // Returns rounds = [ [ {a,b,leg}, ... ], ... ]. repeats = 1, 2 or 3 meetings per pair.
  function roundRobin(ids, repeats = 1) {
    const list = ids.slice();
    if (list.length % 2) list.push(null);
    const n = list.length, base = [];
    for (let r = 0; r < n - 1; r++) {
      const ms = [];
      for (let i = 0; i < n / 2; i++) {
        let a = list[i], b = list[n - 1 - i];
        if (a === null || b === null) continue;
        if (i === 0 && r % 2 === 1) [a, b] = [b, a]; // balance home/away for the fixed player
        ms.push({ a, b });
      }
      base.push(ms);
      list.splice(1, 0, list.pop());
    }
    const rounds = [];
    for (let rep = 0; rep < repeats; rep++)
      base.forEach(ms => rounds.push(ms.map(m => (rep % 2 ? { a: m.b, b: m.a, leg: rep + 1 } : { a: m.a, b: m.b, leg: rep + 1 }))));
    return rounds;
  }

  function makeMatches(rounds, stage, group, prefix) {
    const matches = [];
    rounds.forEach((ms, ri) => ms.forEach((m, mi) =>
      matches.push({ id: `${prefix}${ri + 1}-${mi + 1}`, stage, group, round: ri + 1, a: m.a, b: m.b, leg: m.leg, result: null })));
    return matches;
  }

  function buildLeague(ids, repeats = 1) {
    return { groups: [{ name: 'League', teams: ids.slice(), matches: makeMatches(roundRobin(ids, repeats), 'league', 'League', 'L') }] };
  }

  // Snake-distribute seeded ids into groups so sizes differ by at most 1 (11 into 3 -> 4/4/3).
  function splitGroups(ids, g) {
    const buckets = Array.from({ length: g }, () => []);
    ids.forEach((id, i) => {
      const row = Math.floor(i / g), col = i % g;
      buckets[row % 2 === 0 ? col : g - 1 - col].push(id);
    });
    return buckets;
  }
  function buildGroups(ids, groupCount, repeats = 1) {
    const buckets = splitGroups(ids, groupCount);
    return {
      groups: buckets.map((teams, gi) => {
        const name = 'Group ' + groupLetter(gi);
        return { name, teams, matches: makeMatches(roundRobin(teams, repeats), 'group', name, 'G' + groupLetter(gi) + '-') };
      })
    };
  }

  /* ---------- Who can advance from the group stage ---------- */
  // Valid options = total qualifiers is a power of 2 (>= 2).
  // perGroup = top N of every group, extra = best (N+1)th-placed teams (ranked by points per game).
  function qualifierOptions(groupSizes) {
    const g = groupSizes.length, minSize = Math.min(...groupSizes), total = groupSizes.reduce((s, x) => s + x, 0);
    const opts = [];
    if (g === 1) opts.push({ perGroup: 0, extra: 0, total: 0, label: 'No playoffs - table leader wins' });
    for (let p = 1; p < minSize; p++) { // at least one team per group must be knocked out
      const eligible = groupSizes.filter(s => s > p).length; // groups that have a (p+1)th team
      for (let e = 0; e < g && e <= eligible; e++) {
        const t = g * p + e;
        if (t < 2 || t > total || !isPow2(t)) continue;
        if (g === 1 && e > 0) continue;
        const label = g === 1 ? `Top ${t} go to playoffs`
          : e === 0 ? `Top ${p} from each group (${t} teams)`
          : `Top ${p} from each group + ${e} best ${ordinal(p + 1)}-placed (${t} teams)`;
        opts.push({ perGroup: p, extra: e, total: t, label });
      }
    }
    return opts;
  }
  const ordinal = n => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

  /* ---------- Knockout bracket (byes go to top seeds) ---------- */
  // Standard seeding positions: size 8 -> [1,8,4,5,2,7,3,6]; adjacent pairs meet in round 1.
  function seedOrder(size) {
    let o = [1];
    while (o.length < size) { const n = o.length * 2; o = o.flatMap(s => [s, n + 1 - s]); }
    return o;
  }

  // seeds: ids in seed order (best first). opts: { twoLegSemis, thirdPlace }
  function buildKnockout(seeds, opts = {}) {
    const n = seeds.length, size = nextPow2(n);
    const slots = seedOrder(size).map(s => seeds[s - 1] || null);
    const totalRounds = Math.log2(size), rounds = [];

    for (let r = 1; r <= totalRounds; r++) {
      const teamsIn = size / Math.pow(2, r - 1), count = teamsIn / 2, ms = [];
      for (let i = 0; i < count; i++) {
        ms.push({
          id: `K${r}-${i + 1}`, stage: 'ko', round: r, index: i, roundName: roundName(teamsIn),
          a: r === 1 ? slots[2 * i] : null, b: r === 1 ? slots[2 * i + 1] : null,
          legs: (opts.twoLegSemis && teamsIn === 4) ? 2 : 1,
          next: r < totalRounds ? { id: `K${r + 1}-${Math.floor(i / 2) + 1}`, slot: i % 2 === 0 ? 'a' : 'b' } : null,
          result: null, winner: null, bye: false
        });
      }
      rounds.push(ms);
    }
    // Resolve byes: a round-1 match with one empty slot is won automatically.
    rounds[0].forEach(m => {
      if (m.a === null || m.b === null) {
        m.bye = true; m.winner = m.a || m.b;
        const nx = rounds[1] && rounds[1].find(x => x.id === m.next.id);
        if (nx) nx[m.next.slot] = m.winner;
      }
    });
    const third = (opts.thirdPlace && size >= 4)
      ? { id: 'TP', stage: 'ko', round: totalRounds, roundName: 'Third place', a: null, b: null, legs: 1, next: null, result: null, winner: null, bye: false }
      : null;
    return { size, rounds, third };
  }

  /* ---------- Results -> standings ---------- */
  // Result shapes (stored on match.result):
  //  football: { a: goals, b: goals }
  //  tekken:   { a: roundsWon, b: roundsWon }            (no draws)
  //  cricket:  { winner:'a'|'b'|'tie'|'nr',
  //              a:{ runs, overs, allOut }, b:{ runs, overs, allOut } }   overs like 12.3 = 12 overs 3 balls
  const oversToBalls = o => { const w = Math.floor(o); return w * 6 + Math.round((o - w) * 10); };

  function outcomeOf(sport, res) {
    if (!res) return null;
    if (sport === 'cricket') return res.winner === 'a' || res.winner === 'b' ? res.winner : 'draw';
    return res.a > res.b ? 'a' : res.b > res.a ? 'b' : 'draw';
  }

  function emptyRow(id) {
    return { id, p: 0, w: 0, d: 0, l: 0, pts: 0, gf: 0, ga: 0, gd: 0, rf: 0, rb: 0, ra: 0, rbw: 0, nrr: 0 };
  }

  function computeStandings(sport, ids, matches, rules = {}) {
    const pts = Object.assign({}, SPORTS[sport].points, rules.points || {});
    const maxOvers = rules.maxOvers || SPORTS.cricket.maxOvers;
    const rows = {}; ids.forEach(id => (rows[id] = emptyRow(id)));

    matches.forEach(m => {
      if (!m.result || !rows[m.a] || !rows[m.b]) return;
      const A = rows[m.a], B = rows[m.b], out = outcomeOf(sport, m.result);
      A.p++; B.p++;
      if (out === 'a') { A.w++; B.l++; A.pts += pts.win; B.pts += pts.loss; }
      else if (out === 'b') { B.w++; A.l++; B.pts += pts.win; A.pts += pts.loss; }
      else { A.d++; B.d++; A.pts += pts.draw; B.pts += pts.draw; }

      if (sport === 'cricket') {
        if (m.result.winner === 'nr') return; // no result: points only, NRR unaffected
        const ra = m.result.a, rb = m.result.b;
        const ballsA = ra.allOut ? maxOvers * 6 : oversToBalls(ra.overs);
        const ballsB = rb.allOut ? maxOvers * 6 : oversToBalls(rb.overs);
        A.rf += ra.runs; A.rb += ballsA; A.ra += rb.runs; A.rbw += ballsB;
        B.rf += rb.runs; B.rb += ballsB; B.ra += ra.runs; B.rbw += ballsA;
      } else {
        A.gf += m.result.a; A.ga += m.result.b; B.gf += m.result.b; B.ga += m.result.a;
      }
    });

    const list = Object.values(rows);
    list.forEach(r => {
      r.gd = r.gf - r.ga;
      if (sport === 'cricket') {
        const f = r.rb ? r.rf / (r.rb / 6) : 0, a = r.rbw ? r.ra / (r.rbw / 6) : 0;
        r.nrr = Math.round((f - a) * 10000) / 10000;
      }
    });
    return sortRows(sport, list, matches, pts);
  }

  function sortRows(sport, list, matches, pts) {
    const keys = SPORTS[sport].tiebreak;
    const cmp = (x, y) => { for (const k of keys) if (x[k] !== y[k]) return y[k] - x[k]; return 0; };
    list.sort(cmp);
    // Last tiebreaker: head-to-head points among teams still level on every key.
    const out = [];
    for (let i = 0; i < list.length;) {
      let j = i + 1;
      while (j < list.length && cmp(list[i], list[j]) === 0) j++;
      const tied = list.slice(i, j);
      if (tied.length > 1) {
        const set = new Set(tied.map(r => r.id)), h2h = {};
        tied.forEach(r => (h2h[r.id] = 0));
        matches.forEach(m => {
          if (!m.result || !set.has(m.a) || !set.has(m.b)) return;
          const o = outcomeOf(sport, m.result);
          if (o === 'a') { h2h[m.a] += pts.win; h2h[m.b] += pts.loss; }
          else if (o === 'b') { h2h[m.b] += pts.win; h2h[m.a] += pts.loss; }
          else { h2h[m.a] += pts.draw; h2h[m.b] += pts.draw; }
        });
        tied.forEach(r => (r.h2h = h2h[r.id]));
        tied.sort((x, y) => y.h2h - x.h2h);
      }
      out.push(...tied); i = j;
    }
    out.forEach((r, idx) => (r.pos = idx + 1));
    return out;
  }

  /* ---------- Picking qualifiers from finished groups ---------- */
  // Rank teams from different groups fairly (groups can differ in size): points per game first.
  function compareAcrossGroups(sport) {
    return (x, y) => {
      const ppg = r => (r.p ? r.pts / r.p : 0);
      if (ppg(x) !== ppg(y)) return ppg(y) - ppg(x);
      const second = r => (sport === 'cricket' ? r.nrr : (r.p ? r.gd / r.p : 0));
      if (second(x) !== second(y)) return second(y) - second(x);
      return (y.p ? y.gf / y.p : 0) - (x.p ? x.gf / x.p : 0);
    };
  }

  // groupTables: array of standings arrays (one per group). option: from qualifierOptions().
  // Returns qualifier ids in knockout seed order (group winners first, then runners-up, ...).
  function pickQualifiers(sport, groupTables, option) {
    const cmp = compareAcrossGroups(sport), seeds = [];
    for (let pos = 1; pos <= option.perGroup; pos++)
      seeds.push(...groupTables.map(t => t[pos - 1]).filter(Boolean).sort(cmp).map(r => r.id));
    if (option.extra > 0) {
      const pool = groupTables.map(t => t[option.perGroup]).filter(Boolean).sort(cmp);
      seeds.push(...pool.slice(0, option.extra).map(r => r.id));
    }
    return seeds;
  }

  root.Core = {
    SPORTS, nextPow2, isPow2, shuffle, roundName,
    groupCountOptions, validateSetup,
    roundRobin, buildLeague, splitGroups, buildGroups,
    qualifierOptions, seedOrder, buildKnockout,
    oversToBalls, outcomeOf, computeStandings, pickQualifiers
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
