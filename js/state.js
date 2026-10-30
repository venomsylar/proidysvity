'use strict';

/* ============================== СТАН ГРИ ============================== */
const COLORS = ['#e8b04a', '#e2685a', '#5aa9e2', '#86cf6e', '#b98be6', '#e889b8'];
const BOT_NAMES = ['Мотря', 'Опанас', 'Одарка', 'Панько', 'Ганна', 'Тарас', 'Соломія', 'Грицько'];
const G = { reveal: -1, gid: 0, goal: 10, players: [], doorDeck: [], treasureDeck: [], doorDiscard: [], treasureDiscard: [], cur: 0, viewer: -1, phase: 'setup', combat: null, busy: false, over: false, window: null, log: [], fresh: new Set(), pendingSetup: false };
const cur = () => G.players[G.cur];
const fighter = () => G.combat && G.combat.fighter != null ? G.players[G.combat.fighter] : cur();
const viewerP = () => G.players[G.viewer] || null;
const race = p => p.raceCard ? p.raceCard.race : null;
const cls = p => p.clsCard ? p.clsCard.cls : null;
/* дві раси / два класи (карти «Родовід із сюрпризом» і «Сумісництво») */
const raceCards = p => [p.raceCard, p.raceCard2].filter(Boolean);
const clsCards = p => [p.clsCard, p.clsCard2].filter(Boolean);
const hasRace = (p, r) => raceCards(p).some(c => c.race === r);
const hasCls = (p, k) => clsCards(p).some(c => c.cls === k);
const rcCards = p => [p.raceCard, p.raceCard2, p.clsCard, p.clsCard2, p.dualRace, p.dualCls].filter(Boolean);
const rcNames = p => [...raceCards(p), ...clsCards(p)].map(c => c.name).join(' · ');
const raceShield = p => !!p.dualRace && !p.raceCard2;   // подвійна раса без другої раси: монстри не мають бонусів проти твоєї раси
const clsShield = p => !!p.dualCls && !p.clsCard2;
/* тривалі прокляття */
const curseN = (p, k) => (p.curses || []).filter(c => c.bad && c.bad.p === k).length;
const curseStr = p => curseN(p, 'monday') * 2 + curseN(p, 'sneeze');
const sellPrice = (p, c) => curseN(p, 'inflation') ? Math.floor((c.value || 0) / 2 / 50) * 50 : (c.value || 0);
const nameTag = p => `<b style="color:${p.color}">${esc(p.name)}</b>`;

function usable(p, c) { if (!c.req) return true; if (c.req.sex) return p.sex === c.req.sex; if (c.req.race) return hasRace(p, c.req.race); if (c.req.cls) return hasCls(p, c.req.cls); return true; }
const gearBonus = p => sum(p.gear, c => usable(p, c) ? c.bonus : 0);
const baseStr = p => Math.max(0, p.level + gearBonus(p) + (hasCls(p, 'warrior') ? 1 : 0) - curseStr(p));
const fleeBonus = p => (hasRace(p, 'elf') ? 1 : 0) + sum(p.gear, c => usable(p, c) ? (c.flee || 0) : 0) - curseN(p, 'lead') - curseN(p, 'sneeze');
const EPIC_AT = 10;
const epicFor = p => G.goal > 10 && p.level >= EPIC_AT;
const monLvl = (m, p) => m.lvl * (epicFor(p) ? 2 : 1);
const vsBonus = (m, p) => { let b = 0; if (m.vs) for (const k in m.vs) if ((hasRace(p, k) && !raceShield(p)) || (hasCls(p, k) && !clsShield(p)) || p.sex === k) b += m.vs[k]; return b; };
const DIFF = {
  1: { name: 'Легкий', help: .8, demand: .2, meddle: .06, lead: .15, block: .5, curse: .45, grudge: .04 },
  2: { name: 'Середній', help: .6, demand: .45, meddle: .16, lead: .35, block: .9, curse: .8, grudge: .07 },
  3: { name: 'Важкий', help: .42, demand: .7, meddle: .3, lead: .55, block: 1, curse: 1, grudge: .1 }
};
/* приязність бота: сирі бали памʼяті → 0…100 % (50 — нейтрально); бали поступово забуваються */
const memOf = (b, q) => (b && q && b.mem && b.mem[q.idx]) || 0;
const affinity = (b, q) => Math.round(50 + 50 * Math.tanh(memOf(b, q) / 6));
const affN = (b, q) => (affinity(b, q) - 50) / 50;
const grudgeOf = (b, q) => -affN(b, q) * 5;
const MOODS = [[90, 'найкращі друзі'], [75, 'дружнє'], [60, 'приязне'], [41, 'нейтральне'], [26, 'насторожене'], [11, 'вороже'], [0, 'лютує']];
const moodName = a => MOODS.find(([t]) => a >= t)[1];
function attitude(b, toward) { const a = affinity(b, toward); return `${moodName(a)} · ${a}%`; }
/* пів-життя образ і вдячності — приблизно половина середньої партії (класика ≈ 9 кіл, епік ≈ 16); важкі боти памʼятають довше */
function forgetTick(p) {
  if (!p.mem) return;
  const half = (G.goal > 10 ? 8 : 4.5) * [1, .7, 1, 1.4][p.diff || 2];
  const k = Math.pow(.5, 1 / half);
  for (const i in p.mem) { p.mem[i] *= k; if (Math.abs(p.mem[i]) < .05) delete p.mem[i]; }
}
const handLimit = p => Math.max(1, (hasRace(p, 'dwarf') ? 6 : 5) - curseN(p, 'pocket'));

function draw(deck) {
  const k = deck === 'door' ? 'doorDeck' : 'treasureDeck', dk = deck === 'door' ? 'doorDiscard' : 'treasureDiscard';
  if (!G[k].length) {
    if (!G[dk].length) return null;
    G[k] = shuffle(G[dk]); G[dk] = [];
    log(`Колоду «${deck === 'door' ? 'Двері' : 'Скарби'}» перетасовано.`);
    syncDiscardTop(deck);
  }
  const c = G[k].pop(); syncDeck(deck); return c;
}
function discard(c) { (c.deck === 'door' ? G.doorDiscard : G.treasureDiscard).push(c); syncDiscardTop(c.deck); }
function removeFromHand(p, c) { const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1); }
function giveCard(p, c) { p.hand.push(c); if (p.idx === G.viewer) G.fresh.add(c.uid); }

function equipConflicts(p, c) {
  const out = [];
  if (['head', 'body', 'feet'].includes(c.slot)) p.gear.forEach(g => { if (g.slot === c.slot) out.push(g); });
  if (c.slot === 'hands') {
    const hs = p.gear.filter(g => g.slot === 'hands'); let used = sum(hs, g => g.hands), i = 0;
    while (used + c.hands > 2 && i < hs.length) { out.push(hs[i]); used -= hs[i].hands; i++; }
  }
  if (c.big && !hasRace(p, 'dwarf')) p.gear.forEach(g => { if (g.big && !out.includes(g)) out.push(g); });
  return out;
}
const canEquip = (p, c) => c.kind !== 'gear' ? 'Це не спорядження.' : (!usable(p, c) ? `Лише для: ${reqName(c.req)}.` : null);
function equip(p, c) {
  const rem = equipConflicts(p, c);
  rem.forEach(g => { p.gear.splice(p.gear.indexOf(g), 1); p.hand.push(g); });
  removeFromHand(p, c); p.gear.push(c);
  return rem;
}
function gearScore(p, gear) { const tmp = p.gear; p.gear = gear; const s = baseStr(p) + fleeBonus(p) * 0.3; p.gear = tmp; return s; }
function gearAfter(p, c) { const rem = equipConflicts(p, c); return p.gear.filter(g => !rem.includes(g)).concat([c]); }

function treasureCount() { const cb = G.combat; return Math.max(0, sum(cb.mons, x => x.c.treasures) + sum(cb.mods, m => m.tr)); }
const levelsGain = () => sum(G.combat.mons, x => x.c.levels);
const monNames = () => G.combat ? G.combat.mons.map(x => x.c.name).join(' + ') : '';
/* вогонь і дракони: вогняні речі +2 проти нежиті, на драконів не діють; драконобійні речі — бонус проти драконів */
const combatTypes = cb => ({ undead: cb.mons.some(x => x.c.undead), dragon: cb.mons.some(x => x.c.dragon) });
function typeAdj(q, ty) {
  const r = { fireOff: 0, fireUndead: 0, slayer: 0 };
  for (const g of q.gear) {
    if (!usable(q, g)) continue;
    if (g.fire && ty.dragon) r.fireOff -= g.bonus; else if (g.fire && ty.undead) r.fireUndead += 2;
    if (g.vsT && g.vsT.dragon && ty.dragon) r.slayer += g.vsT.dragon;
  }
  return r;
}
const adjSum = r => r.fireOff + r.fireUndead + r.slayer;
const shotVal = (c, ty, heroSide) => !heroSide || !c.fire || c.bonus < 0 ? c.bonus : ty.dragon ? 0 : c.bonus + (ty.undead ? 2 : 0);
function sides() {
  const cb = G.combat, p = fighter();
  const h = cb.helper != null ? G.players[cb.helper] : null;
  const ty = combatTypes(cb), undead = ty.undead;
  let hero = baseStr(p) + adjSum(typeAdj(p, ty)) + sum(cb.pShots, c => shotVal(c, ty, true)) + cb.wiz * 2;
  if (hasCls(p, 'cleric') && undead) hero += 3;
  if (h) { hero += baseStr(h) + adjSum(typeAdj(h, ty)); if (hasCls(h, 'cleric') && undead) hero += 3; }
  hero = Math.max(0, hero);
  let mon = curseN(p, 'magnet') * 2 + sum(cb.mons, x => monLvl(x.c, p) + vsBonus(x.c, p)) + sum(cb.mods, c => c.bonus) + sum(cb.mShots, c => shotVal(c, ty, false));
  mon = Math.max(1, mon);
  const tie = hasCls(p, 'warrior') || (h && hasCls(h, 'warrior'));
  return { hero, mon, tie, win: hero > mon || (hero === mon && tie) };
}

function keepScore(p, c) {
  switch (c.kind) {
    case 'levelup': return p.level < G.goal - 1 ? 900 : 60;
    case 'flee': return 500;
    case 'oneshot': return 200 + Math.abs(c.bonus) * 60;
    case 'gear': return (usable(p, c) ? 120 : 20) + c.value * 0.3;
    case 'race': return !p.raceCard ? 600 : p.dualRace && !p.raceCard2 && !hasRace(p, c.race) ? 520 : 110;
    case 'class': return !p.clsCard ? 600 : p.dualCls && !p.clsCard2 && !hasCls(p, c.cls) ? 520 : 110;
    case 'dual': return (c.dual === 'race' ? p.dualRace : p.dualCls) ? 90 : 480;
    case 'uncurse': return (p.curses || []).length ? 800 : 320;
    case 'mod': return 230 + Math.abs(c.bonus) * 8;
    case 'curse': return 280;
    case 'wander': return 270;
    case 'redirect': return 550;
    case 'monster': return 100 + (baseStr(p) > monLvl(c, p) + 2 ? 180 : 0);
  }
  return 100;
}
function badHits(q, bad) {
  switch (bad.t) {
    case 'level': return q.level > 1;
    case 'slot': return q.gear.some(g => g.slot === bad.slot);
    case 'gear': case 'best': return q.gear.length > 0;
    case 'hand': return q.hand.length > 0;
    case 'gold': return q.gold > 0;
    case 'race': return !!q.raceCard;
    case 'class': return !!q.clsCard;
    case 'persist': return true;
    case 'death': case 'sex': return true;
  }
  return false;
}
