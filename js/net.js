'use strict';

/* ============================== ГРА ПО МЕРЕЖІ ============================== */
const NET = { role: 'local', peer: null, code: '', conns: new Map(), conn: null, me: -1, gid: -1, asks: new Map(), askSeq: 0, flying: new Set(), mirror: new Map(), snapT: 0, busy: false, err: '', setupOpen: false };
const PEER_PREFIX = 'proidysvity-v1-';
const NET_GRACE = 60000;      // скільки господар чекає на гравця, що втратив звʼязок, перш ніж віддати хід боту
const NET_REJOIN = 120000;    // скільки гість сам пробує відновити звʼязок
const REJOIN_KEY = 'pdsv-rejoin';
NET.allConns = new Set(); NET.lastRx = 0; NET.tok = null; NET.rejoining = null;
const makeTok = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function rejoinRec() { try { const r = JSON.parse(localStorage.getItem(REJOIN_KEY) || 'null'); return r && r.code && r.tok && Date.now() - r.t < 6 * 3600e3 ? r : null; } catch (e) { return null; } }
function saveRejoin(r) { try { if (r) localStorage.setItem(REJOIN_KEY, JSON.stringify(r)); else localStorage.removeItem(REJOIN_KEY); } catch (e) { } }
// скільки секунд лишилось чекати на гравця без звʼязку (0 — звʼязок є)
const offLeft = p => !p || !p.offline ? 0 : NET.role === 'client' ? p.offline : Math.max(1, Math.ceil((p.offline + NET_GRACE - Date.now()) / 1000));
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; sc.onload = () => res(); sc.onerror = () => rej(new Error('load')); document.head.appendChild(sc); });
}
/* Сервер-посередник (TURN від Cloudflare): коли пристрої в різних мережах не бачать один одного напряму,
   дані йдуть через нього. Тимчасові паролі видає наш Worker; якщо він недоступний — працюємо як раніше. */
const TURN_URL = 'https://proidysvity-turn.sylar11111.workers.dev';
let ICE_CACHE = null;
async function getIce() {
  if (ICE_CACHE && Date.now() - ICE_CACHE.t < 6 * 3600e3) return ICE_CACHE.list;
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(TURN_URL, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(tm);
    if (!r.ok) throw new Error('turn ' + r.status);
    const j = await r.json();
    const list = (j.iceServers || []).filter(s => s && s.urls && [].concat(s.urls).length);
    if (!list.some(s => [].concat(s.urls).some(u => /^turns?:/.test(u)))) throw new Error('no turn');
    ICE_CACHE = { t: Date.now(), list }; NET.relay = true; return list;
  } catch (e) { NET.relay = false; return null; }
}
const peerOpts = ice => ice ? { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...ice] } } : { debug: 0 };
const makeCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rnd(32)]).join('');
function sendConn(c, msg) { try { if (c && c.open) c.send(msg); } catch (e) { /* зʼєднання могло закритися */ } }
function netSendTo(idx, msg) { if (NET.role === 'host') sendConn(NET.conns.get(idx), msg); }
function netAll(msg) { if (NET.role === 'host') NET.conns.forEach(c => sendConn(c, msg)); }
function netSendHost(msg) { sendConn(NET.conn, msg); }
const plainPose = p => ({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, tilt: p.tilt, flip: p.flip, s: p.s, tag: p.tag || null });
const poseVisibleTo = (p, idx) => p.tag && p.tag.k === 'h' ? p.tag.who === idx : p.flip < 1.57;
function netFly(c, from, to, dur, lift, meta) {
  NET.conns.forEach((conn, idx) => {
    const vis = poseVisibleTo(from, idx) || poseVisibleTo(to, idx) || meta.owner === idx;
    sendConn(conn, { t: 'fly', card: vis ? c : null, back: c.deck, uid: c.uid, from: plainPose(from), to: plainPose(to), dur, lift, owner: meta.owner == null ? -1 : meta.owner });
  });
}
function queueSnap() {
  if (NET.role !== 'host' || !NET.conns.size || NET.snapT) return;
  NET.snapT = setTimeout(() => { NET.snapT = 0; NET.conns.forEach((c, idx) => sendConn(c, { t: 'snap', s: snapFor(idx) })); }, 70);
}
function snapFor(i) {
  const cb = G.combat;
  return {
    gid: G.gid, goal: G.goal, teams: !!G.teams, cur: G.cur, phase: G.phase, busy: G.busy, over: G.over, log: G.log.slice(-60), prepWait: G.prepWait || [],
    dN: G.doorDeck.length, tN: G.treasureDeck.length, dTop: G.doorDiscard[G.doorDiscard.length - 1] || null, tTop: G.treasureDiscard[G.treasureDiscard.length - 1] || null,
    players: G.players.map(p => ({ idx: p.idx, team: p.team, name: p.name, type: p.type, off: offLeft(p), sub: !!p.wasRemote, color: p.color, sex: p.sex, diff: p.diff, level: p.level, gold: p.gold, gear: p.gear, raceCard: p.raceCard, clsCard: p.clsCard, raceCard2: p.raceCard2, clsCard2: p.clsCard2, dualRace: p.dualRace, dualCls: p.dualCls, curses: p.curses || [], died: p.died, mem: p.type === 'bot' ? p.mem : null, hand: p.idx === i ? p.hand : p.hand.length })),
    cb: cb ? { fighter: cb.fighter, mons: cb.mons.map(x => x.c), mods: cb.mods, pShots: cb.pShots, mShots: cb.mShots, helper: cb.helper, wiz: cb.wiz, asked: [...cb.asked], passed: [...cb.passed], offer: cb.offer } : null,
    win: G.window ? G.window.humans.map(h => h.idx) : null
  };
}
function askRemote(p, title, text, yes, no, timeout = 40000) {
  return new Promise(res => {
    const id = ++NET.askSeq; let t;
    const done = ok => { if (!NET.asks.has(id)) return; NET.asks.delete(id); clearTimeout(t); netSendTo(p.idx, { t: 'askEnd', id }); res(!!ok); };
    done.who = p.idx; NET.asks.set(id, done);
    if (p.offline) { done(false); return; }
    t = setTimeout(() => done(false), timeout);
    netSendTo(p.idx, { t: 'ask', id, title, text, yes, no });
  });
}
function sendLobby() {
  if (NET.role !== 'host') return;
  const rows = setupState.rows.map(r => ({ name: r.name, type: r.type, sex: r.sex, team: setupState.teams ? r.team | 0 : null }));
  setupState.rows.forEach((r, i) => { if (r.conn) sendConn(r.conn, { t: 'lobby', code: NET.code, rows, you: i }); });
}
async function hostRoom() {
  NET.err = ''; NET.busy = true; rerenderSetup && rerenderSetup();
  try { await loadPeer(); } catch (e) { NET.busy = false; NET.err = 'Не вдалося завантажити модуль мережі. Перевір інтернет.'; rerenderSetup && rerenderSetup(); return; }
  const ice = await getIce();
  const tryOpen = (attempt) => {
    const code = makeCode();
    const peer = new window.Peer(PEER_PREFIX + code, peerOpts(ice));
    peer.on('open', () => { NET.role = 'host'; NET.peer = peer; NET.code = code; NET.busy = false; rerenderSetup && rerenderSetup(); chatSync(); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && attempt < 3) { peer.destroy(); tryOpen(attempt + 1); return; }
      if (NET.role !== 'host') { NET.busy = false; NET.err = 'Не вдалося створити кімнату: ' + (e.type || 'помилка мережі') + '.'; rerenderSetup && rerenderSetup(); }
      else toast('Мережа: ' + (e.type || 'помилка'));
    });
    peer.on('connection', conn => {
      conn._rx = Date.now(); NET.allConns.add(conn);
      conn.on('data', d => { conn._rx = Date.now(); hostOnData(conn, d); });
      conn.on('close', () => { NET.allConns.delete(conn); hostOnClose(conn); });
      conn.on('error', () => { NET.allConns.delete(conn); hostOnClose(conn); });
    });
  };
  tryOpen(0);
}
function stopHosting() {
  NET.allConns.forEach(c => sendConn(c, { t: 'bye' })); NET.allConns.clear();
  setupState.rows = setupState.rows.filter(r => { if (r.type === 'remote') { try { r.conn.close(); } catch (e) { } return false; } return true; });
  if (NET.peer) try { NET.peer.destroy(); } catch (e) { }
  Object.assign(NET, { role: 'local', peer: null, code: '' }); NET.conns.clear(); chatSync();
}
function hostOnData(conn, d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'hello') {
    if (conn._row) return;
    if (d.ver !== APP_VERSION) { sendConn(conn, { t: 'full', reason: `Різні версії гри: у тебе ${d.ver ? 'v' + d.ver : 'стара'}, у господаря v${APP_VERSION}. Оновіть сторінку на обох пристроях.` }); return; }
    const playing = G.players.length && !G.over && G.phase !== 'setup';
    if (playing) { sendConn(conn, { t: 'full', reason: 'Гра вже йде. Попроси господаря почати нову партію.' }); return; }
    if (setupState.rows.length >= 6) { sendConn(conn, { t: 'full', reason: 'У кімнаті вже 6 гравців.' }); return; }
    const name = String(d.name || 'Гість').trim().slice(0, 16) || 'Гість';
    const row = { name, type: 'remote', sex: d.sex === 'f' ? 'f' : 'm', diff: 2, conn, team: setupState.rows.length % 2 };
    conn._row = row; setupState.rows.push(row);
    toast(`${name} приєднується до кімнати`);
    rerenderSetup && rerenderSetup(); sendLobby();
    chatSendHistory(conn); chatSys(`${name} заходить у кімнату`); chatSync();
    return;
  }
  if (d.t === 'ping') return;
  if (d.t === 'chat') { chatFromGuest(conn, d); return; }
  if (d.t === 'rejoin') { hostRejoin(conn, d); return; }
  if (d.t === 'act' && conn._pidx != null && G.players[conn._pidx] && G.players[conn._pidx].type === 'remote') { runAct(conn._pidx, d.act); return; }
  if (d.t === 'answer') { const done = NET.asks.get(d.id); if (done && done.who === conn._pidx) done(d.ok, d.pick); }
}
function hostOnClose(conn) {
  if (conn._closed) return; conn._closed = true;
  const pi = conn._pidx, p = pi != null ? G.players[pi] : null;
  const inGame = p && NET.conns.get(pi) === conn;
  if (inGame) {
    NET.conns.delete(pi);
    NET.asks.forEach(done => { if (done.who === pi) done(false); });
    if (p.type === 'bot') { p._reclaim = false; }
    else if (p.type === 'remote' && !G.over) {
      p.offline = Date.now();
      log(`${nameTag(p)} втратив звʼязок. Чекаємо до ${NET_GRACE / 1000} с, поки повернеться.`); say(`${p.name} втратив звʼязок — чекаємо`, 2600);
      if (G.window && G.window.humans.includes(p)) passWindow(p, false);
      const gid = G.gid; clearTimeout(p._dropT);
      p._dropT = setTimeout(() => { if (G.gid === gid) dropToBot(p); }, NET_GRACE);
      boardFor = null; renderUI(); queueSnap();
    }
    if (p.type === 'remote' && p.offline) return; // місце в кімнаті тримаємо, поки чекаємо
  }
  const row = conn._row;
  if (row) { const k = setupState.rows.indexOf(row); if (k >= 0) { setupState.rows.splice(k, 1); rerenderSetup && rerenderSetup(); sendLobby(); chatSys(`${row.name} виходить з кімнати`); } }
}
// гравець так і не повернувся: далі за нього грає бот (поки він не підключиться знову)
function dropToBot(p) {
  p._dropT = 0;
  if (!p.offline || p.type !== 'remote' || G.over) return;
  p.offline = 0; p.type = 'bot'; p.diff = 2; p.mem = p.mem || {}; p.wasRemote = true;
  log(`${nameTag(p)} не повернувся — поки за нього грає бот. Підключиться знову — гратиме сам.`); say(`${p.name} не повернувся — його замінює бот`);
  if (p._row) { const k = setupState.rows.indexOf(p._row); if (k >= 0) setupState.rows.splice(k, 1); }
  if (G.window && G.window.humans.includes(p)) passWindow(p, false);
  if (G.phase === 'prep' && (G.prepWait || []).includes(p.idx)) prepReady(p);
  boardFor = null; renderUI(); queueSnap();
  if (!G.over && G.cur === p.idx && !G.busy && G.phase !== 'prep' && G.phase !== 'deal') { G.busy = true; renderUI(); botTurn(p); }
}
function hostRejoin(conn, d) {
  if (conn._pidx != null) return;
  if (d.ver !== APP_VERSION) { sendConn(conn, { t: 'full', reason: `Різні версії гри: у тебе ${d.ver ? 'v' + d.ver : 'стара'}, у господаря v${APP_VERSION}. Оновіть сторінку.` }); return; }
  const playing = G.players.length && !G.over && G.phase !== 'setup';
  const p = playing && d.tok ? G.players.find(q => q.tok === d.tok && (q.type === 'remote' || q.wasRemote)) : null;
  if (!p) { sendConn(conn, { t: 'full', stale: true, reason: 'Цієї партії вже немає: вона закінчилась або господар почав нову.' }); return; }
  const old = NET.conns.get(p.idx); if (old && old !== conn) { old._closed = true; try { old.close(); } catch (e) { } }
  clearTimeout(p._dropT); p._dropT = 0; p.offline = 0;
  conn._pidx = p.idx; NET.conns.set(p.idx, conn);
  const row = p._row; if (row) { row.conn = conn; conn._row = row; if (!setupState.rows.includes(row) && setupState.rows.length < 6) setupState.rows.push(row); }
  let wait = false;
  if (p.type === 'bot') {
    if (G.cur === p.idx && !['prep', 'deal', 'next'].includes(G.phase)) { p._reclaim = true; wait = true; }
    else { p.type = 'remote'; p.wasRemote = false; }
  }
  sendConn(conn, { t: 'start', you: p.idx, tok: p.tok }); chatSendHistory(conn);
  log(`${nameTag(p)} повернувся в гру.`); say(`${p.name} знову з нами!`);
  boardFor = null; renderUI(); queueSnap();
  if (wait) tell(p, 'Бот дограє цей хід, з наступного граєш ти.', 3200);
  else if (G.cur === p.idx && !G.busy) tell(p, 'Твій хід!', 1800);
}
// повертаємо гравців, за яких бот дограв хід
function applyReclaims() { G.players.forEach(q => { if (q._reclaim) { q._reclaim = false; if (q.type === 'bot' && NET.conns.has(q.idx)) { q.type = 'remote'; q.wasRemote = false; } } }); }

/* серцебиття: обидві сторони раз на 4 с шлють «ping»; хто довго мовчить — той відпав */
function netBeat() {
  const now = Date.now();
  if (NET.role === 'host') {
    if (NET.peer && NET.peer.disconnected && !NET.peer.destroyed) try { NET.peer.reconnect(); } catch (e) { }
    NET.allConns.forEach(c => {
      if (c._closed) { NET.allConns.delete(c); return; }
      sendConn(c, { t: 'ping' });
      if (now - (c._rx || now) > 25000) { NET.allConns.delete(c); try { c.close(); } catch (e) { } hostOnClose(c); }
    });
    if (G.players.some(q => q.offline)) { renderUI(); queueSnap(); }
  } else if (NET.role === 'client' && NET.conn && !NET.rejoining) {
    sendConn(NET.conn, { t: 'ping' });
    if (now - NET.lastRx > 20000) clientDropped();
  }
}
setInterval(netBeat, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) netBeat(); });

/* --- клієнт --- */
function openJoin() {
  const r0 = setupState.rows.find(r => r.type === 'human') || { name: 'Гість', sex: 'm' };
  const st = { sex: r0.sex || 'm' };
  const draw = (err = '') => `<h2>Приєднатися</h2><p>Введи код кімнати, який бачить господар гри на своєму екрані.</p>
    <label class="lbl2" for="jCode">Код кімнати</label><input class="inp code" id="jCode" maxlength="5" autocomplete="off" spellcheck="false" placeholder="напр. K7P2Q" value="${esc(st.code || '')}">
    <label class="lbl2" for="jName">Твоє імʼя</label><input class="inp" id="jName" maxlength="16" value="${esc(st.name || r0.name)}">
    <div class="lbl2">Стать</div><div class="seg" role="group" aria-label="Стать"><button type="button" data-js="m" aria-pressed="${st.sex === 'm'}">Чоловік</button><button type="button" data-js="f" aria-pressed="${st.sex === 'f'}">Жінка</button></div>
    ${err ? `<p class="hint" style="color:var(--bad);margin-top:12px">${esc(err)}</p>` : ''}
    <div class="row end"><button class="btn ghost" type="button" id="jBack">Назад</button><button class="btn primary" type="button" id="jGo">Підключитися</button></div>`;
  const keep = () => { st.code = ($('#jCode').value || '').trim().toUpperCase(); st.name = ($('#jName').value || '').trim(); };
  const show = (err) => { showModal(draw(err)); bind(); };
  const bind = () => {
    $('#sheet').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.js) { keep(); st.sex = b.dataset.js; show(); }
      else if (b.id === 'jBack') { if (MENU.open) closeModal(); else openSetup(); }
      else if (b.id === 'jGo') { keep(); if (st.code.length < 4) { show('Введи код із 5 символів.'); return; } b.disabled = true; b.textContent = 'Підключаємося…'; joinRoom(st.code, st.name || 'Гість', st.sex, err => show(err)); }
    };
  };
  show();
}
// одне зʼєднання з господарем; onFail(причина): 'nohost' | 'timeout' | тип помилки PeerJS
function clientConnect(code, onOpen, onFail, timeout = 15000) {
  if (NET.peer) try { NET.peer.destroy(); } catch (e) { }
  const peer = new window.Peer(peerOpts(ICE_CACHE && NET.relay ? ICE_CACHE.list : null)); NET.peer = peer;
  let opened = false, failed = false;
  const fail = why => { if (opened || failed) return; failed = true; clearTimeout(tm); try { peer.destroy(); } catch (e) { } onFail(why); };
  const tm = setTimeout(() => fail('timeout'), timeout);
  peer.on('error', e => fail(e.type === 'peer-unavailable' ? 'nohost' : (e.type || 'net')));
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    const lost = () => { if (conn === NET.conn && NET.role === 'client') clientDropped(); };
    conn.on('open', () => { if (failed) { try { conn.close(); } catch (e) { } return; } opened = true; clearTimeout(tm); NET.conn = conn; NET.role = 'client'; NET.code = code; NET.lastRx = Date.now(); chatSync(); onOpen(conn); });
    conn.on('data', d => { if (conn !== NET.conn) return; NET.lastRx = Date.now(); clientOnData(d); });
    conn.on('close', lost); conn.on('error', lost);
  });
}
async function joinRoom(code, name, sex, onErr) {
  try { await loadPeer(); } catch (e) { onErr('Не вдалося завантажити модуль мережі. Перевір інтернет.'); return; }
  await getIce();
  NET.rejoining = null; NET.tok = null;
  clientConnect(code, conn => { sendConn(conn, { t: 'hello', name, sex, v: 1, ver: APP_VERSION }); showLobby({ code, rows: [], you: -1 }); },
    why => onErr(why === 'nohost' ? 'Кімнату з таким кодом не знайдено.' : why === 'timeout' ? 'Не вдалося підключитися. Перевір код і чи відкрита кімната.' : 'Помилка мережі: ' + why + '.'));
}
/* --- відновлення звʼязку --- */
function clientDropped() {
  if (NET.role !== 'client' || NET.rejoining) return;
  const old = NET.conn; NET.conn = null; try { old && old.close(); } catch (e) { }
  if (!NET.tok || !G.players.length || G.over) { lostHost(); return; }
  startRejoin({ code: NET.code, tok: NET.tok }, false);
}
function startRejoin(rec, manual) {
  NET.rejoining = { code: rec.code, tok: rec.tok, t0: Date.now(), n: 0, manual, limit: manual ? 25000 : NET_REJOIN };
  rejoinTry();
}
function drawRejoin(R) {
  const left = Math.max(0, Math.ceil((R.limit - (Date.now() - R.t0)) / 1000));
  showModal(`<h2>${R.manual ? 'Повертаємося в гру' : 'Звʼязок перервався'}</h2>
    <p>${R.manual ? `Підключаємося до кімнати <b>${esc(R.code)}</b>…` : 'Пробуємо відновити зʼєднання з господарем. Поки тебе немає, гра чекає, а за хвилину за тебе походить бот — щойно звʼязок повернеться, гратимеш далі сам.'}</p>
    <p class="hint"><span class="spin-dot"></span> Спроба ${R.n} · ще до ${left} с</p>
    <div class="row end"><button class="btn ghost" type="button" id="rjQuit">${R.manual ? 'Скасувати' : 'Вийти в меню'}</button></div>`);
  $('#rjQuit').onclick = () => { NET.rejoining = null; leaveRoom(); openMainMenu(); };
}
async function rejoinTry() {
  const R = NET.rejoining; if (!R) return;
  if (Date.now() - R.t0 > R.limit) { NET.rejoining = null; rejoinFailed(R); return; }
  R.n++; drawRejoin(R);
  try { await loadPeer(); } catch (e) { }
  if (!window.Peer) { setTimeout(rejoinTry, 3000); return; }
  await getIce(); if (NET.rejoining !== R) return;
  clientConnect(R.code, conn => {
    sendConn(conn, { t: 'rejoin', tok: R.tok, ver: APP_VERSION });
    // господар має відповісти «start»; якщо мовчить — пробуємо ще
    R.waitT = setTimeout(() => { if (NET.rejoining === R && NET.conn === conn) { NET.conn = null; try { conn.close(); } catch (e) { } rejoinTry(); } }, 8000);
  }, () => { if (NET.rejoining === R) setTimeout(rejoinTry, 2500); }, 9000);
}
function rejoinFailed(R) {
  const rec = { code: R.code, tok: R.tok };
  leaveRoom();
  showModal(`<h2>Не вдалося повернутися</h2><p>Господар кімнати <b>${esc(R.code)}</b> не відповідає. Можливо, в нього пропав інтернет або він закрив гру. Поки партія триває, за тебе грає бот — повернутися можна будь-коли.</p>
    <div class="row end"><button class="btn ghost" type="button" id="rfMenu">До меню</button><button class="btn primary" type="button" id="rfAgain">Спробувати ще</button></div>`);
  $('#rfMenu').onclick = () => openMainMenu();
  $('#rfAgain').onclick = () => startRejoin(rec, true);
}
function manualRejoin() { const r = rejoinRec(); if (!r) { toast('Немає гри, до якої можна повернутися'); return; } hideMainMenu(); startRejoin(r, true); }
function showLobby(l) {
  NET.lobby = l;
  if (G.players.length && NET.gid >= 0 && !G.over) return;
  showModal(`<h2>Кімната ${esc(l.code)}</h2><p>Ти в кімнаті. Чекаємо, поки господар почне гру.</p>
    <div class="list">${l.rows.map((r, i) => `<div class="tag" style="font-size:13px;padding:6px 10px"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLORS[i]};margin-right:6px"></span>${esc(r.name)} · ${r.type === 'bot' ? 'бот' : r.type === 'remote' ? 'по мережі' : 'господар'}${r.team != null ? ' · ' + teamTag(r.team) : ''}${i === l.you ? ' · це ти' : ''}</div>`).join('') || '<p class="hint">Отримуємо список гравців…</p>'}</div>
    <p class="hint net-relay ${NET.relay ? 'on' : ''}">${NET.relay ? '● Сервер-посередник увімкнено.' : '○ Сервер-посередник недоступний — зʼєднання напряму.'}</p>
    <div class="row end"><button class="btn" type="button" data-chat-open>Чат</button><button class="btn ghost" type="button" id="leaveB">Вийти</button></div>`);
  chatBadge();
  $('#leaveB').onclick = () => { saveRejoin(null); leaveRoom(); openMainMenu(); };
}
function leaveRoom() {
  try { NET.conn && NET.conn.close(); } catch (e) { }
  try { NET.peer && NET.peer.destroy(); } catch (e) { }
  if (NET.rejoining && NET.rejoining.waitT) clearTimeout(NET.rejoining.waitT);
  Object.assign(NET, { role: 'local', conn: null, peer: null, me: -1, gid: -1, tok: null, rejoining: null });
  NET.mirror.forEach(disposeMesh); NET.mirror.clear();
  G.players.forEach(destroySeat); G.players = []; G.combat = null; G.window = null; G.log = []; G.over = false; G.phase = 'setup'; G.viewer = -1;
  G.doorDeck = []; G.treasureDeck = []; G.doorDiscard = []; G.treasureDiscard = [];
  syncDeck('door'); syncDeck('treasure'); syncDiscardTop('door'); syncDiscardTop('treasure'); T.die.visible = false;
  boardFor = null; renderUI(); renderLog(); chatSync();
}
function lostHost() {
  leaveRoom();
  showModal(`<h2>Звʼязок утрачено</h2><p>Господар кімнати закрив гру або відключився.</p><div class="row end"><button class="btn primary" type="button" id="lhB">До меню</button></div>`);
  $('#lhB').onclick = () => openMainMenu();
}
function clientOnData(d) {
  if (!d || typeof d !== 'object') return;
  switch (d.t) {
    case 'lobby': showLobby(d); break;
    case 'bye': NET.rejoining = null; lostHost(); break;
    case 'chat': case 'chatHist': chatOnClient(d); break;
    case 'full': { const r = d.reason; if (d.stale) saveRejoin(null); leaveRoom(); showModal(`<h2>Не вийшло</h2><p>${esc(r || 'Кімната недоступна.')}</p><div class="row end"><button class="btn primary" type="button" id="fB">До меню</button></div>`); $('#fB').onclick = () => openMainMenu(); break; }
    case 'start': {
      NET.me = d.you; NET.curAsk = 0;
      if (d.tok) { NET.tok = d.tok; saveRejoin({ code: NET.code, tok: d.tok, t: Date.now() }); }
      if (NET.rejoining) { clearTimeout(NET.rejoining.waitT); NET.rejoining = null; toast('Звʼязок відновлено!', 1800); }
      closeModal(); hideMainMenu(); break;
    }
    case 'snap': applySnap(d.s); break;
    case 'fly': onNetFly(d); break;
    case 'fx': onNetFx(d); break;
    case 'toast': toast(d.text, d.ms); break;
    case 'ask': NET.curAsk = d.id; confirmModal(d.title, d.text, d.yes, d.no).then(ok => { NET.curAsk = 0; netSendHost({ t: 'answer', id: d.id, ok }); }); break;
    case 'helpAsk': { NET.curAsk = d.id; playSfx('alert'); helpAskModal(d.title, d.text, d.tr | 0, d.T | 0, d.cards || []).then(r => { if (NET.curAsk !== d.id) return; NET.curAsk = 0; netSendHost({ t: 'answer', id: d.id, ok: r.ok, pick: r.counter == null ? null : r.counter }); }); break; }
    case 'cardsAsk': NET.curAsk = d.id; cardsModal(d.title, d.text, d.groups || [], d.yes, d.no).then(ok => { if (NET.curAsk !== d.id) return; NET.curAsk = 0; netSendHost({ t: 'answer', id: d.id, ok }); }); break;
    case 'tradeAsk': { const me = viewerP(); if (!me) { netSendHost({ t: 'answer', id: d.id, ok: false }); break; } NET.curAsk = d.id; playSfx('alert'); tradePickModal(me, d.from, d.give || []).then(pick => { if (NET.curAsk !== d.id) return; NET.curAsk = 0; netSendHost({ t: 'answer', id: d.id, ok: !!pick, pick: pick || [] }); }); break; }
    case 'askEnd': if (NET.curAsk === d.id) { NET.curAsk = 0; closeModal(); } break;
  }
}
function fillPlayer(p, sp) {
  Object.assign(p, { team: sp.team, offline: sp.off || 0, wasRemote: !!sp.sub, name: sp.name, type: sp.type, color: sp.color, sex: sp.sex, diff: sp.diff, level: sp.level, gold: sp.gold, gear: sp.gear, raceCard: sp.raceCard, clsCard: sp.clsCard, raceCard2: sp.raceCard2 || null, clsCard2: sp.clsCard2 || null, dualRace: sp.dualRace || null, dualCls: sp.dualCls || null, curses: sp.curses || [], mem: sp.mem || {}, died: sp.died });
  p.hand = Array.isArray(sp.hand) ? sp.hand : Array.from({ length: sp.hand }, (_, k) => ({ hidden: true, kind: 'hidden', uid: -1 - k, deck: 'door', name: '?' }));
}
function applySnap(s) {
  if (s.gid !== NET.gid) {
    NET.gid = s.gid; closeModal();
    G.players.forEach(destroySeat); NET.mirror.forEach(disposeMesh); NET.mirror.clear(); G.players = []; boardFor = null;
  }
  if (s.over) saveRejoin(null);
  Object.assign(G, { goal: s.goal, teams: !!s.teams, cur: s.cur, phase: s.phase, busy: s.busy, over: s.over, log: s.log, prepWait: s.prepWait || [] });
  G.doorDeck = new Array(s.dN).fill(0); G.treasureDeck = new Array(s.tN).fill(0);
  G.doorDiscard = s.dTop ? [s.dTop] : []; G.treasureDiscard = s.tTop ? [s.tTop] : [];
  const me = G.players[NET.me]; const prev = new Set(me ? me.hand.map(c => c.uid) : []);
  if (!G.players.length) {
    G.players = s.players.map(sp => ({ idx: sp.idx, hand: [], gear: [] }));
    G.players.forEach(p => fillPlayer(p, s.players[p.idx]));
    G.viewer = NET.me; G.players.forEach(buildSeat);
    cam.userAz = 0; cam.userEl = 0; cam.az = seatAngle(NET.me);
  } else {
    G.players.forEach(p => fillPlayer(p, s.players[p.idx]));
    if (me) me.hand.forEach(c => { if (!prev.has(c.uid)) G.fresh.add(c.uid); });
  }
  G.viewer = NET.me;
  G.combat = s.cb ? { ...s.cb, mons: s.cb.mons.map(c => ({ c })), asked: new Set(s.cb.asked), passed: new Set(s.cb.passed), interfered: new Set(), meshes: new Map() } : null;
  G.window = s.win ? { humans: s.win.map(i => G.players[i]).filter(Boolean) } : null;
  G.players.forEach(p => {
    const sig = JSON.stringify([rcCards(p).map(c => c.uid), (p.curses || []).map(c => c.uid), p.gear.map(g => g.uid), p.sex]);
    if (p._sig !== sig) { p._sig = sig; syncSeat(p); }
    else { const ps = p.level + '|' + G.cur + '|' + p.name; if (p._ps !== ps) { p._ps = ps; plateDraw(p); } }
  });
  syncDeck('door'); syncDeck('treasure'); syncDiscardTop('door'); syncDiscardTop('treasure');
  if (!G.combat) T.die.visible = false;
  syncCombat3D(); renderUI(); renderLog();
}
function syncCombat3D() {
  const cb = G.combat, want = new Map();
  if (cb) {
    const n = cb.mons.length;
    cb.mons.forEach((x, i) => want.set(x.c.uid, { c: x.c, pose: centerPose(i, n) }));
    [...cb.mods, ...cb.mShots].forEach((c, i) => want.set(c.uid, { c, pose: sidePose(true, i, n) }));
    cb.pShots.forEach((c, i) => want.set(c.uid, { c, pose: sidePose(false, i, n) }));
  }
  for (const [uid, m] of NET.mirror) if (!want.has(uid)) { if (!m.userData.anim) disposeMesh(m); NET.mirror.delete(uid); }
  for (const [uid, w] of want) {
    let m = NET.mirror.get(uid);
    if (!m) { m = cardMesh(w.c); scene.add(m); NET.mirror.set(uid, m); }
    m.visible = !NET.flying.has(uid);
    if (!m.userData.anim) applyPose(m, w.pose);
  }
}
function resolvePose(p, owner) {
  if (!p.tag) return p;
  const me = NET.me;
  switch (p.tag.k) {
    case 'c': return centerPose(p.tag.i, p.tag.n);
    case 's': return sidePose(p.tag.r, p.tag.i, p.tag.n);
    case 'h': return p.tag.who === me ? handPose() : seatPose(p.tag.who, false);
    case 'p': return p.tag.who === me && owner === me ? handPose() : p;
  }
  return p;
}
function onNetFly(d) {
  const m = d.card ? cardMesh(d.card) : backMesh(d.back);
  if (d.card) NET.flying.add(d.uid);
  syncCombat3D(); scene.add(m);
  fly(m, resolvePose(d.from, d.owner), resolvePose(d.to, d.owner), d.dur, d.lift, {}, true).then(() => { disposeMesh(m); NET.flying.delete(d.uid); syncCombat3D(); });
}
function onNetFx(d) {
  const a = d.a || {};
  switch (d.type) {
    case 'ring': ringFx(new THREE.Vector3(a.x, 0, a.z), a.color, a.dur, true); break;
    case 'burst': burst(new THREE.Vector3(a.x, a.y, a.z), a.colors, a.n, a.speed, a.life, a.gravity, a.size, a.additive, a.spread, true); break;
    case 'flash': flashAt(new THREE.Vector3(a.x, a.y, a.z), a.i, a.dur, a.color, true); break;
    case 'roar': { const m = NET.mirror.get(a.uid); if (m) roar(m); break; }
    case 'lunge': { const m = NET.mirror.get(a.uid); if (m) lunge(m); break; }
    case 'defeat': { const m = NET.mirror.get(a.uid); if (m) { NET.mirror.delete(a.uid); defeatAnim(m); } break; }
    case 'die': { const q = G.players[a.who]; if (q) rollDie(q, a.v); break; }
    case 'banner': banner(a.text, a.color); break;
    case 'confetti': for (let i = 0; i < 4; i++) setTimeout(() => burst(new THREE.Vector3((Math.random() - .5) * 8, 9, (Math.random() - .5) * 8), [a.color, '#ffd36b', '#ffffff', '#ef6b5d', '#5aa9e2', '#86cf6e'], 260, 5, 4.5, -2.6, .22, false, 6, true), i * 450); break;
    case 'sfx': playSfx(a.n); break;
    case 'win': { const p = G.players[a.idx]; if (p) setTimeout(() => showWin(p, false), 900); break; }
  }
}
