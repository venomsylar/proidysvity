'use strict';

/* ============================== ПЕРЕБІГ ГРИ ============================== */
function log(html, cls = '') { G.log.push({ html, cls }); if (G.log.length > 140) G.log.shift(); renderLog(); queueSnap(); }
let toastT;
function toast(text, ms = 2200) { const el = $('#toast'); el.textContent = text; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }
let bannerT;
function banner(text, color) { const el = $('#banner'); el.textContent = text; el.style.setProperty('--bc', color); el.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), 1700); }
function say(text, ms = 2200) { toast(text, ms); netAll({ t: 'toast', text, ms }); }
function tell(p, text, ms = 2400) { if (!p) return; if (p.type === 'remote') netSendTo(p.idx, { t: 'toast', text, ms }); else if (p.type === 'human') toast(text, ms); }
const localHumans = () => G.players.filter(q => q.type === 'human');
const privacy = () => NET.role !== 'client' && localHumans().length >= 2;
const handVisible = () => !privacy() || (G.reveal === G.viewer && G.viewer >= 0);
const isPerson = p => !!p && (p.type === 'human' || p.type === 'remote');
const myTurnHere = () => { const p = cur(); if (!p) return false; return NET.role === 'client' ? p.idx === NET.me : (p.type === 'human' && p.idx === G.viewer); };
const canKickNow = () => !G.busy && !G.over && G.phase === 'start' && myTurnHere();
function memo(a, b, d) { if (!a || !b || a === b) return; a.mem = a.mem || {}; a.mem[b.idx] = (a.mem[b.idx] || 0) + d; }
function confirmFor(p, title, text, yes, no) { return p.type === 'remote' ? askRemote(p, title, text, yes, no) : confirmModal(title, text, yes, no); }

async function startTurn() {
  if (G.over || NET.role === 'client' || G.phase !== 'next') return;
  if (G.pendingSetup) { G.pendingSetup = false; openSetup(); return; }
  const p = cur(); G.phase = 'start'; G.combat = null; forgetTick(p);
  G.players.forEach(plateDraw);
  log(`Хід: ${nameTag(p)} · рівень ${p.level}`, 'turn');
  banner(`Хід: ${p.name}`, p.color); sfx('turn'); netAll({ t: 'fx', type: 'banner', a: { text: `Хід: ${p.name}`, color: p.color } });
  if (p.type === 'human') {
    G.busy = true; renderUI();
    await ensureViewer(p.idx);
    G.busy = false; renderUI();
    if (!p._hinted) { p._hinted = true; toast('Зіграй расу чи клас, спорядись — і вибивай двері!', 2800); }
  } else if (p.type === 'remote') {
    G.busy = false; renderUI(); tell(p, 'Твій хід!', 1800);
  } else {
    G.busy = true; renderUI();
    if (!G.players.some(q => q.type === 'human')) await camTo(seatAngle(p.idx));
    await botTurn(p);
  }
}
async function ensureViewer(i) {
  if (privacy() ? (G.viewer !== i || G.reveal !== i) : G.viewer !== i) {
    if (privacy()) { G.reveal = -1; renderUI(); await curtain(G.players[i]); }
    G.viewer = i; G.reveal = i; renderUI();
  }
  await camTo(seatAngle(i));
}

async function kickDoor() {
  const p = cur(); const c = draw('door');
  sfx('door');
  if (!c) { say('Двері скінчилися'); G.phase = 'afterKick'; return; }
  log(`${nameTag(p)} вибиває двері: <b>${esc(c.name)}</b>.${c.flavor ? ` <i>«${esc(c.flavor)}»</i>` : ''}`);
  const m = cardMesh(c); scene.add(m);
  await fly(m, deckPose('door'), centerPose(0, 1), 800, 2.4);
  if (c.kind === 'monster') { await beginCombat(c, m); return; }
  if (c.kind !== 'curse') say(`${KIND_FIND[c.kind] || 'Знахідка'}: «${c.name}» — карта йде в руку`, 2400);
  await wait(1100 * ANIM);
  if (c.kind === 'curse') {
    say(`Прокляття «${c.name}»: ${c.bad.text}`, 2600); sfx('curse');
    await fly(m, poseOf(m), seatPose(p.idx, true), 600, 1); hitFx(p);
    disposeMesh(m); discard(c);
    await applyBad(p, c.bad);
  } else {
    await fly(m, poseOf(m), toHandOf(p), 600, 1, { owner: p.idx });
    disposeMesh(m); giveCard(p, c);
  }
  G.phase = 'afterKick';
}
async function drawTo(p, deck) {
  const c = draw(deck); if (!c) return null;
  const m = cardMesh(c); scene.add(m);
  await fly(m, deckPose(deck), toHandOf(p), 620, 1.6, { owner: p.idx });
  disposeMesh(m); giveCard(p, c); renderUI();
  return c;
}
async function loot() {
  const p = cur(); log(`${nameTag(p)} обшукує кімнату.`);
  await drawTo(p, 'door'); G.phase = 'charity';
}
async function lookForTrouble(c) {
  const p = cur(); removeFromHand(p, c);
  log(`${nameTag(p)} шукає пригод і викликає <b>${esc(c.name)}</b>.`);
  const m = cardMesh(c); scene.add(m); renderUI();
  await fly(m, fromHandOf(p), centerPose(0, 1), 750, 1.8, { owner: p.idx });
  await beginCombat(c, m);
}

/* --- бій --- */
async function beginCombat(c, m) {
  const p = cur();
  G.combat = { fighter: G.cur, mons: [{ c, m }], mods: [], pShots: [], mShots: [], helper: null, offer: null, wiz: 0, interfered: new Set(), passed: new Set(), asked: new Set(), meshes: new Map() };
  G.phase = 'combat';
  log(`Бій! ${nameTag(p)} проти <b>${esc(c.name)}</b> (рівень ${monLvl(c, p)}).`);
  renderUI();
  await roar(m);
  await botsInterfere();
  if (G.combat && fighter().type === 'bot') await botDrive();
}
function layoutCombat() {
  const cb = G.combat; if (!cb) return; const n = cb.mons.length;
  cb.mons.forEach((x, i) => { if (x.m && !x.m.userData.anim) applyPose(x.m, centerPose(i, n)); });
  [...cb.mods, ...cb.mShots].forEach((c, i) => { const m = cb.meshes.get(c.uid); if (m) applyPose(m, sidePose(true, i, n)); });
  cb.pShots.forEach((c, i) => { const m = cb.meshes.get(c.uid); if (m) applyPose(m, sidePose(false, i, n)); });
}
const monCenter = () => { const x = G.combat && G.combat.mons[0]; return x && x.m ? x.m.position.clone() : new THREE.Vector3(0, 1.6, 0); };
async function playIntoCombat(p, c, side) {
  const cb = G.combat; if (!cb) return;
  removeFromHand(p, c); c._by = p.idx;
  const toMon = c.kind === 'mod' || side === 'mon';
  if (c.kind === 'mod') cb.mods.push(c); else if (toMon) cb.mShots.push(c); else cb.pShots.push(c);
  const n = cb.mons.length;
  const idx = toMon ? cb.mods.length + cb.mShots.length - 1 : cb.pShots.length - 1;
  const f = fighter(), helper = cb.helper != null ? G.players[cb.helper] : null;
  const self = p === f || p === helper;
  log(`${nameTag(p)} грає «${esc(c.name)}» (${sgn(c.bonus)} ${toMon ? 'монстру' : self ? 'собі' : 'герою'}).`);
  if (!self) {
    if (toMon && c.bonus > 0) { memo(f, p, -2); memo(helper, p, -2); }
    else { memo(f, p, 2); memo(helper, p, 1); }
  }
  const m = cardMesh(c); scene.add(m); cb.meshes.set(c.uid, m); renderUI();
  await fly(m, fromHandOf(p), sidePose(toMon, idx, n), 650, 1.6, { owner: p.idx });
  layoutCombat();
  if (toMon) flashAt(monCenter().setY(2.4), 2, 450);
  else ringFx(f.seat.anchor, 0x7fd081, 700);
  renderUI();
}
async function addMonster(p, mc, via) {
  const cb = G.combat; if (!cb || !mc) return;
  removeFromHand(p, mc); mc._by = p.idx;
  if (via) { removeFromHand(p, via); discard(via); }
  const m = cardMesh(mc); scene.add(m); cb.mons.push({ c: mc, m });
  const f = fighter(); if (p !== f) { memo(f, p, -3); if (cb.helper != null) memo(G.players[cb.helper], p, -2); }
  log(via ? `${nameTag(p)} грає «Приблудну потвору»: у бій вривається <b>${esc(mc.name)}</b> (рівень ${monLvl(mc, f)})!`
          : `${nameTag(p)} підкидає мертвяка: <b>${esc(mc.name)}</b> (рівень ${monLvl(mc, f)}) приєднується до бою!`);
  say(`${mc.name} приєднується до бою!`, 1800);
  renderUI();
  const n = cb.mons.length;
  await Promise.all([fly(m, fromHandOf(p), centerPose(n - 1, n), 750, 1.8, { owner: p.idx }),
    ...cb.mons.slice(0, -1).map((x, i) => x.m ? fly(x.m, poseOf(x.m), centerPose(i, n), 420, .25) : null)]);
  layoutCombat();
  await roar(m); renderUI();
}
async function wizardDiscard(p, c) {
  const cb = G.combat; removeFromHand(p, c); cb.wiz++;
  log(`${nameTag(p)} (Маг) спалює карту «${esc(c.name)}»: +2.`);
  const m = cardMesh(c); scene.add(m); renderUI();
  await fly(m, fromHandOf(p), discardPose(c.deck), 550, 1.4, { owner: p.idx });
  burst(m.position, ['#b98be6', '#e889b8', '#ffffff'], 70, 3, 1);
  disposeMesh(m); discard(c); renderUI();
}
async function playSmoke(p, c) {
  removeFromHand(p, c); discard(c);
  log(`${nameTag(p)} кидає «${esc(c.name)}» і зникає з бою!`); sfx('smoke');
  burst(monCenter(), ['#cfc6b8', '#8a8178', '#ffffff'], 160, 2.5, 1.6, -.5, .45, false, 2);
  say('Пуф! Втеча вдалася.');
  await wait(600);
  await clearCombat(); G.phase = 'charity';
}

/* --- втручання ботів: залежить від складності й памʼяті --- */
function meddleOptions(b) {
  const cb = G.combat, p = fighter(), opts = [];
  const undeadIn = cb.mons.some(x => x.c.undead);
  b.hand.forEach(c => {
    if (c.kind === 'mod' && c.bonus > 0) opts.push({ pw: c.bonus, run: () => playIntoCombat(b, c, 'mon') });
    if (c.kind === 'oneshot') { const toMon = c.bonus > 0, ty = combatTypes(cb), pw = Math.abs(shotVal(c, ty, !toMon)); if (pw) opts.push({ pw, run: () => playIntoCombat(b, c, toMon ? 'mon' : 'hero') }); }
    if (c.kind === 'monster' && c.undead && undeadIn) opts.push({ pw: monLvl(c, p) + vsBonus(c, p), mon: true, run: () => addMonster(b, c, null) });
  });
  const w = b.hand.find(c => c.kind === 'wander');
  if (w) b.hand.filter(c => c.kind === 'monster').forEach(mc => opts.push({ pw: monLvl(mc, p) + vsBonus(mc, p), mon: true, run: () => addMonster(b, mc, w) }));
  return opts;
}
async function botsInterfere() {
  const p = fighter(); if (!G.combat) return false; let any = false;
  const leader = Math.max(...G.players.filter(q => q !== p).map(q => q.level));
  /* що вищий рівень героя, то охочіше йому шкодять: плавно, до +0.2 біля фінішу */
  const progress = clamp((p.level - 1) / Math.max(1, G.goal - 1), 0, 1);
  const levelHeat = .2 * Math.pow(progress, 1.5);
  for (const b of shuffle([...G.players])) {
    if (!G.combat || G.over) return any;
    const cb = G.combat;
    if (b === p || b.idx === cb.helper || b.type !== 'bot' || cb.interfered.has(b.idx)) continue;
    const s = sides(); if (!s.win) continue;
    const D = DIFF[b.diff || 2]; const an = affN(b, p);
    const winning = p.level + levelsGain() >= G.goal;
    /* хтось уже нашкодив у цьому бою — решта менш охоче доливає (щоб не накидалися всі разом) */
    const piled = cb.interfered.size;
    const chance = winning ? D.block : (D.meddle + (p.level >= leader ? D.lead : 0) + levelHeat - an * D.grudge * 6) * Math.pow(.5, piled);
    if (Math.random() > clamp(chance, 0, 1)) continue;
    const need = s.hero - s.mon + (s.tie ? 1 : 0);
    const opts = meddleOptions(b); if (!opts.length) continue;
    let pick;
    if (b.diff === 1) pick = opts[rnd(opts.length)];
    else pick = opts.filter(o => o.pw >= need).sort((x, y) => x.pw - y.pw || (x.mon ? 1 : -1))[0] || opts.filter(o => !o.mon).sort((x, y) => y.pw - x.pw)[0];
    if (!pick) continue;
    cb.interfered.add(b.idx); any = true;
    await botDelay(350);
    await pick.run();
    if (winning) say(`${b.name} не дає ${p.name} виграти!`);
    else if (affinity(b, p) < 26 && (b.diff || 2) >= 2) say(`${b.name} мстить ${p.name}!`, 1800);
  }
  return any;
}
function canMeddleCards(h) { const und = G.combat && G.combat.mons.some(x => x.c.undead); return h.hand.some(c => ['mod', 'oneshot', 'wander', 'redirect'].includes(c.kind) || (c.kind === 'monster' && c.undead && und)); }
async function interferenceWindow() {
  const cb = G.combat, p = fighter();
  const humans = G.players.filter(h => isPerson(h) && h !== p && h.idx !== cb.helper && !cb.passed.has(h.idx) && canMeddleCards(h));
  if (!humans.length) return false;
  humans.filter(h => h.type === 'remote').forEach(h => tell(h, `${p.name} ось-ось переможе! Зіграй карту або натисни «Не втручаюсь».`, 2800));
  sfx('alert');
  const res = await new Promise(resolve => { G.window = { resolve, humans }; renderUI(); });
  G.window = null;
  if (res !== 'pass' && G.combat) G.combat.passed.clear();
  renderUI();
  return res !== 'pass';
}
const waitingOn = () => G.window && G.combat ? G.window.humans.filter(h => !G.combat.passed.has(h.idx)) : [];
function passWindow(p) {
  const w = G.window, cb = G.combat; if (!w || !cb) return;
  cb.passed.add(p.idx);
  log(`${nameTag(p)} не втручається.`);
  if (w.humans.every(h => cb.passed.has(h.idx))) { G.window = null; w.resolve('pass'); }
  renderUI();
}

/* --- допомога й торг --- */
function pickJunk(p) { const j = p.hand.filter(c => !['oneshot', 'flee', 'levelup'].includes(c.kind)).sort((a, b) => keepScore(p, a) - keepScore(p, b)); return j[0] || null; }
const cardWorth = c => c.kind === 'gear' ? c.value / 400 : c.kind === 'levelup' ? 2 : c.kind === 'oneshot' ? .4 + Math.abs(c.bonus) * .15 : .6;
function offerText(o, open = true) {
  const parts = [];
  if (o.tr) parts.push(`${o.tr} ${plural(o.tr, 'скарб', 'скарби', 'скарбів')}`);
  if (o.cards.length) parts.push(open ? `${o.cards.length === 1 ? 'карту' : 'карти'} ${o.cards.map(c => '«' + c.name + '»').join(', ')}` : `${o.cards.length} ${plural(o.cards.length, 'карту', 'карти', 'карт')} з руки`);
  return parts.join(' і ') || 'нічого, лише вдячність';
}
function botHelpDecision(h, p, offer) {
  const D = DIFF[h.diff || 2], T = treasureCount(), aff = affinity(h, p), an = affN(h, p);
  if (p.level + levelsGain() >= G.goal) return { ok: h.diff === 1 && Math.random() < .25, why: 'Ще чого! Ти ж тоді переможеш.' };
  const value = offer.tr + sum(offer.cards, cardWorth);
  const demand = Math.max(h.diff === 3 ? 1 : 0, Math.round(T * D.demand) - Math.round(an * 1.5));
  if (value + 1e-9 < demand && aff >= 11) { const c = Math.ceil(demand - sum(offer.cards, cardWorth) - 1e-9); if (c > offer.tr && c <= T && Math.random() < [0, .6, .8, .95][h.diff || 2]) return { ok: false, counter: c, why: `За ${c} — домовились.` }; }
  if (value + 1e-9 < demand) return { ok: false, why: aff < 26 ? `Після всього? Мінімум ${demand} ${plural(demand, 'скарб', 'скарби', 'скарбів')}.` : `За таку ціну? Хочу хоча б ${demand} ${plural(demand, 'скарб', 'скарби', 'скарбів')}.` };
  let chance = D.help + an * .5 + (race(h) === 'elf' ? .15 : 0) + (value - demand) * .1;
  const top = Math.max(...G.players.map(q => q.level));
  if (p.level === top && p.level >= h.level + 2) chance -= .2 * (h.diff || 2);
  const ok = Math.random() < clamp(chance, .03, .97);
  return { ok, why: ok ? '' : aff < 30 ? 'Памʼятаю, як ти мені «допоміг». Ні.' : 'Не цього разу.' };
}
function botAcceptCounter(p, h, counter) {
  const T = treasureCount(), f = togetherWith(h.idx);
  if (!f.win) return false;
  if (p.level + levelsGain() >= G.goal) return true;
  if ((p.diff || 2) === 3 && counter >= T && T > 1) return Math.random() < .4;
  return Math.random() < [0, .95, .85, .75][p.diff || 2];
}
/* вікно для людини, яку кличуть: допомогти, відмовити або попросити більше */
function helpAskModal(title, text, tr, T, cards = []) {
  return new Promise(res => {
    const st = { c: Math.min(T, tr + 1) };
    const draw = () => `<h2>${esc(title)}</h2><p>${esc(text).replace(/\n/g, '<br>')}</p>
      ${cards.length ? `<h3>Карти, які отримаєш одразу</h3>${cardRow(cards)}` : ''}
      ${T > tr ? `<h3>Або попроси більше</h3><p class="hint">Скільки скарбів із ${T} хочеш за допомогу:</p><div class="seg" role="group" aria-label="Скільки скарбів просиш">${Array.from({ length: T - tr }, (_, k) => tr + 1 + k).map(n => `<button type="button" data-hc="${n}" aria-pressed="${st.c === n}">${n}</button>`).join('')}</div>` : ''}
      <div class="row end"><button class="btn ghost" type="button" id="haNo">Відмовити</button>${T > tr ? `<button class="btn" type="button" id="haMore">Попросити ${st.c}</button>` : ''}<button class="btn primary" type="button" id="haYes">Допомогти</button></div>`;
    showModal(draw(), cards.length ? 'wide' : '');
    const fin = r => { $('#sheet').onclick = null; closeModal(); res(r); };
    $('#sheet').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.hc) { st.c = +b.dataset.hc; $('#sheet').innerHTML = draw(); }
      else if (b.id === 'haYes') fin({ ok: true });
      else if (b.id === 'haNo') fin({ ok: false });
      else if (b.id === 'haMore') fin({ ok: false, counter: st.c });
    };
  });
}
function helpAskFor(h, tr, T, title, text, cards = []) {
  cards = cards.map(cardCopy);
  if (h.type !== 'remote') return helpAskModal(title, text, tr, T, cards);
  return new Promise(res => {
    const id = ++NET.askSeq; let tm;
    const done = (ok, pick) => { if (!NET.asks.has(id)) return; NET.asks.delete(id); clearTimeout(tm); netSendTo(h.idx, { t: 'askEnd', id }); res({ ok: !!ok, counter: Number.isFinite(pick) ? pick : null }); };
    done.who = h.idx; NET.asks.set(id, done);
    tm = setTimeout(() => done(false), 45000);
    netSendTo(h.idx, { t: 'helpAsk', id, title, text, tr, T, cards });
  });
}
function togetherWith(i) { const cb = G.combat, was = cb.helper; cb.helper = i; const s = sides(); cb.helper = was; return s; }
/* прогноз для того, кого кличуть: чи переможуть разом */
function helpForecast(i) {
  const cb = G.combat, p = fighter(), h = G.players[i]; if (!cb || !h) return '';
  const now = sides(), tog = togetherWith(i);
  const mine = tog.hero - now.hero;
  const verdict = tog.win ? `✅ Разом ви перемагаєте (${tog.hero} проти ${tog.mon}${tog.hero === tog.mon ? ', нічия на користь воїна' : ''}).` : `❌ Разом ще не вистачає ${tog.mon - tog.hero + (tog.tie ? 0 : 1)} (${tog.hero} проти ${tog.mon}).`;
  return `Зараз: ${p.name} ${now.hero} проти монстрів ${now.mon}. Твоя сила в цьому бою: +${mine}.\n${verdict} Суперники ще можуть втрутитися.`;
}
async function askHelp(i, offer) {
  const cb = G.combat, p = fighter(), h = G.players[i]; if (!cb || !h) return false;
  cb.asked.add(i);
  const T = treasureCount();
  offer = { tr: clamp(offer.tr | 0, 0, T), cards: (offer.cards || []).filter(c => p.hand.includes(c)) };
  log(`${nameTag(p)} кличе на поміч ${nameTag(h)} і пропонує ${esc(offerText(offer, false))}.`);
  renderUI();
  let ok, why = '', counter = null, haggled = false;
  if (h.type === 'bot') { await botDelay(600); const d = botHelpDecision(h, p, offer); ok = d.ok; why = d.why; counter = d.counter == null ? null : d.counter; }
  else { const r = await helpAskFor(h, offer.tr, T, `${h.name}, допоможеш?`, `${p.name} кличе тебе на поміч у бою з «${monNames()}».\n${helpForecast(i)}\nПропонує: ${offerText(offer)}${race(h) === 'elf' ? ', а ти як ельф ще й отримаєш рівень' : ''}.`, offer.cards); ok = r.ok; counter = r.counter; }
  if (!G.combat) return false;
  if (!ok && counter != null && counter > offer.tr && counter <= T) {
    haggled = true;
    log(`${nameTag(h)} торгується: допоможе за ${counter} ${plural(counter, 'скарб', 'скарби', 'скарбів')} замість ${offer.tr}.${why ? ` <i>«${esc(why)}»</i>` : ''}`); renderUI();
    let yes;
    if (p.type === 'bot') { await botDelay(500); yes = botAcceptCounter(p, h, counter); }
    else { const f = togetherWith(i); yes = await confirmFor(p, `${h.name} хоче більше`, `${h.name} допоможе, якщо віддаси ${counter} ${plural(counter, 'скарб', 'скарби', 'скарбів')} із ${T}${offer.cards.length ? ' і обіцяні карти' : ''} (ти пропонував ${offer.tr}).\nРазом: ${f.hero} проти ${f.mon} ${f.win ? '✅ перемагаєте' : '❌ навіть разом не вистачає'}.`, 'Згоден', 'Ні, дорого'); }
    if (!G.combat) return false;
    if (yes) { offer.tr = counter; ok = true; why = ''; log(`${nameTag(p)} погоджується на ціну ${nameTag(h)}.`); }
    else { log(`${nameTag(p)} не погоджується на ціну ${nameTag(h)}.`); memo(h, p, -.5); renderUI(); return false; }
  }
  if (ok) {
    cb.helper = i; cb.offer = { tr: offer.tr };
    memo(p, h, haggled ? (offer.tr >= T && T > 1 ? 1 : 2) : 3); if (h.type === 'bot' && offer.tr + sum(offer.cards, cardWorth) >= T * .5) memo(h, p, 1);
    sfx('help'); log(`${nameTag(h)} приєднується до бою на боці ${nameTag(p)}.`); ringFx(h.seat.anchor, 0x7fd081); say(`${h.name} допомагає!`);
    for (const c of offer.cards) {
      removeFromHand(p, c); const m = cardMesh(c); scene.add(m);
      await fly(m, fromHandOf(p), toHandOf(h), 600, 1.6, { owner: h.idx }); disposeMesh(m); giveCard(h, c);
    }
  } else {
    memo(p, h, -1);
    if (haggled) { renderUI(); return false; }
    log(`${nameTag(h)} відмовляє в допомозі.${why ? ` <i>«${esc(why)}»</i>` : ''}`);
    if (why) tell(p, `${h.name}: «${why}»`, 2600);
  }
  renderUI(); return ok;
}
function pickRedirectTarget(p) {
  const s = sides();
  const others = G.players.filter(q => q !== p);
  if (!others.length) return null;
  if (p.diff === 1) return others[rnd(others.length)];
  const top = Math.max(...G.players.map(q => q.level));
  const grudge = q => grudgeOf(p, q);
  const score = q => (baseStr(q) <= s.mon ? 3 : 0) + (q.level === top ? 2 + (p.diff === 3 ? 2 : 0) : 0) + grudge(q) * .8 + q.level * .2;
  return others.sort((a, b) => score(b) - score(a))[0];
}
async function botDrive() {
  const cb0 = G.combat; if (!cb0 || cb0.driving) return; cb0.driving = true;
  try {
    for (let guard = 0; guard < 24 && G.combat && !G.over; guard++) {
      const p = fighter(); if (p.type !== 'bot') return;
      const cb = G.combat; const s = sides();
      if (s.win) {
        await botDelay(650);
        const a = await botsInterfere();
        const b = (G.combat && fighter() === p && sides().win) ? await interferenceWindow() : false;
        if (!G.combat || G.over) return;
        if (fighter() === p && sides().win && !a && !b) { await winCombat(); return; }
        continue;
      }
      const need = s.mon - s.hero + (s.tie ? 0 : 1);
      const ty = combatTypes(cb), sv = c => Math.abs(shotVal(c, ty, c.bonus > 0));
      const shots = p.hand.filter(c => c.kind === 'oneshot' && sv(c) > 0).sort((x, y) => sv(y) - sv(x));
      const junkN = cls(p) === 'wizard' ? Math.min(3 - cb.wiz, p.hand.filter(c => !['oneshot', 'flee', 'levelup', 'redirect'].includes(c.kind)).length) : 0;
      const potential = sum(shots, sv) + junkN * 2;
      if (potential >= need) {
        let got = 0;
        for (const c of shots) { if (got >= need) break; await botDelay(300); await playIntoCombat(p, c, c.bonus > 0 ? 'hero' : 'mon'); got += sv(c); }
        while (got < need && cls(p) === 'wizard' && cb.wiz < 3) { const j = pickJunk(p); if (!j) break; await botDelay(250); await wizardDiscard(p, j); got += 2; }
        continue;
      }
      if (cb.helper == null) {
        const like = q => affN(p, q) * 5;
        const cand = G.players.filter(q => q !== p && !cb.asked.has(q.idx) && baseStr(q) + potential >= need).sort((x, y) => (baseStr(y) + like(y) * .7) - (baseStr(x) + like(x) * .7));
        if (cand.length) {
          const T = treasureCount(), frac = [0, .6, .5, .35][p.diff || 2];
          await askHelp(cand[0].idx, { tr: Math.min(T, Math.max(T ? 1 : 0, Math.round(T * frac) + (like(cand[0]) < -1 ? 1 : 0))), cards: [] });
          continue;
        }
      }
      const rd = p.hand.find(c => c.kind === 'redirect');
      if (rd) { const t = pickRedirectTarget(p); if (t) { await botDelay(400); await redirectCombat(p, rd, t); continue; } }
      const smoke = p.hand.find(c => c.kind === 'flee');
      if (smoke) { await botDelay(300); await playSmoke(p, smoke); return; }
      await botDelay(400);
      await fleeCombat(); return;
    }
    if (G.combat && !G.over && fighter().type === 'bot') { if (sides().win) await winCombat(); else await fleeCombat(); }
  } finally { cb0.driving = false; }
}
async function redirectCombat(p, c, target) {
  const cb = G.combat; if (!cb || !target || target.idx === cb.fighter) return;
  removeFromHand(p, c);
  const old = fighter();
  log(`${nameTag(p)} грає «${esc(c.name)}»: бій з «${esc(monNames())}» переходить до ${nameTag(target)}!`);
  say(`${target.name} тепер бʼється з «${monNames()}»!`, 2600);
  memo(target, p, -3); if (p !== old) memo(old, p, 2); sfx('redirect');
  const m = cardMesh(c); scene.add(m);
  await fly(m, fromHandOf(p), seatPose(target.idx, true), 700, 2, { owner: p.idx });
  disposeMesh(m); discard(c);
  const jobs = cb.pShots.map(x => { const mm = cb.meshes.get(x.uid); cb.meshes.delete(x.uid); return mm ? fly(mm, poseOf(mm), discardPose(x.deck), 500, 1).then(() => { disposeMesh(mm); discard(x); }) : (discard(x), null); });
  await Promise.all(jobs);
  Object.assign(cb, { fighter: target.idx, pShots: [], wiz: 0, helper: null, offer: null, asked: new Set(), passed: new Set(), interfered: new Set() });
  hitFx(target);
  for (const x of cb.mons) if (x.m) await roar(x.m);
  renderUI();
  if (target.type === 'human' && G.viewer !== target.idx) { if (privacy()) { G.reveal = -1; renderUI(); revealFor(target); } else { G.viewer = target.idx; renderUI(); } }
  if (target.type === 'remote') tell(target, `На тебе перенаправили «${monNames()}»!`, 2600);
  if (target.type === 'bot' && !cb.driving && G.combat === cb) await botDrive();
}
async function fightNow() {
  for (let guard = 0; guard < 8 && G.combat && !G.over; guard++) {
    const p = fighter();
    await botsInterfere();
    if (!G.combat || fighter() !== p) return;
    if (!sides().win) { say('Монстра підсилили! Додай сили, клич на поміч або тікай.', 2600); return; }
    const played = await interferenceWindow();
    if (!G.combat || fighter() !== p) return;
    if (!played) { if (sides().win) await winCombat(); else say('Монстра підсилили! Додай сили, клич на поміч або тікай.', 2600); return; }
  }
  if (G.combat && sides().win) await winCombat();
}
const combatWaiters = [];
function combatEnded() { while (combatWaiters.length) combatWaiters.shift()(); }
async function waitCombatEnd() { while (G.combat && !G.over) { G.busy = false; renderUI(); await new Promise(r => combatWaiters.push(r)); await wait(80); } G.busy = true; renderUI(); }

async function winCombat() {
  const cb = G.combat, p = fighter(); const tr = treasureCount(), gain = levelsGain();
  const helper = cb.helper != null ? G.players[cb.helper] : null;
  const names = monNames();
  log(`${nameTag(p)}${helper ? ' і ' + nameTag(helper) + ' перемагають' : ' перемагає'} <b>${esc(names)}</b>!`);
  say(`Перемога над «${names}»!`);
  for (const x of cb.mons) { if (x.m) { const m = x.m; x.m = null; await defeatAnim(m); } discard(x.c); }
  await clearSideCards();
  await changeLevel(p, gain, true);
  if (G.over) return;
  const hs = helper ? Math.min(tr, cb.offer ? cb.offer.tr : Math.floor(tr / 2)) : 0;
  if (tr) log(`Здобич: ${tr} ${plural(tr, 'скарб', 'скарби', 'скарбів')}${hs ? ` (${hs} — помічникові)` : ''}.`);
  for (let i = 0; i < tr - hs; i++) await drawTo(p, 'treasure');
  for (let i = 0; i < hs; i++) await drawTo(helper, 'treasure');
  if (helper && race(helper) === 'elf') await changeLevel(helper, 1, false);
  T.die.visible = false; G.combat = null; G.phase = 'charity'; renderUI(); combatEnded();
}
async function fleeCombat() {
  const cb = G.combat; const ids = [cb.fighter]; if (cb.helper != null) ids.push(cb.helper);
  const many = cb.mons.length > 1;
  for (const i of ids) {
    const q = G.players[i]; const fb = fleeBonus(q);
    for (const x of cb.mons) {
      const mon = x.c;
      const sayRoll = (r, ok, again) => {
        const math = fb ? `${r} + ${fb} (бонус втечі) = ${r + fb}` : `${r}`;
        say(`${again ? 'Перекидання' : 'Кубик'} · ${q.name}${many ? ` від «${mon.name}»` : ''}: ${math}. Треба 5+ — ${ok ? 'втеча вдалася!' : 'втекти не вдалося.'}`, 2600);
        log(`${nameTag(q)} ${again ? 'перекидає' : 'кидає'} кубик${many ? ` (тікає від «${esc(mon.name)}»)` : ''}: випало <b>${r}</b>${fb ? `, бонус втечі +${fb} → ${r + fb}` : ''}. Треба 5+ → ${ok ? 'втеча вдалася' : 'не вдалося'}.`);
      };
      let r = await rollDie(q); let ok = r + fb >= 5; sayRoll(r, ok, false);
      if (!ok && race(q) === 'halfling') { await wait(1400); r = await rollDie(q); ok = r + fb >= 5; sayRoll(r, ok, true); }
      await wait(1300);
      if (!ok) {
        await lunge(x.m); hitFx(q);
        log(`Халепа від «${esc(mon.name)}»: ${esc(mon.bad.text)}`);
        await applyBad(q, mon.bad);
        if (G.over) return;
      }
    }
  }
  await clearCombat(); G.phase = 'charity';
}
async function clearSideCards() {
  const cb = G.combat; const jobs = [];
  for (const c of [...cb.mods, ...cb.mShots, ...cb.pShots]) {
    const m = cb.meshes.get(c.uid);
    if (m) jobs.push(fly(m, poseOf(m), discardPose(c.deck), 520, 1).then(() => { disposeMesh(m); discard(c); }));
    else discard(c);
  }
  await Promise.all(jobs); cb.meshes.clear();
}
async function clearCombat() {
  const cb = G.combat; if (!cb) return;
  const jobs = [clearSideCards()];
  for (const x of cb.mons) {
    if (x.m) { const m = x.m; x.m = null; jobs.push(fly(m, poseOf(m), discardPose('door'), 650, 1.3).then(() => { disposeMesh(m); discard(x.c); })); }
    else discard(x.c);
  }
  await Promise.all(jobs);
  T.die.visible = false; G.combat = null; if (G.phase === 'combat') G.phase = 'charity'; renderUI(); combatEnded();
}

async function applyBad(q, bad) {
  const lost = [];
  const take = items => items.forEach(g => { q.gear.splice(q.gear.indexOf(g), 1); discard(g); lost.push(g.name); });
  switch (bad.t) {
    case 'level': { const d = Math.min(bad.n, q.level - 1); if (d > 0) await changeLevel(q, -d); else log(`${nameTag(q)} і так на 1-му рівні.`); break; }
    case 'slot': take(q.gear.filter(g => g.slot === bad.slot)); break;
    case 'gear': take(q.gear.slice()); break;
    case 'best': { const b = q.gear.slice().sort((x, y) => y.value - x.value)[0]; if (b) take([b]); break; }
    case 'hand': { const n = Math.min(bad.n, q.hand.length); for (let i = 0; i < n; i++) { const c = q.hand.splice(rnd(q.hand.length), 1)[0]; discard(c); lost.push(c.name); } break; }
    case 'gold': if (q.gold) { lost.push(`${q.gold} зол.`); q.gold = 0; } break;
    case 'race': if (q.raceCard) { discard(q.raceCard); lost.push(q.raceCard.name); q.raceCard = null; } break;
    case 'class': if (q.clsCard) { discard(q.clsCard); lost.push(q.clsCard.name); q.clsCard = null; } break;
    case 'sex': {
      q.sex = q.sex === 'f' ? 'm' : 'f';
      log(`${nameTag(q)} тепер ${q.sex === 'f' ? 'жінка' : 'чоловік'}!${q.gear.some(g => g.req && g.req.sex) ? ' Деякі речі більше не діють.' : ''}`);
      ringFx(q.seat.anchor, 0xb98be6); burst(q.seat.anchor.clone().setY(.8), ['#b98be6', '#e889b8', '#ffffff'], 80, 3, 1.2);
      syncSeat(q); renderUI(); await wait(350); return;
    }
    case 'death': {
      take(q.gear.slice()); q.hand.splice(0).forEach(c => { discard(c); lost.push(c.name); });
      q.died = true; log(`${nameTag(q)} гине! Рівень лишається, речі — ні.`);
      burst(q.seat.anchor, ['#ef6b5d', '#5a1f1a', '#ffffff'], 120, 4, 1.4);
      break;
    }
  }
  if (bad.t !== 'level') log(lost.length ? `${nameTag(q)} втрачає: ${esc(lost.join(', '))}.` : `${nameTag(q)} пощастило: нічого втрачати.`);
  syncSeat(q); renderUI();
  await wait(350);
}

function charityTargets(p) {
  const others = G.players.filter(q => q !== p); const minL = Math.min(...others.map(q => q.level));
  return p.level <= minL ? [] : others.filter(q => q.level === minL);
}
async function charity(p, chosen = []) {
  const lim = handLimit(p); if (p.hand.length <= lim) return;
  const excess = p.hand.length - lim;
  const recips = charityTargets(p);
  const valid = chosen.length === excess && chosen.every(c => p.hand.includes(c));
  const give = valid ? chosen : p.hand.slice().sort((a, b) => keepScore(p, a) - keepScore(p, b)).slice(0, excess);
  if (isPerson(p)) tell(p, recips.length ? `Зайві карти йдуть: ${recips.map(r => r.name).join(', ')}` : 'Зайві карти йдуть у скид', 2400);
  for (const [k, c] of give.entries()) {
    removeFromHand(p, c);
    const m = cardMesh(c); scene.add(m);
    if (recips.length) {
      const r = recips[k % recips.length];
      log(`Благодійність: ${nameTag(p)} віддає карту гравцеві ${nameTag(r)} (у нього найнижчий рівень).`);
      await fly(m, fromHandOf(p), toHandOf(r), 600, 1.8, { owner: r.idx });
      giveCard(r, c); memo(r, p, .5);
      tell(p, `«${c.name}» → ${r.name}`, 1800); tell(r, `${p.name} віддає тобі «${c.name}»`, 2400);
    } else {
      log(`${nameTag(p)} скидає зайву карту «${esc(c.name)}».`);
      await fly(m, fromHandOf(p), discardPose(c.deck), 500, 1.2); discard(c);
    }
    disposeMesh(m); renderUI();
  }
}
async function endTurn(chosen = []) {
  const p = cur();
  await charity(p, chosen);
  if (p.died) {
    p.died = false; log(`${nameTag(p)} повертається до гри з новими картами.`);
    for (let i = 0; i < 2; i++) await drawTo(p, 'door');
    for (let i = 0; i < 2; i++) await drawTo(p, 'treasure');
  }
  G.cur = (G.cur + 1) % G.players.length;
  G.reveal = -1;
  G.phase = 'next'; G.busy = true; renderUI();
  setTimeout(startTurn, 50);
}

/* --- обмін речами --- */
const canTrade = p => !!p && !G.busy && !G.over && !G.combat && p === cur() && ['start', 'afterKick', 'charity'].includes(G.phase);
const tradeItems = p => [...p.gear, ...p.hand.filter(c => c.kind === 'gear')];
const findTradeItem = (p, uid) => tradeItems(p).find(c => c.uid === uid);
const itemWorth = (b, c) => c.value * (usable(b, c) ? 1 : .6) + (usable(b, c) ? c.bonus * 120 + (c.flee || 0) * 60 : 0);
function botTradeOffer(b, p, give) {
  const D = b.diff || 2, aff = affinity(b, p), an = affN(b, p);
  const top = Math.max(...G.players.map(q => q.level));
  if (D === 3 && p.level === top && p.level >= b.level + 2) return { ok: false, why: 'Лідерам нічого не продаю.' };
  if (aff < 11) return { ok: false, why: 'З тобою? Ніколи.' };
  if (!give.length) return { ok: false, why: 'А ти що даєш? Нічого? От і я нічого.' };
  const gain = sum(give, c => itemWorth(b, c));
  const factor = [0, .85, 1.05, 1.35][D] - an * .3;
  let budget = gain / Math.max(.5, factor);
  const pool = tradeItems(b).map(c => ({ c, w: itemWorth(b, c) })).sort((x, y) => (x.w - y.w) || (y.c.value - x.c.value));
  const take = [];
  for (const it of pool) { if (take.length >= give.length + 1) break; if (it.w <= budget) { take.push(it.c); budget -= it.w; } }
  if (!take.length) return gain >= 300 ? { ok: true, take: [], why: 'Дати натомість нічого не можу, але подарунок візьму!' } : { ok: false, why: 'Мені це ні до чого.' };
  return { ok: true, take, why: '' };
}
/* карти у вікнах: показуємо самі карти, а не лише назви */
const cardCopy = c => JSON.parse(JSON.stringify(c));
function cardRow(cards, o = {}) {
  if (!cards.length) return o.empty ? `<p class="hint">${o.empty}</p>` : '';
  return `<div class="cardrow">${cards.map(c => {
    const on = o.sel && o.sel.has(c.uid);
    return `<div class="cpick${o.sel ? ' selectable' : ''}${on ? ' on' : ''}"${o.sel ? ` data-${o.key}="${c.uid}" role="button" tabindex="0" aria-pressed="${on}"` : ''}>${cardHTML(c, 'static')}${o.tag ? `<span class="ctag">${o.tag(c)}</span>` : ''}</div>`;
  }).join('')}</div>`;
}
function cardsModal(title, text, groups, yes, no) {
  return new Promise(res => {
    showModal(`<h2>${esc(title)}</h2>${text ? `<p>${esc(text).replace(/\n/g, '<br>')}</p>` : ''}${groups.map(g => `<h3>${esc(g.label)}</h3>${cardRow(g.cards, { empty: esc(g.empty || 'нічого') })}`).join('')}
      <div class="row end"><button class="btn ghost" id="mNo" type="button">${esc(no)}</button><button class="btn primary" id="mYes" type="button">${esc(yes)}</button></div>`, 'wide');
    $('#mYes').onclick = () => { closeModal(); res(true); }; $('#mNo').onclick = () => { closeModal(); res(false); };
  });
}
function cardsConfirmFor(p, title, text, groups, yes, no) {
  groups = groups.map(g => ({ ...g, cards: g.cards.map(cardCopy) }));
  if (p.type !== 'remote') return cardsModal(title, text, groups, yes, no);
  return new Promise(res => {
    const id = ++NET.askSeq; let tm;
    const done = ok => { if (!NET.asks.has(id)) return; NET.asks.delete(id); clearTimeout(tm); netSendTo(p.idx, { t: 'askEnd', id }); res(!!ok); };
    done.who = p.idx; NET.asks.set(id, done);
    tm = setTimeout(() => done(false), 60000);
    netSendTo(p.idx, { t: 'cardsAsk', id, title, text, groups, yes, no });
  });
}
function tradeChip(c) { return `${artIcon(c)} ${esc(c.name)}${c.bonus ? ' +' + c.bonus : ''}${c.value ? ' · ' + c.value + ' зол.' : ''}`; }
/* вибір зустрічної пропозиції (бачить лише той, кого просять) */
function tradePickModal(t, fromName, giveInfo) {
  return new Promise(res => {
    const items = tradeItems(t), sel = new Set();
    const draw = () => `<h2>${esc(t.name)}, обмін?</h2><p><b>${esc(fromName)}</b> пропонує тобі:</p>
      ${cardRow(giveInfo, { empty: 'нічого — просто просить щось дати' })}
      <h3>Що ти готовий дати натомість</h3><p class="hint">Цей список бачиш лише ти. ${esc(fromName)} побачить тільки те, що ти вибереш, і вирішить, чи згоден.</p>
      <p class="hint">Натисни на карти, які віддаси.</p>${cardRow(items, { sel, key: 'tp', tag: c => t.gear.includes(c) ? 'вдягнено' : 'у руці', empty: 'У тебе немає речей для обміну.' })}
      <div class="row end"><button class="btn ghost" type="button" id="tpNo">Відмовитись</button><button class="btn primary" type="button" id="tpGo" ${sel.size || giveInfo.length ? '' : 'disabled'}>${sel.size ? `Запропонувати (${sel.size})` : 'Взяти без нічого натомість'}</button></div>`;
    showModal(draw(), 'wide');
    $('#sheet').onclick = e => {
      const b = e.target.closest('button, [data-tp]'); if (!b) return;
      if (b.dataset.tp) { const u = +b.dataset.tp; sel.has(u) ? sel.delete(u) : sel.add(u); $('#sheet').innerHTML = draw(); }
      else if (b.id === 'tpNo') { $('#sheet').onclick = null; closeModal(); res(null); }
      else if (b.id === 'tpGo') { $('#sheet').onclick = null; closeModal(); res([...sel]); }
    };
  });
}
function askRemoteTrade(t, fromName, giveInfo, timeout = 90000) {
  return new Promise(res => {
    const id = ++NET.askSeq; let tm;
    const done = (ok, pick) => { if (!NET.asks.has(id)) return; NET.asks.delete(id); clearTimeout(tm); netSendTo(t.idx, { t: 'askEnd', id }); res(ok && Array.isArray(pick) ? pick : null); };
    done.who = t.idx; NET.asks.set(id, done);
    tm = setTimeout(() => done(false), timeout);
    netSendTo(t.idx, { t: 'tradeAsk', id, from: fromName, give: giveInfo });
  });
}
async function humanTradeOffer(t, p, give) {
  const info = give.map(cardCopy);
  if (t.type === 'remote') { const pick = await askRemoteTrade(t, p.name, info); return pick && pick.map(u => findTradeItem(t, u)).filter(Boolean); }
  const pv = G.viewer, pr = G.reveal, priv = privacy();
  if (priv) { G.reveal = -1; closeMenu(); renderUI(); await curtain(t); }
  const pick = await tradePickModal(t, p.name, info);
  if (priv) {
    G.reveal = -1; renderUI();
    const back = G.players[pv];
    if (back && back.type === 'human') { await curtain(back); G.viewer = pv; G.reveal = pv; } else { G.viewer = pv; G.reveal = pr; }
    renderUI();
  }
  return pick && pick.map(u => findTradeItem(t, u)).filter(Boolean);
}
async function doTrade(p, t, give) {
  if (!t || t === p) return;
  const names = l => l.length ? l.map(c => '«' + c.name + '»').join(', ') : 'нічого';
  log(`${nameTag(p)} пропонує обмін гравцеві ${nameTag(t)}${give.length ? `: віддає ${esc(names(give))}` : ''}.`);
  renderUI();
  let take = null, why = '';
  if (t.type === 'bot') { await botDelay(650); const d = botTradeOffer(t, p, give); take = d.ok ? d.take : null; why = d.why; }
  else take = await humanTradeOffer(t, p, give);
  if (!take) { log(`${nameTag(t)} відмовляється від обміну.${why ? ` <i>«${esc(why)}»</i>` : ''}`); tell(p, `${t.name}: ${why ? '«' + why + '»' : 'відмова'}`, 2600); memo(p, t, -.5); return; }
  if (!give.length && !take.length) return;
  if (give.some(c => !findTradeItem(p, c.uid)) || take.some(c => !findTradeItem(t, c.uid))) { tell(p, 'Речі вже змінилися — обмін скасовано.'); return; }
  const ok = await cardsConfirmFor(p, `${t.name} відповідає`, `${why ? '«' + why + '» ' : ''}${take.length ? `${t.name} пропонує натомість ось це. Згоден?` : `${t.name} нічого не дає натомість. Подарувати?`}`,
    [{ label: `Ти отримаєш від ${t.name}`, cards: take, empty: 'нічого' }, { label: 'Ти віддаси', cards: give, empty: 'нічого' }], take.length ? 'Міняємось' : 'Подарувати', 'Відмовитись');
  if (!ok) { log(`${nameTag(p)} не погоджується на пропозицію ${nameTag(t)}.`); memo(t, p, -.3); return; }
  if (give.some(c => !findTradeItem(p, c.uid)) || take.some(c => !findTradeItem(t, c.uid))) { tell(p, 'Речі вже змінилися — обмін скасовано.'); return; }
  const move = async (from, to, c) => {
    if (from.gear.includes(c)) from.gear.splice(from.gear.indexOf(c), 1); else removeFromHand(from, c);
    const m = cardMesh(c); scene.add(m);
    const a = seatAngle(from.idx), w = rotY(0, TABLE_Y + .05, 6.4, a);
    await fly(m, { ...w, yaw: a, tilt: 0, flip: 0, s: .62 }, toHandOf(to), 650, 1.8, { owner: to.idx });
    disposeMesh(m); giveCard(to, c);
  };
  for (const c of give) await move(p, t, c);
  for (const c of take) await move(t, p, c);
  syncSeat(p); syncSeat(t);
  memo(p, t, 1); memo(t, p, 1);
  sfx('coins'); log(`Обмін відбувся: ${nameTag(p)} ⇄ ${nameTag(t)}.`); say(`${p.name} і ${t.name} помінялися речами`, 2000);
  if (t.type === 'bot') { for (let g = 0; g < 6; g++) { const before = gearScore(t, t.gear); const best = t.hand.filter(c => c.kind === 'gear' && !canEquip(t, c)).map(c => ({ c, s: gearScore(t, gearAfter(t, c)) })).sort((a, b) => b.s - a.s)[0]; if (!best || best.s <= before + .01) break; await doEquip(t, best.c); } }
  renderUI();
}
function openCharityPick(v, act) {
  const lim = handLimit(v), excess = v.hand.length - lim; if (excess <= 0) { dispatch(act); return; }
  const recips = charityTargets(v);
  const sel = new Set();
  const dest = recips.length ? `Вони підуть гравцеві з найнижчим рівнем: <b>${recips.map(r => `<span style="color:${r.color}">${esc(r.name)}</span>`).join(', ')}</b>${recips.length > 1 ? ' (по черзі)' : ''}.` : 'Ти сам на найнижчому рівні, тож вони підуть у скид.';
  const draw = () => `<h2>Забагато карт</h2><p>У руці ${v.hand.length} карт при ліміті ${lim}. Вибери <b>${excess}</b> ${plural(excess, 'карту', 'карти', 'карт')}, яких позбудешся. ${dest}</p>
    <p class="hint">Порада: замість цього можна спорядити речі чи продати їх — закрий це вікно.</p>
    <div class="ochips" style="margin-top:10px">${v.hand.map(c => `<button type="button" class="ochip" data-ch="${c.uid}" aria-pressed="${sel.has(c.uid)}">${artIcon(c)} ${esc(c.name)} · ${esc(cardInfo(c).type.toLowerCase())}</button>`).join('')}</div>
    <div class="row end"><button class="btn ghost" type="button" data-close>Назад</button><button class="btn primary" type="button" id="chGo" ${sel.size === excess ? '' : 'disabled'}>Віддати й завершити хід (${sel.size}/${excess})</button></div>`;
  const redraw = () => { $('#sheet').innerHTML = draw(); $('#sheet').querySelectorAll('[data-close]').forEach(x => x.onclick = closeModal); };
  showModal(draw());
  $('#sheet').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.ch) { const u = +b.dataset.ch; if (sel.has(u)) sel.delete(u); else if (sel.size < excess) sel.add(u); redraw(); }
    else if (b.id === 'chGo' && sel.size === excess) { closeModal(); dispatch({ ...act, give: [...sel] }); }
  };
}
function openTrade() {
  const p = viewerP(); if (!canTrade(p)) return;
  const others = G.players.filter(q => q !== p);
  const st = { t: others[0].idx, give: new Set() };
  const draw = () => {
    const t = G.players[st.t];
    const mine = tradeItems(p);
    const gv = sum(mine.filter(c => st.give.has(c.uid)), c => c.value);
    return `<h2>Обмін речами</h2><p>Вибери, з ким мінятися і що пропонуєш. Суперник сам вирішить, що дати натомість (його карт ти не бачиш), а ти потім погодишся або відмовишся. Отримані речі потрапляють у руку.</p>
      <h3>З ким</h3><div class="seg" role="group" aria-label="З ким мінятися">${others.map(q => `<button type="button" data-tt="${q.idx}" aria-pressed="${st.t === q.idx}">${esc(q.name)}</button>`).join('')}</div>
      ${t.type === 'bot' ? `<p class="hint" style="margin-top:8px">Бот, ${DIFF[t.diff || 2].name.toLowerCase()}. Ставлення до тебе: ${attitude(t, p)}. Що вища складність, то вигіднішу пропозицію він хоче.</p>` : ''}
      <h3>Ти віддаєш (${gv} зол.)</h3><p class="hint">Натисни на карти, які пропонуєш.</p>${cardRow(mine, { sel: st.give, key: 'gv', tag: c => p.gear.includes(c) ? 'вдягнено' : 'у руці', empty: 'У тебе немає речей.' })}
      <div class="row end"><button class="btn ghost" type="button" data-close>Скасувати</button><button class="btn primary" type="button" id="trGo">${st.give.size ? 'Запропонувати обмін' : 'Попросити щось без пропозиції'}</button></div>`;
  };
  const redraw = () => { $('#sheet').innerHTML = draw(); $('#sheet').querySelectorAll('[data-close]').forEach(x => x.onclick = closeModal); };
  showModal(draw(), 'wide');
  $('#sheet').onclick = e => {
    const b = e.target.closest('button, [data-gv]'); if (!b) return;
    if (b.dataset.tt) { st.t = +b.dataset.tt; redraw(); }
    else if (b.dataset.gv) { const u = +b.dataset.gv; st.give.has(u) ? st.give.delete(u) : st.give.add(u); redraw(); }
    else if (b.id === 'trGo') { $('#sheet').onclick = null; closeModal(); dispatch({ k: 'trade', target: st.t, give: [...st.give] }); }
  };
}

/* --- дії з картами (спільні для людей і ботів) --- */
async function doEquip(p, c) {
  const err = canEquip(p, c); if (err) { tell(p, err); return; }
  const m = cardMesh(c); scene.add(m);
  const a = seatAngle(p.idx); const w = rotY(0, TABLE_Y + .05, 6.4, a);
  await fly(m, fromHandOf(p), { ...w, yaw: a, tilt: 0, flip: 0, s: .62 }, 520, 1.2, { owner: p.idx });
  disposeMesh(m);
  const rem = equip(p, c); sfx('equip');
  log(`${nameTag(p)} споряджається: «${esc(c.name)}»${rem.length ? ` (знімає ${esc(rem.map(r => r.name).join(', '))})` : ''}.`);
  syncSeat(p); renderUI();
}
async function unequip(p, c) { p.gear.splice(p.gear.indexOf(c), 1); giveCard(p, c); syncSeat(p); renderUI(); }
async function doSell(p, c) {
  if (p.gear.includes(c)) p.gear.splice(p.gear.indexOf(c), 1); else removeFromHand(p, c);
  discard(c); p.gold += c.value; sfx('coins');
  log(`${nameTag(p)} продає «${esc(c.name)}» за ${c.value} зол.`);
  let gained = 0; while (p.gold >= 1000 && p.level + gained < G.goal - 1) { p.gold -= 1000; gained++; }
  syncSeat(p); renderUI();
  burst(p.seat.anchor.clone().setY(1), ['#ffd36b', '#f5c04a'], 40, 2.5, .9);
  if (gained) { say(`${p.name}: +${gained} ${plural(gained, 'рівень', 'рівні', 'рівнів')} за золото`); await changeLevel(p, gained); }
}
async function doPlayRC(p, c) {
  removeFromHand(p, c);
  const key = c.kind === 'race' ? 'raceCard' : 'clsCard';
  const old = p[key];
  const m = cardMesh(c); scene.add(m);
  const a = seatAngle(p.idx); const w = rotY(0, TABLE_Y + .05, 6.4, a);
  await fly(m, fromHandOf(p), { ...w, yaw: a, tilt: 0, flip: 0, s: .62 }, 520, 1.4, { owner: p.idx });
  disposeMesh(m); p[key] = c; sfx('equip');
  log(`${nameTag(p)} тепер ${c.kind === 'race' ? 'раса' : 'клас'}: <b>${esc(c.name)}</b>.`);
  if (old) {
    syncSeat(p);
    const m2 = cardMesh(old); scene.add(m2);
    await fly(m2, { ...w, yaw: a, tilt: 0, flip: 0, s: .62 }, toHandOf(p), 520, 1.2, { owner: p.idx });
    disposeMesh(m2); giveCard(p, old);
    log(`Попередня карта «${esc(old.name)}» повертається в руку ${nameTag(p)}.`);
  }
  ringFx(p.seat.anchor, 0xffd36b); syncSeat(p); renderUI();
}
async function doDiscard(p, c) {
  removeFromHand(p, c);
  log(`${nameTag(p)} скидає «${esc(c.name)}» у скид.`);
  const m = cardMesh(c); scene.add(m); renderUI();
  await fly(m, fromHandOf(p), discardPose(c.deck), 560, 1.3, { owner: p.idx });
  disposeMesh(m); discard(c); renderUI();
}
async function doLevelUp(p, c) {
  if (p.level >= G.goal - 1) { tell(p, `${G.goal}-й рівень — лише за перемогу над монстром!`); return; }
  removeFromHand(p, c); discard(c);
  log(`${nameTag(p)} грає «${esc(c.name)}».`);
  await changeLevel(p, 1);
}
async function doCurse(from, c, target) {
  if (!target) return;
  removeFromHand(from, c);
  log(`${nameTag(from)} насилає «${esc(c.name)}» на ${nameTag(target)}!`);
  memo(target, from, -3); sfx('curse');
  const m = cardMesh(c); scene.add(m); renderUI();
  await fly(m, fromHandOf(from), seatPose(target.idx, true), 750, 2.2);
  hitFx(target); disposeMesh(m); discard(c);
  await applyBad(target, c.bad);
}

/* --- боти --- */
async function botManage(p) {
  for (const kind of ['race', 'class']) {
    const key = kind === 'race' ? 'raceCard' : 'clsCard';
    const c = p.hand.find(x => x.kind === kind);
    if (c && !p[key]) { await botDelay(300); await doPlayRC(p, c); }
  }
  for (let guard = 0; guard < 8; guard++) {
    const before = gearScore(p, p.gear);
    const best = p.hand.filter(c => c.kind === 'gear' && !canEquip(p, c)).map(c => ({ c, s: gearScore(p, gearAfter(p, c)) })).sort((a, b) => b.s - a.s)[0];
    if (!best || best.s <= before + .01) break;
    await botDelay(250); await doEquip(p, best.c);
  }
  for (const c of p.hand.filter(x => x.kind === 'levelup')) if (p.level < G.goal - 1) { await botDelay(250); await doLevelUp(p, c); }
  if (cur() === p && G.phase !== 'combat' && p.level < G.goal - 1) {
    const spare = p.hand.filter(c => c.kind === 'gear' && (canEquip(p, c) || gearScore(p, gearAfter(p, c)) <= gearScore(p, p.gear)));
    if (p.gold + sum(spare, c => c.value) >= 1000) for (const c of spare) { if (p.level >= G.goal - 1) break; await botDelay(200); await doSell(p, c); }
  }
  const curse = p.hand.find(c => c.kind === 'curse');
  const D = DIFF[p.diff || 2];
  if (curse && Math.random() < D.curse) {
    const grudge = q => grudgeOf(p, q);
    const targets = G.players.filter(q => q !== p && badHits(q, curse.bad));
    let t = null;
    if (p.diff === 1) t = targets[rnd(targets.length)] || null;
    else {
      const top = Math.max(...G.players.map(q => q.level));
      const score = q => q.level + (q.level === top ? 3 : 0) + grudge(q) * 1.5 + baseStr(q) * .1;
      t = targets.sort((a, b) => score(b) - score(a))[0] || null;
      if (t && p.diff === 2 && !(t.level >= p.level || grudge(t) >= 3)) t = null;
    }
    if (t) { await botDelay(350); await doCurse(p, curse, t); }
  }
}
async function botTurn(p) {
  if (G.phase === 'start') {
    await botDelay(450);
    await botManage(p); if (G.over) return;
    await botDelay(300);
    await kickDoor(); if (G.over) return;
  }
  if (G.phase === 'combat' && G.combat) { if (fighter().type === 'bot') await botDrive(); if (G.combat && !G.over) await waitCombatEnd(); if (G.over) return; }
  if (G.phase === 'afterKick') {
    await botManage(p); if (G.over) return;
    const str = baseStr(p);
    const m = p.hand.filter(c => c.kind === 'monster' && monLvl(c, p) + vsBonus(c, p) + 2 < str).sort((a, b) => b.treasures - a.treasures || b.lvl - a.lvl)[0];
    await botDelay(400);
    if (m) { await lookForTrouble(m); if (G.combat && !G.over) await waitCombatEnd(); } else await loot();
  }
  if (G.over) return;
  await botManage(p); if (G.over) return;
  await botDelay(400);
  await endTurn();
}

async function gameOver(p) {
  if (G.over) return;
  G.over = true; G.phase = 'over'; G.busy = false; G.window = null;
  log(`${nameTag(p)} досягає ${G.goal}-го рівня і перемагає!`, 'turn');
  confetti(p.color); renderUI(); sfx('win');
  emitFx('win', { idx: p.idx });
  await wait(900);
  showWin(p, true);
}
function showWin(p, isHost) {
  showModal(`<div class="curtain"><h2>Перемога!</h2><div class="who" style="color:${p.color}">${esc(p.name)}</div><p>досягає ${G.goal}-го рівня і стає найславетнішим пройдисвітом підземелля.</p></div>
    <div class="row end"><button class="btn ghost" data-close type="button">Роздивитися стіл</button>${isHost ? '<button class="btn primary" id="again" type="button">Нова гра</button>' : ''}</div>
    ${isHost ? '' : '<p class="hint" style="text-align:center">Нову партію запускає господар кімнати.</p>'}`);
  const a = $('#again'); if (a) a.onclick = () => { closeModal(); openSetup(); };
}
