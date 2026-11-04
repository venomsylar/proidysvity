'use strict';

/* ============================== ПОДІЇ НА СТОЛІ ==============================
   Раз на кілька кіл відкривається подія: на одне коло вона змінює правила для всіх.
   Вмикається/вимикається прапорцем «Події на столі» в налаштуваннях гри. */
const EVENTS = {
  moon:     { icon: '🌕', name: 'Повний місяць', text: 'Нежить +3 у бою. Перевертні +2.' },
  fair:     { icon: '🎪', name: 'Ярмарок', text: 'Речі продаються на 50% дорожче.' },
  tax:      { icon: '🧾', name: 'Податкова перевірка', text: 'Хто має понад 500 золотих, одразу віддає половину.' },
  rain:     { icon: '🌧️', name: 'Злива', text: 'Усім +1 до втечі: монстри посковзуються.' },
  feast:    { icon: '🍖', name: 'Бенкет', text: 'На початку свого ходу кожен бере карту скарбів.' },
  fog:      { icon: '🌫️', name: 'Туман', text: 'Кликати на поміч не можна: нікого не видно.' },
  hero:     { icon: '🎺', name: 'День героя', text: 'За перемогу над монстром +1 скарб.' },
  crisis:   { icon: '📉', name: 'Криза', text: 'Речі продаються за півціни.' },
  dragons:  { icon: '🔥', name: 'Сезон драконів', text: 'Дракони +3 у бою.' },
  holiday:  { icon: '🎉', name: 'Свято', text: 'Прокляття не діють: усі святкують.' },
  training: { icon: '🏋️', name: 'Тренування', text: 'Кожен герой у бою +1.' },
  blackcat: { icon: '🐈‍⬛', name: 'Чорна кішка', text: 'Лідерові (найвищий рівень) монстри +2.' },
  quiet:    { icon: '🤫', name: 'Тиша', text: 'У чужий бій втручатися не можна.' },
  generous: { icon: '🤝', name: 'Щедрість', text: 'Помічник отримує ще +1 скарб.' }
};
const EVENT_EVERY = 3; // подія відкривається на 2-му, 5-му, 8-му… колі й діє одне коло
const evOn = id => !!G.event && G.event.id === id;

// виклик на початку кожного ходу (лише господар/локальна гра)
async function eventsTurn(p) {
  const n = G.players.length; if (!n) return;
  if (((G.turnNo || 1) - 1) % n !== 0) { if (evOn('feast')) await drawTo(p, 'treasure'); return; }
  const round = ((G.turnNo || 1) - 1) / n; // 0, 1, 2…
  if (G.event) { log(`${G.event.icon} Подія «${esc(G.event.name)}» скінчилась.`); G.event = null; renderUI(); }
  if (!G.events || round < 1 || round % EVENT_EVERY !== 1) { if (evOn('feast')) await drawTo(p, 'treasure'); return; }
  const prev = G.lastEvent, ids = Object.keys(EVENTS).filter(k => k !== prev && !(k === 'dragons' && G.types && G.types.dragon === false) && !(k === 'moon' && G.types && G.types.undead === false));
  const id = ids[rnd(ids.length)], e = EVENTS[id];
  G.event = { id, icon: e.icon, name: e.name, text: e.text }; G.lastEvent = id;
  log(`${e.icon} <b>Подія: ${esc(e.name)}.</b> ${esc(e.text)} Діє до кінця кола.`, 'turn');
  banner(`${e.icon} ${e.name}`, '#9fd0ff'); netAll({ t: 'fx', type: 'banner', a: { text: `${e.icon} ${e.name}`, color: '#9fd0ff' } }); sfx('alert');
  if (id === 'tax') for (const q of G.players) if (q.gold > 500) { const lose = Math.floor(q.gold / 2 / 50) * 50; q.gold -= lose; log(`🧾 ${nameTag(q)} віддає податковій ${lose} зол.`); }
  renderUI(); await wait(900);
  if (evOn('feast')) await drawTo(p, 'treasure');
}
// поправки подій до бою
function eventHero(cb, p, h, allies) {
  if (!G.event) return 0; let b = 0;
  const heroes = [p, h, ...allies].filter(Boolean);
  if (evOn('training')) b += heroes.length;
  if (evOn('moon')) b += 2 * heroes.filter(q => hasRace(q, 'werewolf')).length;
  return b;
}
function eventMon(cb, p) {
  if (!G.event) return 0; let m = 0;
  if (evOn('moon')) m += 3 * cb.mons.filter(x => x.c.undead).length;
  if (evOn('dragons')) m += 3 * cb.mons.filter(x => x.c.dragon).length;
  if (evOn('blackcat') && p.level >= Math.max(...G.players.map(q => q.level))) m += 2;
  return m;
}
const eventSell = price => evOn('fair') ? Math.round(price * 1.5 / 50) * 50 : evOn('crisis') ? Math.floor(price / 2 / 50) * 50 : price;
const eventNoHelp = () => evOn('fog');
const eventNoMeddle = () => evOn('quiet');
// плашка з поточною подією
function renderEvent() {
  let el = $('#evPill');
  if (!el && typeof ResizeObserver === 'function' && $('#dock')) new ResizeObserver(() => document.documentElement.style.setProperty('--dockH', Math.round($('#dock').getBoundingClientRect().height) + 'px')).observe($('#dock')); // кнопки над панеллю йдуть за її висотою
  if (!el) { el = document.createElement('button'); el.id = 'evPill'; el.type = 'button'; el.className = 'evpill'; el.hidden = true; $('#ui .middle').appendChild(el); el.onclick = () => G.event && showModal(`<h2>${G.event.icon} ${esc(G.event.name)}</h2><p>${esc(G.event.text)}</p><p class="hint">Подія діє до кінця цього кола — поки кожен не зробить свій хід. Вимкнути події можна в налаштуваннях гри.</p><div class="row end"><button class="btn primary" type="button" data-close>Зрозуміло</button></div>`); }
  const e = G.event && !G.over ? G.event : null;
  el.hidden = !e; if (e) { el.innerHTML = `<span class="ev-i">${e.icon}</span><b>${esc(e.name)}</b><span class="ev-t">${esc(e.text)}</span>`; el.title = `${e.name}: ${e.text}`; el.setAttribute('aria-label', `Подія: ${e.name}`); }
}
