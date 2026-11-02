'use strict';

/* ============================== ПІДСУМОК ПАРТІЇ ==============================
   Графік рівнів за ходами й «найкращі моменти»: хто кого бив, підставляв і рятував. */
function histReset() { G.hist = []; G.hl = { best: null, kills: {}, curses: {}, flees: {}, hits: {}, helps: {}, stabs: {}, steals: {}, deaths: {} }; }
function histTurn() { if (!G.hist) histReset(); G.hist.push(G.players.map(p => p.level)); if (G.hist.length > 400) G.hist.splice(1, 1); }
function hlAdd(k, p, n = 1) { if (!p || p.idx == null || p.idx < 0) return; if (!G.hl) histReset(); G.hl[k][p.idx] = (G.hl[k][p.idx] || 0) + n; }
function hlKill(p, cb) {
  if (!cb) return; hlAdd('kills', p);
  const tot = sum(cb.mons, x => typeof x.c.lvl === 'number' ? x.c.lvl : 0);
  if (!G.hl.best || tot > G.hl.best.lvl) G.hl.best = { lvl: tot, name: cb.mons.map(x => x.c.name).join(' + '), who: p.idx };
}
function summaryData() {
  if (!G.hist) histReset();
  return { hist: [...G.hist, G.players.map(p => p.level)], hl: G.hl, players: G.players.map(p => ({ name: p.name, color: p.color })) };
}
function chartSVG(d) {
  const H = d.hist, n = H.length; if (n < 2) return '';
  const W = 560, Hh = 170, L = 26, R = 10, T = 10, B = 22;
  const max = Math.max(2, ...H.flat()), sx = i => L + (W - L - R) * i / (n - 1), sy = v => T + (Hh - T - B) * (1 - (v - 1) / (max - 1));
  let s = `<svg class="sumchart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Рівні гравців за ходами">`;
  for (let v = 1; v <= max; v += Math.max(1, Math.round(max / 5))) s += `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" class="gl"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`;
  s += `<text x="${L}" y="${Hh - 4}">хід 1</text><text x="${W - R}" y="${Hh - 4}" text-anchor="end">хід ${n - 1}</text>`;
  d.players.forEach((p, k) => {
    const pts = H.map((row, i) => `${sx(i).toFixed(1)},${sy(row[k] || 1).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${p.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
    const last = H[n - 1][k] || 1; s += `<circle cx="${sx(n - 1)}" cy="${sy(last)}" r="4.5" fill="${p.color}" stroke="#1b1310" stroke-width="2"/>`;
  });
  return s + '</svg>';
}
function summaryHTML(d) {
  if (!d || !d.hist) return '';
  const nm = i => d.players[i] ? `<b style="color:${d.players[i].color}">${esc(d.players[i].name)}</b>` : '';
  const top = k => { const e = Object.entries(d.hl[k] || {}).sort((a, b) => b[1] - a[1])[0]; return e && e[1] > 0 ? { i: +e[0], n: e[1] } : null; };
  const lines = [];
  if (d.hl.best) lines.push(`🏆 Найсильніший переможений: <b>${esc(d.hl.best.name)}</b> (${d.hl.best.lvl}) — ${nm(d.hl.best.who)}`);
  const pick = [['kills', '⚔️', 'Найбільше перемог', n => `${n} ${plural(n, 'бій', 'бої', 'боїв')}`], ['helps', '🤝', 'Найкращий помічник', n => `${n} ${plural(n, 'раз', 'рази', 'разів')}`],
    ['curses', '😈', 'Найбільше проклять наслав', n => `${n}`], ['stabs', '🥷', 'Найбільше ударів у спину', n => `${n}`], ['steals', '👛', 'Найспритніший злодій', n => `${n} ${plural(n, 'крадіжка', 'крадіжки', 'крадіжок')}`],
    ['flees', '🏃', 'Найчастіше тікав', n => `${n} ${plural(n, 'раз', 'рази', 'разів')}`], ['hits', '🩹', 'Найбільше халеп', n => `${n}`], ['deaths', '💀', 'Гинув', n => `${n} ${plural(n, 'раз', 'рази', 'разів')}`]];
  for (const [k, e, t, f] of pick) { const x = top(k); if (x) lines.push(`${e} ${t}: ${nm(x.i)} — ${f(x.n)}`); }
  return `<div class="sumbox"><h3>Підсумок партії</h3>${chartSVG(d)}<div class="sumleg">${d.players.map(p => `<span><i style="background:${p.color}"></i>${esc(p.name)}</span>`).join('')}</div>${lines.length ? `<ul class="sumhl">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}</div>`;
}
