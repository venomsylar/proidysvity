'use strict';

/* ============================== РЕНДЕР ІНТЕРФЕЙСУ ============================== */
const SIL = '<svg class="sil" viewBox="0 0 100 150" aria-hidden="true"><circle cx="50" cy="22" r="13"/><path d="M31 46 Q50 39 69 46 L73 96 L27 96 Z"/><path d="M31 50 L13 90 M69 50 L87 90"/><path d="M41 96 L37 142 M59 96 L63 142"/></svg>';
function slotItems(p) {
  const hands = p.gear.filter(g => g.slot === 'hands'); let L = null, R = null, two = false;
  for (const h of hands) { if (h.hands === 2) { L = h; R = h; two = true; } else if (!L) L = h; else if (!R) R = h; }
  return { head: p.gear.find(g => g.slot === 'head'), body: p.gear.find(g => g.slot === 'body'), feet: p.gear.find(g => g.slot === 'feet'), L, R, two, misc: p.gear.filter(g => g.slot === 'misc') };
}
function slotHTML(p, c, label, area, big, extra = '') {
  if (!c) return `<div class="slot empty" style="grid-area:${area}"><span class="sl">${label}</span>${extra}</div>`;
  const off = c.kind === 'gear' && !usable(p, c);
  const bonus = c.kind === 'gear' && (c.bonus || c.flee) ? `<span class="sb">${c.bonus ? '+' + c.bonus : ''}${c.flee ? ` ↗${c.flee}` : ''}</span>` : '';
  const tip = `${label}: ${c.name}${off ? ` (не діє — лише для: ${reqName(c.req)})` : ''}`;
  return `<button type="button" class="slot ${c.kind !== 'gear' ? 'rc' : ''} ${off ? 'off' : ''}" style="grid-area:${area}" data-g="${c.uid}" title="${esc(tip)}" aria-label="${esc(tip)}"><span class="se" aria-hidden="true">${artIcon(c, "")}</span>${big ? `<span class="sn">${esc(c.name)}</span>` : ''}${bonus}${extra}</button>`;
}
const miniRC = (second, dual) => (second ? `<span class="s2" title="${esc(second.name)}">${artIcon(second, '')}</span>` : '') + (dual ? `<span class="sd" title="${esc(dual.name)}">×2</span>` : '');
function dualSlotHTML(p) {
  const cs = [p.dualRace, p.dualCls].filter(Boolean);
  if (!cs.length) return `<div class="slot empty dualslot" style="grid-area:dual"><span class="sl">Особливе</span></div>`;
  return `<div class="slot dualslot rc" style="grid-area:dual">${cs.map(c => `<button type="button" class="dualb" data-g="${c.uid}" title="${esc(c.name)}">${artIcon(c, '')}<span class="sn">${esc(c.name)}</span></button>`).join('')}</div>`;
}
function dollHTML(p, big) {
  const s = slotItems(p);
  const misc = s.misc.length ? slotHTML(p, s.misc[0], 'Дрібниці', 'misc', big && s.misc.length === 1, s.misc.length > 1 ? `<span class="cnt">×${s.misc.length}</span>` : '') : slotHTML(p, null, 'Дрібниці', 'misc', big);
  const rh = s.two ? `<div class="slot twin" style="grid-area:rh" title="Дворучна річ: ${esc(s.R.name)}"><span class="se" aria-hidden="true">${artIcon(s.R, "")}</span><span class="sl">дві руки</span></div>` : slotHTML(p, s.R, 'Права рука', 'rh', big);
  return `<div class="doll ${big ? 'big' : ''}">${SIL}
    ${slotHTML(p, p.raceCard, 'Раса', 'race', big, big ? '' : miniRC(p.raceCard2, p.dualRace))}${slotHTML(p, s.head, 'Голова', 'head', big)}${slotHTML(p, p.clsCard, 'Клас', 'cls', big, big ? '' : miniRC(p.clsCard2, p.dualCls))}
    ${slotHTML(p, s.L, 'Ліва рука', 'lh', big)}${slotHTML(p, s.body, 'Тіло', 'body', big)}${rh}
    ${misc}${slotHTML(p, s.feet, 'Ноги', 'feet', big)}
    <div class="slot power" style="grid-area:pow" title="Сила в бою"><span class="pv">${baseStr(p)}</span><span class="sl">сила</span></div>
    ${big ? slotHTML(p, p.raceCard2, p.dualRace ? 'Раса 2' : 'Раса 2 · потрібна карта «Родовід»', 'race2', big) + dualSlotHTML(p) + slotHTML(p, p.clsCard2, p.dualCls ? 'Клас 2' : 'Клас 2 · потрібна карта «Сумісництво»', 'cls2', big) : ''}</div>`;
}
const CURSE_SHORT = { monday: '−2 у бою', lead: '−1 до втечі', pocket: '−1 карта в руці', inflation: 'продаж за пів ціни', lonely: 'без помічників', magnet: 'монстри +2', sack: '−1 скарб', sneeze: '−1 у бою й утечі' };
const curseTitle = p => (p.curses || []).map(k => `${k.name}: ${k.bad.text}`).join('\n');
// жетони тривалих проклять біля персонажа — видно без відкривання картки
function curseChips(p) {
  const cs = p.curses || []; if (!cs.length) return '';
  return `<div class="cchips" role="list" aria-label="Тривалі прокляття">${cs.map(k => `<button type="button" class="cchip" role="listitem" data-sheet title="${esc(k.name)}: ${esc(k.bad.text)} Зняти — картою «Зняти прокляття».">${artIcon(k, 'ai')}${cs.length > 3 ? '' : `<i>${esc(CURSE_SHORT[k.bad.p] || k.name)}</i>`}</button>`).join('')}</div>`;
}
const sexName = p => p.sex === 'f' ? 'жінка' : 'чоловік';
const typeName = p => p.type === 'bot' ? `бот · ${DIFF[p.diff || 2].name.toLowerCase()}` : p.type === 'remote' ? 'гравець по мережі' : 'гравець';
function openCharSheet(i) {
  const p = G.players[i]; if (!p) return;
  closeMenu(); hidePeek();
  const mine = i === G.viewer && handVisible();
  const v = viewerP();
  const rcName = rcNames(p) || 'без раси й класу';
  const rows = [`<div class="kv"><span>Рівень</span><b>${p.level}</b></div>`];
  p.gear.forEach(c => { const on = usable(p, c); if (c.bonus || !on) rows.push(`<div class="kv ${on ? '' : 'off'}"><span>${artIcon(c)} ${esc(c.name)}${on ? '' : ` — лише для: ${esc(reqName(c.req))}`}</span><b>${on ? '+' + c.bonus : '0'}</b></div>`); });
  if (hasCls(p, 'warrior')) rows.push(`<div class="kv"><span>${artIcon(p.clsCard)} Воїн</span><b>+1</b></div>`);
  (p.curses || []).forEach(k => { const d = { monday: 2, sneeze: 1 }[k.bad.p]; if (d) rows.push(`<div class="kv off-curse"><span>${artIcon(k)} ${esc(k.name)}</span><b>−${d}</b></div>`); });
  rows.push(`<div class="kv total"><span>Разом</span><b>${baseStr(p)}</b></div>`);
  const fb = fleeBonus(p), need = Math.max(1, 5 - fb);
  let chance = Math.min(6, 7 - need) / 6; if (hasRace(p, 'halfling')) chance = 1 - Math.pow(1 - chance, 2);
  const fleeSrc = [hasRace(p, 'elf') ? 'Ельф +1' : '', ...p.gear.filter(c => c.flee && usable(p, c)).map(c => `${c.name} +${c.flee}`), hasRace(p, 'halfling') ? 'Напіврослик перекидає кубик' : '', ...(p.curses || []).filter(k => ['lead', 'sneeze'].includes(k.bad.p)).map(k => `${k.name} −1`)].filter(Boolean);
  const abil = [...raceCards(p).map(c => `<p class="ability"><b>${esc(c.name)}.</b> ${esc(RACES[c.race].text)}</p>`), ...clsCards(p).map(c => `<p class="ability"><b>${esc(c.name)}.</b> ${esc(CLASSES[c.cls].text)}</p>`),
    p.dualRace && `<p class="ability"><b>${esc(p.dualRace.name)}.</b> ${p.raceCard2 ? 'Дві раси одночасно.' : 'Можна мати другу расу. Поки її немає — монстри не мають бонусів проти твоєї раси.'}</p>`,
    p.dualCls && `<p class="ability"><b>${esc(p.dualCls.name)}.</b> ${p.clsCard2 ? 'Два класи одночасно.' : 'Можна мати другий клас. Поки його немає — монстри не мають бонусів проти твого класу.'}</p>`].filter(Boolean).join('') || `<p class="ability">Немає раси й класу. ${mine ? 'Зіграй карту раси чи класу з руки поза боєм.' : ''}</p>`;
  const mood = p.type === 'bot' && v && v !== p ? `<h3>Характер</h3><div class="kv"><span>Складність</span><b style="color:var(--text)">${DIFF[p.diff || 2].name}</b></div><div class="kv"><span>Ставлення до тебе</span><b style="color:var(--text)">${attitude(p, v)}</b></div><p class="hint" style="margin-top:6px">Бот памʼятає, хто йому допомагав і хто підставляв. Від цього залежить, чи погодиться він допомогти і чи захоче нашкодити.</p>` : '';
  const handsUsed = sum(p.gear.filter(g => g.slot === 'hands'), g => g.hands), bigN = p.gear.filter(g => g.big).length;
  const s = slotItems(p);
  const miscList = s.misc.length > 1 ? `<div class="misc-list">${s.misc.map(c => `<button class="tag" type="button" data-g="${c.uid}">${artIcon(c)} ${esc(c.name)}${c.bonus ? ' +' + c.bonus : ''}</button>`).join('')}</div>` : '';
  showModal(`<div class="cs-head" style="--pc:${p.color}"><div class="cs-lvl"><small>рівень</small>${p.level}</div><div><h2>${esc(p.name)}</h2><div class="hint">${esc(rcName)} · ${sexName(p)} · ${typeName(p)}${mine ? ' · це ти' : ''}</div></div></div>
    <div class="cs-grid"><div>${dollHTML(p, true)}${miscList}<p class="hint" style="text-align:center;margin-top:10px">${mine ? 'Клацни річ, щоб зняти чи продати її.' : 'Клацни річ, щоб роздивитися.'}</p></div>
    <div><h3>Сила в бою</h3>${rows.join('')}
      <h3>Втеча</h3><div class="kv"><span>Потрібно на кубику</span><b>${need <= 1 ? 'будь-яке' : need + '+'}</b></div><div class="kv"><span>Шанс утекти</span><b>${Math.round(chance * 100)}%</b></div>${fleeSrc.length ? `<p class="hint" style="margin-top:6px">${esc(fleeSrc.join(' · '))}</p>` : ''}
      <h3>Здібності</h3>${abil}
      <h3>Тривалі прокляття</h3>${(p.curses || []).length ? p.curses.map(k => `<div class="kv off-curse"><span>${artIcon(k)} ${esc(k.name)}</span><b>${esc(k.bad.text)}</b></div>`).join('') + '<p class="hint">Зняти можна картою «Бабусина замова» чи «Свята вода з-під крана».</p>' : '<p class="hint">Немає. Пощастило!</p>'}
      ${mood}
      <h3>Запаси</h3>
      <div class="kv"><span>Золото</span><b>${p.gold} / 1000</b></div><div class="meter" aria-hidden="true"><i style="width:${Math.min(100, p.gold / 10)}%"></i></div>
      <div class="kv"><span>Карти в руці</span><b>${p.hand.length} / ${handLimit(p)}</b></div>
      <div class="kv"><span>Зайняті руки</span><b>${handsUsed} / 2</b></div>
      <div class="kv"><span>Великі речі</span><b>${bigN} / ${hasRace(p, 'dwarf') ? '∞' : 1}</b></div>
    </div></div>
    <div class="row end"><button class="btn primary" type="button" data-close>Закрити</button></div>`, 'wide');
  $('#sheet').querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
    const c = [...rcCards(p), ...p.gear].find(x => x && x.uid === +b.dataset.g); if (!c) return;
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
  const len = G.coop ? 10 : G.teams ? TEAM_PER() : G.goal;
  const pips = () => Array.from({ length: len }, (_, k) => `${k === 10 ? '<b></b>' : ''}<i class="${k >= 10 && G.goal > 10 ? 'ep' : ''} ${k === len - 1 && !G.teams ? 'fin' : ''}"></i>`).join('');
  const rowHTML = p => `<div class="brow${G.teams && !G.coop ? ' mate' : ''}" style="--pc:${p.color};--tc:${G.teams ? TEAMS[p.team].color : p.color}" data-p="${p.idx}" role="button" tabindex="0" title="Картка персонажа: ${esc(p.name)}"><div class="blvl"></div><div style="min-width:0"><div class="bname"><span class="bn">${esc(p.name)}</span><span class="bcur" hidden></span><em class="btype"></em><span class="bt">хід</span><span class="bs"></span></div><div class="track">${pips()}</div><div class="bmeta"></div></div></div>`;
  const head = `<div class="bhead"><span>Табло</span><span>${G.coop ? 'похід' : G.teams ? 'команди' : `мета <b>${G.goal}</b>`}</span></div>`;
  const coopHead = G.coop ? `<div class="bcoop"><div class="tl"><span>Загроза</span><b class="thv"></b></div><div class="thr">${Array.from({ length: G.coop.max }, (_, k) => `<i class="${k >= Math.ceil(G.coop.max * 2 / 3) ? 'z2' : k >= Math.ceil(G.coop.max / 3) ? 'z1' : ''}"></i>`).join('')}</div><div class="cinf"></div></div>` : '';
  el.innerHTML = !G.players.length ? '' : head + coopHead + (G.coop ? G.players.map(rowHTML).join('') : G.teams
    ? teamIds().map(t => `<div class="bteam" data-team="${t}" style="--tc:${TEAMS[t].color}"><span class="tn">${teamName(t)}</span><span class="tsc"></span><div class="tbar"><i></i></div></div>` + teamMembers(t).map(rowHTML).join('')).join('')
    : G.players.map(rowHTML).join(''));
  el.hidden = !G.players.length;
  boardFor = G.players; boardGoal = G.goal;
  G.players.forEach(p => { p._ui = p.level; });
}
function renderPlayers() {
  if (boardFor !== G.players || boardGoal !== G.goal) buildBoard();
  const el = $('#players');
  if (G.coop) {
    const co = G.coop, b = el.querySelector('.bcoop');
    if (b) {
      b.querySelector('.thv').textContent = `${co.threat} / ${co.max}`;
      b.querySelectorAll('.thr i').forEach((pip, k) => pip.classList.toggle('on', k < co.threat));
      const f = co.lair ? coopFc() : null;
      b.querySelector('.cinf').innerHTML = `🗝️ ${co.keys}/${co.need} · ${co.lair ? `<b class="lair">лігво відчинене</b>` : 'лігво зачинене'} · Підземелля: ${NET.role === 'client' ? co.handN | 0 : co.hand.length} карт${co.lair && co.guards && co.guardsDone < co.guards.length ? `<div class="cboss">🛡️ Вартові: ${co.guards.map((g, k) => k < co.guardsDone ? `<s>${esc(g.name)}</s>` : k === co.guardsDone ? `<b>${esc(g.name)} (${g.lvl})</b>` : `${esc(g.name)} (${g.lvl})`).join(' → ')}</div>` : ''}${co.lair && co.boss ? `<div class="cboss">${esc(co.boss.art || '')} <b>${esc(co.boss.name)}</b>${f ? ` · загін ${f.hero}${f.shots ? '+' + f.shots : ''} проти ${f.mon}` : ''}</div>` : ''}`;
    }
  } else if (G.teams) {
    const best = Math.max(...teamIds().map(t => teamScore(t) / teamTarget(t)));
    teamIds().forEach(t => {
      const h = el.querySelector(`.bteam[data-team="${t}"]`); if (!h) return;
      const sc = teamScore(t), tg = teamTarget(t);
      h.querySelector('.tsc').textContent = `${sc} / ${tg}`;
      h.querySelector('.tbar i').style.width = Math.min(100, sc / tg * 100) + '%';
      h.classList.toggle('lead', sc / tg === best && teamIds().filter(k => teamScore(k) / teamTarget(k) === best).length === 1);
    });
  }
  G.players.forEach(p => {
    const row = el.querySelector(`.brow[data-p="${p.idx}"]`); if (!row) return;
    const isCur = p.idx === G.cur && !G.over;
    row.classList.toggle('cur', isCur);
    row.querySelector('.bt').hidden = !isCur;
    row.querySelector('.btype').textContent = p.type === 'bot' ? (p.wasRemote ? 'бот замість' : `бот ${'★'.repeat(p.diff || 2)}`) : p.type === 'remote' ? (offLeft(p) ? `без звʼязку ${offLeft(p)}с` : 'мережа') : (NET.role === 'client' && p.idx === NET.me ? 'ти' : '');
    row.querySelector('.blvl').textContent = p.level;
    row.querySelector('.bs').innerHTML = `${ICO.sword} ${baseStr(p)}`;
    const rc = rcNames(p) || 'без раси й класу';
    { const bc = row.querySelector('.bcur'), n = (p.curses || []).length; bc.hidden = !n; if (n) { bc.textContent = `⛓${n}`; bc.title = curseTitle(p); } }
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
  if (offLeft(p) && G.phase !== 'prep') return `Чекаємо на ${nm}: звʼязок перервався. Ще до ${offLeft(p)} с — потім за нього походить бот.`;
  if (G.bossWait && G.combat) {
    const s = sides(), wait = G.bossWait.waiting.map(i => G.players[i]).filter(Boolean);
    const line = `Бій з Босом: загін <b>${s.hero}</b> проти <b>${s.mon}</b> — ${s.win ? 'ви перемагаєте!' : `бракує ${s.mon - s.hero + (s.tie ? 0 : 1)}.`}`;
    return v && wait.includes(v) ? `${line} Зіграй разові карти (клацни карту), потім натисни «Готово до бою».` : `${line} Чекаємо: ${wait.map(q => esc(q.name)).join(', ')}.`;
  }
  if (G.assist && G.combat) {
    const h = G.players[G.assist.who], s = sides(), need = Math.max(0, s.mon - s.hero + (s.tie ? 0 : 1));
    return v && h === v ? `<b>${esc(fighter().name)}</b> разом із тобою ще не перемагає «${esc(monNames())}»: бракує <b>${need}</b>. Зіграй разові карти з руки (клацни карту) або натисни «Нічим допомогти».` : `Чекаємо, чи <b>${esc(h ? h.name : '')}</b> докине карт у бій: бракує ${need}.`;
  }
  if (G.window && G.combat) {
    const mine = v && G.window.humans.includes(v) && !G.combat.passed.has(v.idx);
    const names = waitingOn().map(h => esc(h.name)).join(', ');
    return mine ? `<b>${esc(fighter().name)}</b> ось-ось переможе «${esc(monNames())}». Зіграй карту на монстра, підкинь мертвяка, приведи потвору чи перенаправ бій — або натисни <b>«Не втручаюсь»</b>. Без твого рішення бій не завершиться.` : `<b>${esc(fighter().name)}</b> ось-ось переможе. Чекаємо рішення: <b>${names}</b>.`;
  }
  switch (G.phase) {
    case 'deal': return 'Роздаємо карти…';
    case 'prep': {
      const wait = (G.prepWait || []).map(i => G.players[i]).filter(Boolean);
      if (v && wait.includes(v)) return 'Перед першим ходом: зіграй расу, клас і вдягни речі (клацни карту в руці). Коли готовий — натисни <b>«Я спорядився»</b>.';
      return wait.length ? `Чекаємо, поки спорядяться: ${wait.map(q => nameTag(q) + (offLeft(q) ? ` (без звʼязку, ще ${offLeft(q)} с)` : '')).join(', ')}.` : 'Усі спорядилися. Починаємо!';
    }
    case 'start': if (you && G.coop && G.coop.lair && G.coop.guards && G.coop.guardsDone < G.coop.guards.length) { const g = G.coop.guards[G.coop.guardsDone]; return `Лігво відчинене, але його стережуть: наступний вартовий — <b>${esc(g.name)}</b> (рівень ${g.lvl}, ${g.treasures || 4} скарби). Атакуй його замість дверей (можна кликати на поміч) — або спершу прокачайся.`; }
      if (you && G.coop && G.coop.lair) { const f = coopFc(); return `Лігво відчинене! Можеш вести загін на Боса${f ? ` (зараз ${f.hero} проти ${f.mon}${f.shots ? `, у загону ще ${f.shots} у разових картах` : ''})` : ''} — або вибивай двері, щоб прокачатися.`; }
      return you ? 'Твій хід. Зіграй расу, клас і речі з руки, потім <b>вибий двері</b> — кнопкою або клацнувши колоду на столі.' : `Хід: ${nm}${p.type === 'remote' ? ' (на іншому пристрої)' : ''}.`;
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
  $('#strText').innerHTML = `${esc(v.name)} · сила ${baseStr(v)}${(v.curses || []).length ? ` <span class="ccount" title="${esc(curseTitle(v))}">⛓ ${v.curses.length}</span>` : ''}`;
  setHTML($('#equip'), dollHTML(v, false) + curseChips(v) + `<button class="btn small char-btn" type="button" data-sheet>Картка персонажа · сила ${baseStr(v)} · втеча ${sgn(fleeBonus(v))}</button>`);
  { const lim = handLimit(v), n = v.hand.length; setHTML($('#handOwner'), `${esc(v.name)} · <span class="hc${n > lim ? ' over' : ''}" title="Ліміт руки: ${lim}. Зайві карти доведеться віддати в кінці ходу.">${n} з ${lim}</span> ${plural(lim, 'карти', 'карт', 'карт')}${n > lim ? ' — забагато, зайві віддаси в кінці ходу' : ''}`); }
  const nowT = performance.now(); G.fresh.forEach(u => { if (!freshT[u]) freshT[u] = nowT + 700; }); G.fresh.clear();
  setHTML($('#hand'), v.hand.map(c => cardHTML(c, (freshT[c.uid] > nowT ? 'fresh ' : '') + (cardActions(c, 'hand').some(a => !a.dis && !/^(Продати|Скинути|Віддати)/.test(a.label)) ? 'playable' : ''))).join('') || '<div class="empty">Рука порожня.</div>');
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
    .concat(Object.entries(cb.stab || {}).filter(([, n]) => n).map(([i, n]) => `<span class="tag m">🥷 ${esc((G.players[i] || {}).name || '')}: удар у спину −${n * 2}</span>`))
    .concat(h ? [`<span class="tag h">${esc(h.name)} +${baseStr(h)}${cb.offer ? ` · обіцяно ${cb.offer.tr} ${plural(cb.offer.tr, 'скарб', 'скарби', 'скарбів')}` : ''}</span>`] : []);
  if (cb.mons.length > 1) mods.unshift(...cb.mons.map(x => `<span class="tag m">${artIcon(x.c)} ${esc(x.c.name)} ${monLvl(x.c, p)}${x.c.dragon ? ' · 🐉 дракон' : ''}${x.c.undead ? ' · 💀 нежить' : ''}</span>`));
  [p, h].filter(Boolean).forEach(q => {
    const a = typeAdj(q, ty), who = q === p ? '' : esc(q.name) + ': ';
    if (a.fireOff) mods.push(`<span class="tag m">${who}🔥 Дракон не боїться вогню ${a.fireOff}</span>`);
    if (a.fireUndead) mods.push(`<span class="tag h">${who}🔥 Вогонь палить нежить +${a.fireUndead}</span>`);
    if (a.slayer) mods.push(`<span class="tag h">${who}🛡️ Драконобій +${a.slayer}</span>`);
  });
  if (epicFor(p)) mods.unshift(`<span class="tag m">Епічна зона: рівень монстрів ×2</span>`);
  if (cb.boss) { G.players.filter(q => q !== p).forEach(q => mods.push(`<span class="tag h">${esc(q.name)} +${baseStr(q)}</span>`)); if (cb.bossX) mods.push(`<span class="tag m">Здібність Боса +${cb.bossX}</span>`); }
  if (G.coop && G.coop.threat >= Math.ceil(G.coop.max / 3)) mods.push(`<span class="tag m">⚠️ Підземелля прокинулось +${G.coop.threat >= Math.ceil(G.coop.max * 2 / 3) ? 4 : 2}</span>`);
  cb.mons.forEach(x => { const vb = vsBonus(x.c, p); if (vb) mods.push(`<span class="tag m">${esc(x.c.name)}: бонус проти тебе +${vb}</span>`); });
  if (cb.mons.some(x => x.c.undead) && (hasCls(p, 'cleric') || (h && hasCls(h, 'cleric')))) mods.push('<span class="tag h">Жрець проти нежиті +3</span>');
  [p, h].filter(Boolean).forEach(q => (q.curses || []).forEach(k => { const v = { monday: '−2', sneeze: '−1', magnet: 'монстри +2', sack: 'скарбів −1' }[k.bad.p]; if (v) mods.push(`<span class="tag m">⛓ ${q === p ? '' : esc(q.name) + ': '}${esc(k.name)} ${v}</span>`); }));
  if (raceShield(p) && cb.mons.some(x => x.c.vs && Object.keys(x.c.vs).some(k => hasRace(p, k)))) mods.push(`<span class="tag h">${esc(p.dualRace.name)}: бонус проти раси не діє</span>`);
  if (clsShield(p) && cb.mons.some(x => x.c.vs && Object.keys(x.c.vs).some(k => hasCls(p, k)))) mods.push(`<span class="tag h">${esc(p.dualCls.name)}: бонус проти класу не діє</span>`);
  const others = NET.role !== 'client' ? G.players.filter(q => q.type === 'human' && q !== p && q !== viewerP()) : [];
  const canMeddle = others.length > 0 && !G.over && (!G.busy || G.window);
  const meddleLbl = others.length === 1 && others[0].idx === cb.helper ? `Карти помічника: ${esc(others[0].name)}` : others.some(q => q.idx === cb.helper) ? 'Помічник чи інші гравці тут: зіграти карту' : 'Втрутитися (інші гравці тут)';
  const pct = Math.round(s.hero / (s.hero + s.mon) * 100);
  const bad = cb.mons.length > 1 ? `${cb.mons.length} монстри — тікати доведеться від кожного окремо` : cb.mons[0].c.bad.text;
  el.innerHTML = `<div class="cside hero"><div class="cl">${cb.boss ? 'Увесь загін' : esc(p.name) + (h ? ' + ' + esc(h.name) : '')}</div><div class="big">${s.hero}</div></div>
    <div class="vs">${s.win ? 'перемагає' : 'програє'}<b>${ICO.sword}</b></div>
    <div class="cside mon"><div class="cl">${esc(monNames())}</div><div class="big">${s.mon}</div></div>
    <div class="cbar" aria-hidden="true"><i style="width:${pct}%"></i></div>
    ${mods.length ? `<div class="cmods">${mods.join('')}</div>` : ''}
    ${cb.boss ? `<div class="cnote">Перемога — кінець походу. Програш: кожен −1 рівень, Загроза +3.</div>` : `<div class="cnote">Нагорода: <b>${tr} ${plural(tr, 'скарб', 'скарби', 'скарбів')}, +${gain} ${plural(gain, 'рівень', 'рівні', 'рівнів')}</b> · Халепа: <b>${esc(bad)}</b>${s.tie && s.hero === s.mon ? ' · Нічия на користь воїна' : ''}</div>`}
    ${G.window ? `<div class="cnote" style="color:var(--brass)">Чекаємо рішення: <b>${waitingOn().map(h => esc(h.name)).join(', ') || '…'}</b>. Бій не завершиться, доки кожен не зіграє карту або не натисне «Не втручаюсь».</div>` : ''}
    ${canMeddle ? '<div class="crow"><button class="btn small" type="button" id="meddle">${meddleLbl}</button></div>' : ''}`;
  el.hidden = false;
  const m = $('#meddle'); if (m) m.onclick = openInterfere;
}
function renderUI() { renderPlayers(); renderDock(); renderCombat(); queueSnap(); chatSync(); }

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
