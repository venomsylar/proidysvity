'use strict';

/* ============================== ДІЇ: ОДНА СИСТЕМА ДЛЯ ЛЮДЕЙ НА ЦЬОМУ Й ІНШИХ ПРИСТРОЯХ ============================== */
const sameAct = (a, b) => !!a && !!b && a.k === b.k && (a.uid || 0) === (b.uid || 0) && (a.side || '') === (b.side || '') && (a.target == null ? -1 : a.target) === (b.target == null ? -1 : b.target) && (a.mon || 0) === (b.mon || 0);
function findOwnCard(p, uid) {
  const h = p.hand.find(c => c.uid === uid); if (h) return { c: h, where: 'hand' };
  const g = [p.raceCard, p.clsCard, ...p.gear].find(c => c && c.uid === uid); return g ? { c: g, where: 'gear' } : null;
}
const flatActs = list => list.flatMap(a => a.sub ? a.sub : [a]);
function actAllowed(p, act) {
  if (!act || G.over) return false;
  if (act.k === 'pass') return waitingOn().includes(p);
  if (act.k === 'trade') return canTrade(p) && !!G.players[act.target] && act.target !== p.idx;
  if (act.k === 'help') { const cb = G.combat; return !G.busy && G.phase === 'combat' && !!cb && p === fighter() && cb.helper == null && !!G.players[act.target] && act.target !== p.idx && !cb.asked.has(act.target); }
  if (act.uid) { const f = findOwnCard(p, act.uid); return !!f && flatActs(cardActions(f.c, f.where, p)).some(a => !a.dis && sameAct(a.act, act)); }
  return dockActs(p).some(a => a.act && !a.dis && sameAct(a.act, act));
}
function dispatch(act, asIdx = G.viewer) {
  closeMenu();
  if (NET.role === 'client') { netSendHost({ t: 'act', act }); return; }
  runAct(asIdx, act);
}
async function runAct(pi, act) {
  const p = G.players[pi]; if (!p || G.over) return;
  if (!actAllowed(p, act)) { tell(p, 'Зараз так не можна.', 1600); if (p.type === 'human') playSfx('deny'); else netSendTo(p.idx, { t: 'fx', type: 'sfx', a: { n: 'deny' } }); renderUI(); return; }
  if (act.k === 'pass') { passWindow(p); return; }
  if (G.window && G.window.humans.includes(p)) { const w = G.window; G.window = null; closeModal(); renderUI(); await execAct(p, act); w.resolve('played'); return; }
  if (G.busy) return;
  G.busy = true; renderUI();
  try { await execAct(p, act); } finally { if (G.phase !== 'next') G.busy = false; renderUI(); }
}
async function execAct(p, a) {
  const f = a.uid ? findOwnCard(p, a.uid) : null; const c = f && f.c;
  switch (a.k) {
    case 'kick': return kickDoor();
    case 'loot': return loot();
    case 'fight': return fightNow();
    case 'flee': return fleeCombat();
    case 'end': return endTurn((a.give || []).map(u => p.hand.find(x => x.uid === u)).filter(Boolean));
    case 'discard': return doDiscard(p, c);
    case 'rc2hand': { p[c.kind === 'race' ? 'raceCard' : 'clsCard'] = null; giveCard(p, c); log(`${nameTag(p)} знімає ${c.kind === 'race' ? 'расу' : 'клас'} «${esc(c.name)}» і повертає карту в руку.`); syncSeat(p); return; }
    case 'help': return askHelp(a.target, { tr: a.tr | 0, cards: (a.cards || []).map(u => p.hand.find(x => x.uid === u)).filter(Boolean) });
    case 'trouble': return lookForTrouble(c);
    case 'equip': return doEquip(p, c);
    case 'unequip': return unequip(p, c);
    case 'sell': return doSell(p, c);
    case 'rc': return doPlayRC(p, c);
    case 'droprc': { p[c.kind === 'race' ? 'raceCard' : 'clsCard'] = null; discard(c); log(`${nameTag(p)} скидає ${c.kind === 'race' ? 'расу' : 'клас'} «${esc(c.name)}» у скид.`); syncSeat(p); return; }
    case 'levelup': return doLevelUp(p, c);
    case 'curse': return doCurse(p, c, G.players[a.target]);
    case 'shot': return playIntoCombat(p, c, a.side);
    case 'mod': return playIntoCombat(p, c, 'mon');
    case 'smoke': return playSmoke(p, c);
    case 'wizard': return wizardDiscard(p, c);
    case 'undead': return addMonster(p, c, null);
    case 'wander': return addMonster(p, p.hand.find(x => x.uid === a.mon), c);
    case 'redirect': return redirectCombat(p, c, G.players[a.target]);
    case 'trade': return doTrade(p, G.players[a.target], (a.give || []).map(u => findTradeItem(p, u)).filter(Boolean));
  }
}

function cardActions(c, where, v = viewerP()) {
  if (!v || !c || c.hidden) return [];
  const p = cur(), cb = G.combat, inCombat = G.phase === 'combat' && !!cb;
  const myTurn = v === p, free = !G.busy && !G.over, win = !!G.window && G.window.humans.includes(v);
  const isFighter = inCombat && v === fighter(), isHelper = inCombat && cb.helper === v.idx;
  const combatOk = inCombat && (free || win);
  const acts = [];
  const A = (label, act, extra = {}) => acts.push({ label, act, ...extra });
  const sell = () => { if (free && myTurn && !inCombat && c.value) A(`Продати за ${c.value} зол.`, { k: 'sell', uid: c.uid }); };
  if (where === 'gear') {
    if (c.kind === 'race' || c.kind === 'class') { if (free && !inCombat) { A('Зняти в руку', { k: 'rc2hand', uid: c.uid }); A('Скинути в скид', { k: 'droprc', uid: c.uid }); } return acts; }
    if (free && !inCombat) A('Зняти в руку', { k: 'unequip', uid: c.uid });
    sell(); return acts;
  }
  if (where !== 'hand') return acts;
  const undeadIn = inCombat && cb.mons.some(x => x.c.undead);
  const fp = fighter();
  switch (c.kind) {
    case 'gear': if (free && !inCombat) A('Спорядити', { k: 'equip', uid: c.uid }, { dis: canEquip(v, c) }); sell(); break;
    case 'race': case 'class': if (free && !inCombat) A(`Стати: ${c.name}`, { k: 'rc', uid: c.uid }, { why: (c.kind === 'race' ? v.raceCard : v.clsCard) ? 'Поточна карта повернеться в руку.' : '' }); break;
    case 'levelup': if (free && !inCombat) A('Підняти рівень', { k: 'levelup', uid: c.uid }, { dis: v.level >= G.goal - 1 ? `${G.goal}-й рівень — лише за перемогу над монстром.` : null }); break;
    case 'oneshot':
      if (combatOk) {
        const pos = c.bonus > 0, ty = combatTypes(cb), hv = shotVal(c, ty, true), note = c.fire && ty.dragon ? ' — дракон не боїться вогню' : '';
        if (pos) {
          if (isFighter || isHelper) A(`У бій за себе (${sgn(hv)})${note}`, { k: 'shot', uid: c.uid, side: 'hero' });
          else { A(`Підсилити монстра (+${c.bonus})`, { k: 'shot', uid: c.uid, side: 'mon' }); A(`Допомогти герою (${sgn(hv)})${note}`, { k: 'shot', uid: c.uid, side: 'hero' }); }
        } else {
          if (isFighter || isHelper) A(`Послабити монстра (${c.bonus})`, { k: 'shot', uid: c.uid, side: 'mon' });
          else { A(`Послабити героя (${c.bonus})`, { k: 'shot', uid: c.uid, side: 'hero' }); A(`Послабити монстра (${c.bonus})`, { k: 'shot', uid: c.uid, side: 'mon' }); }
        }
      }
      sell(); break;
    case 'flee': if (inCombat && free && (isFighter || isHelper)) A('Втекти з бою', { k: 'smoke', uid: c.uid }); sell(); break;
    case 'mod': if (combatOk) A(`Зіграти на монстра (${sgn(c.bonus)})`, { k: 'mod', uid: c.uid }); break;
    case 'monster':
      if (free && myTurn && G.phase === 'afterKick') A('Шукати пригод: битися з ним', { k: 'trouble', uid: c.uid });
      if (combatOk && c.undead && undeadIn) A(`Підкинути мертвяка в бій (+${monLvl(c, fp) + vsBonus(c, fp)})`, { k: 'undead', uid: c.uid });
      break;
    case 'wander': {
      const mons = v.hand.filter(x => x.kind === 'monster');
      if (combatOk) A('Привести потвору в бій…', null, { dis: mons.length ? null : 'Потрібен монстр у руці.', sub: mons.map(m => ({ label: `${m.name} · +${monLvl(m, fp) + vsBonus(m, fp)} до монстрів`, act: { k: 'wander', uid: c.uid, mon: m.uid } })) });
      break;
    }
    case 'redirect': if (combatOk) A('Перенаправити бій на…', null, { sub: G.players.filter(q => q !== fighter()).map(q => ({ label: `${q.name} · сила ${baseStr(q)}`, act: { k: 'redirect', uid: c.uid, target: q.idx } })) }); sell(); break;
    case 'curse': if (free && !inCombat) A('Наслати прокляття…', null, { sub: G.players.filter(q => q !== v).map(q => ({ label: `${q.name} · рів. ${q.level}`, act: { k: 'curse', uid: c.uid, target: q.idx } })) }); break;
  }
  if (free && !inCombat) A('Скинути в скид', { k: 'discard', uid: c.uid });
  if (isFighter && free && cls(v) === 'wizard' && cb.wiz < 3 && !['oneshot', 'flee'].includes(c.kind)) A('Спалити заради +2 (Маг)', { k: 'wizard', uid: c.uid });
  return acts;
}
function dockActs(v) {
  const acts = [], p = cur();
  if (!v || !p || G.over) return acts;
  if (G.window) {
    const wait = waitingOn();
    if (NET.role === 'client') { if (wait.includes(v)) acts.push({ label: 'Не втручаюсь', act: { k: 'pass' }, cls: 'primary' }); return acts; }
    const locals = wait.filter(h => h.type === 'human');
    const many = locals.length > 1 || (locals.length === 1 && locals[0] !== v);
    locals.forEach(h => acts.push({ label: many ? `${h.name}: не втручаюсь` : 'Не втручаюсь', act: { k: 'pass' }, as: h.idx, cls: 'primary' }));
    if (privacy() && locals.length) acts.push({ label: 'Втрутитися…', fn: openInterfere });
    return acts;
  }
  if (G.busy) return acts;
  if (G.phase === 'combat' && G.combat) {
    const fp = fighter(); if (v !== fp) return acts;
    const s = sides(), cb = G.combat;
    acts.push({ label: 'Битися!', act: { k: 'fight' }, cls: 'primary pulse', dis: !s.win });
    acts.push({ label: 'Покликати на поміч', fn: openHelp, dis: cb.helper != null || G.players.every(q => q === fp || cb.asked.has(q.idx)) });
    acts.push({ label: 'Тікати', act: { k: 'flee' }, cls: 'danger' });
    return acts;
  }
  if (v !== p) return acts;
  if (G.phase === 'start') acts.push({ label: 'Вибити двері', act: { k: 'kick' }, cls: 'primary pulse' });
  if (G.phase === 'afterKick') acts.push({ label: 'Обшукати кімнату', act: { k: 'loot' }, cls: 'primary' });
  if (G.phase === 'charity') acts.push({ label: v.hand.length > handLimit(v) ? 'Завершити хід…' : 'Завершити хід', act: { k: 'end' }, pick: true, cls: 'primary' });
  if (canTrade(v)) acts.push({ label: 'Обмін…', fn: openTrade });
  return acts;
}
function hintFor(c) {
  if (G.phase === 'combat') return ['mod', 'oneshot', 'wander', 'redirect'].includes(c.kind) || (c.kind === 'monster' && c.undead) ? '' : 'Цю карту не можна зіграти в бою.';
  if (c.kind === 'monster') return c.undead ? 'Монстра можна викликати після вибивання дверей. Мертвяка ще й можна підкинути в бій до іншої нежиті.' : 'Монстра з руки можна викликати після вибивання дверей, якщо там не було бою.';
  if (['mod', 'oneshot', 'wander', 'redirect'].includes(c.kind)) return 'Грається під час бою.';
  if (c.kind === 'flee') return 'Грається під час твого бою.';
  return '';
}
function openCardMenu(c, where) {
  hidePeek();
  const acts = where === 'view' ? [] : cardActions(c, where); const menu = $('#menu');
  const renderActs = (list, back) => list.map((a, i) => `<button class="btn ${/^Скинути/.test(a.label) ? 'danger' : i === 0 && !a.dis ? 'primary' : ''}" type="button" data-i="${i}" ${a.dis ? 'disabled' : ''}>${esc(a.label)}</button>${a.dis ? `<div class="why">${esc(a.dis)}</div>` : a.why ? `<div class="why">${esc(a.why)}</div>` : ''}`).join('') + (back ? '<button class="btn ghost" type="button" data-back>Назад</button>' : '');
  const hint = acts.length || where === 'view' ? '' : `<div class="why">${esc(hintFor(c))}</div>`;
  menu.innerHTML = `<div class="menu-inner">${cardHTML(c, 'big')}<div class="menu-acts" id="menuActs">${renderActs(acts)}${hint}<button class="btn ghost" type="button" data-close>Закрити</button></div></div>`;
  menu.hidden = false;
  const bind = (list) => {
    $('#menuActs').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-close')) return closeMenu();
      if (b.hasAttribute('data-back')) { $('#menuActs').innerHTML = renderActs(acts) + '<button class="btn ghost" type="button" data-close>Закрити</button>'; bind(acts); return; }
      const a = list[+b.dataset.i]; if (!a || a.dis) return;
      if (a.sub) { $('#menuActs').innerHTML = renderActs(a.sub, true); bind(a.sub); return; }
      if (a.act) dispatch(a.act);
    };
  };
  bind(acts);
  menu.onclick = e => { if (e.target === menu) closeMenu(); };
  const first = menu.querySelector('.menu-acts .btn'); first && first.focus();
}
function closeMenu() { $('#menu').hidden = true; }

/* --- модальні вікна --- */
function showModal(html, cls = '') { NET.setupOpen = false; $('#sheet').className = 'sheet ' + cls; $('#sheet').innerHTML = html; $('#modal').hidden = false; $('#sheet').querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal); const f = $('#sheet').querySelector('.btn.primary, .btn'); f && f.focus(); }
function closeModal() { $('#modal').hidden = true; NET.setupOpen = false; }
function confirmModal(title, text, yes, no) {
  return new Promise(res => {
    showModal(`<h2>${esc(title)}</h2><p>${esc(text).replace(/\n/g, '<br>')}</p><div class="row end"><button class="btn ghost" id="mNo" type="button">${esc(no)}</button><button class="btn primary" id="mYes" type="button">${esc(yes)}</button></div>`);
    $('#mYes').onclick = () => { closeModal(); res(true); }; $('#mNo').onclick = () => { closeModal(); res(false); };
  });
}
function curtain(p) {
  return new Promise(res => {
    showModal(`<div class="curtain"><p class="hint">Передай пристрій гравцеві</p><div class="who" style="color:${p.color}">${esc(p.name)}</div><p>Інші — не підглядайте в карти.</p><div class="row" style="justify-content:center"><button class="btn primary" id="cGo" type="button">Показати мої карти</button></div></div>`);
    $('#cGo').onclick = () => { closeModal(); res(); };
  });
}
function openHelp() {
  const cb = G.combat, p = viewerP(); if (!cb || !p || p !== fighter()) return;
  const T = treasureCount();
  const st = { tr: Math.ceil(T / 2), cards: new Set() };
  const opts = G.players.filter(q => q !== p && !cb.asked.has(q.idx));
  const offerable = p.hand.filter(c => !c.hidden);
  const draw = () => `<h2>Покликати на поміч</h2>
    <p>Помічник додає свою силу до твоєї. Запропонуй ціну: скарби з цього бою віддаси після перемоги, а карти з руки — одразу, якщо погодиться.</p>
    <h3>Скарби з цього бою (усього ${T})</h3>
    <div class="seg" role="group" aria-label="Скільки скарбів пропонуєш">${Array.from({ length: T + 1 }, (_, k) => `<button type="button" data-tr="${k}" aria-pressed="${st.tr === k}">${k}</button>`).join('')}</div>
    ${offerable.length ? `<h3>Карти з руки на додачу</h3><div class="ochips">${offerable.map(c => `<button type="button" class="ochip" data-oc="${c.uid}" aria-pressed="${st.cards.has(c.uid)}">${c.art} ${esc(c.name)}</button>`).join('')}</div>` : ''}
    <h3>Кого кличеш</h3>
    <div class="list">${opts.map(q => `<button class="btn" type="button" data-h="${q.idx}"><b style="color:${q.color}">${esc(q.name)}</b> · сила ${baseStr(q)} · рівень ${q.level} · ${(f => f.win ? `<span style="color:var(--good,#7fd081)">разом ${f.hero} проти ${f.mon} ✅</span>` : `<span style="color:var(--bad,#ef6b5d)">разом ${f.hero} проти ${f.mon} ❌</span>`)(togetherWith(q.idx))}${q.type === 'bot' ? ` · бот (${DIFF[q.diff || 2].name.toLowerCase()}), ставлення: ${attitude(q, p)}` : q.type === 'remote' ? ' · на іншому пристрої' : ''}</button>`).join('') || '<p class="hint">Більше нікого просити.</p>'}</div>
    <div class="row end"><button class="btn ghost" type="button" data-close>Скасувати</button></div>`;
  showModal(draw());
  $('#sheet').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tr != null) { st.tr = +b.dataset.tr; $('#sheet').innerHTML = draw(); $('#sheet').querySelectorAll('[data-close]').forEach(x => x.onclick = closeModal); }
    else if (b.dataset.oc) { const u = +b.dataset.oc; st.cards.has(u) ? st.cards.delete(u) : st.cards.add(u); $('#sheet').innerHTML = draw(); $('#sheet').querySelectorAll('[data-close]').forEach(x => x.onclick = closeModal); }
    else if (b.dataset.h != null) { closeModal(); dispatch({ k: 'help', target: +b.dataset.h, tr: st.tr, cards: [...st.cards] }); }
  };
}
function revealFor(p) {
  if (!p) return;
  showModal(`<div class="curtain"><p class="hint">Карти бачить лише власник</p><div class="who" style="color:${p.color}">${esc(p.name)}</div><p>Інші — відверніться. Коли закінчиш, натисни «Сховати карти».</p><div class="row" style="justify-content:center"><button class="btn ghost" type="button" data-close>Скасувати</button><button class="btn primary" id="rvGo" type="button">Показати мої карти</button></div></div>`);
  $('#rvGo').onclick = () => { closeModal(); G.viewer = p.idx; G.reveal = p.idx; renderUI(); };
}
function hideHand() { G.reveal = -1; closeMenu(); renderUI(); const c = cur(); if (c && c.type === 'human' && !G.over) revealFor(c); }
function openInterfere() {
  const p = fighter(); const hs = localHumans().filter(q => q !== p && (!G.combat || q.idx !== G.combat.helper));
  if (hs.length === 1) { revealFor(hs[0]); return; }
  showModal(`<h2>Хто втручається?</h2><p>Обери себе — гра покаже лише твої карти. Інші гравці за цим пристроєм свої карти не побачать.</p>
    <div class="list">${hs.map(h => `<button class="btn" type="button" data-w="${h.idx}"><b style="color:${h.color}">${esc(h.name)}</b></button>`).join('')}</div>
    <div class="row end"><button class="btn ghost" type="button" data-close>Скасувати</button></div>`);
  $('#sheet').querySelectorAll('[data-w]').forEach(b => b.onclick = () => revealFor(G.players[+b.dataset.w]));
}
function openRules() {
  showModal(`<h2>Як грати</h2>
  <p>Мета — першим дійти до <b>${G.goal}-го рівня</b>. Останній рівень можна отримати лише перемогою над монстром.${G.goal > 10 ? ' <b>Епічна гра:</b> з 10-го рівня кожен монстр для тебе має подвійний рівень (підсилювачі й разові карти не подвоюються).' : ''}</p>
  <h3>Твій хід</h3>
  <ul><li><b>Вибий двері.</b> Монстр — бій. Прокляття — діє на тебе одразу. Інша карта йде в руку.</li>
  <li>Якщо бою не було: <b>шукай пригод</b> (зіграй монстра з руки) або <b>обшукай кімнату</b> (візьми ще одну карту дверей у руку).</li>
  <li><b>Благодійність.</b> Наприкінці ходу понад 5 карт у руці (гному — 6) — ти сам вибираєш, які зайві віддати. Вони йдуть гравцеві з найнижчим рівнем, а якщо найнижчий — ти, то в скид.</li>
  <li>Будь-яку карту з руки можна скинути поза боєм. Нова раса чи клас замінює стару, а стара карта повертається в руку.</li></ul>
  <h3>Бій</h3>
  <ul><li>Твоя сила — рівень плюс бонуси спорядження. Перемагаєш, якщо сила більша за суму всіх монстрів (воїн — і за нічиєї): отримуєш рівні й скарби з усіх.</li>
  <li>Програєш — грай разові карти, клич на поміч або тікай: кидок кубика 5+ <b>окремо від кожного монстра</b>. Не втік — спрацьовує Халепа саме цього монстра.</li>
  <li>Суперники можуть грати на монстрів підсилювачі й разові карти, <b>підкидати мертвяків</b> (нежить з руки — у бій, де вже є нежить) і грати <b>Приблудну потвору</b>, щоб додати будь-якого монстра з руки.</li></ul>
  <h3>Нежить, дракони й вогонь</h3>
  <ul><li>На старті можна вибрати, які монстри будуть у колоді: звичайні є завжди, <b>нежить</b> і <b>дракони</b> — за бажанням. Тип видно на плашці під малюнком карти.</li>
  <li><b>Вогняні речі</b> (🔥) дають ще <b>+2 проти нежиті</b>, але <b>на драконів не діють</b> зовсім — їхній бонус пропадає в бою з драконом. Так само вогняні разові карти.</li>
  <li><b>Драконобійні речі</b> (🛡️) мають додатковий бонус лише проти драконів.</li>
  <li>Разові карти зі знаком «−» послаблюють: кинь на монстра, щоб тобі було легше, або на героя, щоб йому було важче.</li></ul>
  <h3>Поміч і торг</h3>
  <ul><li>Кличучи на поміч, ти пропонуєш ціну: скільки скарбів із бою віддаси і які карти з руки додаси одразу.</li>
  <li>Боти памʼятають, хто їм допомагав, а хто підставляв, і торгуються відповідно. Приязність показано у відсотках: 50% — нейтрально, вище — дружба, нижче — образа. Від неї залежить, чи допоможе бот і скільки попросить. З часом і добро, і образи забуваються (приблизно наполовину за пів партії). Хто допоміг лише після торгу — отримує менше вдячності, а хто вициганив усі скарби — зовсім трохи. Що вища складність, то більше вони вимагають, частіше шкодять лідеру й довше тримають образу. Ставлення бота видно в його картці та у вікні поміченого виклику.</li></ul>
  <h3>Стать, речі й золото</h3>
  <ul><li>Стать обирається на старті. Деякі речі лише для жінок або чоловіків, а прокляття «Зміна статі» змінює її — і ці речі перестають діяти.</li>
  <li>Один головний убір, броня, взуття, дві руки й одна велика річ (гному — більше). Деякі речі лише для певної раси чи класу.</li>
  <li>На своєму ході поза боєм продавай речі: кожні 1000 золотих — рівень (крім переможного).</li>
  <li>Прокляття з руки можна наслати на будь-кого поза боєм.</li></ul>
  <h3>Гра по мережі</h3>
  <ul><li>Один гравець натискає «Створити кімнату» й називає код. Інші відкривають цей самий файл на своїх пристроях, тиснуть «Приєднатися» й вводять код.</li>
  <li>Для зʼєднання потрібен інтернет; у межах однієї мережі дані йдуть між пристроями напряму. Якщо хтось відключився, за нього дограє бот.</li></ul>
  <h3>Табло й стіл</h3>
  <ul><li><b>Табло</b> зліва показує рівні: заповнена смужка — пройдені рівні, остання поділка в рамці — фініш. В епічній грі червонуваті поділки після 10-го — зона подвійних монстрів.</li>
  <li>Підсвічений рядок табло і світне кільце біля таблички на столі показують, чий зараз хід. Перед табличкою лежать раса, клас і речі гравця. Наведи на карту на столі, щоб її збільшити.</li></ul>
  <h3>Звук</h3>
  <p>Кнопка «Звук» угорі: окремі гучності для музики й ефектів та повне вимкнення (клавіша M). У кожного вигляду столу своя музика.</p>
  <h3>Керування</h3>
  <p>Тягни стіл, щоб обертати; колесо миші або щипок — масштаб; подвійний клік — повернути камеру. Клацни карту, щоб роздивитися або зіграти. Колоду дверей можна клацнути просто на столі.</p>
  <div class="row end"><button class="btn primary" type="button" data-close>Зрозуміло</button></div>`);
}

/* --- налаштування партії --- */
const setupState = { types: loadMonTypes(), rows: [{ name: 'Мандрівник', type: 'human', sex: 'm', diff: 2 }, { name: 'Мотря', type: 'bot', sex: 'f', diff: 2 }, { name: 'Опанас', type: 'bot', sex: 'm', diff: 2 }, { name: 'Одарка', type: 'bot', sex: 'f', diff: 2 }], speed: 1, goal: 10, anim: 1.5 };
function loadMonTypes() { try { const t = JSON.parse(localStorage.getItem('pdsv-montypes') || 'null'); if (t) return { undead: t.undead !== false, dragon: t.dragon !== false }; } catch (e) { } return { undead: true, dragon: true }; }
function saveMonTypes(t) { try { localStorage.setItem('pdsv-montypes', JSON.stringify(t)); } catch (e) { } }
const monTypesText = t => ['звичайні', t.undead && 'нежить', t.dragon && 'дракони'].filter(Boolean).join(', ');
const FEMALE_NAMES = new Set(['Мотря', 'Одарка', 'Ганна', 'Соломія']);
let rerenderSetup = null;
function openSetup() {
  if (NET.role === 'client') { toast('Нову партію запускає господар кімнати.'); return; }
  const s = setupState;
  const netBlock = () => NET.role === 'host'
    ? `<h3>Гра по мережі</h3><div class="netcode"><span>Код кімнати</span><b>${esc(NET.code)}</b></div>
       <p class="hint">Друзі відкривають цей самий файл, тиснуть «Приєднатися» й вводять код. Підключено: ${s.rows.filter(r => r.type === 'remote').length}.</p>
       <div class="row" style="margin-top:6px"><button class="btn small ghost" type="button" id="netStop">Закрити кімнату</button></div>`
    : `<h3>Гра по мережі</h3><p class="hint">Грайте з різних пристроїв: один створює кімнату, інші приєднуються за кодом. Для зʼєднання потрібен інтернет; в одній мережі дані йдуть напряму між пристроями.</p>
       <div class="row" style="margin-top:6px"><button class="btn small" type="button" id="netHost" ${NET.busy ? 'disabled' : ''}>${NET.busy ? 'Створюємо…' : 'Створити кімнату'}</button><button class="btn small" type="button" id="netJoin">Приєднатися до кімнати</button></div>
       ${NET.err ? `<p class="hint" style="color:var(--bad)">${esc(NET.err)}</p>` : ''}`;
  const row = (r, i) => {
    const remote = r.type === 'remote';
    return `<div class="prow"><span class="dot" style="background:${COLORS[i]}"></span>
      <input class="inp" id="pname-${i}" value="${esc(r.name)}" maxlength="16" ${remote ? 'disabled' : ''} aria-label="Імʼя гравця ${i + 1}">
      <div class="pctl">
        ${remote ? '<span class="tag">на іншому пристрої</span>' : `<div class="seg" role="group" aria-label="Тип гравця"><button type="button" data-t="human" data-i="${i}" aria-pressed="${r.type === 'human'}">Людина</button><button type="button" data-t="bot" data-i="${i}" aria-pressed="${r.type === 'bot'}">Бот</button></div>`}
        ${r.type === 'bot' ? `<select class="inp sel" data-diff="${i}" aria-label="Складність бота">${[1, 2, 3].map(d => `<option value="${d}" ${(r.diff || 2) === d ? 'selected' : ''}>${DIFF[d].name}</option>`).join('')}</select>` : ''}
        <div class="seg" role="group" aria-label="Стать"><button type="button" data-sex="m" data-i="${i}" aria-pressed="${r.sex === 'm'}" ${remote ? 'disabled' : ''} title="Чоловік">Ч</button><button type="button" data-sex="f" data-i="${i}" aria-pressed="${r.sex === 'f'}" ${remote ? 'disabled' : ''} title="Жінка">Ж</button></div>
      </div>
      <button class="btn small ghost" type="button" data-del="${i}" ${s.rows.length <= 2 ? 'disabled' : ''} aria-label="Прибрати гравця">✕</button></div>`;
  };
  const html = () => `<h2>Пройдисвіти</h2>
    <p>Настільна гра про похід у підземелля: вибивай двері, бий монстрів, збирай мотлох і підставляй друзів.</p>
    <h3>Гравці (2–6)</h3>
    <div id="rows">${s.rows.map(row).join('')}</div>
    <div class="row" style="margin-top:4px"><button class="btn small" type="button" id="addP" ${s.rows.length >= 6 ? 'disabled' : ''}>Додати бота</button><button class="btn small" type="button" id="addH" ${s.rows.length >= 6 ? 'disabled' : ''}>Додати людину</button></div>
    <p class="hint" style="margin-top:6px">Складність бота: легкий частіше допомагає й рідко шкодить, важкий торгується, мстить і полює на лідера. Кілька людей за одним пристроєм грають по черзі.</p>
    ${netBlock()}
    <h3>Мета</h3>
    <div class="seg" role="group" aria-label="Мета гри">${[[10, 'До 10 рівня'], [20, 'До 20 рівня · епік']].map(([v, l]) => `<button type="button" data-goal="${v}" aria-pressed="${s.goal === v}">${l}</button>`).join('')}</div>
    <p class="hint" style="margin-top:8px">${s.goal === 20 ? 'Епічна гра: з 10-го рівня кожен монстр для тебе має подвійний рівень. У колоді зʼявляються монстри 16–20 рівнів.' : 'Класична партія: перший, хто дійде до 10-го рівня, перемагає.'}</p>
    <h3>Монстри в колоді</h3>
    <div class="checks" role="group" aria-label="Типи монстрів">
      <label class="chk"><input type="checkbox" checked disabled> Звичайні</label>
      <label class="chk"><input type="checkbox" data-mt="undead" ${s.types.undead ? 'checked' : ''}> 💀 Нежить</label>
      <label class="chk"><input type="checkbox" data-mt="dragon" ${s.types.dragon ? 'checked' : ''}> 🐉 Дракони</label>
    </div>
    <p class="hint" style="margin-top:8px">${s.types.undead || s.types.dragon ? `Граємо з такими монстрами: ${monTypesText(s.types)}.${s.types.dragon ? ' Дракони не бояться вогняних речей, зате є драконобійна зброя.' : ''}${s.types.undead ? ' Вогонь палить нежить: вогняні речі дають проти неї +2.' : ''}` : 'Лише звичайні монстри — без нежиті й драконів.'}</p>
    <h3>Темп ботів</h3>
    <div class="seg" role="group" aria-label="Темп ботів">${[[1.4, 'Спокійний'], [1, 'Звичайний'], [.45, 'Швидкий']].map(([v, l]) => `<button type="button" data-sp="${v}" aria-pressed="${s.speed === v}">${l}</button>`).join('')}</div>
    <h3>Вигляд столу</h3>
    <div class="row" style="margin-top:0"><span class="hint">Зараз: <b style="color:var(--text)">${esc(SKIN.name)}</b></span><button class="btn small" type="button" id="skinB">Змінити</button></div>
    <h3>Анімація карт</h3>
    <div class="seg" role="group" aria-label="Швидкість анімації карт">${[[2.1, 'Повільна'], [1.5, 'Звичайна'], [.9, 'Швидка']].map(([v, l]) => `<button type="button" data-an="${v}" aria-pressed="${s.anim === v}">${l}</button>`).join('')}</div>
    <div class="row end"><button class="btn ghost" type="button" id="rulesB">Правила</button><button class="btn primary" type="button" id="startB">Почати гру</button></div>`;
  const save = () => s.rows.forEach((r, i) => { const el = $('#pname-' + i); if (el && r.type !== 'remote') r.name = el.value.trim() || (r.type === 'bot' ? BOT_NAMES[i] : `Гравець ${i + 1}`); });
  const bind = () => {
    $('#sheet').onchange = e => { const sel = e.target.closest('[data-diff]'); if (sel) { save(); s.rows[+sel.dataset.diff].diff = +sel.value; } const mt = e.target.closest('[data-mt]'); if (mt) { save(); s.types[mt.dataset.mt] = mt.checked; saveMonTypes(s.types); rerender(); } };
    $('#sheet').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.t) { save(); s.rows[+b.dataset.i].type = b.dataset.t; rerender(); }
      else if (b.dataset.sex) { save(); s.rows[+b.dataset.i].sex = b.dataset.sex; rerender(); }
      else if (b.dataset.del) { save(); const r = s.rows.splice(+b.dataset.del, 1)[0]; if (r && r.conn) { try { r.conn.send({ t: 'full', reason: 'Господар прибрав тебе з кімнати.' }); r.conn.close(); } catch (e) { } } rerender(); sendLobby(); }
      else if (b.id === 'addP') { save(); const used = new Set(s.rows.map(r => r.name)); const nm = BOT_NAMES.find(n => !used.has(n)) || 'Бот'; s.rows.push({ name: nm, type: 'bot', sex: FEMALE_NAMES.has(nm) ? 'f' : 'm', diff: 2 }); rerender(); sendLobby(); }
      else if (b.id === 'addH') { save(); s.rows.push({ name: `Гравець ${s.rows.length + 1}`, type: 'human', sex: 'm', diff: 2 }); rerender(); sendLobby(); }
      else if (b.dataset.sp) { save(); s.speed = +b.dataset.sp; rerender(); }
      else if (b.dataset.goal) { save(); s.goal = +b.dataset.goal; rerender(); }
      else if (b.dataset.an) { save(); s.anim = +b.dataset.an; ANIM = s.anim; rerender(); }
      else if (b.id === 'skinB') { save(); openSkins(openSetup); }
      else if (b.id === 'netHost') { save(); hostRoom(); }
      else if (b.id === 'netJoin') { save(); openJoin(); }
      else if (b.id === 'netStop') { save(); stopHosting(); rerender(); }
      else if (b.id === 'rulesB') { save(); openRules(); const back = $('#sheet').querySelector('[data-close]'); back.textContent = 'Назад'; back.onclick = () => openSetup(); }
      else if (b.id === 'startB') { save(); closeModal(); newGame(); }
    };
  };
  const rerender = () => { if (!NET.setupOpen) return; $('#sheet').innerHTML = html(); bind(); };
  rerenderSetup = () => { save(); rerender(); };
  showModal(html()); NET.setupOpen = true; bind();
}
async function newGame() {
  const s = setupState; botSpeed = s.speed; ANIM = s.anim || 1.5; G.goal = s.goal;
  G.players.forEach(destroySeat);
  if (G.combat) { G.combat.mons.forEach(x => disposeMesh(x.m)); G.combat.meshes.forEach(disposeMesh); }
  T.die.visible = false;
  Object.assign(G, { reveal: -1, gid: G.gid + 1, players: [], doorDeck: shuffle(buildDoorDeck(s.goal > 10, s.types)), treasureDeck: shuffle(buildTreasureDeck(s.types)), types: { ...s.types }, doorDiscard: [], treasureDiscard: [], cur: 0, viewer: -1, phase: 'deal', combat: null, busy: true, over: false, window: null, log: [], fresh: new Set(), pendingSetup: false });
  faceCache.forEach(t => t.dispose()); faceCache.clear();
  syncDeck('door'); syncDeck('treasure'); syncDiscardTop('door'); syncDiscardTop('treasure');
  NET.conns.clear();
  G.players = s.rows.map((r, i) => ({ idx: i, name: r.name, type: r.type, sex: r.sex || 'm', diff: r.diff || 2, color: COLORS[i], level: 1, gold: 0, hand: [], gear: [], raceCard: null, clsCard: null, died: false, mem: {} }));
  s.rows.forEach((r, i) => { if (r.type === 'remote' && r.conn) { r.conn._pidx = i; NET.conns.set(i, r.conn); } });
  G.players.forEach(buildSeat);
  const firstHuman = G.players.find(p => p.type === 'human');
  G.viewer = firstHuman ? firstHuman.idx : -1;
  cam.az = firstHuman ? seatAngle(firstHuman.idx) : 0; cam.userAz = 0; cam.userEl = 0;
  NET.conns.forEach((c, i) => sendConn(c, { t: 'start', you: i }));
  renderUI();
  log(`Нова гра до ${G.goal}-го рівня. Монстри: ${monTypesText(G.types || setupState.types)}. Кожен отримує 4 карти дверей і 4 карти скарбів.`, 'turn');
  const jobs = []; let k = 0;
  const soloHuman = G.players.filter(q => q.type === 'human').length === 1;
  for (let r = 0; r < 4; r++) for (const deck of ['door', 'treasure']) for (const p of G.players) {
    const c = draw(deck); const delay = k++ * 55;
    jobs.push(wait(delay).then(async () => {
      const m = cardMesh(c); scene.add(m);
      const vh = p.idx === G.viewer && soloHuman;
      await fly(m, deckPose(deck), vh ? handPose() : seatPose(p.idx), 520, 1.4, { owner: p.idx });
      disposeMesh(m); if (vh) giveCard(p, c); else p.hand.push(c); renderUI();
    }));
  }
  await Promise.all(jobs);
  G.cur = rnd(G.players.length);
  log(`Першим ходить ${nameTag(cur())}.`);
  G.phase = 'next';
  startTurn();
}
