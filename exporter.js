/* ==========================================================
   exporter.js - makes a PDF of a tournament and shares it.
   No libraries: a tiny PDF writer using the built-in Helvetica font.
   ========================================================== */
(function (root) {
  'use strict';
  const W = 595, H = 842, M = 40;
  const BLUE = [0.141, 0.341, 1], ORANGE = [1, 0.478, 0.102], INK = [0.06, 0.1, 0.2], MUTE = [0.36, 0.42, 0.54];
  const ROW = [0.957, 0.965, 0.984], LINE = [0.87, 0.9, 0.945], WHITE = [1, 1, 1];
  // Helvetica character widths (ASCII 32..126, per 1000 units)
  const WID = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
    667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,
    556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

  /* ---------- Text helpers (standard PDF fonts only support Latin characters) ---------- */
  const SMART = { '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-', '\u2014': '-', '\u2026': '...' };
  const clean = s => String(s).replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/g, c => SMART[c]).replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
  const esc = s => s.replace(/[\\()]/g, '\\$&');
  const width = (s, size, bold) => { let n = 0; for (const ch of s) { const c = ch.charCodeAt(0); n += (c >= 32 && c <= 126 ? WID[c - 32] : 556); } return n * size / 1000 * (bold ? 1.07 : 1); };
  function fit(s, max, size, bold) {
    s = clean(s); if (width(s, size, bold) <= max) return s;
    while (s.length > 1 && width(s + '...', size, bold) > max) s = s.slice(0, -1);
    return s + '...';
  }

  /* ---------- Minimal PDF writer. Layout uses y measured from the TOP of the page. ---------- */
  function Doc() {
    const pages = []; let c = null;
    const col = a => a.join(' ');
    return {
      add() { c = []; pages.push(c); },
      use(i) { c = pages[i]; },
      count: () => pages.length,
      rect(x, top, w, h, color) { c.push(`${col(color)} rg ${x} ${(H - top - h).toFixed(2)} ${w} ${h} re f`); },
      line(x1, x2, top, color) { c.push(`${col(color)} RG 0.6 w ${x1} ${H - top} m ${x2} ${H - top} l S`); },
      text(s, x, top, size, o = {}) {
        s = clean(s); const bold = !!o.bold, wd = width(s, size, bold);
        const px = o.align === 'right' ? x - wd : o.align === 'center' ? x - wd / 2 : x;
        c.push(`${col(o.color || INK)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${px.toFixed(2)} ${(H - top).toFixed(2)} Td (${esc(s)}) Tj ET`);
      },
      bytes() {
        const objs = [], n = pages.length, kids = [];
        objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
        pages.forEach((p, i) => {
          const pid = 5 + 2 * i, cid = pid + 1, content = p.join('\n');
          kids.push(pid + ' 0 R');
          objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`;
          objs[cid] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
        });
        objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`;
        let out = '%PDF-1.4\n'; const off = [];
        for (let i = 1; i < objs.length; i++) { off[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
        const xref = out.length;
        out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + off.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
        out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
        const u = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255;
        return u;
      }
    };
  }

  /* ---------- Build the tournament PDF ---------- */
  function build(t) {
    const Core = root.Core, Engine = root.Engine, d = Doc(), S = t.sport;
    const nm = id => { const p = t.players.find(x => x.id === id); return p ? p.name : 'To be decided'; };
    const rules = { points: t.settings.points, maxOvers: t.settings.maxOvers };
    const tb = Core.SPORTS[S].koTiebreak || 'decider game';
    const fmtName = { league: 'League', knockout: 'Knockout', groups: 'Groups + knockout' }[t.format];
    const wdSet = new Set(t.withdrawn || []);
    const sch = root.Schedule && t.schedule ? root.Schedule.compute(t) : null;
    let y = 0, usedStar = false;

    function newPage(first) {
      d.add();
      if (first) {
        d.rect(0, 0, W, 96, BLUE);
        d.text('ARENA', M, 34, 13, { bold: true, color: WHITE });
        d.rect(M, 40, 34, 4, ORANGE);
        d.text(fit(t.name, W - 2 * M, 22, true), M, 74, 22, { bold: true, color: WHITE });
        y = 118;
        d.text(`${t.game}, ${fmtName}, ${t.players.length} entries`, M, y, 10, { color: MUTE });
        d.text(new Date().toLocaleDateString(), W - M, y, 10, { color: MUTE, align: 'right' });
        y += 22;
      } else { d.text(fit(t.name, 300, 9, false), M, 28, 9, { color: MUTE }); y = 50; }
    }
    const need = h => { if (y + h > H - 54) newPage(false); };
    function section(title) {
      need(50); y += 10;
      d.text(title, M, y, 13, { bold: true }); y += 6; d.line(M, W - M, y, LINE); y += 16;
    }
    const sg = n => (n > 0 ? '+' : '') + n;

    /* standings */
    function standings() {
      const tables = Engine.groupTables(S, t.groups, rules), q = t.settings.qualifier;
      let hot = new Set();
      if (q) hot = new Set(Engine.qualifierSeeds(t));
      else if (t.format === 'league' && tables[0][0] && tables[0][0].p) hot = new Set([tables[0][0].id]);
      const cols = S === 'football' ? [['P', 'p'], ['W', 'w'], ['D', 'd'], ['L', 'l'], ['GF', 'gf'], ['GA', 'ga'], ['GD', 'gd'], ['Pts', 'pts']]
        : S === 'cricket' ? [['P', 'p'], ['W', 'w'], ['L', 'l'], ['T/NR', 'd'], ['Pts', 'pts'], ['NRR', 'nrr']]
        : [['P', 'p'], ['W', 'w'], ['L', 'l'], ['RF', 'gf'], ['RA', 'ga'], ['RD', 'gd']];
      const nameW = 160, statW = (W - 2 * M - 30 - nameW) / cols.length;
      const val = (k, v) => k === 'gd' ? sg(v) : k === 'nrr' ? (v > 0 ? '+' : '') + v.toFixed(3) : String(v);
      section('Standings');
      tables.forEach((rows, gi) => {
        need(70);
        if (t.groups.length > 1) { d.text(t.groups[gi].name, M, y, 10, { bold: true, color: MUTE }); y += 14; }
        d.text('#', M + 15, y, 8, { color: MUTE, align: 'center' }); d.text('Name', M + 34, y, 8, { color: MUTE });
        cols.forEach((c, j) => d.text(c[0], M + 30 + nameW + statW * (j + 1) - 6, y, 8, { color: MUTE, align: 'right' }));
        y += 6; d.line(M, W - M, y, LINE); y += 3;
        rows.forEach((r, i) => {
          need(18);
          if (i % 2 === 0) d.rect(M, y, W - 2 * M, 17, ROW);
          if (hot.has(r.id)) d.rect(M, y, 3, 17, ORANGE);
          d.text(String(r.pos), M + 15, y + 12, 9, { color: MUTE, align: 'center' });
          d.text(fit(nm(r.id) + (wdSet.has(r.id) ? ' (withdrew)' : ''), nameW - 8, 10, true), M + 34, y + 12, 10, { bold: true });
          cols.forEach((c, j) => d.text(val(c[1], r[c[1]]), M + 30 + nameW + statW * (j + 1) - 6, y + 12, 10, { bold: c[1] === 'pts', align: 'right' }));
          y += 17;
        });
        y += 16;
      });
      need(20);
      const note = q ? 'Orange marks show who is in a qualifying place.' : t.format === 'league' ? 'The table leader wins the league.' : '';
      if (note) { d.text(note, M, y, 8, { color: MUTE }); y += 12; }
    }

    /* matches */
    function resText(m) {
      const r = m.result; if (!r) return 'vs';
      if (r.wo) return 'Walkover';
      if (S === 'cricket') return r.winner === 'nr' ? 'No result' : r.winner === 'tie' ? r.a.runs + ' v ' + r.b.runs + ', tie' : r.a.runs + ' v ' + r.b.runs;
      let s = r.legs ? r.legs.map(l => l.a + '-' + l.b).join(', ') : r.a + ' - ' + r.b;
      if (r.legs && r.legs.length === 2) s += ' (agg ' + (r.legs[0].a + r.legs[1].a) + '-' + (r.legs[0].b + r.legs[1].b) + ')';
      return s;
    }
    function matchRow(m, alt) {
      need(17); const c = W / 2;
      if (alt) d.rect(M, y, W - 2 * M, 17, ROW);
      if (m.bye) { d.text(nm(m.winner) + ' advances (bye)', c, y + 12, 9, { align: 'center', color: MUTE }); y += 17; return; }
      const won = m.winner || (m.result && S !== 'cricket' ? (m.result.a > m.result.b ? m.a : m.result.b > m.result.a ? m.b : null) : null) ||
        (m.result && S === 'cricket' ? (m.result.winner === 'a' ? m.a : m.result.winner === 'b' ? m.b : null) : null);
      const sl = sch && sch.slots[m.id];
      if (sl) d.text(root.Schedule.label(sl), M + 4, y + 12, 8, { color: MUTE });
      d.text(fit(nm(m.a), sl ? 100 : 135, 10, won === m.a), c - 80, y + 12, 10, { align: 'right', bold: won === m.a });
      let mid = resText(m); if (m.result && m.result.decider) { mid += '*'; usedStar = true; }
      d.text(fit(mid, 150, 9, true), c, y + 12, 9, { align: 'center', bold: !!m.result, color: m.result ? INK : MUTE });
      d.text(fit(nm(m.b), 135, 10, won === m.b), c + 80, y + 12, 10, { bold: won === m.b });
      y += 17;
    }
    function list(matches) { matches.forEach((m, i) => matchRow(m, i % 2 === 0)); y += 6; }

    function knockout() {
      section('Knockout');
      t.ko.rounds.forEach(rd => {
        need(46); y += 8; d.text(rd[0].roundName + (rd[0].legs === 2 ? ' (two legs, aggregate)' : ''), M, y, 9, { bold: true, color: MUTE }); y += 10;
        list(rd);
      });
      if (t.ko.third) { need(46); y += 8; d.text('Third place', M, y, 9, { bold: true, color: MUTE }); y += 10; list([t.ko.third]); }
    }
    function fixtures() {
      section(t.stage === 'knockout' && t.format !== 'knockout' ? 'Group stage results' : 'Fixtures and results');
      t.groups.forEach(g => {
        if (t.groups.length > 1) { need(30); d.text(g.name, M, y, 11, { bold: true }); y += 14; }
        const rounds = {}; g.matches.forEach(m => (rounds[m.round] = rounds[m.round] || []).push(m));
        Object.keys(rounds).forEach(r => { need(46); y += 4; d.text('Round ' + r, M, y, 9, { bold: true, color: MUTE }); y += 10; list(rounds[r]); });
      });
    }

    /* assemble */
    newPage(true);
    if (t.championName) {
      d.rect(M, y, W - 2 * M, 38, ROW); d.rect(M, y, 5, 38, ORANGE);
      d.text('CHAMPION', M + 16, y + 14, 8, { color: MUTE });
      d.text(fit(t.championName, W - 2 * M - 30, 16, true), M + 16, y + 31, 16, { bold: true });
      y += 52;
    }
    if (t.groups.length) standings();
    if (t.ko) knockout();
    if (t.groups.length) fixtures();
    if (usedStar) { need(20); d.text('* won on ' + tb + '.', M, y, 8, { color: MUTE }); }

    const n = d.count();
    for (let i = 0; i < n; i++) {
      d.use(i); d.line(M, W - M, H - 38, LINE);
      d.text('Made with Arena', M, H - 24, 8, { color: MUTE });
      d.text(`Page ${i + 1} of ${n}`, W - M, H - 24, 8, { color: MUTE, align: 'right' });
    }
    return d.bytes();
  }

  /* ---------- Share (phone share sheet) or download ---------- */
  async function share(t) {
    const blob = new Blob([build(t)], { type: 'application/pdf' });
    const name = (t.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'tournament') + '.pdf';
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: t.name }); return 'shared'; }
      catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
    }
    offerFile(blob, name, 'Your PDF is ready');
    return 'ready';
  }

  /* Shows a box with real Download / Open buttons. A user's own click is the most reliable way to save a file. */
  function offerFile(blob, name, title) {
    const dlg = document.getElementById('dlg'), url = URL.createObjectURL(blob);
    const safe = String(name).replace(/[^\w.\- ]/g, '');
    dlg.innerHTML = `<h2>${title}</h2><p class="mute">${safe}</p>
      <div class="row">
        <a class="btn primary" href="${url}" download="${safe}" style="text-decoration:none">Download</a>
        <a class="btn" href="${url}" target="_blank" rel="noopener" style="text-decoration:none">Open in new tab</a>
        <button type="button" class="btn" id="fileClose">Close</button>
      </div>
      <p class="mute">If nothing downloads, you may be inside an editor preview. Open the app in a normal browser tab (or your live link) and try again.</p>`;
    dlg.showModal();
    document.getElementById('fileClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => setTimeout(() => URL.revokeObjectURL(url), 500), { once: true });
  }

  root.Exporter = { build, share, offerFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Exporter;
})(typeof window !== 'undefined' ? window : globalThis);
