'use strict';

/* ============================== ЧАТ ==============================
   Лише для гри по мережі. Повідомлення живуть, поки триває сесія: ніде не зберігаються
   й зникають, щойно кімнату закрито або гравець вийшов. Господар — єдине джерело правди:
   гості шлють текст йому, а він розсилає всім (імʼя відправника визначає сам господар). */
const CHAT = { list: [], open: false, unread: 0, mine: new Set(), seq: 0, peekT: 0 };
const CHAT_MAX = 200, CHAT_KEEP = 120;
const QUICK = ['👍', '😂', '😱', '🙏', 'Допоможи!', 'Ні, дякую'];
const chatOn = () => NET.role === 'host' || NET.role === 'client';

function chatBuild() {
  if ($('#chat')) return;
  const btn = document.createElement('button');
  btn.className = 'btn small'; btn.id = 'btnChat'; btn.type = 'button'; btn.hidden = true;
  btn.innerHTML = 'Чат<span class="chat-badge" hidden></span>';
  const ta = document.querySelector('.top-actions'); ta.insertBefore(btn, $('#btnLog'));
  btn.onclick = () => chatToggle();
  const el = document.createElement('div');
  el.id = 'chat'; el.className = 'chat'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Чат');
  el.innerHTML = `<div class="chat-head"><b>Чат</b><span>лише на цю гру</span><button class="btn small ghost" type="button" id="chatX" aria-label="Закрити чат">✕</button></div>
    <div class="chat-list" id="chatList" aria-live="polite"></div>
    <div class="chat-quick">${QUICK.map(q => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="chat-form" id="chatForm" autocomplete="off"><input class="inp" id="chatIn" maxlength="${CHAT_MAX}" placeholder="Напиши повідомлення…" aria-label="Повідомлення"><button class="btn small primary" type="submit">Надіслати</button></form>`;
  document.body.appendChild(el);
  const peek = document.createElement('button');
  peek.type = 'button'; peek.className = 'chat-peek'; peek.id = 'chatPeek'; peek.hidden = true;
  peek.onclick = () => { peek.hidden = true; chatToggle(true); };
  document.body.appendChild(peek);
  $('#chatX').onclick = () => chatToggle(false);
  $('#chatForm').onsubmit = e => { e.preventDefault(); const i = $('#chatIn'); chatSend(i.value); i.value = ''; i.focus(); };
  el.querySelector('.chat-quick').onclick = e => { const b = e.target.closest('[data-q]'); if (b) chatSend(b.dataset.q); };
  $('#chatIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); chatToggle(false); } });
}

// показати/сховати кнопку чату відповідно до стану мережі
function chatSync() {
  chatBuild();
document.addEventListener('click', e => { if (e.target.closest('[data-chat-open]')) chatToggle(true); });
  const on = chatOn();
  $('#btnChat').hidden = !on;
  if (!on && (CHAT.open || CHAT.list.length)) chatReset();
  chatBadge();
}
function chatReset() {
  CHAT.list = []; CHAT.unread = 0; CHAT.mine.clear(); CHAT.open = false;
  if ($('#chat')) { $('#chat').hidden = true; $('#chatList').innerHTML = ''; $('#chatPeek').hidden = true; }
  chatBadge();
}
function chatToggle(open = !CHAT.open) {
  chatBuild();
document.addEventListener('click', e => { if (e.target.closest('[data-chat-open]')) chatToggle(true); });
  if (open && !chatOn()) return;
  CHAT.open = open; $('#chat').hidden = !open;
  if (open) { CHAT.unread = 0; $('#chatPeek').hidden = true; chatRender(); setTimeout(() => $('#chatIn').focus(), 30); }
  chatBadge();
}
function chatBadge() {
  const b = $('#btnChat'); if (!b) return;
  const s = b.querySelector('.chat-badge'); s.hidden = !CHAT.unread; s.textContent = CHAT.unread > 9 ? '9+' : CHAT.unread;
  document.querySelectorAll('[data-chat-open]').forEach(x => { x.textContent = CHAT.unread ? `Чат (${CHAT.unread})` : 'Чат'; });
}
const chatTime = t => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
function chatRender() {
  const box = $('#chatList'); if (!box) return;
  box.innerHTML = CHAT.list.length ? CHAT.list.map(m => m.sys
    ? `<div class="cm sys">${esc(m.text)}</div>`
    : `<div class="cm${m.mine ? ' me' : ''}"><b style="color:${m.color || 'var(--brass)'}">${esc(m.name)}</b><span class="ct">${chatTime(m.t)}</span><div class="cx">${esc(m.text)}</div></div>`).join('')
    : '<div class="cm sys">Тут можна перемовлятися з усіма в кімнаті. Повідомлення зникнуть, коли гра закінчиться.</div>';
  box.scrollTop = box.scrollHeight;
}
function chatPush(m) {
  CHAT.list.push(m); if (CHAT.list.length > CHAT_KEEP) CHAT.list.shift();
  if (CHAT.open) chatRender();
  else if (!m.mine && !m.sys) {
    CHAT.unread++; chatBadge(); playSfx('click');
    const pk = $('#chatPeek'); pk.innerHTML = `<b style="color:${m.color || 'var(--brass)'}">${esc(m.name)}:</b> ${esc(m.text.length > 70 ? m.text.slice(0, 70) + '…' : m.text)}`; pk.hidden = false;
    clearTimeout(CHAT.peekT); CHAT.peekT = setTimeout(() => { pk.hidden = true; }, 4200);
  }
}
const chatClean = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);

/* --- хто пише: господар визначає сам --- */
function chatHostSelf() {
  const v = viewerP();
  if (v && v.type === 'human') return { name: v.name, color: v.color };
  if (G.players.length) { const h = G.players.find(q => q.type === 'human'); if (h) return { name: h.name, color: h.color }; }
  const i = setupState.rows.findIndex(r => r.type === 'human');
  return i >= 0 ? { name: setupState.rows[i].name, color: setupState.teams ? TEAMS[setupState.rows[i].team | 0].color : COLORS[i] } : { name: 'Господар', color: COLORS[0] };
}
function chatSenderOf(conn) {
  if (conn._pidx != null && G.players[conn._pidx] && !G.over) { const p = G.players[conn._pidx]; return { name: p.name, color: p.color }; }
  const i = setupState.rows.indexOf(conn._row);
  if (i >= 0) { const r = setupState.rows[i]; return { name: r.name, color: setupState.teams ? TEAMS[r.team | 0].color : COLORS[i] }; }
  if (conn._pidx != null && G.players[conn._pidx]) { const p = G.players[conn._pidx]; return { name: p.name, color: p.color }; }
  return null;
}
function chatBroadcast(m) {
  NET.allConns.forEach(c => { if (c._row || c._pidx != null) sendConn(c, { t: 'chat', m }); });
  chatPush({ ...m, mine: m.n != null && m.host === true });
}
function chatSend(text) {
  text = chatClean(text); if (!text || !chatOn()) return;
  if (NET.role === 'client') {
    const n = ++CHAT.seq + ':' + Math.random().toString(36).slice(2, 6);
    CHAT.mine.add(n); netSendHost({ t: 'chat', text, n }); return;
  }
  const me = chatHostSelf();
  chatBroadcast({ name: me.name, color: me.color, text, t: Date.now(), n: 'h', host: true });
}
function chatSys(text) { if (NET.role === 'host') chatBroadcast({ sys: true, text, t: Date.now() }); }
// господар отримав повідомлення від гостя
function chatFromGuest(conn, d) {
  const who = chatSenderOf(conn); if (!who) return;
  const now = Date.now(); conn._chatT = (conn._chatT || []).filter(t => now - t < 6000);
  if (conn._chatT.length >= 6) { sendConn(conn, { t: 'toast', text: 'Не так швидко — зачекай кілька секунд', ms: 1800 }); return; }
  conn._chatT.push(now);
  const text = chatClean(d.text); if (!text) return;
  const m = { name: who.name, color: who.color, text, t: now, n: typeof d.n === 'string' ? d.n.slice(0, 20) : null };
  NET.allConns.forEach(c => { if (c._row || c._pidx != null) sendConn(c, { t: 'chat', m }); });
  chatPush({ ...m, mine: false });
}
function chatSendHistory(conn) { sendConn(conn, { t: 'chatHist', list: CHAT.list.slice(-60).map(m => ({ ...m, mine: undefined, host: undefined })) }); }
// гість отримав повідомлення від господаря
function chatOnClient(d) {
  if (d.t === 'chatHist') { CHAT.list = (d.list || []).map(m => ({ ...m, mine: m.n != null && CHAT.mine.has(m.n) })); if (CHAT.open) chatRender(); return; }
  const m = d.m || {}; chatPush({ ...m, mine: m.n != null && CHAT.mine.has(m.n) });
}

chatBuild();
document.addEventListener('click', e => { if (e.target.closest('[data-chat-open]')) chatToggle(true); });
