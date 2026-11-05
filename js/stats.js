'use strict';

/* ============================== СТАТИСТИКА Й ДОСЯГНЕННЯ ==============================
   Усе зберігається лише на цьому пристрої. «Ти» — перша людина за цим пристроєм
   (або твоє місце в мережевій грі). Ігри, де за пристроєм лише боти, не рахуються. */
const STATS_KEY = 'pdsv-stats';
const ACH = [
  ['first_win', '🏆', 'Перша перемога', 'Виграй будь-яку партію.'],
  ['ten_games', '🎲', 'Завсідник', 'Зіграй 10 партій.'],
  ['epic_win', '👑', 'Епічний пройдисвіт', 'Виграй епічну партію до 20-го рівня.'],
  ['team_win', '🤝', 'Командний гравець', 'Виграй командну гру.'],
  ['coop_win', '🐲', 'Боса повалено', 'Переможи Боса в поході.'],
  ['coop_hard', '🔥', 'Майстер походу', 'Переможи Боса на складності «Важко».'],
  ['no_help', '🗡️', 'Сам собі воїн', 'Виграй партію, жодного разу не покликавши на поміч.'],
  ['flawless', '✨', 'Без подряпини', 'Виграй партію, жодного разу не отримавши халепи від монстра.'],
  ['big_kill', '🦣', 'Мисливець на велетнів', 'Переможи монстра 16-го рівня або вище.'],
  ['dragon', '🐉', 'Драконоборець', 'Переможи дракона.'],
  ['triple', '🎯', 'Три в одному', 'Переможи трьох і більше монстрів в одному бою.'],
  ['helper', '💛', 'Добра душа', 'Допоможи іншим перемогти в 5 боях.'],
  ['thief', '🥷', 'Спритні руки', 'Успішно поцуп річ Злодюжкою.'],
  ['backstab', '🔪', 'Удар у спину', 'Вдар у спину тричі за один бій.'],
  ['cursed', '⛓️', 'Магніт для бід', 'Май одночасно три тривалі прокляття.'],
  ['rich', '💰', 'Золота лихоманка', 'Продай речей на 2000 золотих за одну партію.']
];
function statsLoad() {
  try { const d = JSON.parse(localStorage.getItem(STATS_KEY) || 'null'); if (d && d.modes) return d; } catch (e) { }
  return { modes: { ffa: { p: 0, w: 0 }, teams: { p: 0, w: 0 }, coop: { p: 0, w: 0 } }, kills: 0, helps: 0, best: null, ach: {} };
}
let STATS = statsLoad();
function statsSave() { try { localStorage.setItem(STATS_KEY, JSON.stringify(STATS)); } catch (e) { } }
// «ти» в поточній партії
function statMe() { if (!G.players.length) return null; if (NET.role === 'client') return G.players[NET.me] || null; return G.players.find(q => q.type === 'human') || null; }
const isMe = p => !!p && p === statMe();
const gameMode = () => G.coop ? 'coop' : G.teams ? 'teams' : 'ffa';
const achUnlocks = id => [...Object.values(SKINS).filter(S => S.ach === id).map(S => `стіл «${S.name}»`), ...Object.values(CARD_SKINS).filter(S => S.ach === id).map(S => `карти «${S.name}»`), ...Object.keys(PANEL_ACH).filter(k => PANEL_ACH[k] === id).map(k => `тло «${PANELS[k]}»`)].join(', ');
function achieve(id) {
  if (STATS.ach[id]) return;
  const a = ACH.find(x => x[0] === id); if (!a) return;
  STATS.ach[id] = Date.now(); statsSave();
  const el = document.createElement('div'); el.className = 'achv';
  const un = achUnlocks(id);
  el.innerHTML = `<span class="ae">${a[1]}</span><span><small>Досягнення</small><b>${esc(a[2])}</b>${un ? `<small class="unl">🔓 Відкрито ${esc(un)} — у «Стіл»</small>` : ''}</span>`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 4200);
  playSfx('levelUp');
}
// події партії (на господарі чи в локальній грі)
function statOnKill(p, helper, cb) {
  if (!cb || cb.boss) return;
  if (isMe(p)) {
    STATS.kills++;
    const top = Math.max(...cb.mons.map(x => typeof x.c.lvl === 'number' ? x.c.lvl : 0));
    const topC = cb.mons.find(x => x.c.lvl === top);
    if (!STATS.best || top > STATS.best.lvl) STATS.best = { lvl: top, name: topC ? topC.c.name : '' };
    if (top >= 16) achieve('big_kill');
    if (cb.mons.some(x => x.c.dragon)) achieve('dragon');
    if (cb.mons.length >= 3) achieve('triple');
    statsSave();
  }
  if (isMe(helper)) { STATS.helps++; statsSave(); if (STATS.helps >= 5) achieve('helper'); }
}
function statFlag(k, v = true) { G.stat = G.stat || {}; G.stat[k] = v; }
function statSold(p, price) { if (!isMe(p)) return; G.stat = G.stat || {}; G.stat.sold = (G.stat.sold || 0) + price; if (G.stat.sold >= 2000) achieve('rich'); }
function statGameEnd(won) {
  const me = statMe(); if (!me || G._statDone === G.gid) return;
  G._statDone = G.gid;
  const m = STATS.modes[gameMode()]; m.p++; if (won) m.w++;
  const total = Object.values(STATS.modes).reduce((s, x) => s + x.p, 0);
  statsSave();
  if (total >= 10) achieve('ten_games');
  if (!won) return;
  achieve('first_win');
  if (G.coop) { achieve('coop_win'); if (G.coop.diff === 'hard') achieve('coop_hard'); }
  else if (G.teams) achieve('team_win');
  if (!G.coop && G.goal > 10) achieve('epic_win');
  if (NET.role !== 'client') { const st = G.stat || {}; if (!st.asked) achieve('no_help'); if (!st.hit) achieve('flawless'); }
}

/* --- екран у головному меню --- */
function openStats() {
  const mName = { ffa: 'Кожен сам за себе', teams: 'Командна гра', coop: 'Похід на Боса' };
  const rows = Object.entries(STATS.modes).map(([k, x]) => `<tr><td>${mName[k]}</td><td>${x.p}</td><td>${x.w}</td><td>${x.p ? Math.round(x.w / x.p * 100) + '%' : '—'}</td></tr>`).join('');
  const got = ACH.filter(a => STATS.ach[a[0]]).length;
  showModal(`<h2>Досягнення</h2>
    <p class="hint" id="accLine">${typeof accLineHTML === 'function' ? accLineHTML() : ''}</p>
    <table class="cstats"><tr><th>Режим</th><th>Партій</th><th>Перемог</th><th>Відсоток</th></tr>${rows}</table>
    <div class="st-line">Переможено монстрів: <b>${STATS.kills}</b> · допомог іншим: <b>${STATS.helps}</b>${STATS.best ? ` · найсильніший переможений: <b>${esc(STATS.best.name)}</b> (${STATS.best.lvl})` : ''}</div>
    <h3>Досягнення · ${got} / ${ACH.length}</h3>
    <div class="ach-grid">${ACH.map(([id, e, n, d]) => { const t = STATS.ach[id]; return `<div class="ach${t ? ' on' : ''}"><span class="ae">${t ? e : '🔒'}</span><span><b>${esc(n)}</b><small>${esc(d)}${t ? ` · ${new Date(t).toLocaleDateString('uk-UA')}` : ''}</small>${achUnlocks(id) ? `<small class="unl">${t ? '🔓' : '🎁'} ${esc(achUnlocks(id))}</small>` : ''}</span></div>`; }).join('')}</div>
    <label class="chk" style="margin-top:12px"><input type="checkbox" id="stTele" ${typeof teleOn === 'function' && teleOn() ? 'checked' : ''}> Надсилати анонімну статистику партій (раси, класи, монстри — без імен), щоб покращувати баланс гри</label>
    <div class="row end"><button class="btn small" type="button" id="stBal">📊 Баланс гри</button><button class="btn small" type="button" id="stBoard">🏆 Загальний борд</button><button class="btn ghost small" type="button" id="stReset">Скинути статистику</button><button class="btn primary" type="button" data-close>Назад</button></div>`, 'wide');
  $('#stBoard').onclick = () => openBoard(() => openStats());
  $('#stBal').onclick = () => openBalance(() => openStats());
  $('#stTele').onchange = e => { try { localStorage.setItem(TELE_KEY, e.target.checked ? '1' : '0'); } catch (er) { } };
  $('#stReset').onclick = async () => {
    if (typeof ACC !== 'undefined' && ACC) {
      if (await confirmModal('Скинути статистику акаунта?', 'Усі партії й досягнення буде стерто на всіх твоїх пристроях. Загальний борд це не змінить.', 'Скинути', 'Ні')) {
        try { const d = await api('POST', '/stats/reset', {}); lsSet(BASE_KEY, d.stats); lsSet(PEND_KEY, null); statsReplace(d.stats); } catch (e) { toast(accErrText(e), 2600); }
      }
    } else if (await confirmModal('Скинути статистику?', 'Усі партії й досягнення на цьому пристрої буде стерто.', 'Скинути', 'Ні')) { localStorage.removeItem(STATS_KEY); STATS = statsLoad(); }
    openStats();
  };
}

// стіл чи тло, відкриті досягненням, могли зачинитися (скинули статистику) — повертаємо звичайні
if (skinLocked(SKIN_ID)) applySkin('tavern');
if (panelLocked(PANEL_ID)) applyPanel('oak');
if (cskinLocked(CSKIN_ID)) applyCardSkin('classic');
