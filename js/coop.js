'use strict';

/* ============================== КООПЕРАТИВ: «ПОХІД НА БОСА» ==============================
   Усі гравці — одна команда проти самого Підземелля. Треба знайти 3 ключі, відчинити лігво
   й перемогти Боса раніше, ніж шкала Загрози дійде до кінця. Підземелля — невидимий гравець
   зі своєю рукою: посилює монстрів, підкидає потвор і насилає прокляття. */
const COOP_DIFF = {
  easy: { name: 'Легко', max: 14, mult: .85, meddle: .25, cards: 1, bossCards: 1, curse: .25, draw: 1 },
  normal: { name: 'Нормально', max: 12, mult: 1, meddle: .42, cards: 2, bossCards: 2, curse: .45, draw: 2 },
  hard: { name: 'Важко', max: 10, mult: 1.15, meddle: .6, cards: 3, bossCards: 3, curse: .7, draw: 2 }
};
const BOSSES = [
  { id: 'dragon', name: 'Древній Дракон Кредиту', art: '🐲', dragon: true, flavor: 'Спить на золоті. Твоєму.', ability: 'Дракон: вогняні речі й зілля проти нього не діють.' },
  { id: 'lich', name: 'Ліч-бюрократ', art: '☠️', undead: true, flavor: 'Помер, але довідку не здав.', ability: 'Нежить. На початку бою кличе на допомогу мертвяка з колоди.' },
  { id: 'worm', name: 'Хмарний Хробак', art: '🪱', flavor: 'Росте, поки ви вагаєтесь.', ability: '+1 за кожне коло, яке вже минуло в поході.' },
  { id: 'tax', name: 'Король Податкової', art: '🤴', flavor: 'Корона з чеків. Трон з декларацій.', ability: 'На початку бою кожен платить 300 золотих. За кожного, кому нічим платити, Бос +3.' },
  { id: 'goblins', name: 'Матінка Гоблінів', art: '👵', flavor: 'Сто онуків. Усі голодні.', ability: '+2 за кожну карту в руці Підземелля на початку бою.' },
  { id: 'monday', name: 'Тінь Понеділка', art: '🌑', flavor: 'Приходить щотижня. Ніхто не готовий.', ability: '+2 за кожне тривале прокляття на гравцях.' }
];
// невидимий гравець «Підземелля»
const DUNGEON = { idx: -1, name: 'Підземелля', color: '#b77be0', type: 'dungeon', hand: [], gear: [], curses: [], level: 1, sex: 'm', mem: {} };
const coopOn = () => !!G.coop;
const threatStage = () => !G.coop ? 0 : G.coop.threat >= Math.ceil(G.coop.max * 2 / 3) ? 2 : G.coop.threat >= Math.ceil(G.coop.max / 3) ? 1 : 0;
const threatBonus = () => threatStage() * 2;

/* --- карти походу --- */
function coopDoorCards() {
  const d = [];
  [['Іржавий ключ від лігва', 'Висів на шиї у щура. Щур не віддавав.'], ['Кістяний ключ від лігва', 'Хтось ним колупав у зубах.'], ['Золотий ключ від лігва', 'Від дверей, яких краще не відчиняти.']]
    .forEach(([name, flavor]) => d.push(mk({ deck: 'door', kind: 'key', name, art: '🗝️', flavor })));
  [['Розбудили варту', '🔔', 1, 'Хтось наступив на дзвоник. Ти.'], ['Гучний чих', '🤧', 1, 'Підземелля здригнулося. І прокинулося.'], ['Сигналізація з горщиків', '🥁', 2, 'Брязь! Бах! Ну все.'], ['Наступили на кота', '🐈‍⬛', 1, 'Кіт кричав так, що чули на поверхні.']]
    .forEach(([name, art, n, flavor]) => d.push(mk({ deck: 'door', kind: 'alarm', name, art, n, flavor })));
  return d;
}
function coopTreasureCards() {
  return [['Сигнальний ріг', '📯', 'Ту-ту-у! Чудовиська ховаються.'], ['Колискова для підземелля', '🎵', 'Баю-бай, засинай, на героїв не чіпай.']]
    .map(([name, art, flavor]) => mk({ deck: 'treasure', kind: 'horn', name, art, value: 300, flavor }));
}
// ключі кладемо у верхню половину колоди, щоб похід не затягувався
function coopBuildDecks(door, treasure, n = 4) {
  const keys = [], rest = [];
  coopDoorCards().forEach(c => (c.kind === 'key' ? keys : rest).push(c));
  rest.forEach(c => door.splice(rnd(door.length - 4 * n), 0, c));
  // не в стартовій роздачі (верхні 4×n карт), але й не на самому дні
  // з меншою групою двері вибивають рідше — ключі кладемо ближче до верху
  const top = 4 * n + 2, span = Math.max(6, Math.min(Math.floor(door.length * .55), 10 * n + 10) - top);
  keys.forEach(c => door.splice(door.length - top - rnd(span), 0, c));
  coopTreasureCards().forEach(c => treasure.splice(rnd(treasure.length + 1), 0, c));
}
function coopStart(diff) {
  const D = COOP_DIFF[diff] || COOP_DIFF.normal;
  const n = G.players.length;
  // мала група розвивається повільніше за коло — даємо їй трохи довшу шкалу
  G.coop = { diff: diff in COOP_DIFF ? diff : 'normal', threat: 0, max: D.max + (n <= 2 ? 3 : n === 3 ? 1 : 0), keys: 0, need: 3, lair: false, boss: null, round: 1, tries: 0, hand: [], stats: {} };
  DUNGEON.hand = G.coop.hand; DUNGEON.mem = {};
  G.players.forEach(p => { G.coop.stats[p.idx] = { kills: 0, keys: 0, shots: 0 }; });
}
const coopStat = (p, k, n = 1) => { if (G.coop && p && G.coop.stats[p.idx]) G.coop.stats[p.idx][k] += n; };

/* --- ключі, тривоги, ріг --- */
// ключ або тривога, що трапились будь-де (вибиті двері чи карта в руку), спрацьовують одразу
async function coopSpecial(p, c) {
  if (!G.coop || !c) return false;
  if (c.kind === 'key') {
    if (G.coop.lair) { discard(c); log(`${nameTag(p)} знаходить ще один ключ, але лігво вже відчинене.`); return true; }
    G.coop.keys++; coopStat(p, 'keys');
    log(`🗝️ ${nameTag(p)} знаходить «${esc(c.name)}»! Ключів: ${G.coop.keys} з ${G.coop.need}.`, 'turn');
    say(`Ключ знайдено! ${G.coop.keys} з ${G.coop.need}`, 2600); sfx('levelUp');
    if (G.coop.keys >= G.coop.need && !G.coop.lair) openLair();
    renderUI(); return true;
  }
  if (c.kind === 'alarm') { discard(c); await addThreat(c.n || 1, `«${c.name}»`); return true; }
  return false;
}
function openLair() {
  const co = G.coop; co.lair = true;
  const pool = BOSSES.filter(b => (!b.dragon || (G.types || {}).dragon !== false) && (!b.undead || (G.types || {}).undead !== false));
  co.boss = pool[rnd(pool.length)];
  log(`🚪 Усі ключі зібрано — лігво відчинено! Там чекає <b>${esc(co.boss.name)}</b>. ${esc(co.boss.ability)}`, 'turn');
  say(`Лігво відчинено! Бос: ${co.boss.name}`, 3200); banner('Лігво відчинено!', '#b77be0'); netAll({ t: 'fx', type: 'banner', a: { text: 'Лігво відчинено!', color: '#b77be0' } });
}
async function addThreat(n, why) {
  const co = G.coop; if (!co || G.over || n <= 0) return;
  const st = threatStage();
  co.threat = Math.min(co.max, co.threat + n);
  log(`⚠️ Загроза +${n}${why ? ` (${why})` : ''}: ${co.threat} з ${co.max}.`);
  if (threatStage() > st) { say(`Підземелля прокидається: монстри +${threatBonus()}`, 2800); log(`Підземелля прокидається: усі монстри тепер +${threatBonus()}, і воно частіше втручається.`, 'turn'); sfx('curse'); }
  renderUI();
  if (co.threat >= co.max) await coopEnd(false);
}
async function coopHorn(p, c) {
  removeFromHand(p, c); discard(c);
  const co = G.coop, was = co.threat; co.threat = Math.max(0, co.threat - 2);
  log(`${nameTag(p)} грає «${esc(c.name)}»: Загроза −${was - co.threat} (${co.threat} з ${co.max}).`);
  say('Підземелля притихло', 2000); sfx('help'); renderUI();
}
// прокляття з руки в поході можна жбурнути в монстра
async function coopCurseMon(p, c) { c.bonus = -2; await playIntoCombat(p, c, 'mon'); }

/* --- Підземелля як гравець --- */
function dungeonDraw(n) {
  const co = G.coop; let got = 0;
  for (let k = 0; k < n * 3 && got < n; k++) {
    const deck = Math.random() < .25 ? 'treasure' : 'door';
    const c = draw(deck); if (!c) continue;
    if (['key', 'alarm', 'horn'].includes(c.kind)) { const d = deck === 'door' ? G.doorDeck : G.treasureDeck; d.splice(Math.max(0, d.length - rnd(Math.min(12, d.length + 1))), 0, c); syncDeck(deck); continue; }
    if (['monster', 'mod', 'wander', 'curse', 'oneshot'].includes(c.kind)) { co.hand.push(c); got++; } else discard(c);
  }
  while (co.hand.length > 8) discard(co.hand.splice(rnd(co.hand.length), 1)[0]);
}
// Підземелля втручається, коли герої перемагають
async function dungeonMeddle(boss = false, limit = null) {
  const co = G.coop, cb = G.combat; if (!co || !cb || G.over) return 0;
  const D = COOP_DIFF[co.diff];
  cb.dPlayed = cb.dPlayed || 0;
  const cap = limit != null ? limit : (boss ? D.bossCards : D.cards) - cb.dPlayed;
  let n = 0;
  while (n < cap && G.combat === cb && !G.over && sides().win) {
    const s = sides();
    const chance = boss ? .95 : D.meddle + threatStage() * .12 + (s.hero - s.mon <= 3 ? .1 : 0);
    if (Math.random() > chance) break;
    const opts = meddleOptions(DUNGEON); if (!opts.length) break;
    const need = s.hero - s.mon + (s.tie ? 1 : 0);
    const pick = opts.filter(o => o.pw >= need).sort((a, b) => a.pw - b.pw)[0] || opts.sort((a, b) => b.pw - a.pw)[0];
    await botDelay(450); await pick.run(); n++; cb.dPlayed++;
  }
  return n;
}
async function coopRoundEnd() {
  const co = G.coop; if (!co || G.over) return;
  co.round++;
  dungeonDraw(COOP_DIFF[co.diff].draw);
  await addThreat(1, `минуло коло ${co.round - 1}`); if (G.over) return;
  // інколи Підземелля насилає прокляття на найсильнішого
  const c = co.hand.find(x => x.kind === 'curse');
  if (c && Math.random() < COOP_DIFF[co.diff].curse + threatStage() * .1) {
    const t = G.players.slice().sort((a, b) => baseStr(b) - baseStr(a) || b.level - a.level).find(q => badHits(q, c.bad));
    if (t) await doCurse(DUNGEON, c, t);
  }
}

/* --- фінальний бій --- */
const groupStr = () => sum(G.players, q => baseStr(q));
function bossBase() { const co = G.coop, n = G.players.length; return Math.round((6 + 11 * n) * COOP_DIFF[co.diff].mult); }
function bossExtraNow() {
  const co = G.coop, b = co.boss; if (!b) return 0;
  switch (b.id) {
    case 'worm': return co.round - 1;
    case 'goblins': return co.hand.length * 2;
    case 'monday': return sum(G.players, q => (q.curses || []).length) * 2;
    case 'tax': return G.players.filter(q => q.gold < 300).length * 3;
  }
  return 0;
}
// грубий прогноз для ботів і для підказки на табло
function bossForecast() {
  const co = G.coop; if (!co || !co.boss) return null;
  const ty = { dragon: !!co.boss.dragon, undead: !!co.boss.undead };
  const hero = sum(G.players, q => baseStr(q) + adjSum(typeAdj(q, ty)) + (hasCls(q, 'cleric') && ty.undead ? 3 : 0));
  const shots = sum(G.players, q => shotBoost(q, ty));
  const dmg = sum(co.hand.filter(c => (c.kind === 'mod' && c.bonus > 0) || c.kind === 'oneshot'), c => Math.abs(c.bonus)) * (COOP_DIFF[co.diff].bossCards / Math.max(1, co.hand.length));
  return { hero, shots, mon: bossBase() + bossExtraNow() + threatBonus() + (co.boss.id === 'lich' ? 6 : 0), dmg: Math.round(dmg) };
}
const coopFc = () => !G.coop ? null : NET.role === 'client' ? G.coop.fc || null : bossForecast();
function coopWantsAssault() {
  const co = G.coop; if (!co || !co.lair || G.over) return false;
  const f = bossForecast(); if (!f) return false;
  const left = co.max - co.threat;
  if (f.hero + f.shots >= f.mon + f.dmg + 2) return true;
  if (left <= 2 && f.hero + f.shots >= (f.mon + f.dmg) * .85) return true;
  return left <= 1;
}
function bossCard() {
  const b = G.coop.boss;
  return mk({ deck: 'door', kind: 'monster', boss: true, name: b.name, art: b.art, lvl: bossBase(), treasures: 0, levels: 0, dragon: !!b.dragon, undead: !!b.undead, vs: null, flavor: b.flavor, ability: b.ability, bad: { t: 'boss', text: 'Програш: кожен втрачає рівень, Загроза +3.' } });
}
async function assaultLair() {
  const co = G.coop, p = cur(); if (!co || !co.lair || G.combat) return;
  co.tries++;
  const c = bossCard();
  log(`⚔️ ${nameTag(p)} веде загін на штурм лігва! <b>${esc(c.name)}</b> (сила ${c.lvl}). ${esc(co.boss.ability)}`, 'turn');
  banner('Штурм лігва!', '#b77be0'); netAll({ t: 'fx', type: 'banner', a: { text: 'Штурм лігва!', color: '#b77be0' } }); sfx('alert');
  const m = cardMesh(c); scene.add(m);
  await fly(m, deckPose('door'), centerPose(0, 1), 900, 2.6);
  G.combat = { fighter: G.cur, mons: [{ c, m }], mods: [], pShots: [], mShots: [], helper: null, offer: null, wiz: 0, interfered: new Set(), passed: new Set(), asked: new Set(), meshes: new Map(), boss: co.boss.id, bossX: 0 };
  G.phase = 'combat'; renderUI();
  await roar(m);
  const cb = G.combat;
  // здібності боса на початку бою
  if (co.boss.id === 'tax') {
    const broke = G.players.filter(q => q.gold < 300);
    G.players.forEach(q => { q.gold = Math.max(0, q.gold - 300); });
    cb.bossX = broke.length * 3;
    log(`${esc(co.boss.name)} збирає податок: кожен платить 300 золотих.${broke.length ? ` Нічим платити: ${broke.map(nameTag).join(', ')} — Бос +${cb.bossX}.` : ''}`);
  } else if (co.boss.id !== 'lich') cb.bossX = bossExtraNow();
  if (cb.bossX && co.boss.id !== 'tax') log(`${esc(co.boss.name)}: ${esc(co.boss.ability)} Зараз це +${cb.bossX}.`);
  if (co.boss.id === 'lich') {
    const u = G.doorDeck.slice().reverse().find(x => x.kind === 'monster' && x.undead);
    if (u) { G.doorDeck.splice(G.doorDeck.indexOf(u), 1); syncDeck('door'); co.hand.push(u); await addMonster(DUNGEON, u, null); }
  }
  renderUI();
  if (G.over || !G.combat) return;
  await dungeonMeddle(true);
  for (let round = 0; round < 3 && G.combat === cb && !G.over; round++) {
    await bossHeroes();
    if (G.combat !== cb || G.over) return;
    if (round < 2 && sides().win && co.diff !== 'easy') { const d = await dungeonMeddle(true, 1); if (d && !sides().win) continue; }
    break;
  }
  if (G.combat !== cb || G.over) return;
  if (sides().win) await bossVictory(); else await bossDefeat();
}
// хід героїв у бою з босом: боти докидають карти, люди грають свої й тиснуть «Готово до бою»
async function bossHeroes() {
  const cb = G.combat, ty = combatTypes(cb);
  const sv = c => Math.abs(shotVal(c, ty, c.bonus > 0));
  const need = () => { const s = sides(); return s.win ? 0 : s.mon - s.hero + (s.tie ? 0 : 1); };
  const humans = G.players.filter(q => isPerson(q) && !q.offline);
  const humanPot = sum(humans, q => shotBoost(q, ty));
  const bots = G.players.filter(q => q.type === 'bot');
  const botPot = sum(bots, q => sum(q.hand.filter(c => c.kind === 'oneshot' && sv(c) > 0), sv));
  if (need() > 0 && botPot + humanPot >= need()) {
    for (const b of bots) {
      const shots = b.hand.filter(c => c.kind === 'oneshot' && sv(c) > 0).sort((x, y) => sv(y) - sv(x));
      for (const c of shots) { if (need() <= Math.max(0, humanPot * .5) || G.combat !== cb) break; await botDelay(300); await playIntoCombat(b, c, c.bonus > 0 ? 'hero' : 'mon'); coopStat(b, 'shots'); }
    }
  }
  if (!humans.length || G.combat !== cb) return;
  sfx('alert');
  humans.filter(h => h.type === 'remote').forEach(h => tell(h, 'Бій з Босом! Зіграй разові карти й натисни «Готово до бою».', 3000));
  await new Promise(res => {
    let tm; const done = () => { clearTimeout(tm); if (G.bossWait && G.bossWait.resolve === done) G.bossWait = null; res(); };
    tm = setTimeout(done, 90000);
    G.bossWait = { waiting: humans.map(h => h.idx), resolve: done }; renderUI();
  });
  renderUI();
}
function bossReady(p) {
  const w = G.bossWait; if (!w) return;
  w.waiting = w.waiting.filter(i => i !== p.idx);
  log(`${nameTag(p)} готовий до бою з Босом.`);
  if (!w.waiting.length) w.resolve(); else renderUI();
}
async function bossVictory() {
  const cb = G.combat, co = G.coop;
  log(`🏆 Загін перемагає <b>${esc(co.boss.name)}</b> (${sides().hero} проти ${sides().mon})! Похід завершено.`, 'turn');
  for (const x of cb.mons) if (x.m) { const m = x.m; x.m = null; await defeatAnim(m); }
  await clearSideCards();
  await coopEnd(true);
}
async function bossDefeat() {
  const co = G.coop;
  log(`💥 ${esc(co.boss.name)} відкидає загін (${sides().hero} проти ${sides().mon}). Кожен втрачає рівень, Загроза +3.`, 'turn');
  say('Бос відкинув загін! Відновіть сили й спробуйте знову.', 3000);
  const cb = G.combat;
  for (const x of cb.mons) if (x.m) await lunge(x.m);
  for (const q of G.players) { if (q.level > 1) await changeLevel(q, -1); }
  // бос лишається в лігві, його карту прибираємо зі столу
  cb.mons = cb.mons.filter(x => { if (x.c.boss) { if (x.m) disposeMesh(x.m); return false; } return true; });
  await clearCombat();
  await addThreat(3, 'поразка біля лігва');
}
async function coopEnd(win) {
  if (G.over) return;
  const co = G.coop;
  G.over = true; G.phase = 'over'; G.busy = false; G.window = null; G.assist = null; G.bossWait = null;
  if (G.combat) { G.combat.mons.forEach(x => x.m && disposeMesh(x.m)); G.combat.meshes.forEach(disposeMesh); G.combat = null; }
  if (!win) log(`☠️ Загроза дійшла до ${co.max}: Підземелля прокинулось. Похід провалено.`, 'turn');
  renderUI(); sfx(win ? 'win' : 'curse');
  if (win) confetti('#b77be0');
  const a = { win, boss: co.boss ? co.boss.name : '', threat: co.threat, max: co.max, round: co.round, stats: G.players.map(q => ({ name: q.name, color: q.color, level: q.level, ...co.stats[q.idx] })) };
  emitFx('coopEnd', a);
  await wait(900);
  showCoopEnd(a, true);
}
function showCoopEnd(a, isHost) {
  const best = Math.max(...a.stats.map(s => s.kills + s.keys * 2 + s.shots));
  showModal(`<div class="curtain"><h2>${a.win ? 'Боса повалено!' : 'Підземелля прокинулось…'}</h2>
    <div class="who" style="color:${a.win ? '#b77be0' : '#ef6b5d'}">${a.win ? esc(a.boss) : 'Похід провалено'}</div>
    <p>${a.win ? `Загін переміг за ${a.round} ${plural(a.round, 'коло', 'кола', 'кіл')}, Загроза — ${a.threat} з ${a.max}.` : `Шкала Загрози заповнилась на ${a.round}-му колі.${a.boss ? ` ${esc(a.boss)} так і лишився в лігві.` : ''}`}</p></div>
    <table class="cstats"><tr><th>Гравець</th><th>Рівень</th><th>Перемог</th><th>Ключів</th><th>Карт на Боса</th></tr>
    ${a.stats.map(s => `<tr><td><b style="color:${s.color}">${esc(s.name)}</b>${s.kills + s.keys * 2 + s.shots === best && best > 0 ? ' ⭐' : ''}</td><td>${s.level}</td><td>${s.kills}</td><td>${s.keys}</td><td>${s.shots}</td></tr>`).join('')}</table>
    <div class="row end"><button class="btn ghost" data-close type="button">Роздивитися стіл</button>${isHost ? '<button class="btn primary" id="again" type="button">Нова гра</button>' : ''}</div>
    ${isHost ? '' : '<p class="hint" style="text-align:center">Нову партію запускає господар кімнати.</p>'}`);
  const b = $('#again'); if (b) b.onclick = () => { closeModal(); openSetup(); };
}
// хід бота в поході: ріг, коли Загроза росте
async function coopBotManage(p) {
  if (!G.coop || G.combat || G.over) return;
  const h = p.hand.find(c => c.kind === 'horn');
  if (h && G.coop.threat >= Math.min(4, G.coop.max - 3)) { await botDelay(300); await coopHorn(p, h); }
}
