'use strict';

/* ============================== РЕНДЕР ІНТЕРФЕЙСУ ============================== */
const SIL = '<svg class="sil" viewBox="0 0 100 150" aria-hidden="true"><circle cx="50" cy="22" r="13"/><path d="M31 46 Q50 39 69 46 L73 96 L27 96 Z"/><path d="M31 50 L13 90 M69 50 L87 90"/><path d="M41 96 L37 142 M59 96 L63 142"/></svg>';
function slotItems(p) {
  const hands = p.gear.filter(g => g.slot === 'hands'); let L = null, R = null, two = false;
  for (const h of hands) { if (h.hands === 2) { L = h; R = h; two = true; } else if (!L) L = h; else if (!R) R = h; }
  return { head: p.gear.find(g => g.slot === 'head'), body: p.gear.find(g => g.slot === 'body'), feet: p.gear.find(g => g.slot === 'feet'), L, R, two, misc: p.gear.filter(g => g.slot === 'misc') };
}
function slotHTML(p, c, label, area, big, extra = '') {
  if (!c) return `<div class="slot empty" style="grid-area:${area}"><span class="sl">${label}</span></div>`;
  const off = c.kind === 'gear' && !usable(p, c);
  const bonus = c.kind === 'gear' && (c.bonus || c.flee) ? `<span class="sb">${c.bonus ? '+' + c.bonus : ''}${c.flee ? ` ↗${c.flee}` : ''}</span>` : '';
  const tip = `${label}: ${c.name}${off ? ` (не діє — лише для: ${reqName(c.req)})` : ''}`;
  return `<button type="button" class="slot ${c.kind !== 'gear' ? 'rc' : ''} ${off ? 'off' : ''}" style="grid-area:${area}" data-g="${c.uid}" title="${esc(tip)}" aria-label="${esc(tip)}"><span class="se" aria-hidden="true">${artIcon(c, "")}</span>${big ? `<span class="sn">${esc(c.name)}</span>` : ''}${bonus}${extra}</button>`;
}
function dollHTML(p, big) {
  const s = slotItems(p);
  const misc = s.misc.length ? slotHTML(p, s.misc[0], 'Дрібниці', 'misc', big && s.misc.length === 1, s.misc.length > 1 ? `<span class="cnt">×${s.misc.length}</span>` : '') : slotHTML(p, null, 'Дрібниці', 'misc', big);
  const rh = s.two ? `<div class="slot twin" style="grid-area:rh" title="Дворучна річ: ${esc(s.R.name)}"><span class="se" aria-hidden="true">${artIcon(s.R, "")}</span><span class="sl">дві руки</span></div>` : slotHTML(p, s.R, 'Права рука', 'rh', big);
  return `<div class="doll ${big ? 'big' : ''}">${SIL}
    ${slotHTML(p, p.raceCard, 'Раса', 'race', big)}${slotHTML(p, s.head, 'Голова', 'head', big)}${slotHTML(p, p.clsCard, 'Клас', 'cls', big)}
    ${slotHTML(p, s.L, 'Ліва рука', 'lh', big)}${slotHTML(p, s.body, 'Тіло', 'body', big)}${rh}
    ${misc}${slotHTML(p, s.feet, 'Ноги', 'feet', big)}
    <div class="slot power" style="grid-area:pow" title="Сила в бою"><span class="pv">${baseStr(p)}</span><span class="sl">сила</span></div></div>`;
}
const sexName = p => p.sex === 'f' ? 'жінка' : 'чоловік';
const typeName = p => p.type === 'bot' ? `бот · ${DIFF[p.diff || 2].name.toLowerCase()}` : p.type === 'remote' ? 'гравець по мережі' : 'гравець';
function openCharSheet(i) {
  const p = G.players[i]; if (!p) return;
  closeMenu(); hidePeek();
  const mine = i === G.viewer && handVisible();
  const v = viewerP();
  const rcName = [p.raceCard && p.raceCard.name, p.clsCard && p.clsCard.name].filter(Boolean).join(' · ') || 'без раси й класу';
  const rows = [`<div class="kv"><span>Рівень</span><b>${p.level}</b></div>`];
  p.gear.forEach(c => { const on = usable(p, c); if (c.bonus || !on) rows.push(`<div class="kv ${on ? '' : 'off'}"><span>${artIcon(c)} ${esc(c.name)}${on ? '' : ` — лише для: ${esc(reqName(c.req))}`}</span><b>${on ? '+' + c.bonus : '0'}</b></div>`); });
  if (cls(p) === 'warrior') rows.push(`<div class="kv"><span>${artIcon(p.clsCard)} Воїн</span><b>+1</b></div>`);
  rows.push(`<div class="kv total"><span>Разом</span><b>${baseStr(p)}</b></div>`);
  const fb = fleeBonus(p), need = Math.max(1, 5 - fb);
  let chance = Math.min(6, 7 - need) / 6; if (race(p) === 'halfling') chance = 1 - Math.pow(1 - chance, 2);
  const fleeSrc = [race(p) === 'elf' ? 'Ельф +1' : '', ...p.gear.filter(c => c.flee && usable(p, c)).map(c => `${c.name} +${c.flee}`), race(p) === 'halfling' ? 'Напіврослик перекидає кубик' : ''].filter(Boolean);
  const abil = [p.raceCard && `<p class="ability"><b>${esc(p.raceCard.name)}.</b> ${esc(RACES[race(p)].text)}</p>`, p.clsCard && `<p class="ability"><b>${esc(p.clsCard.name)}.</b> ${esc(CLASSES[cls(p)].text)}</p>`].filter(Boolean).join('') || `<p class="ability">Немає раси й класу. ${mine ? 'Зіграй карту раси чи класу з руки поза боєм.' : ''}</p>`;
  const mood = p.type === 'bot' && v && v !== p ? `<h3>Характер</h3><div class="kv"><span>Складність</span><b style="color:var(--text)">${DIFF[p.diff || 2].name}</b></div><div class="kv"><span>Ставлення до тебе</span><b style="color:var(--text)">${attitude(p, v)}</b></div><p class="hint" style="margin-top:6px">Бот памʼятає, хто йому допомагав і хто підставляв. Від цього залежить, чи погодиться він допомогти і чи захоче нашкодити.</p>` : '';
  const handsUsed = sum(p.gear.filter(g => g.slot === 'hands'), g => g.hands), bigN = p.gear.filter(g => g.big).length;
  const s = slotItems(p);
  const miscList = s.misc.length > 1 ? `<div class="misc-list">${s.misc.map(c => `<button class="tag" type="button" data-g="${c.uid}">${artIcon(c)} ${esc(c.name)}${c.bonus ? ' +' + c.bonus : ''}</button>`).join('')}</div>` : '';
  showModal(`<div class="cs-head" style="--pc:${p.color}"><div class="cs-lvl"><small>рівень</small>${p.level}</div><div><h2>${esc(p.name)}</h2><div class="hint">${esc(rcName)} · ${sexName(p)} · ${typeName(p)}${mine ? ' · це ти' : ''}</div></div></div>
    <div class="cs-grid"><div>${dollHTML(p, true)}${miscList}<p class="hint" style="text-align:center;margin-top:10px">${mine ? 'Клацни річ, щоб зняти чи продати її.' : 'Клацни річ, щоб роздивитися.'}</p></div>
    <div><h3>Сила в бою</h3>${rows.join('')}
      <h3>Втеча</h3><div class="kv"><span>Потрібно на кубику</span><b>${need <= 1 ? 'будь-яке' : need + '+'}</b></div><div class="kv"><span>Шанс утекти</span><b>${Math.round(chance * 100)}%</b></div>${fleeSrc.length ? `<p class="hint" style="margin-top:6px">${esc(fleeSrc.join(' · '))}</p>` : ''}
      <h3>Здібності</h3>${abil}
      ${mood}
      <h3>Запаси</h3>
      <div class="kv"><span>Золото</span><b>${p.gold} / 1000</b></div><div class="meter" aria-hidden="true"><i style="width:${Math.min(100, p.gold / 10)}%"></i></div>
      <div class="kv"><span>Карти в руці</span><b>${p.hand.length} / ${handLimit(p)}</b></div>
      <div class="kv"><span>Зайняті руки</span><b>${handsUsed} / 2</b></div>
      <div class="kv"><span>Великі речі</span><b>${bigN} / ${race(p) === 'dwarf' ? '∞' : 1}</b></div>
    </div></div>
    <div class="row end"><button class="btn primary" type="button" data-close>Закрити</button></div>`, 'wide');
  $('#sheet').querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
    const c = [p.raceCard, p.clsCard, ...p.gear].find(x => x && x.uid === +b.dataset.g); if (!c) return;
    closeModal(); openCardMenu(c, mine ? 'gear' : 'view');
  });
}
let lastLogHTML = '';
function renderLog() {
  const ol = $('#logList'); if (!ol) return;
  const html = G.log.slice(-80).map(l => `<li class="${l.cls}">${l.html}</li>`).join('');
  if (html === lastLogHTML) return;
  const atBottom = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
  lastLogHTML = html; ol.innerHTML = html;
  if (atBottom) ol.scrollTop = ol.scrollHeight;
}
const freshT = {};
function setHTML(el, html) { if (el._html === html) return false; const sl = el.scrollLeft, st = el.scrollTop; el.innerHTML = html; el._html = html; el.scrollLeft = sl; el.scrollTop = st; return true; }
let boardFor = null, boardGoal = 0;
function buildBoard() {
  const el = $('#players');
  const pips = () => Array.from({ length: G.goal }, (_, k) => `${k === 10 ? '<b></b>' : ''}<i class="${k >= 10 ? 'ep' : ''} ${k === G.goal - 1 ? 'fin' : ''}"></i>`).join('');
  el.innerHTML = G.players.length ? `<div class="bhead"><span>Табло</span><span>мета <b>${G.goal}</b></span></div>` + G.players.map(p => `<div class="brow" style="--pc:${p.color}" data-p="${p.idx}" role="button" tabindex="0" title="Картка персонажа: ${esc(p.name)}"><div class="blvl"></div><div style="min-width:0"><div class="bname"><span class="bn">${esc(p.name)}</span><em class="btype"></em><span class="bt">хід</span><span class="bs"></span></div><div class="track">${pips()}</div><div class="bmeta"></div></div></div>`).join('') : '';
  el.hidden = !G.players.length;
  boardFor = G.players; boardGoal = G.goal;
  G.players.forEach(p => { p._ui = p.level; });
}
function renderPlayers() {
  if (boardFor !== G.players || boardGoal !== G.goal) buildBoard();
  const el = $('#players');
  G.players.forEach(p => {
    const row = el.querySelector(`.brow[data-p="${p.idx}"]`); if (!row) return;
    const isCur = p.idx === G.cur && !G.over;
    row.classList.toggle('cur', isCur);
    row.querySelector('.bt').hidden = !isCur;
    row.querySelector('.btype').textContent = p.type === 'bot' ? `бот ${'★'.repeat(p.diff || 2)}` : p.type === 'remote' ? 'мережа' : (NET.role === 'client' && p.idx === NET.me ? 'ти' : '');
    row.querySelector('.blvl').textContent = p.level;
    row.querySelector('.bs').innerHTML = `${ICO.sword} ${baseStr(p)}`;
    const rc = [p.raceCard && p.raceCard.name, p.clsCard && p.clsCard.name].filter(Boolean).join(' · ') || 'без раси й класу';
    row.querySelector('.bmeta').innerHTML = `${ICO[p.sex === 'f' ? 'f' : 'm']} ${esc(rc)} · карт ${p.hand.length} · ${p.gold} зол.`;
    const pipsEl = row.querySelectorAll('.track i');
    pipsEl.forEach((pip, k) => pip.classList.toggle('on', k < p.level));
    if (p._ui !== p.level) {
      const up = p.level > p._ui;
      row.classList.remove('up', 'down'); void row.offsetWidth; row.classList.add(up ? 'up' : 'down');
      if (up) for (let k = p._ui; k < p.level; k++) { const pip = pipsEl[k]; if (pip) { pip.classList.remove('pop'); void pip.offsetWidth; pip.classList.add('pop'); } }
      p._ui = p.level;
    }
  });
}
function statusText() {
  const p = cur(), v = viewerP(); if (!p) return NET.role === 'client' ? 'Підключено. Чекаємо початку гри…' : '';
  if (G.over) return NET.role === 'client' ? 'Гру завершено. Нову партію запускає господар.' : 'Гру завершено. Почни нову, коли будеш готовий.';
  const you = v && v === p;
  const nm = `<b>${esc(p.name)}</b>`;
  if (G.window && G.combat) {
    const mine = v && G.window.humans.includes(v) && !G.combat.passed.has(v.idx);
    const names = waitingOn().map(h => esc(h.name)).join(', ');
    return mine ? `<b>${esc(fighter().name)}</b> ось-ось переможе «${esc(monNames())}». Зіграй карту на монстра, підкинь мертвяка, приведи потвору чи перенаправ бій — або натисни <b>«Не втручаюсь»</b>. Без твого рішення бій не завершиться.` : `<b>${esc(fighter().name)}</b> ось-ось переможе. Чекаємо рішення: <b>${names}</b>.`;
  }
  switch (G.phase) {
    case 'deal': return 'Роздаємо карти…';
    case 'start': return you ? 'Твій хід. Зіграй расу, клас і речі з руки, потім <b>вибий двері</b> — кнопкою або клацнувши колоду на столі.' : `Хід: ${nm}${p.type === 'remote' ? ' (на іншому пристрої)' : ''}.`;
    case 'afterKick': return you ? 'Бою не було. <b>Обшукай кімнату</b> або зіграй монстра з руки, щоб шукати пригод.' : `${nm} вирішує, що робити далі.`;
    case 'combat': { if (!G.combat) return ''; const s = sides(); const fp = fighter(); const fy = v && v === fp; if (fp !== p) return fy ? (s.win ? 'Монстра перенаправили на тебе, але ти сильніший — <b>бий!</b>' : 'Монстра перенаправили на тебе! Додай сили, клич на поміч або тікай.') : `<b>${esc(fp.name)}</b> бʼється з «${esc(monNames())}» (бій перенаправили).`; return you ? (s.win ? 'Ти сильніший — <b>бий!</b> Але суперники ще можуть підсилити монстра.' : 'Монстри сильніші. Зіграй разові карти, поклич на поміч (і запропонуй ціну) або тікай.') : `${nm} бʼється з «${esc(monNames())}». Можеш зіграти карту на монстра або на допомогу.`; }
    case 'charity': return you ? (p.hand.length > handLimit(p) ? `У руці ${p.hand.length} карт при ліміті ${handLimit(p)}: зайві підуть найслабшому гравцю. Можеш спорядитися чи продати речі.` : 'Можеш спорядитися, продати речі чи наслати прокляття. Потім <b>заверши хід</b>.') : `${nm} завершує хід.`;
  }
  return '';
}
function renderDock() {
  const v = viewerP();
  $('#status').innerHTML = statusText();
  const box = $('#actions'); box.innerHTML = '';
  const acts = G.over && NET.role !== 'client' ? [{ label: 'Нова гра', fn: openSetup, cls: 'primary' }] : dockActs(v);
  acts.forEach(a => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label; b.disabled = !!a.dis; b.onclick = () => (a.pick && v && v.hand.length > handLimit(v)) ? openCharityPick(v, a.act) : a.act ? dispatch(a.act, a.as != null ? a.as : G.viewer) : a.fn(); box.appendChild(b); });
  if (!v) { $('#strText').textContent = NET.role === 'client' ? '' : 'режим глядача'; setHTML($('#equip'), `<div class="empty">${G.players.length ? 'Усі гравці за цим пристроєм — боти. Спостерігай.' : ''}</div>`); setHTML($('#hand'), ''); setHTML($('#handOwner'), ''); return; }
  document.querySelector('.dock .lbl [data-sheet]').hidden = !handVisible();
  if (!handVisible()) {
    const others = localHumans();
    $('#strText').textContent = 'карти приховано';
    setHTML($('#equip'), '<div class="empty">Персонаж і рука показуються, коли гравець відкриє свої карти.</div>');
    setHTML($('#handOwner'), '');
    if (setHTML($('#hand'), `<div class="hand-cover"><div class="backs" aria-hidden="true">${'<i></i>'.repeat(5)}</div><div><p class="empty" style="padding:0 0 8px">Карти приховано, щоб ніхто не підглядав. Відкрий лише свої:</p><div class="row" style="margin:0">${others.map(h => `<button class="btn small" type="button" data-reveal="${h.idx}"><b style="color:${h.color}">${esc(h.name)}</b> · показати мої карти</button>`).join('')}</div></div></div>`)) $('#hand').querySelectorAll('[data-reveal]').forEach(b => b.onclick = () => revealFor(G.players[+b.dataset.reveal]));
    return;
  }
  if (privacy() && v !== cur()) { const c0 = cur(); if (!G.window && c0 && c0.type === 'human') $('#status').innerHTML += ` Потім сховай карти — хід за <b>${esc(c0.name)}</b>.`; const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'Сховати карти'; b.onclick = hideHand; box.appendChild(b); }
  $('#strText').textContent = `${v.name} · сила ${baseStr(v)}`;
  setHTML($('#equip'), dollHTML(v, false) + `<button class="btn small char-btn" type="button" data-sheet>Картка персонажа · сила ${baseStr(v)} · втеча +${fleeBonus(v)}</button>`);
  { const lim = handLimit(v), n = v.hand.length; setHTML($('#handOwner'), `${esc(v.name)} · <span class="hc${n > lim ? ' over' : ''}" title="Ліміт руки: ${lim}. Зайві карти доведеться віддати в кінці ходу.">${n} з ${lim}</span> ${plural(lim, 'карти', 'карт', 'карт')}${n > lim ? ' — забагато, зайві віддаси в кінці ходу' : ''}`); }
  const nowT = performance.now(); G.fresh.forEach(u => { if (!freshT[u]) freshT[u] = nowT + 700; }); G.fresh.clear();
  setHTML($('#hand'), v.hand.map(c => cardHTML(c, (freshT[c.uid] > nowT ? 'fresh ' : '') + (cardActions(c, 'hand').some(a => !a.dis && !/^(Продати|Скинути)/.test(a.label)) ? 'playable' : ''))).join('') || '<div class="empty">Рука порожня.</div>');
  G.fresh.clear();
}
function renderCombat() {
  const el = $('#combat'); const cb = G.combat;
  if (!cb || G.phase !== 'combat') { el.hidden = true; return; }
  const s = sides(), p = fighter(), h = cb.helper != null ? G.players[cb.helper] : null;
  const tr = treasureCount(), gain = levelsGain();
  const ty = combatTypes(cb);
  const mods = [...cb.mods, ...cb.mShots].map(c => `<span class="tag ${shotVal(c, ty, false) < 0 ? 'h' : 'm'}">${esc(c.name)} ${sgn(shotVal(c, ty, false))}</span>`)
    .concat(cb.pShots.map(c => `<span class="tag ${c.bonus < 0 ? 'm' : 'h'}">${esc(c.name)} ${sgn(shotVal(c, ty, true))}${c.fire && ty.dragon && c.bonus > 0 ? ' (вогонь не діє)' : ''}</span>`))
    .concat(cb.wiz ? [`<span class="tag h">Магія +${cb.wiz * 2}</span>`] : [])
    .concat(h ? [`<span class="tag h">${esc(h.name)} +${baseStr(h)}${cb.offer ? ` · обіцяно ${cb.offer.tr} ${plural(cb.offer.tr, 'скарб', 'скарби', 'скарбів')}` : ''}</span>`] : []);
  if (cb.mons.length > 1) mods.unshift(...cb.mons.map(x => `<span class="tag m">${artIcon(x.c)} ${esc(x.c.name)} ${monLvl(x.c, p)}${x.c.dragon ? ' · 🐉 дракон' : ''}${x.c.undead ? ' · 💀 нежить' : ''}</span>`));
  [p, h].filter(Boolean).forEach(q => {
    const a = typeAdj(q, ty), who = q === p ? '' : esc(q.name) + ': ';
    if (a.fireOff) mods.push(`<span class="tag m">${who}🔥 Дракон не боїться вогню ${a.fireOff}</span>`);
    if (a.fireUndead) mods.push(`<span class="tag h">${who}🔥 Вогонь палить нежить +${a.fireUndead}</span>`);
    if (a.slayer) mods.push(`<span class="tag h">${who}🛡️ Драконобій +${a.slayer}</span>`);
  });
  if (epicFor(p)) mods.unshift(`<span class="tag m">Епічна зона: рівень монстрів ×2</span>`);
  cb.mons.forEach(x => { const vb = vsBonus(x.c, p); if (vb) mods.push(`<span class="tag m">${esc(x.c.name)}: бонус проти тебе +${vb}</span>`); });
  if (cb.mons.some(x => x.c.undead) && (cls(p) === 'cleric' || (h && cls(h) === 'cleric'))) mods.push('<span class="tag h">Жрець проти нежиті +3</span>');
  const localOthers = NET.role !== 'client' && G.players.some(q => q.type === 'human' && q !== p && q.idx !== cb.helper);
  const canMeddle = localOthers && !G.over && (!G.busy || G.window) && G.players.filter(q => q.type === 'human').length > 1;
  const pct = Math.round(s.hero / (s.hero + s.mon) * 100);
  const bad = cb.mons.length > 1 ? `${cb.mons.length} монстри — тікати доведеться від кожного окремо` : cb.mons[0].c.bad.text;
  el.innerHTML = `<div class="cside hero"><div class="cl">${esc(p.name)}${h ? ' + ' + esc(h.name) : ''}</div><div class="big">${s.hero}</div></div>
    <div class="vs">${s.win ? 'перемагає' : 'програє'}<b>${ICO.sword}</b></div>
    <div class="cside mon"><div class="cl">${esc(monNames())}</div><div class="big">${s.mon}</div></div>
    <div class="cbar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    ${mods.length ? `<div class="cmods">${mods.join('')}</div>` : ''}
    <div class="cnote">Нагорода: <b>${tr} ${plural(tr, 'скарб', 'скарби', 'скарбів')}, +${gain} ${plural(gain, 'рівень', 'рівні', 'рівнів')}</b> · Халепа: <b>${esc(bad)}</b>${s.tie && s.hero === s.mon ? ' · Нічия на користь воїна' : ''}</div>
    ${G.window ? `<div class="cnote" style="color:var(--brass)">Чекаємо рішення: <b>${waitingOn().map(h => esc(h.name)).join(', ') || '…'}</b>. Бій не завершиться, доки кожен не зіграє карту або не натисне «Не втручаюсь».</div>` : ''}
    ${canMeddle ? '<div class="crow"><button class="btn small" type="button" id="meddle">Втрутитися (інші гравці тут)</button></div>' : ''}`;
  el.hidden = false;
  const m = $('#meddle'); if (m) m.onclick = openInterfere;
}
function renderUI() { renderPlayers(); renderDock(); renderCombat(); queueSnap(); }

/* --- делеговані обробники --- */
$('#hand').addEventListener('click', e => { const el = e.target.closest('.card'); if (!el || !handVisible()) return; const v = viewerP(); const c = v && v.hand.find(x => x.uid === +el.dataset.uid); if (c) openCardMenu(c, 'hand'); });
$('#hand').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const el = e.target.closest('.card'); if (!el) return; e.preventDefault(); el.click(); });
$('#equip').addEventListener('click', e => { if (!handVisible()) return; if (e.target.closest('[data-sheet]')) { if (G.viewer >= 0) openCharSheet(G.viewer); return; } const b = e.target.closest('[data-g]'); if (!b) return; const v = viewerP(); const uid = +b.dataset.g; const c = v && [v.raceCard, v.clsCard, ...v.gear].find(x => x && x.uid === uid); if (c) openCardMenu(c, 'gear'); });
$('#btnRules').onclick = openRules;
$('#btnSkin').onclick = () => openSkins();
$('#btnSound').onclick = openSound; soundLabel();
document.querySelector('.dock .lbl [data-sheet]').onclick = () => { if (G.viewer >= 0 && handVisible()) openCharSheet(G.viewer); };
$('#players').addEventListener('click', e => { const c = e.target.closest('[data-p]'); if (c) openCharSheet(+c.dataset.p); });
$('#players').addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const c = e.target.closest('[data-p]'); if (c) { e.preventDefault(); openCharSheet(+c.dataset.p); } });
$('#btnLog').onclick = () => { const l = $('#log'); l.hidden = !l.hidden; };
$('#btnLogClose').onclick = () => { $('#log').hidden = true; };
$('#btnNew').onclick = () => openMainMenu();
addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); } });
if (innerWidth < 760) $('#log').hidden = true;
