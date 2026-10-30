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
const nameTag = p => `<b style="color:${p.color}">${esc(p.name)}</b>`;

function usable(p, c) { if (!c.req) return true; if (c.req.sex) return p.sex === c.req.sex; if (c.req.race) return race(p) === c.req.race; if (c.req.cls) return cls(p) === c.req.cls; return true; }
const gearBonus = p => sum(p.gear, c => usable(p, c) ? c.bonus : 0);
const baseStr = p => p.level + gearBonus(p) + (cls(p) === 'warrior' ? 1 : 0);
const fleeBonus = p => (race(p) === 'elf' ? 1 : 0) + sum(p.gear, c => usable(p, c) ? (c.flee || 0) : 0);
const EPIC_AT = 10;
const epicFor = p => G.goal > 10 && p.level >= EPIC_AT;
const monLvl = (m, p) => m.lvl * (epicFor(p) ? 2 : 1);
const vsBonus = (m, p) => { let b = 0; if (m.vs) for (const k in m.vs) if (race(p) === k || cls(p) === k || p.sex === k) b += m.vs[k]; return b; };
const DIFF = {
  1: { name: 'Легкий', help: .8, demand: .2, meddle: .06, lead: .15, block: .5, curse: .45, grudge: .04 },
  2: { name: 'Середній', help: .6, demand: .45, meddle: .16, lead: .35, block: .9, curse: .8, grudge: .07 },
  3: { name: 'Важкий', help: .42, demand: .7, meddle: .3, lead: .55, block: 1, curse: 1, grudge: .1 }
};
function attitude(b, toward) { const m = (b.mem && b.mem[toward.idx]) || 0; return m >= 4 ? 'дружнє' : m >= 1 ? 'приязне' : m > -2 ? 'нейтральне' : m > -5 ? 'ворожість' : 'лютує'; }
const handLimit = p => race(p) === 'dwarf' ? 6 : 5;

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
  if (c.big && race(p) !== 'dwarf') p.gear.forEach(g => { if (g.big && !out.includes(g)) out.push(g); });
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
function sides() {
  const cb = G.combat, p = fighter();
  const h = cb.helper != null ? G.players[cb.helper] : null;
  const undead = cb.mons.some(x => x.c.undead);
  let hero = baseStr(p) + sum(cb.pShots, c => c.bonus) + cb.wiz * 2;
  if (cls(p) === 'cleric' && undead) hero += 3;
  if (h) { hero += baseStr(h); if (cls(h) === 'cleric' && undead) hero += 3; }
  let mon = sum(cb.mons, x => monLvl(x.c, p) + vsBonus(x.c, p)) + sum(cb.mods, c => c.bonus) + sum(cb.mShots, c => c.bonus);
  mon = Math.max(1, mon);
  const tie = cls(p) === 'warrior' || (h && cls(h) === 'warrior');
  return { hero, mon, tie, win: hero > mon || (hero === mon && tie) };
}

function keepScore(p, c) {
  switch (c.kind) {
    case 'levelup': return p.level < G.goal - 1 ? 900 : 60;
    case 'flee': return 500;
    case 'oneshot': return 200 + c.bonus * 60;
    case 'gear': return (usable(p, c) ? 120 : 20) + c.value * 0.3;
    case 'race': return p.raceCard ? 110 : 600;
    case 'class': return p.clsCard ? 110 : 600;
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
    case 'death': case 'sex': return true;
  }
  return false;
}
