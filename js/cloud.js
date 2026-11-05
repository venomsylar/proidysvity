'use strict';

/* ============================== ХМАРНІ ДОПОМІЖНИКИ ==============================
   1) Відкриті кімнати: господар обирає «відкрита» чи «закрита». Відкриту видно в списку
      «Приєднатися», поки в ній чекають гравців.
   2) Відновлення кімнати: на початку кожного ходу господар зберігає партію на сервері.
      Якщо його браузер перезавантажився чи впав — «Відновити кімнату» в головному меню:
      той самий код, гравці підключаються самі й грають далі.
   3) Анонімна статистика партій для балансу (раси, класи, монстри — без імен). */
const HOSTREC_KEY = 'pdsv-hostroom', TELE_KEY = 'pdsv-tele';
const roomSecretNew = () => randId() + randId();
const gameIsLive = () => G.players.length && !G.over && G.phase !== 'setup';

/* --- 1. відкриті кімнати --- */
let roomTimer = 0, roomSoonT = 0;
function roomListable() { return NET.role === 'host' && NET.code && NET.roomSecret && !!setupState.roomOpen && !gameIsLive() && setupState.rows.length < 6; }
async function roomTick(now = false) {
  if (!now) { clearTimeout(roomSoonT); roomSoonT = setTimeout(() => roomTick(true), 800); return; }
  if (!roomTimer) roomTimer = setInterval(() => roomTick(true), 20000);
  try {
    if (roomListable()) {
      const host = setupState.rows.find(r => r.type === 'human');
      await api('POST', '/rooms/announce', { code: NET.code, secret: NET.roomSecret, name: (ACC && ACC.user.name) || (host && host.name) || 'Гравець', mode: setupState.mode, goal: setupState.goal, n: setupState.rows.length, ver: APP_VERSION });
      NET.listed = NET.code;
    } else if (NET.listed) { const code = NET.listed; NET.listed = ''; await api('POST', '/rooms/close', { code, secret: NET.roomSecret }); }
  } catch (e) { /* без сервера кімната працює як закрита */ }
}
function roomCloseAll() {
  const code = NET.code, secret = NET.roomSecret; NET.listed = '';
  if (code && secret) { api('POST', '/room/drop', { code, secret }).catch(() => { }); }
  lsSet(HOSTREC_KEY, null);
}
const MODE_NAME = { ffa: 'кожен сам за себе', teams: 'командна гра', coop: 'похід на Боса' };
async function roomsRender() {
  const el = $('#jRooms'); if (!el) return;
  let list;
  try { list = (await api('GET', '/rooms?ver=' + APP_VERSION, null, 6000)).rooms || []; }
  catch (e) { if ($('#jRooms') === el) el.innerHTML = '<p class="hint">Список відкритих кімнат зараз недоступний — заходь за кодом.</p>'; return; }
  if ($('#jRooms') !== el) return;
  el.innerHTML = list.length
    ? list.map(r => `<button type="button" class="room-it" data-rc="${esc(r.code)}"><b>${esc(r.name)}</b><span>${esc(MODE_NAME[r.mode] || '')}${r.mode !== 'coop' ? ` · до ${r.goal} рівня` : ''}</span><em>${r.n} / 6</em></button>`).join('')
    : '<p class="hint">Відкритих кімнат зараз немає. Створи свою — або заходь за кодом від друзів.</p>';
}
function roomsPoll() {
  const el = $('#jRooms'); if (!el || el._poll) return;
  el._poll = true; roomsRender();
  const t = setInterval(() => { if (!$('#jRooms') || $('#modal').hidden) { clearInterval(t); return; } roomsRender(); }, 5000);
}

/* --- 2. відновлення кімнати господаря --- */
let hostSaveBusy = false;
async function hostCloudSave() {
  if (NET.role !== 'host' || !NET.roomSecret || !gameIsLive() || hostSaveBusy) return;
  if (!G.players.some(p => p.type === 'remote' || p.wasRemote)) return; // гостей немає — вистачає звичайного збереження
  hostSaveBusy = true;
  try {
    const data = saveData(true);
    lsSet(HOSTREC_KEY, { code: NET.code, secret: NET.roomSecret, t: Date.now(), names: G.players.map(p => p.name).join(', ') });
    await api('POST', '/room/save', { code: NET.code, secret: NET.roomSecret, data }, 15000);
  } catch (e) { } finally { hostSaveBusy = false; }
}
function hostCloudDrop() {
  if (NET.role !== 'host' || !NET.roomSecret) return;
  api('POST', '/room/drop', { code: NET.code, secret: NET.roomSecret }).catch(() => { });
  lsSet(HOSTREC_KEY, null); NET.listed = '';
}
const hostRec = () => { const r = lsGet(HOSTREC_KEY); return r && r.code && r.secret && Date.now() - r.t < 12 * 3600e3 ? r : null; };
async function hostResume() {
  const rec = hostRec(); if (!rec) { toast('Немає кімнати, яку можна відновити'); return; }
  hideMainMenu();
  showModal(`<h2>Відновлюємо кімнату ${esc(rec.code)}</h2><p id="hrSt">Завантажуємо партію з сервера…</p><p class="hint">Гравці підключаться самі — їхня гра кілька хвилин пробує повернутися. Якщо хтось не встигне, він може натиснути «Повернутися в гру» в головному меню.</p><div class="row end"><button class="btn ghost" type="button" id="hrNo">Скасувати</button></div>`);
  let cancelled = false; $('#hrNo').onclick = () => { cancelled = true; closeModal(); openMainMenu(); };
  let d;
  try { d = JSON.parse((await api('POST', '/room/load', { code: rec.code, secret: rec.secret }, 20000)).data); }
  catch (e) { if (!cancelled) { $('#hrSt').textContent = e.code === 'no_save' ? 'На сервері вже немає цієї партії (вона закінчилась або минуло понад 12 годин).' : accErrText(e); } if (e.code === 'no_save') lsSet(HOSTREC_KEY, null); return; }
  if (cancelled) return;
  if (!d || d.v !== APP_VERSION) { $('#hrSt').textContent = 'Партію збережено в іншій версії гри — відновити не вийде.'; return; }
  $('#hrSt').textContent = `Відкриваємо кімнату ${rec.code}… (якщо код ще зайнятий, чекаємо до хвилини)`;
  NET.roomSecret = rec.secret;
  hostRoom(rec.code, (ok, why) => {
    if (cancelled) return;
    if (!ok) { $('#hrSt').textContent = 'Не вдалося відкрити кімнату: ' + (why || 'помилка мережі') + '. Спробуй ще раз за хвилину.'; return; }
    closeModal();
    resumeGame(d);
    // гості ще не підключились: тримаємо їхні місця, як після обриву звʼязку
    const gid = G.gid;
    G.players.forEach(p => { if (p.type === 'remote') { p.offline = Date.now(); clearTimeout(p._dropT); p._dropT = setTimeout(() => { if (G.gid === gid) dropToBot(p); }, NET_GRACE * 2); } });
    log(`Кімнату ${rec.code} відновлено. Чекаємо, поки гравці повернуться.`, 'turn');
    renderUI();
  });
}

/* --- 3. анонімна статистика для балансу --- */
const teleOn = () => { try { return localStorage.getItem(TELE_KEY) !== '0'; } catch (e) { return true; } };
function teleMon(c, k) {
  if (!c || !c.name || NET.role === 'client') return;
  const T = G.tele = G.tele || { t0: Date.now(), mons: {} };
  const m = T.mons[c.name] = T.mons[c.name] || { f: 0, w: 0, fl: 0, h: 0 };
  m[k]++; m.f++;
}
function teleSend(winIdx) {
  if (NET.role === 'client' || !teleOn() || G.players.length < 2 || !G.tele || G.tele.sent) return;
  G.tele.sent = true;
  const body = {
    mode: gameMode(), goal: G.goal, turns: G.turnNo || 0, minutes: Math.round((Date.now() - (G.tele.t0 || Date.now())) / 60000),
    players: G.players.map(p => ({ race: raceCards(p).map(c => c.race), cls: clsCards(p).map(c => c.cls), bot: p.type === 'bot', level: p.level, win: winIdx.includes(p.idx) })),
    mons: G.tele.mons
  };
  api('POST', '/tele', body).catch(() => { });
}
async function openBalance(back) {
  const done = () => { closeModal(); if (back) back(); };
  showModal('<h2>📊 Баланс гри</h2><p class="hint">Завантаження…</p>', 'wide');
  let d;
  try { d = await api('GET', '/balance'); } catch (e) { showModal(`<h2>📊 Баланс гри</h2><p>${esc(accErrText(e))}</p><div class="row end"><button class="btn primary" type="button" id="blBack">Назад</button></div>`); $('#blBack').onclick = done; return; }
  const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';
  const nm = (kind, k) => k === 'none' ? (kind === 'race' ? 'без раси' : 'без класу') : kind === 'race' ? (RACES[k] ? RACES[k].name : k) : (CLASSES[k] ? CLASSES[k].name : k);
  const pick = kind => { const L = (d.picks || []).filter(r => r.kind === kind).sort((a, b) => b.wins / Math.max(1, b.games) - a.wins / Math.max(1, a.games));
    return L.length ? `<table class="cstats bal-t"><tr><th>${kind === 'race' ? 'Раса' : 'Клас'}</th><th>Партій</th><th>Перемог</th><th>Сер. рівень</th></tr>${L.map(r => `<tr><td>${esc(nm(kind, r.key))}</td><td>${r.games}</td><td>${pct(r.wins, r.games)}</td><td>${(r.levels / Math.max(1, r.games)).toFixed(1)}</td></tr>`).join('')}</table>` : '<p class="hint">Поки немає даних.</p>'; };
  const mons = (d.mons || []).slice().sort((a, b) => a.wins / a.fights - b.wins / b.fights);
  const g = d.games || [], total = g.reduce((s, x) => s + x.games, 0);
  showModal(`<h2>📊 Баланс гри</h2>
    <p class="hint">Анонімна статистика всіх партій усіх гравців (без імен). Зіграно партій: <b>${total}</b>${g.length ? ' · ' + g.map(x => `${MODE_NAME[x.mode]}: ${x.games} (сер. ${Math.round(x.turns / Math.max(1, x.games))} ходів, ${Math.round(x.minutes / Math.max(1, x.games))} хв; перемоги ботів ${pct(x.bot_wins, x.games)})`).join(' · ') : ''}.</p>
    <h3>Раси</h3><div class="bd-wrap">${pick('race')}</div>
    <h3>Класи</h3><div class="bd-wrap">${pick('cls')}</div>
    <h3>Монстри · найзліші вгорі</h3>${mons.length ? `<div class="bd-wrap"><table class="cstats bal-t"><tr><th>Монстр</th><th>Боїв</th><th>Герой переміг</th><th>Утік</th><th>Халепа</th></tr>${mons.map(m => `<tr><td>${esc(m.name)}</td><td>${m.fights}</td><td>${pct(m.wins, m.fights)}</td><td>${pct(m.fled, m.fights)}</td><td>${pct(m.hit, m.fights)}</td></tr>`).join('')}</table></div>` : '<p class="hint">Поки замало боїв (монстр зʼявляється тут після трьох).</p>'}
    <div class="row end"><button class="btn primary" type="button" id="blBack">Назад</button></div>`, 'wide');
  $('#blBack').onclick = done;
}
