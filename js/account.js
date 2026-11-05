'use strict';

/* ============================== АКАУНТ І СПІЛЬНА СТАТИСТИКА ==============================
   Необовʼязковий вхід (імʼя + пароль) на сервері гри. Статистика й досягнення живуть
   у локальному STATS, а з сервером синхронізуються «пакетами змін»: пристрій надсилає
   лише те, що набіг з останньої синхронізації, тож гра на двох пристроях складається, а не
   перезаписується. Загальний борд рахує лише партії через інтернет, які підтвердили
   щонайменше двоє гравців з акаунтами (кожен зі свого пристрою). */
const API_URL = (() => { try { return localStorage.getItem('pdsv-api') || 'https://proidysvity-api.sylar11111.workers.dev'; } catch (e) { return 'https://proidysvity-api.sylar11111.workers.dev'; } })();
const ACC_KEY = 'pdsv-acc', BASE_KEY = 'pdsv-acc-base', PEND_KEY = 'pdsv-acc-pend';
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
let ACC = lsGet(ACC_KEY); // { token, user: { id, name } }
const ACCS = { busy: false, err: '', last: 0, timer: 0 };

async function api(method, path, body, timeout = 9000) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(API_URL + path, { method, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(ACC && ACC.token ? { Authorization: 'Bearer ' + ACC.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/auth/login') accDropSession();
    if (!r.ok) throw Object.assign(new Error(d.error || 'http'), { code: d.error || 'http' });
    return d;
  } catch (e) { if (!e.code) e.code = 'offline'; throw e; } finally { clearTimeout(tm); }
}
const ACC_ERR = {
  offline: 'Сервер гри недоступний. Перевір інтернет і спробуй ще раз.', bad_name: 'Імʼя: від 3 до 16 символів — літери, цифри, пробіл, крапка, «-» чи «_».',
  bad_pass: 'Пароль: від 6 до 64 символів.', name_taken: 'Таке імʼя вже зайняте. Обери інше або увійди.', bad_login: 'Неправильне імʼя або пароль.', auth: 'Сесія скінчилась — увійди ще раз.', server: 'Помилка на сервері. Спробуй трохи згодом.'
};
const accErrText = e => ACC_ERR[e && e.code] || 'Не вдалося. Спробуй ще раз.';

/* --- арифметика статистики (така сама, як на сервері) --- */
const statsEmpty = () => ({ modes: { ffa: { p: 0, w: 0 }, teams: { p: 0, w: 0 }, coop: { p: 0, w: 0 } }, kills: 0, helps: 0, best: null, ach: {} });
function statsDiff(a, b) {
  const d = statsEmpty(); b = b || statsEmpty();
  for (const m of Object.keys(d.modes)) { const x = (a.modes || {})[m] || {}, y = (b.modes || {})[m] || {}; d.modes[m].p = Math.max(0, (x.p || 0) - (y.p || 0)); d.modes[m].w = Math.max(0, (x.w || 0) - (y.w || 0)); }
  d.kills = Math.max(0, (a.kills || 0) - (b.kills || 0)); d.helps = Math.max(0, (a.helps || 0) - (b.helps || 0));
  if (a.best && (!b.best || a.best.lvl > b.best.lvl)) d.best = a.best;
  for (const [k, t] of Object.entries(a.ach || {})) if (!(b.ach || {})[k]) d.ach[k] = t;
  return d;
}
function statsAdd(a, d) {
  const o = JSON.parse(JSON.stringify(a || statsEmpty()));
  for (const m of Object.keys(d.modes)) { o.modes[m] = o.modes[m] || { p: 0, w: 0 }; o.modes[m].p += d.modes[m].p; o.modes[m].w += d.modes[m].w; }
  o.kills = (o.kills || 0) + d.kills; o.helps = (o.helps || 0) + d.helps;
  if (d.best && (!o.best || d.best.lvl > o.best.lvl)) o.best = d.best;
  o.ach = o.ach || {}; for (const [k, t] of Object.entries(d.ach)) if (!o.ach[k] || t < o.ach[k]) o.ach[k] = t;
  return o;
}
const statsDeltaEmpty = d => !d.kills && !d.helps && !d.best && !Object.keys(d.ach).length && Object.values(d.modes).every(x => !x.p && !x.w);
const randId = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');

// замінити локальну статистику (і перевірити, чи не зачинилися/відчинилися скіни)
function statsReplace(next) {
  for (const k of Object.keys(STATS)) delete STATS[k];
  Object.assign(STATS, next); statsSaveRaw();
  if (skinLocked(SKIN_ID)) applySkin('tavern');
  if (panelLocked(PANEL_ID)) applyPanel('oak');
  if (cskinLocked(CSKIN_ID)) applyCardSkin('classic');
}

/* --- синхронізація --- */
async function accSync(force = false) {
  if (!ACC || ACCS.busy) return;
  ACCS.busy = true; ACCS.err = '';
  try {
    let pend = lsGet(PEND_KEY);
    const base = lsGet(BASE_KEY) || statsEmpty();
    if (!pend) { const d = statsDiff(STATS, base); if (!statsDeltaEmpty(d)) { pend = { id: randId(), delta: d }; lsSet(PEND_KEY, pend); } }
    let total;
    if (pend) total = (await api('POST', '/stats/push', pend)).stats;
    else if (force || performance.now() - ACCS.last > 60000) total = (await api('GET', '/me')).stats;
    if (total) {
      // те, що набігло локально, поки йшов запит, не губимо
      const unsynced = statsDiff(STATS, pend ? statsAdd(base, pend.delta) : base);
      lsSet(BASE_KEY, total); lsSet(PEND_KEY, null);
      statsReplace(statsAdd(total, unsynced));
      ACCS.last = performance.now();
    }
  } catch (e) { ACCS.err = e.code || 'offline'; } finally { ACCS.busy = false; accRender(); }
}
// після кожного збереження статистики — синхронізація з невеликою затримкою
function accSoon() { if (!ACC) return; clearTimeout(ACCS.timer); ACCS.timer = setTimeout(() => accSync(), 2500); accBadge(); }
const statsSaveRaw = statsSave;
statsSave = function () { statsSaveRaw(); accSoon(); };

function accDropSession() { if (!ACC) return; ACC = null; lsSet(ACC_KEY, null); lsSet(BASE_KEY, null); lsSet(PEND_KEY, null); toast('Тебе вийшло з акаунта — увійди знову (👤 угорі)', 3200); accBadge(); }

async function accLogin(name, pass, isNew) {
  const d = await api('POST', isNew ? '/auth/register' : '/auth/login', { name, pass });
  const hadLocal = !statsDeltaEmpty(statsDiff(STATS, statsEmpty()));
  ACC = { token: d.token, user: d.user }; lsSet(ACC_KEY, ACC); accBadge();
  // перший вхід на цьому пристрої: усе, що тут уже було награно, додаємо до акаунта
  lsSet(BASE_KEY, statsEmpty()); lsSet(PEND_KEY, null);
  if (!hadLocal) { lsSet(BASE_KEY, d.stats); statsReplace(d.stats); }
  await accSync(true);
  return hadLocal;
}
async function accLogout() {
  try { await api('POST', '/auth/logout', {}); } catch (e) { }
  ACC = null; lsSet(ACC_KEY, null); lsSet(BASE_KEY, null); lsSet(PEND_KEY, null);
  statsReplace(statsEmpty()); // статистика лишається на сервері; цей пристрій знову «чистий»
  accBadge();
}

/* --- партії через інтернет для загального борду --- */
// господар: коли в партії щонайменше двоє людей з акаунтами — просимо в сервера номер партії
async function vgStart() {
  G.vg = null;
  if (NET.role !== 'host' || !ACC) return;
  const map = {}, me = G.players.find(p => p.type === 'human');
  if (me) map[me.idx] = ACC.user.id;
  G.players.forEach(p => { const a = p._row && p._row.acc; if (p.type === 'remote' && a && Number.isInteger(a.id) && !Object.values(map).includes(a.id)) map[p.idx] = a.id; });
  if (Object.keys(map).length < 2) return;
  const gid = G.gid;
  try {
    const d = await api('POST', '/game/start', { participants: Object.values(map), mode: gameMode() });
    if (G.gid !== gid) return;
    G.vg = { id: d.gameId, map }; queueSnap();
    log(`🏆 Партію зареєстровано для загального борду: ${Object.keys(map).length} гравці з акаунтами.`);
  } catch (e) { /* без сервера просто граємо */ }
}
// кожен гравець з акаунтом сам повідомляє, хто переміг
async function vgReport(winIdx) {
  const vg = G.vg; if (!vg || !ACC || !Object.values(vg.map).includes(ACC.user.id) || vg.sent) return;
  vg.sent = true;
  const winners = winIdx.map(i => vg.map[i]).filter(x => x != null);
  try {
    const d = await api('POST', '/game/result', { gameId: vg.id, winners });
    if (d.status === 'confirmed') toast('🏆 Партію зараховано до загального борду', 2800);
    else if (d.status === 'pending') toast('🏆 Результат надіслано — борд оновиться, щойно підтвердить ще хтось із гравців', 3200);
    else if (d.status === 'too_short') toast('Партія коротша за 4 хвилини — на загальний борд не йде', 2800);
  } catch (e) { vg.sent = false; }
}
const vgWinners = p => G.teams ? G.players.filter(q => sameTeam(q, p)).map(q => q.idx) : [p.idx];

/* --- вікна --- */
function accRender() { const el = $('#accLine'); if (el) el.innerHTML = accLineHTML(); accBadge(); }
// значок акаунта у верхній панелі й на головному екрані: імʼя + крапка стану
function accBadge() {
  const st = !ACC ? 'off' : ACCS.err ? 'err' : (ACCS.busy || lsGet(PEND_KEY)) ? 'sync' : 'ok';
  const tip = !ACC ? 'Ти не увійшов в акаунт — статистика лише на цьому пристрої. Натисни, щоб увійти.'
    : st === 'err' ? `${ACC.user.name}: немає звʼязку з сервером — синхронізую, щойно зʼявиться інтернет.` : st === 'sync' ? `${ACC.user.name}: синхронізація…` : `${ACC.user.name}: увійшов, статистика синхронізована.`;
  const html = ACC ? `<span class="ad ${st}" aria-hidden="true"></span><span class="ai" aria-hidden="true">👤</span><span class="an">${esc(ACC.user.name)}</span>` : `<span class="ai" aria-hidden="true">👤</span><span class="an">Увійти</span>`;
  for (const el of document.querySelectorAll('.acc-chip')) { el.innerHTML = html; el.title = tip; el.setAttribute('aria-label', tip); el.classList.toggle('in', !!ACC); }
}
function accLineHTML() {
  if (!ACC) return `Статистика зберігається лише на цьому пристрої. <button type="button" class="linkbtn" data-acc>Увійди</button>, щоб вона була спільна для всіх твоїх пристроїв.`;
  return `👤 <b>${esc(ACC.user.name)}</b> · ${ACCS.busy ? 'синхронізація…' : ACCS.err ? `<span class="neg">${ACCS.err === 'offline' ? 'немає звʼязку — синхронізую пізніше' : 'не вдалося синхронізувати'}</span>` : 'статистика спільна для всіх твоїх пристроїв'} · <button type="button" class="linkbtn" data-acc>Акаунт</button>`;
}
function openAccount(back) {
  const done = () => { closeModal(); if (back) back(); };
  if (ACC) {
    showModal(`<h2>👤 ${esc(ACC.user.name)}</h2><p>Твоя статистика й досягнення зберігаються на сервері гри й однакові на всіх пристроях, де ти увійшов.</p>
      <p class="hint" id="accSt">${accLineHTML()}</p>
      <div class="row"><button class="btn" type="button" id="accSync">Синхронізувати зараз</button><button class="btn" type="button" id="accBoard">🏆 Загальний борд</button></div>
      <div class="row end"><button class="btn ghost" type="button" id="accOut">Вийти з акаунта</button><button class="btn primary" type="button" id="accDone">Готово</button></div>`);
    $('#accDone').onclick = done;
    $('#accSync').onclick = async () => { $('#accSt').textContent = 'Синхронізація…'; await accSync(true); $('#accSt').innerHTML = accLineHTML(); };
    $('#accBoard').onclick = () => openBoard(() => openAccount(back));
    $('#accOut').onclick = async () => { if (!await confirmModal('Вийти з акаунта?', 'Статистика лишиться на сервері. На цьому пристрої вона зникне, доки не увійдеш знову.', 'Вийти', 'Скасувати')) { openAccount(back); return; } await accLogout(); toast('Ти вийшов з акаунта', 1800); openAccount(back); };
    return;
  }
  let mode = 'login';
  const draw = (err = '') => `<h2>Акаунт</h2><p>Увійди, щоб статистика й досягнення (а з ними — відкриті столи, карти й тла) були спільні для телефону, планшета й компʼютера. Також тоді партії через інтернет потрапляють на загальний борд.</p>
    <div class="seg" role="group" aria-label="Вхід чи реєстрація"><button type="button" data-am="login" aria-pressed="${mode === 'login'}">Увійти</button><button type="button" data-am="new" aria-pressed="${mode === 'new'}">Створити акаунт</button></div>
    <form id="accForm" class="accform" autocomplete="on">
      <label>Імʼя гравця<input id="accName" name="username" autocomplete="username" maxlength="16" required value="${esc(($('#accName') || {}).value || '')}"></label>
      <label>Пароль<span class="pw"><input id="accPass" name="password" type="password" autocomplete="${mode === 'new' ? 'new-password' : 'current-password'}" minlength="6" maxlength="64" required><button type="button" class="pw-eye" id="accEye" aria-label="Показати пароль" title="Показати пароль">👁</button></span></label>
      ${mode === 'new' ? '<p class="hint">Пошта не потрібна. Запамʼятай пароль: відновити його не вийде. Якщо браузер сам запропонує «надійний пароль» — натисни 👁, щоб побачити й записати його.</p>' : ''}
      <p class="acc-err" role="alert">${esc(err)}</p>
      <div class="row end"><button class="btn ghost" type="button" id="accCancel">Назад</button><button class="btn primary" type="submit" id="accGo">${mode === 'new' ? 'Створити' : 'Увійти'}</button></div>
    </form>`;
  const wire = () => {
    $('#accCancel').onclick = done;
    $('#accEye').onclick = () => { const i = $('#accPass'), show = i.type === 'password'; i.type = show ? 'text' : 'password'; $('#accEye').setAttribute('aria-label', show ? 'Сховати пароль' : 'Показати пароль'); $('#accEye').classList.toggle('on', show); };
    $('#sheet').querySelectorAll('[data-am]').forEach(b => b.onclick = () => { mode = b.dataset.am; $('#sheet').innerHTML = draw(); wire(); });
    $('#accForm').onsubmit = async e => {
      e.preventDefault(); const name = $('#accName').value.trim(), pass = $('#accPass').value;
      $('#accGo').disabled = true; $('#accGo').textContent = '…';
      try {
        const had = await accLogin(name, pass, mode === 'new');
        toast(had ? 'Готово! Статистику цього пристрою додано до акаунта' : `Вітаємо, ${ACC.user.name}!`, 2600);
        openAccount(back);
      } catch (er) { $('#sheet').innerHTML = draw(accErrText(er)); wire(); $('#accName').value = name; }
    };
  };
  showModal(draw()); wire();
}
async function openBoard(back) {
  const done = () => { closeModal(); if (back) back(); };
  showModal(`<h2>🏆 Загальний борд</h2><p class="hint">Завантаження…</p>`, 'wide');
  let d;
  try { d = await api('GET', '/board'); } catch (e) { showModal(`<h2>🏆 Загальний борд</h2><p>${esc(accErrText(e))}</p><div class="row end"><button class="btn primary" type="button" id="bdBack">Назад</button></div>`); $('#bdBack').onclick = done; return; }
  const meId = ACC && ACC.user.id, pct = (w, g) => g ? Math.round(w / g * 100) + '%' : '—';
  const rows = (d.top || []).map((r, i) => `<tr class="${r.id === meId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.wins}</td><td>${r.games}</td><td>${r.coop_wins} / ${r.coop_games}</td><td>${pct(r.wins + r.coop_wins, r.games + r.coop_games)}</td></tr>`).join('');
  showModal(`<h2>🏆 Загальний борд</h2>
    <p class="hint">Лише партії через інтернет, у яких були щонайменше двоє гравців з акаунтами і які тривали понад 4 хвилини. Результат зараховується, коли його підтвердила більшість гравців — кожен зі свого пристрою.</p>
    ${rows ? `<div class="bd-wrap"><table class="cstats board-t"><tr><th>#</th><th>Гравець</th><th>Перемог</th><th>Партій</th><th>Похід (перемог / партій)</th><th>Відсоток</th></tr>${rows}</table></div>` : '<p>Поки що порожньо. Зіграй партію через інтернет із друзями, які теж увійшли в акаунт!</p>'}
    ${ACC ? '' : '<p class="hint">Щоб потрапити сюди, <button type="button" class="linkbtn" id="bdLogin">увійди в акаунт</button>.</p>'}
    <div class="row end"><button class="btn primary" type="button" id="bdBack">Назад</button></div>`, 'wide');
  $('#bdBack').onclick = done;
  if ($('#bdLogin')) $('#bdLogin').onclick = () => openAccount(() => openBoard(back));
}
document.addEventListener('click', e => { const b = e.target.closest('[data-acc]'); if (b) { e.preventDefault(); const back = $('#modal').hidden ? null : () => openStats(); openAccount(back); } });
// старт: якщо вже увійшли — підтягнути зміни з інших пристроїв
if (ACC) setTimeout(() => accSync(true), 1500);
accBadge(); setTimeout(accBadge, 50); // головне меню будується трохи пізніше
addEventListener('online', () => accSync(true));
document.addEventListener('visibilitychange', () => { if (!document.hidden) accSync(); });
