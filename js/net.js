'use strict';

/* ============================== ГРА ПО МЕРЕЖІ ============================== */
const NET = { role: 'local', peer: null, code: '', conns: new Map(), conn: null, me: -1, gid: -1, asks: new Map(), askSeq: 0, flying: new Set(), mirror: new Map(), snapT: 0, busy: false, err: '', setupOpen: false };
const PEER_PREFIX = 'proidysvity-v1-';
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; sc.onload = () => res(); sc.onerror = () => rej(new Error('load')); document.head.appendChild(sc); });
}
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
    gid: G.gid, goal: G.goal, cur: G.cur, phase: G.phase, busy: G.busy, over: G.over, log: G.log.slice(-60),
    dN: G.doorDeck.length, tN: G.treasureDeck.length, dTop: G.doorDiscard[G.doorDiscard.length - 1] || null, tTop: G.treasureDiscard[G.treasureDiscard.length - 1] || null,
    players: G.players.map(p => ({ idx: p.idx, name: p.name, type: p.type, color: p.color, sex: p.sex, diff: p.diff, level: p.level, gold: p.gold, gear: p.gear, raceCard: p.raceCard, clsCard: p.clsCard, raceCard2: p.raceCard2, clsCard2: p.clsCard2, dualRace: p.dualRace, dualCls: p.dualCls, curses: p.curses || [], died: p.died, mem: p.type === 'bot' ? p.mem : null, hand: p.idx === i ? p.hand : p.hand.length })),
    cb: cb ? { fighter: cb.fighter, mons: cb.mons.map(x => x.c), mods: cb.mods, pShots: cb.pShots, mShots: cb.mShots, helper: cb.helper, wiz: cb.wiz, asked: [...cb.asked], passed: [...cb.passed], offer: cb.offer } : null,
    win: G.window ? G.window.humans.map(h => h.idx) : null
  };
}
function askRemote(p, title, text, yes, no, timeout = 40000) {
  return new Promise(res => {
    const id = ++NET.askSeq; let t;
    const done = ok => { if (!NET.asks.has(id)) return; NET.asks.delete(id); clearTimeout(t); netSendTo(p.idx, { t: 'askEnd', id }); res(!!ok); };
    done.who = p.idx; NET.asks.set(id, done);
    t = setTimeout(() => done(false), timeout);
    netSendTo(p.idx, { t: 'ask', id, title, text, yes, no });
  });
}
function sendLobby() {
  if (NET.role !== 'host') return;
  const rows = setupState.rows.map(r => ({ name: r.name, type: r.type, sex: r.sex }));
  setupState.rows.forEach((r, i) => { if (r.conn) sendConn(r.conn, { t: 'lobby', code: NET.code, rows, you: i }); });
}
async function hostRoom() {
  NET.err = ''; NET.busy = true; rerenderSetup && rerenderSetup();
  try { await loadPeer(); } catch (e) { NET.busy = false; NET.err = 'Не вдалося завантажити модуль мережі. Перевір інтернет.'; rerenderSetup && rerenderSetup(); return; }
  const tryOpen = (attempt) => {
    const code = makeCode();
    const peer = new window.Peer(PEER_PREFIX + code, { debug: 0 });
    peer.on('open', () => { NET.role = 'host'; NET.peer = peer; NET.code = code; NET.busy = false; rerenderSetup && rerenderSetup(); });
    peer.on('error', e => {
      if (e.type === 'unavailable-id' && attempt < 3) { peer.destroy(); tryOpen(attempt + 1); return; }
      if (NET.role !== 'host') { NET.busy = false; NET.err = 'Не вдалося створити кімнату: ' + (e.type || 'помилка мережі') + '.'; rerenderSetup && rerenderSetup(); }
      else toast('Мережа: ' + (e.type || 'помилка'));
    });
    peer.on('connection', conn => {
      conn.on('data', d => hostOnData(conn, d));
      conn.on('close', () => hostOnClose(conn));
      conn.on('error', () => hostOnClose(conn));
    });
  };
  tryOpen(0);
}
function stopHosting() {
  setupState.rows = setupState.rows.filter(r => { if (r.type === 'remote') { try { r.conn.close(); } catch (e) { } return false; } return true; });
  if (NET.peer) try { NET.peer.destroy(); } catch (e) { }
  Object.assign(NET, { role: 'local', peer: null, code: '' }); NET.conns.clear();
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
    const row = { name, type: 'remote', sex: d.sex === 'f' ? 'f' : 'm', diff: 2, conn };
    conn._row = row; setupState.rows.push(row);
    toast(`${name} приєднується до кімнати`);
    rerenderSetup && rerenderSetup(); sendLobby();
    return;
  }
  if (d.t === 'act' && conn._pidx != null && G.players[conn._pidx] && G.players[conn._pidx].type === 'remote') { runAct(conn._pidx, d.act); return; }
  if (d.t === 'answer') { const done = NET.asks.get(d.id); if (done && done.who === conn._pidx) done(d.ok, d.pick); }
}
function hostOnClose(conn) {
  if (conn._closed) return; conn._closed = true;
  const pi = conn._pidx, p = pi != null ? G.players[pi] : null;
  if (p && p.type === 'remote' && NET.conns.get(pi) === conn) {
    NET.conns.delete(pi);
    p.type = 'bot'; p.diff = 2; p.mem = p.mem || {};
    log(`${nameTag(p)} відключився. Далі за нього грає бот.`); say(`${p.name} відключився — його замінює бот`);
    NET.asks.forEach(done => { if (done.who === pi) done(false); });
    if (G.window && G.window.humans.includes(p)) passWindow(p, false);
    boardFor = null; renderUI();
    if (!G.over && G.cur === pi && !G.busy) { G.busy = true; renderUI(); botTurn(p); }
  }
  const row = conn._row;
  if (row) { const k = setupState.rows.indexOf(row); if (k >= 0) setupState.rows.splice(k, 1); if (row.type === 'remote' && !(p && p.type === 'bot')) { rerenderSetup && rerenderSetup(); sendLobby(); } }
}

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
async function joinRoom(code, name, sex, onErr) {
  try { await loadPeer(); } catch (e) { onErr('Не вдалося завантажити модуль мережі. Перевір інтернет.'); return; }
  if (NET.peer) try { NET.peer.destroy(); } catch (e) { }
  const peer = new window.Peer({ debug: 0 }); NET.peer = peer;
  let opened = false;
  const fail = setTimeout(() => { if (!opened) { onErr('Не вдалося підключитися. Перевір код і чи відкрита кімната.'); try { peer.destroy(); } catch (e) { } } }, 15000);
  peer.on('error', e => { clearTimeout(fail); if (!opened) onErr(e.type === 'peer-unavailable' ? 'Кімнату з таким кодом не знайдено.' : 'Помилка мережі: ' + (e.type || 'невідома') + '.'); });
  peer.on('open', () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    NET.conn = conn;
    conn.on('open', () => { opened = true; clearTimeout(fail); NET.role = 'client'; NET.code = code; sendConn(conn, { t: 'hello', name, sex, v: 1, ver: APP_VERSION }); showLobby({ code, rows: [], you: -1 }); });
    conn.on('data', clientOnData);
    conn.on('close', () => { if (NET.role === 'client') lostHost(); });
  });
}
function showLobby(l) {
  NET.lobby = l;
  if (G.players.length && NET.gid >= 0 && !G.over) return;
  showModal(`<h2>Кімната ${esc(l.code)}</h2><p>Ти в кімнаті. Чекаємо, поки господар почне гру.</p>
    <div class="list">${l.rows.map((r, i) => `<div class="tag" style="font-size:13px;padding:6px 10px"><span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${COLORS[i]};margin-right:6px"></span>${esc(r.name)} · ${r.type === 'bot' ? 'бот' : r.type === 'remote' ? 'по мережі' : 'господар'}${i === l.you ? ' · це ти' : ''}</div>`).join('') || '<p class="hint">Отримуємо список гравців…</p>'}</div>
    <div class="row end"><button class="btn ghost" type="button" id="leaveB">Вийти</button></div>`);
  $('#leaveB').onclick = () => { leaveRoom(); openMainMenu(); };
}
function leaveRoom() {
  try { NET.conn && NET.conn.close(); } catch (e) { }
  try { NET.peer && NET.peer.destroy(); } catch (e) { }
  Object.assign(NET, { role: 'local', conn: null, peer: null, me: -1, gid: -1 });
  NET.mirror.forEach(disposeMesh); NET.mirror.clear();
  G.players.forEach(destroySeat); G.players = []; G.combat = null; G.window = null; G.log = []; G.over = false; G.phase = 'setup'; G.viewer = -1;
  G.doorDeck = []; G.treasureDeck = []; G.doorDiscard = []; G.treasureDiscard = [];
  syncDeck('door'); syncDeck('treasure'); syncDiscardTop('door'); syncDiscardTop('treasure'); T.die.visible = false;
  boardFor = null; renderUI(); renderLog();
}
function lostHost() {
  leaveRoom();
  showModal(`<h2>Звʼязок утрачено</h2><p>Господар кімнати відключився або закрив гру.</p><div class="row end"><button class="btn primary" type="button" id="lhB">До меню</button></div>`);
  $('#lhB').onclick = () => openMainMenu();
}
function clientOnData(d) {
  if (!d || typeof d !== 'object') return;
  switch (d.t) {
    case 'lobby': showLobby(d); break;
    case 'full': { const r = d.reason; leaveRoom(); showModal(`<h2>Не вийшло</h2><p>${esc(r || 'Кімната недоступна.')}</p><div class="row end"><button class="btn primary" type="button" id="fB">До меню</button></div>`); $('#fB').onclick = () => openMainMenu(); break; }
    case 'start': NET.me = d.you; closeModal(); hideMainMenu(); break;
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
  Object.assign(p, { name: sp.name, type: sp.type, color: sp.color, sex: sp.sex, diff: sp.diff, level: sp.level, gold: sp.gold, gear: sp.gear, raceCard: sp.raceCard, clsCard: sp.clsCard, raceCard2: sp.raceCard2 || null, clsCard2: sp.clsCard2 || null, dualRace: sp.dualRace || null, dualCls: sp.dualCls || null, curses: sp.curses || [], mem: sp.mem || {}, died: sp.died });
  p.hand = Array.isArray(sp.hand) ? sp.hand : Array.from({ length: sp.hand }, (_, k) => ({ hidden: true, kind: 'hidden', uid: -1 - k, deck: 'door', name: '?' }));
}
function applySnap(s) {
  if (s.gid !== NET.gid) {
    NET.gid = s.gid; closeModal();
    G.players.forEach(destroySeat); NET.mirror.forEach(disposeMesh); NET.mirror.clear(); G.players = []; boardFor = null;
  }
  Object.assign(G, { goal: s.goal, cur: s.cur, phase: s.phase, busy: s.busy, over: s.over, log: s.log });
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
